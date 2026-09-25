-- C3: Abzeichen. Werden nach jedem Ergebnis auf dem Server vergeben (award_badges) und hängen
-- an diesem Ergebnis: Wird es rückgängig gemacht, verschwinden die Abzeichen mit (on delete cascade).
-- Jedes Abzeichen gibt es pro Spieler einmal (Jubiläum je Stufe einmal). Gäste bekommen keine.
--
--   treue_seele  – bei den letzten N Spieltagen der Gruppe in Folge dabei
--   siegesserie  – N Siege in Folge
--   comeback     – Sieg als klarer Außenseiter (Siegchance unter X)
--   jubilaeum    – 25 / 50 / 100 Spiele
-- „Spiel“ wie in Tabelle und Statistik: eine Partie; ein Turnier zählt einmal.

-- Schwellen – die EINE Stelle zum Anpassen (Dashboard: Table Editor → badge_settings)
create table public.badge_settings (
  id integer primary key default 1 check (id = 1),
  loyal_sessions integer not null default 10 check (loyal_sessions > 1),
  win_streak integer not null default 5 check (win_streak > 1),
  comeback_max_chance numeric not null default 0.3 check (comeback_max_chance between 0 and 0.5),
  jubilee_levels integer[] not null default array[25, 50, 100]
);
insert into public.badge_settings default values;
alter table public.badge_settings enable row level security;
create policy "badge_settings_select" on public.badge_settings for select to authenticated using (true);

create table public.badges (
  id bigint generated always as identity primary key,
  group_id uuid not null references public.groups (id) on delete cascade,
  player_id uuid not null references public.players (id) on delete cascade,
  kind text not null check (kind in ('treue_seele', 'siegesserie', 'comeback', 'jubilaeum')),
  level integer not null default 1,
  result_id uuid not null references public.results (id) on delete cascade,
  awarded_at timestamptz not null default now(),
  unique (player_id, kind, level)
);
create index badges_group_idx on public.badges (group_id);
create index badges_result_idx on public.badges (result_id);

alter table public.badges enable row level security;
create policy "badges_select" on public.badges for select to authenticated
  using (public.is_group_member(group_id));

-- Spiele eines Spielers (ein Eintrag je Ergebnis), mit Ergebnis aus seiner Sicht (1 / 0,5 / 0)
create function public.player_games(p_player uuid)
returns table (result_id uuid, seq bigint, score numeric)
language sql
stable
security definer
set search_path = ''
as $$
  select g.result_id, g.seq, g.score from (
    select distinct on (rc.result_id)
      rc.result_id, r.seq,
      case when rc.team_id = m.team_a then m.score_a else 1 - m.score_a end as score
    from public.rating_changes rc
    join public.matches m on m.id = rc.match_id
    join public.results r on r.id = rc.result_id
    where rc.player_id = p_player
    order by rc.result_id, rc.id
  ) g
  order by g.seq
$$;

