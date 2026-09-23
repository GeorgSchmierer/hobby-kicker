-- M3: Spieltage, Teams, Ergebnisse und die Anpassung der Stärkewerte (CLAUDE.md, Abschnitt 7).
-- Die Wertung läuft ausschließlich hier auf dem Server. Die App ruft nur Server-Funktionen auf;
-- direkt schreiben darf sie in keine dieser Tabellen.

-- ---------------------------------------------------------------------------
-- Stellschrauben der Wertung – die EINE Stelle, an der sie geändert werden
-- (z. B. im Supabase-Dashboard unter Table Editor → rating_settings, oder per neuer Migration)
-- ---------------------------------------------------------------------------

create table public.rating_settings (
  id integer primary key default 1 check (id = 1),
  -- D: je größer, desto weniger zählt ein Stärkeunterschied für die Erwartung
  scale_d numeric not null default 10 check (scale_d > 0),
  -- K: wie stark sich die Werte pro Partie höchstens ändern
  k numeric not null default 0.3 check (k >= 0),
  -- Neue Spieler (weniger als new_player_games Partien) ändern sich um diesen Faktor schneller
  new_player_factor numeric not null default 1.5 check (new_player_factor >= 1),
  new_player_games integer not null default 5 check (new_player_games >= 0),
  -- Torstand-Faktor M = 1 + margin_weight · ln(1 + Tordifferenz), höchstens margin_cap
  margin_weight numeric not null default 0.5 check (margin_weight >= 0),
  margin_cap numeric not null default 2 check (margin_cap >= 1)
);
insert into public.rating_settings default values;

-- ---------------------------------------------------------------------------
-- Tabellen
-- ---------------------------------------------------------------------------

