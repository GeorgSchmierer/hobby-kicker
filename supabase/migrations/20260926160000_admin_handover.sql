-- D2: Admin-Rechte weitergeben. Mehrere Admins gab es schon; neu:
-- * Der letzte Admin einer Gruppe mit weiteren Mitgliedern kann sein Konto nicht löschen, ohne
--   vorher jemand anderen zum Admin zu machen (bisher wurde automatisch jemand befördert).
--   Gruppe verlassen war schon gesperrt (leave_group).
-- * Rollenwechsel und Entfernen von Mitgliedern landen im audit_log.

-- Hinderungsgrund fürs Konto-Löschen: Name der ersten Gruppe, in der man einziger Admin ist
-- (null = Löschen möglich). Die App fragt das vorher ab, um einen verständlichen Hinweis zu zeigen.
create function public.account_deletion_blocker()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select g.name from public.group_members me
  join public.groups g on g.id = me.group_id
  where me.user_id = auth.uid() and me.role = 'admin'
    and not exists (
      select 1 from public.group_members o
      where o.group_id = me.group_id and o.user_id <> me.user_id and o.role = 'admin'
    )
    and exists (
      select 1 from public.group_members o
      where o.group_id = me.group_id and o.user_id <> me.user_id
    )
  order by g.name
  limit 1
$$;

create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  blocker text;
begin
  if uid is null then
    raise exception 'Nicht angemeldet';
  end if;

  blocker := public.account_deletion_blocker();
  if blocker is not null then
    raise exception 'Du bist der einzige Admin in „%“. Mach vorher jemand anderen zum Admin (Reiter „Gruppe“ → Mitglied → Bearbeiten → Zum Admin).', blocker;
  end if;

  -- Gruppen, in denen man allein ist, werden gelöscht
  delete from public.groups gr
  where exists (select 1 from public.group_members m where m.group_id = gr.id and m.user_id = uid)
    and not exists (select 1 from public.group_members m where m.group_id = gr.id and m.user_id <> uid);

  delete from auth.users where id = uid;
end;
$$;

-- Protokoll: Rolle geändert
create function public.log_role_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.role is distinct from old.role then
    insert into public.audit_log (group_id, user_id, action, details)
    values (new.group_id, auth.uid(), 'role_changed',
            jsonb_build_object('member', new.user_id, 'before', old.role, 'after', new.role));
  end if;
  return new;
end;
$$;

create trigger group_members_log_role
  after update of role on public.group_members
  for each row execute function public.log_role_change();

-- Protokoll: von einem Admin entfernt (selbst verlassen protokolliert leave_group)
create function public.log_member_removed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is distinct from old.user_id
     and exists (select 1 from public.groups where id = old.group_id) then
    insert into public.audit_log (group_id, user_id, action, details)
    values (old.group_id, auth.uid(), 'member_removed', jsonb_build_object('member', old.user_id));
  end if;
  return old;
end;
$$;

create trigger group_members_log_removed
  after delete on public.group_members
  for each row execute function public.log_member_removed();

revoke execute on function
  public.account_deletion_blocker(), public.log_role_change(), public.log_member_removed()
from public, anon;
revoke execute on function public.log_role_change(), public.log_member_removed() from authenticated;
grant execute on function public.account_deletion_blocker() to authenticated;
