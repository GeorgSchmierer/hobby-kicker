-- A4: Nachzügler während eines Spieltags einplanen (optional mit Tausch).
--
-- Bisher galt: Wer in team_players steht, hat alle Partien seines Teams gespielt. Das stimmt
-- nicht mehr, wenn jemand später dazukommt oder das Team wechselt. Deshalb wird jetzt je
-- Wertungsänderung festgehalten, für welches Team der Spieler in dieser Partie gespielt hat.
-- rating_changes ist damit die Aufstellung jeder Partie; team_players ist die AKTUELLE
-- Aufstellung (für die nächste Partie).

alter table public.rating_changes
  add column team_id uuid references public.teams (id) on delete cascade;

-- Bisherige Partien: Aufstellung = Team laut team_players (bisher gab es keine Wechsel)
update public.rating_changes rc
set team_id = tp.team_id
from public.matches m, public.team_players tp
where m.id = rc.match_id
  and tp.player_id = rc.player_id
  and tp.team_id in (m.team_a, m.team_b);

alter table public.rating_changes alter column team_id set not null;

-- Wertung einer Partie: wie bisher, speichert zusätzlich das Team
create or replace function public.rate_match(p_match uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.rating_settings;
  m public.matches;
  strength_a numeric;
  strength_b numeric;
  expected_a numeric;
  margin numeric;
  p record;
  k_player numeric;
  delta numeric;
begin
  select * into s from public.rating_settings where id = 1;
  select * into m from public.matches where id = p_match;

  -- Spieler beider Teams sperren, damit gleichzeitige Einträge sich nicht überschreiben
  perform 1 from public.players pl
    join public.team_players tp on tp.player_id = pl.id
    where tp.team_id in (m.team_a, m.team_b)
    for update of pl;

  -- Teamstärke S = Summe der Gesamtstärken g = (d + a) / 2
  select coalesce(sum((pl.defense + pl.attack) / 2), 0) into strength_a
    from public.team_players tp join public.players pl on pl.id = tp.player_id
    where tp.team_id = m.team_a;
  select coalesce(sum((pl.defense + pl.attack) / 2), 0) into strength_b
    from public.team_players tp join public.players pl on pl.id = tp.player_id
    where tp.team_id = m.team_b;

  -- Erwartung für A: E_A = 1 / (1 + 10^((S_B − S_A) / D))
  expected_a := 1 / (1 + power(10::numeric, (strength_b - strength_a) / s.scale_d));

  -- Torstand-Faktor M = 1 + 0,5 · ln(1 + Tordifferenz), gedeckelt; ohne Torstand M = 1
  margin := case
    when m.goals_a is null then 1
    else least(s.margin_cap, 1 + s.margin_weight * ln(1 + abs(m.goals_a - m.goals_b)))
  end;

  perform set_config('hobby_kicker.rating_update', 'on', true);

  for p in
    select pl.id, pl.defense, pl.attack, pl.games_played, tp.team_id, (tp.team_id = m.team_a) as in_a
    from public.team_players tp join public.players pl on pl.id = tp.player_id
    where tp.team_id in (m.team_a, m.team_b)
  loop
    k_player := s.k * case when p.games_played < s.new_player_games then s.new_player_factor else 1 end;
    -- Δ = K · M · (R_A − E_A); Team B mit umgekehrtem Vorzeichen
    delta := k_player * margin * (m.score_a - expected_a);
    if not p.in_a then
      delta := -delta;
    end if;

    insert into public.rating_changes (
      result_id, match_id, group_id, player_id, team_id,
      defense_before, attack_before, defense_after, attack_after, games_before
    ) values (
      m.result_id, m.id, m.group_id, p.id, p.team_id,
      p.defense, p.attack,
      least(11, greatest(1, round(p.defense + delta, 2))),
      least(11, greatest(1, round(p.attack + delta, 2))),
      p.games_played
    );

    -- Erste Version: Δ gleichermaßen auf Abwehr und Angriff, Werte bleiben zwischen 1 und 11
    update public.players set
      defense = least(11, greatest(1, round(p.defense + delta, 2))),
      attack = least(11, greatest(1, round(p.attack + delta, 2))),
      games_played = p.games_played + 1
    where id = p.id;
  end loop;

  perform set_config('hobby_kicker.rating_update', 'off', true);
end;
$$;

-- Nachzügler einem Team zuteilen. Optional Tausch: p_move_player wechselt aus p_team
-- in das Team p_move_to (der Nachzügler nimmt seinen Platz ein). Alle Mitglieder dürfen das.
create function public.add_late_player(
  p_session uuid,
  p_player uuid,
  p_team uuid,
  p_move_player uuid default null,
  p_move_to uuid default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  gid uuid;
begin
  select group_id into gid from public.sessions where id = p_session;
  if gid is null or not public.is_group_member(gid) then
    raise exception 'Diesen Spieltag gibt es nicht.';
  end if;
  if not exists (select 1 from public.players where id = p_player and group_id = gid and active) then
    raise exception 'Diesen Spieler gibt es nicht.';
  end if;
  if exists (
    select 1 from public.team_players tp join public.teams t on t.id = tp.team_id
    where t.session_id = p_session and tp.player_id = p_player
  ) then
    raise exception 'Der Spieler ist schon in einem Team.';
  end if;
  if not exists (select 1 from public.teams where id = p_team and session_id = p_session) then
    raise exception 'Dieses Team gibt es nicht.';
  end if;

  if p_move_player is not null then
    if p_move_to is null or p_move_to = p_team
       or not exists (select 1 from public.teams where id = p_move_to and session_id = p_session) then
      raise exception 'Ungültiger Tausch.';
    end if;
    update public.team_players set team_id = p_move_to
    where team_id = p_team and player_id = p_move_player;
    if not found then
      raise exception 'Der Spieler für den Tausch ist nicht in diesem Team.';
    end if;
  end if;

  insert into public.team_players (team_id, player_id, group_id) values (p_team, p_player, gid);

  insert into public.audit_log (group_id, user_id, action, details)
  values (gid, auth.uid(), 'late_player_added', jsonb_build_object(
    'session_id', p_session, 'player_id', p_player, 'team_id', p_team,
    'moved_player', p_move_player, 'moved_to', p_move_to));
end;
$$;

-- Versehentlich hinzugefügten Spieler wieder aus dem Spieltag nehmen – nur solange er an
-- diesem Tag noch keine Partie gespielt hat und sein Team nicht leer wird.
create function public.remove_session_player(p_session uuid, p_player uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  gid uuid;
  tid uuid;
begin
  select group_id into gid from public.sessions where id = p_session;
  if gid is null or not public.is_group_member(gid) then
    raise exception 'Diesen Spieltag gibt es nicht.';
  end if;
  select tp.team_id into tid from public.team_players tp join public.teams t on t.id = tp.team_id
  where t.session_id = p_session and tp.player_id = p_player;
  if tid is null then
    raise exception 'Der Spieler ist nicht in diesem Spieltag.';
  end if;
  if exists (
    select 1 from public.rating_changes rc join public.results r on r.id = rc.result_id
    where r.session_id = p_session and rc.player_id = p_player
  ) then
    raise exception 'Der Spieler hat heute schon mitgespielt und kann nicht mehr entfernt werden.';
  end if;
  if (select count(*) from public.team_players where team_id = tid) <= 1 then
    raise exception 'Ein Team braucht mindestens einen Spieler.';
  end if;

  delete from public.team_players where team_id = tid and player_id = p_player;
  -- MVP-Stimmen für ihn verfallen (er hat ja nicht mitgespielt)
  delete from public.mvp_votes where session_id = p_session and player_id = p_player;

  insert into public.audit_log (group_id, user_id, action, details)
  values (gid, auth.uid(), 'session_player_removed', jsonb_build_object(
    'session_id', p_session, 'player_id', p_player));
end;
$$;

revoke execute on function
  public.add_late_player(uuid, uuid, uuid, uuid, uuid),
  public.remove_session_player(uuid, uuid)
from public, anon;
grant execute on function
  public.add_late_player(uuid, uuid, uuid, uuid, uuid),
  public.remove_session_player(uuid, uuid)
to authenticated;
