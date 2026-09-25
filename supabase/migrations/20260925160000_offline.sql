-- A5: Offline-Modus. Spieltag starten und Ergebnisse eintragen geht auch ohne Netz – die App
-- sammelt die Einträge und schickt sie später. Dafür:
-- * Die App vergibt die IDs selbst (Spieltag, Teams, Ergebnis). Kommt ein Eintrag doppelt an
--   (Antwort ging verloren, App schickt nochmal), wird er nicht noch einmal gewertet.
-- * Jedes Ergebnis trägt die laufende Nummer der Partie am Spieltag, wie das Handy sie kannte
--   (match_no). Haben zwei Handys dieselbe Partie eingetragen, gewinnt der erste Eintrag; der
--   zweite wird mit einer verständlichen Meldung abgelehnt.
-- Die alten Funktionen bleiben für ältere App-Versionen bestehen.

alter table public.results add column match_no integer check (match_no is null or match_no > 0);

-- Spieltag mit vorgegebenen IDs anlegen (idempotent). p_played_on: Tag, an dem das Handy den
-- Spieltag angelegt hat (höchstens 3 Tage zurück, falls erst später Netz da war).
create function public.start_session_v2(
  p_id uuid,
  p_group uuid,
  p_teams jsonb,
  p_team_ids uuid[],
  p_played_on date
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing uuid;
  team_count integer;
  all_ids uuid[];
  i integer;
  pid uuid;
begin
  if not public.is_group_member(p_group) then
    raise exception 'Du bist kein Mitglied dieser Gruppe.';
  end if;
  select group_id into existing from public.sessions where id = p_id;
  if found then
    if existing <> p_group then
      raise exception 'Ungültiger Spieltag.';
    end if;
    return p_id; -- schon angekommen (erneutes Senden)
  end if;

  if p_played_on is null or p_played_on > public.berlin_today()
     or p_played_on < public.berlin_today() - 3 then
    raise exception 'Ungültiges Datum für den Spieltag.';
  end if;
  if jsonb_typeof(p_teams) <> 'array' then
    raise exception 'Ungültige Teams.';
  end if;
  team_count := jsonb_array_length(p_teams);
  if team_count not between 2 and 4 then
    raise exception 'Es braucht 2 bis 4 Teams.';
  end if;
  if p_team_ids is null or cardinality(p_team_ids) <> team_count
     or cardinality(p_team_ids) <> (select count(distinct x) from unnest(p_team_ids) x) then
    raise exception 'Ungültige Teams.';
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

  insert into public.sessions (id, group_id, played_on, created_by)
    values (p_id, p_group, p_played_on, auth.uid());

  for i in 0 .. team_count - 1 loop
    if jsonb_array_length(p_teams -> i) = 0 then
      raise exception 'Jedes Team braucht mindestens einen Spieler.';
    end if;
    insert into public.teams (id, session_id, group_id, idx) values (p_team_ids[i + 1], p_id, p_group, i);
    for pid in
      select member_id::uuid from jsonb_array_elements_text(p_teams -> i) as member(member_id)
    loop
      insert into public.team_players (team_id, player_id, group_id) values (p_team_ids[i + 1], pid, p_group);
    end loop;
  end loop;

  insert into public.audit_log (group_id, user_id, action, details)
  values (p_group, auth.uid(), 'session_started', jsonb_build_object('session_id', p_id));
  return p_id;
end;
$$;

-- Ergebnis eintragen (Partie oder Turniersieger) mit vorgegebener ID, idempotent.
-- p_kind 'match': p_team_a gegen p_team_b, p_outcome 'a' | 'b' | 'draw' (mit Toren aus den Toren).
-- p_kind 'tournament': p_team_a ist der Turniersieger.
-- Rückgabe: 'saved' (neu gewertet) oder 'already' (war schon da).
create function public.record_result_v2(
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

  insert into public.audit_log (group_id, user_id, action, details)
  values (gid, auth.uid(), 'result_recorded', jsonb_build_object('result_id', p_id, 'kind', p_kind));
  return 'saved';
end;
$$;

revoke execute on function
  public.start_session_v2(uuid, uuid, jsonb, uuid[], date),
  public.record_result_v2(uuid, uuid, integer, text, uuid, uuid, text, integer, integer)
from public, anon;
grant execute on function
  public.start_session_v2(uuid, uuid, jsonb, uuid[], date),
  public.record_result_v2(uuid, uuid, integer, text, uuid, uuid, text, integer, integer)
to authenticated;
