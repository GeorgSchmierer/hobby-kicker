-- A6: Gastspieler. Ein Gast ist ein Spieler mit is_guest = true: wird normal eingeteilt und
-- gewertet (seine Werte passen sich an), erscheint aber nicht in Tabelle und Statistik.
-- Nach dem Spieltag: als festen Spieler übernehmen (is_guest = false, nur Admin) oder
-- ausblenden (active = false). Ganz gelöscht wird er nicht, weil die Partien der anderen
-- sonst unvollständig wären. Kommt derselbe Gast wieder, wird der alte Eintrag reaktiviert.

alter table public.players add column is_guest boolean not null default false;

-- Gast anlegen (jedes Mitglied). p_id vergibt die App (Offline-Modus: idempotent).
-- Gibt es p_id schon als Gast der Gruppe, wird er wieder eingeblendet (Werte bleiben).
create function public.add_guest(p_id uuid, p_group uuid, p_name text, p_rating numeric)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing public.players;
begin
  if not public.is_group_member(p_group) then
    raise exception 'Du bist kein Mitglied dieser Gruppe.';
  end if;
  select * into existing from public.players where id = p_id;
  if found then
    if existing.group_id <> p_group or not existing.is_guest then
      raise exception 'Ungültiger Gast.';
    end if;
    update public.players set active = true where id = p_id and not active;
    return p_id;
  end if;
  if p_rating is null or p_rating < 1 or p_rating > 11 then
    raise exception 'Ungültige Stärke.';
  end if;
  insert into public.players (id, group_id, name, defense, attack, is_guest)
    values (p_id, p_group, trim(p_name), p_rating, p_rating, true);
  return p_id;
end;
$$;

-- Nach dem Spieltag: Gast übernehmen (p_keep = true, nur Admin) oder ausblenden (jedes Mitglied)
create function public.finish_guest(p_player uuid, p_keep boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  gid uuid;
begin
  select group_id into gid from public.players where id = p_player and is_guest;
  if gid is null or not public.is_group_member(gid) then
    raise exception 'Diesen Gast gibt es nicht.';
  end if;
  if p_keep then
    if not public.is_group_admin(gid) then
      raise exception 'Als festen Spieler übernehmen können nur Admins.';
    end if;
    update public.players set is_guest = false, active = true where id = p_player;
  else
    update public.players set active = false where id = p_player;
  end if;
end;
$$;

revoke execute on function
  public.add_guest(uuid, uuid, text, numeric),
  public.finish_guest(uuid, boolean)
from public, anon;
grant execute on function
  public.add_guest(uuid, uuid, text, numeric),
  public.finish_guest(uuid, boolean)
to authenticated;
