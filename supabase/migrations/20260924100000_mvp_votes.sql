-- Extra: „MVP des Tages“ – jedes Mitglied hat pro Spieltag eine Stimme (änderbar).
-- Gewählt werden kann nur, wer an diesem Spieltag in einem Team war.

create table public.mvp_votes (
  session_id uuid not null references public.sessions (id) on delete cascade,
  voter_id uuid not null references auth.users (id) on delete cascade,
  player_id uuid not null references public.players (id),
  group_id uuid not null references public.groups (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (session_id, voter_id)
);
create index mvp_votes_group_idx on public.mvp_votes (group_id);

alter table public.mvp_votes enable row level security;

-- Alle Mitglieder sehen die Stimmen (wer wen gewählt hat, ist kein Geheimnis in der Runde);
-- abgeben/ändern nur über vote_mvp()
create policy "mvp_votes_select" on public.mvp_votes for select to authenticated
  using (public.is_group_member(group_id));

create function public.vote_mvp(p_session uuid, p_player uuid)
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
  if not exists (
    select 1 from public.team_players tp
    join public.teams t on t.id = tp.team_id
    where t.session_id = p_session and tp.player_id = p_player
  ) then
    raise exception 'Dieser Spieler hat an dem Spieltag nicht mitgespielt.';
  end if;

  insert into public.mvp_votes (session_id, voter_id, player_id, group_id)
  values (p_session, auth.uid(), p_player, gid)
  on conflict (session_id, voter_id)
  do update set player_id = excluded.player_id, created_at = now();
end;
$$;

revoke execute on function public.vote_mvp(uuid, uuid) from public, anon;
grant execute on function public.vote_mvp(uuid, uuid) to authenticated;
