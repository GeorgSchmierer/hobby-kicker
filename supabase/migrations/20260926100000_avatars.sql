-- B1: Spieler-Fotos. Privater Speicher „avatars“, Pfad: <gruppe>/<spieler>/<zufall>.jpg
-- Sehen dürfen nur Mitglieder der Gruppe; hochladen, ersetzen und löschen der Admin oder der
-- Spieler selbst (verknüpftes Konto). Ohne Foto zeigt die App einen Kreis mit Initialen.

alter table public.players add column avatar_path text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', false, 512000, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

-- Gruppe und Spieler aus dem Pfad lesen (null, wenn der Pfad nicht passt)
create function public.avatar_path_group(p_name text)
returns uuid
language sql
immutable
set search_path = ''
as $$
  select case
    when p_name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[A-Za-z0-9-]+\.(jpg|png|webp)$'
    then split_part(p_name, '/', 1)::uuid
  end
$$;

create function public.avatar_path_player(p_name text)
returns uuid
language sql
immutable
set search_path = ''
as $$
  select case
    when p_name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[A-Za-z0-9-]+\.(jpg|png|webp)$'
    then split_part(p_name, '/', 2)::uuid
  end
$$;

-- Darf der Nutzer das Foto dieses Spielers ändern? (Admin oder der Spieler selbst)
create function public.can_edit_avatar(p_player uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.players p
    where p.id = p_player
      and (public.is_group_admin(p.group_id) or p.user_id = auth.uid())
  )
$$;

-- Passt der Pfad zu einem Spieler dieser Gruppe, dessen Foto der Nutzer ändern darf?
create function public.can_upload_avatar(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.can_edit_avatar(public.avatar_path_player(p_name))
    and exists (
      select 1 from public.players p
      where p.id = public.avatar_path_player(p_name) and p.group_id = public.avatar_path_group(p_name)
    )
$$;

create policy "avatars_select" on storage.objects for select to authenticated
  using (bucket_id = 'avatars' and public.is_group_member(public.avatar_path_group(name)));
create policy "avatars_insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and public.can_upload_avatar(name));
create policy "avatars_update" on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and public.can_edit_avatar(public.avatar_path_player(name)))
  with check (bucket_id = 'avatars' and public.can_upload_avatar(name));
create policy "avatars_delete" on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and public.can_edit_avatar(public.avatar_path_player(name)));

-- Foto eines Spielers setzen oder entfernen (p_path = null)
create function public.set_avatar(p_player uuid, p_path text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  gid uuid;
begin
  select group_id into gid from public.players where id = p_player;
  if gid is null or not public.can_edit_avatar(p_player) then
    raise exception 'Das Foto können nur Admins oder der Spieler selbst ändern.';
  end if;
  if p_path is not null and (
    public.avatar_path_group(p_path) is distinct from gid
    or public.avatar_path_player(p_path) is distinct from p_player
  ) then
    raise exception 'Ungültiger Speicherort für das Foto.';
  end if;
  update public.players set avatar_path = p_path where id = p_player;
end;
$$;

revoke execute on function public.set_avatar(uuid, text) from public, anon;
grant execute on function public.set_avatar(uuid, text) to authenticated;
grant execute on function
  public.avatar_path_group(text), public.avatar_path_player(text), public.can_edit_avatar(uuid),
  public.can_upload_avatar(text)
to authenticated;
