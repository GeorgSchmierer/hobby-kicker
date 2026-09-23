-- M2: Profile, Gruppen, Mitglieder, Spieler, Audit-Log
-- Sicherheitsregeln siehe CLAUDE.md, Abschnitt 8.
-- Grundsatz: Row Level Security (RLS) auf allen Tabellen. Alles, was mehr als eine
-- Tabelle betrifft (Gruppe anlegen, beitreten, Konto löschen), läuft über Server-Funktionen.

-- ---------------------------------------------------------------------------
-- Tabellen
-- ---------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text check (char_length(trim(display_name)) between 1 and 30),
  created_at timestamptz not null default now()
);

create table public.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 1 and 40),
  invite_code text not null unique,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.group_members (
  group_id uuid not null references public.groups (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null default 'member' check (role in ('admin', 'member')),
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);
create index group_members_user_idx on public.group_members (user_id);

create table public.players (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 30),
  defense numeric(4, 2) not null default 6 check (defense between 1 and 11),
  attack numeric(4, 2) not null default 6 check (attack between 1 and 11),
  games_played integer not null default 0 check (games_played >= 0),
  active boolean not null default true,
  user_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index players_group_name_idx on public.players (group_id, lower(trim(name)));

create table public.audit_log (
  id bigint generated always as identity primary key,
  group_id uuid references public.groups (id) on delete cascade,
  user_id uuid references auth.users (id) on delete set null,
  action text not null,
  details jsonb,
  created_at timestamptz not null default now()
);
create index audit_log_group_idx on public.audit_log (group_id, created_at desc);

-- Fehlversuche beim Beitreten (Begrenzung gegen Durchprobieren von Codes)
create table public.invite_attempts (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  attempted_at timestamptz not null default now()
);
create index invite_attempts_user_idx on public.invite_attempts (user_id, attempted_at desc);

-- ---------------------------------------------------------------------------
-- Hilfsfunktionen (security definer, damit die RLS-Regeln sich nicht selbst aufrufen)
-- ---------------------------------------------------------------------------

create function public.is_group_member(gid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.group_members
    where group_id = gid and user_id = auth.uid()
  );
$$;

create function public.is_group_admin(gid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.group_members
    where group_id = gid and user_id = auth.uid() and role = 'admin'
  );
$$;

create function public.shares_group_with(other uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.group_members me
    join public.group_members them on them.group_id = me.group_id
    where me.user_id = auth.uid() and them.user_id = other
  );
$$;

-- Zufälliger Einladungscode: 8 Zeichen ohne leicht verwechselbare (0/O, 1/I/L)
create function public.new_invite_code()
returns text
language plpgsql
volatile
set search_path = ''
as $$
declare
  alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  bytes bytea;
  code text;
begin
  loop
    bytes := extensions.gen_random_bytes(8);
    code := '';
    for i in 0..7 loop
      code := code || substr(alphabet, (get_byte(bytes, i) % length(alphabet)) + 1, 1);
    end loop;
    exit when not exists (select 1 from public.groups where invite_code = code);
  end loop;
  return code;
end;
$$;

-- ---------------------------------------------------------------------------
-- Trigger
-- ---------------------------------------------------------------------------

-- Beim ersten Login automatisch ein (leeres) Profil anlegen
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id) values (new.id);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger players_touch_updated_at
  before update on public.players
  for each row execute function public.touch_updated_at();

-- Änderungen an Spielern protokollieren (wer hat wann was geändert)
create function public.log_player_change()
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

create trigger players_audit
  after insert or update or delete on public.players
  for each row execute function public.log_player_change();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.groups enable row level security;
alter table public.group_members enable row level security;
alter table public.players enable row level security;
alter table public.audit_log enable row level security;
alter table public.invite_attempts enable row level security;

-- Profile: eigenes Profil und Profile von Leuten aus den eigenen Gruppen sehen; nur eigenes ändern
create policy "profiles_select" on public.profiles for select to authenticated
  using (id = (select auth.uid()) or public.shares_group_with(id));
create policy "profiles_update_own" on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- Gruppen: Mitglieder sehen, Admins dürfen umbenennen. Anlegen nur über create_group().
create policy "groups_select" on public.groups for select to authenticated
  using (public.is_group_member(id));
create policy "groups_update_admin" on public.groups for update to authenticated
  using (public.is_group_admin(id)) with check (public.is_group_admin(id));

-- Mitglieder: Mitglieder sehen die Liste. Rollen ändern und entfernen nur Admins.
-- Beitreten nur über create_group()/join_group(), Verlassen über leave_group().
create policy "members_select" on public.group_members for select to authenticated
  using (public.is_group_member(group_id));
-- Die eigene Rolle kann man nicht ändern (sonst könnte eine Gruppe ohne Admin bleiben)
create policy "members_update_admin" on public.group_members for update to authenticated
  using (public.is_group_admin(group_id) and user_id <> (select auth.uid()))
  with check (public.is_group_admin(group_id) and user_id <> (select auth.uid()));
create policy "members_delete_admin" on public.group_members for delete to authenticated
  using (public.is_group_admin(group_id) and user_id <> (select auth.uid()));

-- Spieler: alle Mitglieder sehen sie (inkl. Stärkewerte). Anlegen, Ändern, Löschen nur Admins.
create policy "players_select" on public.players for select to authenticated
  using (public.is_group_member(group_id));
create policy "players_insert_admin" on public.players for insert to authenticated
  with check (public.is_group_admin(group_id));
create policy "players_update_admin" on public.players for update to authenticated
  using (public.is_group_admin(group_id)) with check (public.is_group_admin(group_id));
create policy "players_delete_admin" on public.players for delete to authenticated
  using (public.is_group_admin(group_id));

