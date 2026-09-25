-- D1: Kassenbuch – nur zum Mitschreiben, keine echten Zahlungen in der App.
-- Kosten je Spieltag (z. B. Hallenmiete) werden auf alle aufgeteilt, die an dem Tag in einem Team
-- waren (auch Gäste und Nachzügler). Beträge in Cent; die Summe der Anteile ist immer genau der
-- Betrag (Rest-Cents gehen der Reihe nach an die ersten Spieler, sortiert nach Name).
-- Eintragen, löschen und „bezahlt“ abhaken: nur Admins (Wunsch Projektinhaber). Sehen: alle Mitglieder.

create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  session_id uuid not null references public.sessions (id) on delete cascade,
  description text not null check (char_length(trim(description)) between 1 and 60),
  amount_cents integer not null check (amount_cents between 1 and 1000000),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
create index expenses_group_idx on public.expenses (group_id);
create index expenses_session_idx on public.expenses (session_id);

create table public.expense_shares (
  expense_id uuid not null references public.expenses (id) on delete cascade,
  player_id uuid not null references public.players (id),
  group_id uuid not null references public.groups (id) on delete cascade,
  amount_cents integer not null check (amount_cents >= 0),
  paid_at timestamptz,
  paid_by uuid references auth.users (id) on delete set null,
  primary key (expense_id, player_id)
);
create index expense_shares_player_idx on public.expense_shares (player_id);

alter table public.expenses enable row level security;
alter table public.expense_shares enable row level security;
create policy "expenses_select" on public.expenses for select to authenticated
  using (public.is_group_member(group_id));
create policy "expense_shares_select" on public.expense_shares for select to authenticated
  using (public.is_group_member(group_id));

-- Kosten eintragen und aufteilen
create function public.add_expense(p_session uuid, p_description text, p_amount_cents integer)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  gid uuid;
  eid uuid;
  people uuid[];
  n integer;
  base integer;
  rest integer;
  i integer;
begin
  select group_id into gid from public.sessions where id = p_session;
  if gid is null or not public.is_group_admin(gid) then
    raise exception 'Kosten eintragen können nur Admins.';
  end if;
  if p_amount_cents is null or p_amount_cents < 1 or p_amount_cents > 1000000 then
    raise exception 'Bitte einen Betrag zwischen 0,01 € und 10.000 € eingeben.';
  end if;

  -- Alle, die an dem Tag in einem Team waren (aktuelle Aufstellung + wer eine Partie gespielt hat)
  select array_agg(p.id order by lower(p.name), p.id) into people
  from public.players p
  where p.id in (
    select tp.player_id from public.team_players tp join public.teams t on t.id = tp.team_id
    where t.session_id = p_session
    union
    select rc.player_id from public.rating_changes rc join public.results r on r.id = rc.result_id
    where r.session_id = p_session
  );
  n := coalesce(cardinality(people), 0);
  if n = 0 then
    raise exception 'An diesem Spieltag hat niemand mitgespielt.';
  end if;

  insert into public.expenses (group_id, session_id, description, amount_cents, created_by)
  values (gid, p_session, trim(p_description), p_amount_cents, auth.uid())
  returning id into eid;

  base := p_amount_cents / n;
  rest := p_amount_cents - base * n;
  for i in 1 .. n loop
    insert into public.expense_shares (expense_id, player_id, group_id, amount_cents)
    values (eid, people[i], gid, base + case when i <= rest then 1 else 0 end);
  end loop;

  insert into public.audit_log (group_id, user_id, action, details)
  values (gid, auth.uid(), 'expense_added',
          jsonb_build_object('expense_id', eid, 'amount_cents', p_amount_cents, 'description', p_description));
  return eid;
end;
$$;

-- Anteil als bezahlt / offen markieren (p_player = null: alle Anteile der Kosten)
create function public.set_share_paid(p_expense uuid, p_player uuid, p_paid boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  gid uuid;
begin
  select group_id into gid from public.expenses where id = p_expense;
  if gid is null or not public.is_group_admin(gid) then
    raise exception 'Zahlungen abhaken können nur Admins.';
  end if;
  update public.expense_shares
  set paid_at = case when p_paid then coalesce(paid_at, now()) end,
      paid_by = case when p_paid then coalesce(paid_by, auth.uid()) end
  where expense_id = p_expense and (p_player is null or player_id = p_player);
end;
$$;

create function public.delete_expense(p_expense uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  gid uuid;
begin
  select group_id into gid from public.expenses where id = p_expense;
  if gid is null or not public.is_group_admin(gid) then
    raise exception 'Kosten löschen können nur Admins.';
  end if;
  delete from public.expenses where id = p_expense;
  insert into public.audit_log (group_id, user_id, action, details)
  values (gid, auth.uid(), 'expense_deleted', jsonb_build_object('expense_id', p_expense));
end;
$$;

revoke execute on function
  public.add_expense(uuid, text, integer),
  public.set_share_paid(uuid, uuid, boolean),
  public.delete_expense(uuid)
from public, anon;
grant execute on function
  public.add_expense(uuid, text, integer),
  public.set_share_paid(uuid, uuid, boolean),
  public.delete_expense(uuid)
to authenticated;