create table public.sessions (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  -- Datum in deutscher Zeit (der Server läuft in UTC)
  played_on date not null default (now() at time zone 'Europe/Berlin')::date,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
create index sessions_group_idx on public.sessions (group_id, created_at desc);

create table public.teams (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions (id) on delete cascade,
  group_id uuid not null references public.groups (id) on delete cascade,
  -- Reihenfolge = Teamfarbe in der App (0 Rot, 1 Blau, 2 Gelb, 3 Lila)
  idx smallint not null check (idx between 0 and 3),
  unique (session_id, idx)
);

-- Spieler mit Verlauf können nicht gelöscht werden (nur auf „inaktiv“ setzen) –
-- sonst würde die Geschichte der Spieltage verfälscht.
create table public.team_players (
  team_id uuid not null references public.teams (id) on delete cascade,
  player_id uuid not null references public.players (id),
  group_id uuid not null references public.groups (id) on delete cascade,
  primary key (team_id, player_id)
);
create index team_players_player_idx on public.team_players (player_id);

-- Ein „Ergebnis“ ist ein Eintrag: entweder eine Partie oder ein Turniersieger
-- (der intern als mehrere gewonnene Partien gewertet wird). Rückgängig wirkt auf ein ganzes Ergebnis.
create table public.results (
  id uuid primary key default gen_random_uuid(),
  seq bigint generated always as identity unique,
  group_id uuid not null references public.groups (id) on delete cascade,
  session_id uuid not null references public.sessions (id) on delete cascade,
  kind text not null check (kind in ('match', 'tournament')),
  entered_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
create index results_group_idx on public.results (group_id, seq desc);
create index results_session_idx on public.results (session_id, seq);

create table public.matches (
  id uuid primary key default gen_random_uuid(),
  result_id uuid not null references public.results (id) on delete cascade,
  group_id uuid not null references public.groups (id) on delete cascade,
  team_a uuid not null references public.teams (id) on delete cascade,
  team_b uuid not null references public.teams (id) on delete cascade,
  goals_a integer check (goals_a between 0 and 99),
  goals_b integer check (goals_b between 0 and 99),
  -- Ergebnis aus Sicht von Team A: 1 Sieg, 0,5 Unentschieden, 0 Niederlage
  score_a numeric(2, 1) not null check (score_a in (0, 0.5, 1)),
  check (team_a <> team_b),
  check ((goals_a is null) = (goals_b is null))
);
create index matches_result_idx on public.matches (result_id);

create table public.rating_changes (
  id bigint generated always as identity primary key,
  result_id uuid not null references public.results (id) on delete cascade,
  match_id uuid not null references public.matches (id) on delete cascade,
  group_id uuid not null references public.groups (id) on delete cascade,
  player_id uuid not null references public.players (id),
  defense_before numeric(4, 2) not null,
  attack_before numeric(4, 2) not null,
  defense_after numeric(4, 2) not null,
  attack_after numeric(4, 2) not null,
  games_before integer not null
);
create index rating_changes_result_idx on public.rating_changes (result_id, id);
create index rating_changes_player_idx on public.rating_changes (player_id);

-- ---------------------------------------------------------------------------
-- Row Level Security: Mitglieder lesen, schreiben nur über die Server-Funktionen unten
-- ---------------------------------------------------------------------------

alter table public.rating_settings enable row level security;
alter table public.sessions enable row level security;
alter table public.teams enable row level security;
alter table public.team_players enable row level security;
alter table public.results enable row level security;
alter table public.matches enable row level security;
alter table public.rating_changes enable row level security;

create policy "rating_settings_select" on public.rating_settings for select to authenticated
  using (true);
create policy "sessions_select" on public.sessions for select to authenticated
  using (public.is_group_member(group_id));
create policy "teams_select" on public.teams for select to authenticated
  using (public.is_group_member(group_id));
create policy "team_players_select" on public.team_players for select to authenticated
  using (public.is_group_member(group_id));
create policy "results_select" on public.results for select to authenticated
  using (public.is_group_member(group_id));
create policy "matches_select" on public.matches for select to authenticated
  using (public.is_group_member(group_id));
create policy "rating_changes_select" on public.rating_changes for select to authenticated
  using (public.is_group_member(group_id));

-- ---------------------------------------------------------------------------
-- Audit-Log: Wertungsänderungen nicht pro Spieler protokollieren (das steht in rating_changes),
-- sondern einmal pro Ergebnis
-- ---------------------------------------------------------------------------

create or replace function public.log_player_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Wird gerade die ganze Gruppe gelöscht, gibt es nichts mehr zu protokollieren
  if tg_op = 'DELETE' and not exists (select 1 from public.groups where id = old.group_id) then
    return old;
  end if;
  -- Änderungen durch die Wertung stehen bereits in rating_changes
  if tg_op = 'UPDATE' and current_setting('hobby_kicker.rating_update', true) = 'on' then
    return new;
  end if;
  insert into public.audit_log (group_id, user_id, action, details)
  values (
    coalesce(new.group_id, old.group_id),
    auth.uid(),
    'player_' || lower(tg_op),
    jsonb_build_object(
      'player_id', coalesce(new.id, old.id),
      'before', case when tg_op <> 'INSERT' then to_jsonb(old) end,
      'after', case when tg_op <> 'DELETE' then to_jsonb(new) end
    )
  );
  return coalesce(new, old);
end;
$$;

-- ---------------------------------------------------------------------------
-- Wertung einer Partie (intern, nicht von der App aufrufbar)
-- ---------------------------------------------------------------------------

create function public.rate_match(p_match uuid)
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
    select pl.id, pl.defense, pl.attack, pl.games_played, (tp.team_id = m.team_a) as in_a
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
      result_id, match_id, group_id, player_id,
      defense_before, attack_before, defense_after, attack_after, games_before
    ) values (
      m.result_id, m.id, m.group_id, p.id,
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

-- ---------------------------------------------------------------------------
-- Server-Funktionen für die App
-- ---------------------------------------------------------------------------

-- Spieltag mit den gewürfelten Teams speichern.
-- p_teams: JSON-Liste von Listen mit Spieler-IDs, z. B. [["id1","id2"],["id3","id4"]]
create function public.start_session(p_group uuid, p_teams jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  sid uuid;
  tid uuid;
  team_count integer;
  all_ids uuid[];
  i integer;
  pid uuid;
begin
  if not public.is_group_member(p_group) then
    raise exception 'Du bist kein Mitglied dieser Gruppe.';
  end if;
  if jsonb_typeof(p_teams) <> 'array' then
    raise exception 'Ungültige Teams.';
  end if;
  team_count := jsonb_array_length(p_teams);
  if team_count not between 2 and 4 then
    raise exception 'Es braucht 2 bis 4 Teams.';
  end if;

  select array_agg(member_id::uuid) into all_ids
    from jsonb_array_elements(p_teams) as team(members),
         jsonb_array_elements_text(team.members) as member(member_id);
  if all_ids is null or cardinality(all_ids) <> (select count(distinct x) from unnest(all_ids) x) then
    raise exception 'Jeder Spieler darf nur in einem Team sein.';
  end if;
  if exists (
    select 1 from unnest(all_ids) x
    where not exists (select 1 from public.players where id = x and group_id = p_group)
  ) then
    raise exception 'Ein Spieler gehört nicht zu dieser Gruppe.';
  end if;

  insert into public.sessions (group_id, created_by) values (p_group, auth.uid())
    returning id into sid;

  for i in 0 .. team_count - 1 loop
    if jsonb_array_length(p_teams -> i) = 0 then
      raise exception 'Jedes Team braucht mindestens einen Spieler.';
    end if;
    insert into public.teams (session_id, group_id, idx) values (sid, p_group, i)
      returning id into tid;
    for pid in
      select member_id::uuid from jsonb_array_elements_text(p_teams -> i) as member(member_id)
    loop
      insert into public.team_players (team_id, player_id, group_id) values (tid, pid, p_group);
    end loop;
  end loop;

  insert into public.audit_log (group_id, user_id, action, details)
  values (p_group, auth.uid(), 'session_started', jsonb_build_object('session_id', sid));
  return sid;
end;
$$;

-- Eine Partie eintragen. p_outcome: 'a' (Team A gewinnt), 'b' oder 'draw'.
-- Mit Torstand wird das Ergebnis aus den Toren abgeleitet.
create function public.record_match(
  p_session uuid,
  p_team_a uuid,
  p_team_b uuid,
  p_outcome text,
  p_goals_a integer default null,
  p_goals_b integer default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  gid uuid;
  rid uuid;
  mid uuid;
  outcome text := p_outcome;
  score numeric;
begin
  select group_id into gid from public.sessions where id = p_session;
  if gid is null or not public.is_group_member(gid) then
    raise exception 'Diesen Spieltag gibt es nicht.';
  end if;
  if p_team_a = p_team_b then
    raise exception 'Bitte zwei verschiedene Teams wählen.';
  end if;
  if (select count(*) from public.teams where session_id = p_session and id in (p_team_a, p_team_b)) <> 2 then
    raise exception 'Die Teams gehören nicht zu diesem Spieltag.';
  end if;
  if (p_goals_a is null) <> (p_goals_b is null) then
    raise exception 'Bitte beide Torzahlen eintragen – oder keine.';
  end if;
  if p_goals_a is not null then
    outcome := case
      when p_goals_a > p_goals_b then 'a'
      when p_goals_a < p_goals_b then 'b'
      else 'draw'
    end;
  end if;
  score := case outcome when 'a' then 1 when 'b' then 0 when 'draw' then 0.5 end;
  if score is null then
    raise exception 'Ungültiges Ergebnis.';
  end if;

  insert into public.results (group_id, session_id, kind, entered_by)
    values (gid, p_session, 'match', auth.uid())
    returning id into rid;
  insert into public.matches (result_id, group_id, team_a, team_b, goals_a, goals_b, score_a)
    values (rid, gid, p_team_a, p_team_b, p_goals_a, p_goals_b, score)
    returning id into mid;
  perform public.rate_match(mid);

  insert into public.audit_log (group_id, user_id, action, details)
  values (gid, auth.uid(), 'result_recorded', jsonb_build_object('result_id', rid, 'kind', 'match'));
  return rid;
end;
$$;

-- Nur den Turniersieger eintragen: zählt als Sieg gegen jedes andere Team
-- (die übrigen Teams untereinander werden nicht gewertet).
create function public.record_tournament_winner(p_session uuid, p_winner uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  gid uuid;
  rid uuid;
  mid uuid;
  other record;
begin
  select group_id into gid from public.sessions where id = p_session;
  if gid is null or not public.is_group_member(gid) then
    raise exception 'Diesen Spieltag gibt es nicht.';
  end if;
  if not exists (select 1 from public.teams where id = p_winner and session_id = p_session) then
    raise exception 'Dieses Team gehört nicht zu diesem Spieltag.';
  end if;

  insert into public.results (group_id, session_id, kind, entered_by)
    values (gid, p_session, 'tournament', auth.uid())
    returning id into rid;

  for other in
    select id from public.teams where session_id = p_session and id <> p_winner order by idx
  loop
    insert into public.matches (result_id, group_id, team_a, team_b, score_a)
      values (rid, gid, p_winner, other.id, 1)
      returning id into mid;
    perform public.rate_match(mid);
  end loop;

  insert into public.audit_log (group_id, user_id, action, details)
  values (gid, auth.uid(), 'result_recorded', jsonb_build_object('result_id', rid, 'kind', 'tournament'));
  return rid;
end;
$$;

-- Das zuletzt eingetragene Ergebnis der Gruppe zurücknehmen (nur Admin).
-- p_expected_result: das Ergebnis, das der Admin gerade sieht – ist inzwischen ein neueres
-- dazugekommen, wird abgebrochen statt versehentlich das falsche zu löschen.
create function public.undo_last_result(p_group uuid, p_expected_result uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  rid uuid;
begin
  if not public.is_group_admin(p_group) then
    raise exception 'Nur Admins dürfen Ergebnisse rückgängig machen.';
  end if;
  select id into rid from public.results where group_id = p_group order by seq desc limit 1;
  if rid is null then
    raise exception 'Es gibt kein Ergebnis zum Rückgängigmachen.';
  end if;
  if rid <> p_expected_result then
    raise exception 'Inzwischen wurde ein neueres Ergebnis eingetragen. Bitte neu laden.';
  end if;

  perform set_config('hobby_kicker.rating_update', 'on', true);
  -- Je Spieler die Werte von VOR diesem Ergebnis wiederherstellen (erste Änderung im Ergebnis)
  update public.players pl set
    defense = rc.defense_before,
    attack = rc.attack_before,
    games_played = rc.games_before
  from (
    select distinct on (player_id) player_id, defense_before, attack_before, games_before
    from public.rating_changes
    where result_id = rid
    order by player_id, id
  ) rc
  where pl.id = rc.player_id;
  perform set_config('hobby_kicker.rating_update', 'off', true);

  delete from public.results where id = rid;

  insert into public.audit_log (group_id, user_id, action, details)
  values (p_group, auth.uid(), 'result_undone', jsonb_build_object('result_id', rid));
end;
$$;

-- Spieltag ohne Ergebnisse löschen (Admin oder wer ihn angelegt hat)
create function public.delete_session(p_session uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  sess public.sessions;
begin
  select * into sess from public.sessions where id = p_session;
  if sess.id is null or not public.is_group_member(sess.group_id) then
    raise exception 'Diesen Spieltag gibt es nicht.';
  end if;
  if not (public.is_group_admin(sess.group_id) or sess.created_by = auth.uid()) then
    raise exception 'Nur Admins oder wer den Spieltag angelegt hat, dürfen ihn löschen.';
  end if;
  if exists (select 1 from public.results where session_id = p_session) then
    raise exception 'Spieltage mit Ergebnissen können nicht gelöscht werden.';
  end if;
  delete from public.sessions where id = p_session;
  insert into public.audit_log (group_id, user_id, action, details)
  values (sess.group_id, auth.uid(), 'session_deleted', jsonb_build_object('session_id', p_session));
end;
$$;

-- ---------------------------------------------------------------------------
-- Rechte
-- ---------------------------------------------------------------------------

revoke execute on function
  public.rate_match(uuid),
  public.start_session(uuid, jsonb),
  public.record_match(uuid, uuid, uuid, text, integer, integer),
  public.record_tournament_winner(uuid, uuid),
  public.undo_last_result(uuid, uuid),
  public.delete_session(uuid)
from public, anon;

revoke execute on function public.rate_match(uuid) from authenticated;

grant execute on function
  public.start_session(uuid, jsonb),
  public.record_match(uuid, uuid, uuid, text, integer, integer),
  public.record_tournament_winner(uuid, uuid),
  public.undo_last_result(uuid, uuid),
  public.delete_session(uuid)
to authenticated;
