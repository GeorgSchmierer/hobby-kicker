-- C2: Saison-Tabelle. Punkte rechnet der Server (Stellschrauben in rating_settings).
-- Saisons legt der Admin fest (Name, Beginn, Ende); ohne Saisons zeigt die App Kalenderjahre.
-- Gezählt wird wie in der Statistik: eine Partie = ein Spiel; ein Turniersieg = EIN Sieg für das
-- Siegerteam und EINE Niederlage für die anderen. Gäste erscheinen nicht.

alter table public.rating_settings
  add column points_win integer not null default 3 check (points_win >= 0),
  add column points_draw integer not null default 1 check (points_draw >= 0),
  add column points_loss integer not null default 0 check (points_loss >= 0);

create table public.seasons (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 40),
  starts_on date not null,
  ends_on date not null,
  created_at timestamptz not null default now(),
  check (ends_on >= starts_on)
);
create index seasons_group_idx on public.seasons (group_id, starts_on desc);

alter table public.seasons enable row level security;
create policy "seasons_select" on public.seasons for select to authenticated
  using (public.is_group_member(group_id));
create policy "seasons_insert_admin" on public.seasons for insert to authenticated
  with check (public.is_group_admin(group_id));
create policy "seasons_update_admin" on public.seasons for update to authenticated
  using (public.is_group_admin(group_id)) with check (public.is_group_admin(group_id));
create policy "seasons_delete_admin" on public.seasons for delete to authenticated
  using (public.is_group_admin(group_id));

-- Tabelle eines Zeitraums (p_from/p_to = null: ohne Grenze). Sortiert nach Punkten, dann
-- Siegen, dann weniger Spielen.
create function public.standings(p_group uuid, p_from date default null, p_to date default null)
returns table (
  player_id uuid,
  played integer,
  wins integer,
  draws integer,
  losses integer,
  points integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_group_member(p_group) then
    raise exception 'Du bist kein Mitglied dieser Gruppe.';
  end if;
  return query
  with games as (
    -- je Ergebnis und Spieler genau ein Spiel (bei Turnieren die erste Partie des Ergebnisses)
    select distinct on (rc.result_id, rc.player_id)
      rc.player_id,
      case when rc.team_id = m.team_a then m.score_a else 1 - m.score_a end as score
    from public.rating_changes rc
    join public.matches m on m.id = rc.match_id
    join public.results r on r.id = rc.result_id
    join public.sessions s on s.id = r.session_id
    join public.players p on p.id = rc.player_id
    where r.group_id = p_group
      and not p.is_guest
      and (p_from is null or s.played_on >= p_from)
      and (p_to is null or s.played_on <= p_to)
    order by rc.result_id, rc.player_id, rc.id
  ),
  totals as (
    select g.player_id,
      count(*)::integer as played,
      count(*) filter (where g.score = 1)::integer as wins,
      count(*) filter (where g.score = 0.5)::integer as draws,
      count(*) filter (where g.score = 0)::integer as losses
    from games g
    group by g.player_id
  )
  select t.player_id, t.played, t.wins, t.draws, t.losses,
    (t.wins * st.points_win + t.draws * st.points_draw + t.losses * st.points_loss)::integer as points
  from totals t cross join public.rating_settings st
  order by points desc, t.wins desc, t.played asc;
end;
$$;

revoke execute on function public.standings(uuid, date, date) from public, anon;
grant execute on function public.standings(uuid, date, date) to authenticated;
