-- A1 + A2: Fester Termin (wöchentlich) und Zu-/Absagen.
-- Ein Termin wird über sein Datum angesprochen; die Serie legt Wochentag, Uhrzeit und Ort fest.
-- Einzelne Termine können abgesagt werden, ohne die Serie zu löschen.
-- Schreiben nur über Server-Funktionen, lesen dürfen alle Mitglieder.

-- ---------------------------------------------------------------------------
-- Tabellen
-- ---------------------------------------------------------------------------

-- Eine Serie pro Gruppe
create table public.schedules (
  group_id uuid primary key references public.groups (id) on delete cascade,
  weekday smallint not null check (weekday between 1 and 7), -- 1 = Montag … 7 = Sonntag
  start_time time not null,
  location text check (location is null or char_length(location) between 1 and 80),
  max_players smallint check (max_players is null or max_players between 2 and 99),
  updated_at timestamptz not null default now()
);

-- Abgesagte Einzeltermine („fällt aus“)
create table public.event_cancellations (
  group_id uuid not null references public.schedules (group_id) on delete cascade,
  event_date date not null,
  cancelled_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (group_id, event_date)
);

-- Zu-/Absagen je Termin und Spieler (nicht je Konto: auch Spieler ohne App können zusagen)
create table public.rsvps (
  group_id uuid not null references public.groups (id) on delete cascade,
  event_date date not null,
  player_id uuid not null references public.players (id) on delete cascade,
  attending boolean not null,
  -- Zeitpunkt der letzten Änderung der Antwort (für die Warteliste: wer zuerst zusagt, ist drin)
  answered_at timestamptz not null default now(),
  answered_by uuid references auth.users (id) on delete set null,
  primary key (group_id, event_date, player_id)
);
create index rsvps_player_idx on public.rsvps (player_id);

alter table public.schedules enable row level security;
alter table public.event_cancellations enable row level security;
alter table public.rsvps enable row level security;

create policy "schedules_select" on public.schedules for select to authenticated
  using (public.is_group_member(group_id));
create policy "event_cancellations_select" on public.event_cancellations for select to authenticated
  using (public.is_group_member(group_id));
create policy "rsvps_select" on public.rsvps for select to authenticated
  using (public.is_group_member(group_id));

-- ---------------------------------------------------------------------------
-- Hilfsfunktionen
-- ---------------------------------------------------------------------------

-- Heutiges Datum in deutscher Zeit
create function public.berlin_today()
returns date
language sql
stable
set search_path = ''
as $$
  select (now() at time zone 'Europe/Berlin')::date
$$;

-- Ist p_date ein kommender Termin der Serie (richtiger Wochentag, nicht in der Vergangenheit)?
create function public.is_upcoming_event(p_group uuid, p_date date)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.schedules s
    where s.group_id = p_group
      and extract(isodow from p_date) = s.weekday
      and p_date >= public.berlin_today()
  )
$$;

-- ---------------------------------------------------------------------------
-- Server-Funktionen
-- ---------------------------------------------------------------------------