-- Audit-Log: Mitglieder dürfen lesen, schreiben nur die Trigger
create policy "audit_select" on public.audit_log for select to authenticated
  using (public.is_group_member(group_id));

-- invite_attempts: keine Policies -> für die App unsichtbar, nur Server-Funktionen nutzen sie

-- Spielzähler darf nur der Server ändern (ab M3 über die Wertungsfunktion):
-- Änderungsrecht nur für die übrigen Spalten vergeben
revoke update on public.players from authenticated, anon;
grant update (name, defense, attack, active, user_id) on public.players to authenticated;

-- ---------------------------------------------------------------------------
-- Server-Funktionen (von der App aus aufrufbar)
-- ---------------------------------------------------------------------------

-- Gruppe anlegen; wer sie anlegt, wird Admin
create function public.create_group(group_name text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  gid uuid;
begin
  if uid is null then
    raise exception 'Nicht angemeldet';
  end if;
  insert into public.groups (name, invite_code, created_by)
  values (trim(group_name), public.new_invite_code(), uid)
  returning id into gid;
  insert into public.group_members (group_id, user_id, role) values (gid, uid, 'admin');
  insert into public.audit_log (group_id, user_id, action) values (gid, uid, 'group_created');
  return gid;
end;
$$;

-- Mit Einladungscode beitreten. Gibt die Gruppen-ID zurück oder null bei falschem Code.
-- Höchstens 5 Fehlversuche pro 15 Minuten.
create function public.join_group(code text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  gid uuid;
  failed integer;
begin
  if uid is null then
    raise exception 'Nicht angemeldet';
  end if;

  select count(*) into failed
  from public.invite_attempts
  where user_id = uid and attempted_at > now() - interval '15 minutes';
  if failed >= 5 then
    raise exception 'Zu viele Fehlversuche. Bitte in 15 Minuten erneut versuchen.'
      using errcode = 'P0001', hint = 'rate_limited';
  end if;

  select id into gid from public.groups
  where invite_code = upper(regexp_replace(code, '[^A-Za-z0-9]', '', 'g'));

  if gid is null then
    insert into public.invite_attempts (user_id) values (uid);
    return null;
  end if;

  insert into public.group_members (group_id, user_id, role)
  values (gid, uid, 'member')
  on conflict (group_id, user_id) do nothing;
  if found then
    insert into public.audit_log (group_id, user_id, action) values (gid, uid, 'member_joined');
  end if;
  return gid;
end;
$$;

-- Neuen Einladungscode erzeugen (nur Admin); der alte ist danach ungültig
create function public.regenerate_invite_code(gid uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  code text;
begin
  if not public.is_group_admin(gid) then
    raise exception 'Nur Admins dürfen den Einladungscode erneuern.';
  end if;
  code := public.new_invite_code();
  update public.groups set invite_code = code where id = gid;
  insert into public.audit_log (group_id, user_id, action)
  values (gid, auth.uid(), 'invite_code_regenerated');
  return code;
end;
$$;

-- Gruppe verlassen. Der letzte Admin muss vorher jemand anderen zum Admin machen,
-- außer er ist das letzte Mitglied – dann wird die Gruppe gelöscht.
create function public.leave_group(gid uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  other_admins integer;
  other_members integer;
begin
  if not public.is_group_member(gid) then
    return;
  end if;
  select count(*) filter (where role = 'admin'), count(*)
    into other_admins, other_members
  from public.group_members
  where group_id = gid and user_id <> uid;

  if other_members = 0 then
    delete from public.groups where id = gid;
    return;
  end if;
  if public.is_group_admin(gid) and other_admins = 0 then
    raise exception 'Du bist der einzige Admin. Mach zuerst jemand anderen zum Admin.';
  end if;
  delete from public.group_members where group_id = gid and user_id = uid;
  insert into public.audit_log (group_id, user_id, action) values (gid, uid, 'member_left');
end;
$$;

-- Eigenes Konto löschen (DSGVO). Gruppen ohne weiteren Admin bekommen das
-- am längsten dabei gewesene Mitglied als Admin; leere Gruppen werden gelöscht.
create function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  g record;
begin
  if uid is null then
    raise exception 'Nicht angemeldet';
  end if;

  for g in select group_id from public.group_members where user_id = uid and role = 'admin' loop
    if not exists (
      select 1 from public.group_members
      where group_id = g.group_id and user_id <> uid and role = 'admin'
    ) then
      update public.group_members set role = 'admin'
      where (group_id, user_id) = (
        select group_id, user_id from public.group_members
        where group_id = g.group_id and user_id <> uid
        order by joined_at
        limit 1
      );
    end if;
  end loop;

  delete from public.groups gr
  where exists (select 1 from public.group_members m where m.group_id = gr.id and m.user_id = uid)
    and not exists (select 1 from public.group_members m where m.group_id = gr.id and m.user_id <> uid);

  delete from auth.users where id = uid;
end;
$$;

-- Server-Funktionen nur für angemeldete Nutzer freigeben
revoke execute on function
  public.create_group(text),
  public.join_group(text),
  public.regenerate_invite_code(uuid),
  public.leave_group(uuid),
  public.delete_my_account(),
  public.new_invite_code(),
  public.handle_new_user(),
  public.log_player_change(),
  public.touch_updated_at(),
  public.is_group_member(uuid),
  public.is_group_admin(uuid),
  public.shares_group_with(uuid)
from public, anon;

revoke execute on function public.new_invite_code() from authenticated;

grant execute on function
  public.create_group(text),
  public.join_group(text),
  public.regenerate_invite_code(uuid),
  public.leave_group(uuid),
  public.delete_my_account(),
  public.is_group_member(uuid),
  public.is_group_admin(uuid),
  public.shares_group_with(uuid)
to authenticated;
