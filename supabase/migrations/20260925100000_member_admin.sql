-- Mitglieder verwalten (Admin): Anzeigenamen ändern, Mitglied mit Spieler verknüpfen.

-- ---------------------------------------------------------------------------
-- Mitglied ↔ Spieler
-- ---------------------------------------------------------------------------

-- Ein Konto gehört in einer Gruppe zu höchstens einem Spieler
create unique index players_group_user_idx on public.players (group_id, user_id)
  where user_id is not null;

-- Verknüpfen nur mit Mitgliedern derselben Gruppe
create function public.check_player_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.user_id is not null and not exists (
    select 1 from public.group_members where group_id = new.group_id and user_id = new.user_id
  ) then
    raise exception 'Dieses Konto ist kein Mitglied der Gruppe.';
  end if;
  return new;
end;
$$;

create trigger players_check_user
  before insert or update of user_id on public.players
  for each row execute function public.check_player_user();

-- Wer die Gruppe verlässt oder entfernt wird, verliert die Verknüpfung
create function public.unlink_player_on_leave()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Wird gerade die ganze Gruppe gelöscht, gibt es nichts zu tun
  if exists (select 1 from public.groups where id = old.group_id) then
    update public.players set user_id = null
    where group_id = old.group_id and user_id = old.user_id;
  end if;
  return old;
end;
$$;

create trigger group_members_unlink_player
  after delete on public.group_members
  for each row execute function public.unlink_player_on_leave();

-- ---------------------------------------------------------------------------
-- Anzeigenamen eines Mitglieds ändern (nur Admin)
-- ---------------------------------------------------------------------------
-- Der Name gehört zum Konto; hat jemand mehrere Gruppen, ändert er sich überall.

create function public.set_member_name(p_group uuid, p_user uuid, p_name text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  old_name text;
begin
  if not public.is_group_admin(p_group) then
    raise exception 'Nur Admins dürfen Namen von Mitgliedern ändern.';
  end if;
  if not exists (select 1 from public.group_members where group_id = p_group and user_id = p_user) then
    raise exception 'Diese Person ist kein Mitglied der Gruppe.';
  end if;
  select display_name into old_name from public.profiles where id = p_user;
  update public.profiles set display_name = trim(p_name) where id = p_user;
  insert into public.audit_log (group_id, user_id, action, details)
  values (
    p_group,
    auth.uid(),
    'member_renamed',
    jsonb_build_object('member', p_user, 'before', old_name, 'after', trim(p_name))
  );
end;
$$;

revoke execute on function
  public.set_member_name(uuid, uuid, text),
  public.check_player_user(),
  public.unlink_player_on_leave()
from public, anon;
revoke execute on function public.check_player_user(), public.unlink_player_on_leave() from authenticated;
grant execute on function public.set_member_name(uuid, uuid, text) to authenticated;