-- Serie anlegen oder ändern (nur Admin). Ändert sich der Wochentag, verfallen die
-- kommenden Absagen und Antworten des alten Wochentags.
create function public.save_schedule(
  p_group uuid,
  p_weekday integer,
  p_time time,
  p_location text,
  p_max integer
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_group_admin(p_group) then
    raise exception 'Nur Admins dürfen den Termin festlegen.';
  end if;
  insert into public.schedules (group_id, weekday, start_time, location, max_players)
  values (p_group, p_weekday, p_time, nullif(trim(p_location), ''), p_max)
  on conflict (group_id) do update
    set weekday = excluded.weekday,
        start_time = excluded.start_time,
        location = excluded.location,
        max_players = excluded.max_players,
        updated_at = now();

  delete from public.event_cancellations
  where group_id = p_group and event_date >= public.berlin_today()
    and extract(isodow from event_date) <> p_weekday;
  delete from public.rsvps
  where group_id = p_group and event_date >= public.berlin_today()
    and extract(isodow from event_date) <> p_weekday;

  insert into public.audit_log (group_id, user_id, action, details)
  values (p_group, auth.uid(), 'schedule_saved', jsonb_build_object(
    'weekday', p_weekday, 'time', p_time, 'location', p_location, 'max_players', p_max));
end;
$$;

-- Serie löschen (nur Admin); kommende Antworten verfallen, vergangene bleiben für Statistiken
create function public.delete_schedule(p_group uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_group_admin(p_group) then
    raise exception 'Nur Admins dürfen den Termin löschen.';
  end if;
  delete from public.rsvps where group_id = p_group and event_date >= public.berlin_today();
  delete from public.schedules where group_id = p_group;
  insert into public.audit_log (group_id, user_id, action) values (p_group, auth.uid(), 'schedule_deleted');
end;
$$;

-- Einzelnen Termin absagen oder wieder stattfinden lassen (nur Admin)
create function public.set_event_cancelled(p_group uuid, p_date date, p_cancelled boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_group_admin(p_group) then
    raise exception 'Nur Admins dürfen Termine absagen.';
  end if;
  if not public.is_upcoming_event(p_group, p_date) then
    raise exception 'An diesem Tag ist kein Termin.';
  end if;
  if p_cancelled then
    insert into public.event_cancellations (group_id, event_date, cancelled_by)
    values (p_group, p_date, auth.uid())
    on conflict do nothing;
  else
    delete from public.event_cancellations where group_id = p_group and event_date = p_date;
  end if;
  insert into public.audit_log (group_id, user_id, action, details)
  values (p_group, auth.uid(), case when p_cancelled then 'event_cancelled' else 'event_restored' end,
          jsonb_build_object('date', p_date));
end;
$$;

-- Zu- oder absagen (p_attending = null nimmt die Antwort zurück).
-- Jedes Mitglied darf für sich selbst und für Spieler ohne Konto antworten, Admins für alle.
create function public.set_rsvp(p_group uuid, p_date date, p_player uuid, p_attending boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  owner uuid;
begin
  if not public.is_group_member(p_group) then
    raise exception 'Diese Gruppe gibt es nicht.';
  end if;
  select user_id into owner from public.players
  where id = p_player and group_id = p_group and active;
  if not found then
    raise exception 'Diesen Spieler gibt es nicht.';
  end if;
  if owner is not null and owner <> auth.uid() and not public.is_group_admin(p_group) then
    raise exception 'Dieser Spieler hat ein eigenes Konto und antwortet selbst.';
  end if;
  if not public.is_upcoming_event(p_group, p_date) then
    raise exception 'An diesem Tag ist kein Termin.';
  end if;
  if exists (select 1 from public.event_cancellations where group_id = p_group and event_date = p_date) then
    raise exception 'Dieser Termin fällt aus.';
  end if;

  if p_attending is null then
    delete from public.rsvps where group_id = p_group and event_date = p_date and player_id = p_player;
    return;
  end if;
  insert into public.rsvps (group_id, event_date, player_id, attending, answered_by)
  values (p_group, p_date, p_player, p_attending, auth.uid())
  on conflict (group_id, event_date, player_id) do update
    set attending = excluded.attending,
        answered_by = excluded.answered_by,
        -- Platz auf der Liste behalten, wenn sich die Antwort nicht ändert
        answered_at = case when public.rsvps.attending = excluded.attending
                           then public.rsvps.answered_at else now() end;
end;
$$;

-- ---------------------------------------------------------------------------
-- Rechte
-- ---------------------------------------------------------------------------

revoke execute on function
  public.berlin_today(),
  public.is_upcoming_event(uuid, date),
  public.save_schedule(uuid, integer, time, text, integer),
  public.delete_schedule(uuid),
  public.set_event_cancelled(uuid, date, boolean),
  public.set_rsvp(uuid, date, uuid, boolean)
from public, anon;

grant execute on function
  public.berlin_today(),
  public.is_upcoming_event(uuid, date),
  public.save_schedule(uuid, integer, time, text, integer),
  public.delete_schedule(uuid),
  public.set_event_cancelled(uuid, date, boolean),
  public.set_rsvp(uuid, date, uuid, boolean)
to authenticated;