create function public.award_badges(p_result uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  st public.badge_settings;
  s public.rating_settings;
  res public.results;
  pid uuid;
  lvl integer;
  game_count integer;
  last_scores numeric[];
  session_ids uuid[];
  mt record;
  strength_own numeric;
  strength_opp numeric;
  expected numeric;
begin
  select * into st from public.badge_settings where id = 1;
  select * into s from public.rating_settings where id = 1;
  select * into res from public.results where id = p_result;

  for pid in
    select distinct rc.player_id from public.rating_changes rc
    join public.players p on p.id = rc.player_id
    where rc.result_id = p_result and not p.is_guest
  loop
    -- Jubiläum: jede erreichte Stufe
    select count(*) into game_count from public.player_games(pid);
    foreach lvl in array st.jubilee_levels loop
      if game_count >= lvl then
        insert into public.badges (group_id, player_id, kind, level, result_id)
        values (res.group_id, pid, 'jubilaeum', lvl, p_result)
        on conflict do nothing;
      end if;
    end loop;

    -- Siegesserie: die letzten N Spiele (inkl. diesem) alle gewonnen
    select array_agg(g.score order by g.seq desc) into last_scores
    from (select * from public.player_games(pid) order by seq desc limit st.win_streak) g;
    if cardinality(last_scores) = st.win_streak and 1 = all(last_scores) then
      insert into public.badges (group_id, player_id, kind, result_id)
      values (res.group_id, pid, 'siegesserie', p_result)
      on conflict do nothing;
    end if;

    -- Comeback-König: in diesem Ergebnis als klarer Außenseiter gewonnen
    for mt in
      select m.id, rc.team_id as own_team,
        case when rc.team_id = m.team_a then m.team_b else m.team_a end as opp_team,
        case when rc.team_id = m.team_a then m.score_a else 1 - m.score_a end as score
      from public.rating_changes rc join public.matches m on m.id = rc.match_id
      where rc.result_id = p_result and rc.player_id = pid
    loop
      continue when mt.score <> 1;
      select sum((defense_before + attack_before) / 2) into strength_own
        from public.rating_changes where match_id = mt.id and team_id = mt.own_team;
      select sum((defense_before + attack_before) / 2) into strength_opp
        from public.rating_changes where match_id = mt.id and team_id = mt.opp_team;
      expected := 1 / (1 + power(10::numeric, (strength_opp - strength_own) / s.scale_d));
      if expected < st.comeback_max_chance then
        insert into public.badges (group_id, player_id, kind, result_id)
        values (res.group_id, pid, 'comeback', p_result)
        on conflict do nothing;
      end if;
    end loop;

    -- Treue Seele: bei den letzten N Spieltagen (mit Ergebnissen) der Gruppe dabei
    select array_agg(x.id) into session_ids from (
      select se.id from public.sessions se
      where se.group_id = res.group_id
        and exists (select 1 from public.results r where r.session_id = se.id)
      order by se.played_on desc, se.created_at desc
      limit st.loyal_sessions
    ) x;
    if cardinality(session_ids) = st.loyal_sessions and not exists (
      select 1 from unnest(session_ids) sid
      where not exists (
        select 1 from public.rating_changes rc join public.results r on r.id = rc.result_id
        where r.session_id = sid and rc.player_id = pid
      )
    ) then
      insert into public.badges (group_id, player_id, kind, result_id)
      values (res.group_id, pid, 'treue_seele', p_result)
      on conflict do nothing;
    end if;
  end loop;
end;
$$;

revoke execute on function public.award_badges(uuid), public.player_games(uuid) from public, anon, authenticated;

-- Ergebnis eintragen (Offline-Version, siehe …_offline.sql) vergibt jetzt auch Abzeichen
create or replace function public.record_result_v2(
  p_id uuid,
  p_session uuid,
  p_match_no integer,
  p_kind text,
  p_team_a uuid,
  p_team_b uuid,
  p_outcome text,
  p_goals_a integer,
  p_goals_b integer
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  gid uuid;
  mid uuid;
  outcome text := p_outcome;
  score numeric;
  other record;
begin
  select group_id into gid from public.sessions where id = p_session;
  if gid is null or not public.is_group_member(gid) then
    raise exception 'Diesen Spieltag gibt es nicht.';
  end if;
  -- Einträge desselben Spieltags nacheinander abarbeiten (Doppelte sicher erkennen)
  perform 1 from public.sessions where id = p_session for update;

  if exists (select 1 from public.results where id = p_id) then
    return 'already';
  end if;

  if p_kind = 'match' then
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
      outcome := case when p_goals_a > p_goals_b then 'a' when p_goals_a < p_goals_b then 'b' else 'draw' end;
    end if;
    score := case outcome when 'a' then 1 when 'b' then 0 when 'draw' then 0.5 end;
    if score is null then
      raise exception 'Ungültiges Ergebnis.';
    end if;
    if p_match_no is not null and exists (
      select 1 from public.results r join public.matches m on m.result_id = r.id
      where r.session_id = p_session and r.kind = 'match' and r.match_no = p_match_no
        and least(m.team_a, m.team_b) = least(p_team_a, p_team_b)
        and greatest(m.team_a, m.team_b) = greatest(p_team_a, p_team_b)
    ) then
      raise exception 'DOPPELT: Diese Partie hat schon jemand anderes eingetragen.';
    end if;

    insert into public.results (id, group_id, session_id, kind, entered_by, match_no)
      values (p_id, gid, p_session, 'match', auth.uid(), p_match_no);
    insert into public.matches (result_id, group_id, team_a, team_b, goals_a, goals_b, score_a)
      values (p_id, gid, p_team_a, p_team_b, p_goals_a, p_goals_b, score)
      returning id into mid;
    perform public.rate_match(mid);

  elsif p_kind = 'tournament' then
    if not exists (select 1 from public.teams where id = p_team_a and session_id = p_session) then
      raise exception 'Dieses Team gehört nicht zu diesem Spieltag.';
    end if;
    if p_match_no is not null and exists (
      select 1 from public.results
      where session_id = p_session and kind = 'tournament' and match_no = p_match_no
    ) then
      raise exception 'DOPPELT: Den Turniersieger hat schon jemand anderes eingetragen.';
    end if;

    insert into public.results (id, group_id, session_id, kind, entered_by, match_no)
      values (p_id, gid, p_session, 'tournament', auth.uid(), p_match_no);
    for other in
      select id from public.teams where session_id = p_session and id <> p_team_a order by idx
    loop
      insert into public.matches (result_id, group_id, team_a, team_b, score_a)
        values (p_id, gid, p_team_a, other.id, 1)
        returning id into mid;
      perform public.rate_match(mid);
    end loop;
  else
    raise exception 'Ungültiges Ergebnis.';
  end if;

  perform public.award_badges(p_id);

  insert into public.audit_log (group_id, user_id, action, details)
  values (gid, auth.uid(), 'result_recorded', jsonb_build_object('result_id', p_id, 'kind', p_kind));
  return 'saved';
end;
$$;
