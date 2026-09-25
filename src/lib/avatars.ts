/**
 * Spieler-Avatare (TODO B1): Kreis mit Initialen in einer Farbe, die fest aus dem Namen folgt –
 * oder ein eigenes Foto. Fotos liegen privat in Supabase Storage („avatars“), nur
 * Gruppenmitglieder bekommen (zeitlich begrenzte) Links. Ohne Netz: Initialen.
 */
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { useSyncExternalStore } from 'react';

import { newId } from './outbox';
import { supabase } from './supabase';

/** Seitenlänge der gespeicherten Fotos in Pixeln (klein halten: ~20–40 KB je Foto) */
export const AVATAR_SIZE = 256;
const AVATAR_QUALITY = 0.75;
/** Wie lange ein Bild-Link gilt (Sekunden) */
const LINK_SECONDS = 60 * 60 * 24;

const PALETTE = [
  '#E53935', '#D81B60', '#8E24AA', '#5E35B1', '#3949AB', '#1E88E5', '#00897B',
  '#43A047', '#7CB342', '#F4511E', '#6D4C41', '#546E7A',
];

/** „Tommi“ → „TO“, „Max Mustermann“ → „MM“ */
export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  if (words.length === 1) return [...words[0]].slice(0, 2).join('').toUpperCase();
  return ([...words[0]][0] + [...words[words.length - 1]][0]).toUpperCase();
}

/** Farbe fest aus dem Namen abgeleitet (gleicher Name → gleiche Farbe, auf allen Geräten) */
export function avatarColor(name: string): string {
  let hash = 0;
  for (const ch of name.trim().toLowerCase()) hash = (hash * 31 + ch.codePointAt(0)!) >>> 0;
  return PALETTE[hash % PALETTE.length];
}

// ---------------------------------------------------------------------------
// Bild-Links (werden gesammelt angefragt und gemerkt)
// ---------------------------------------------------------------------------

const links = new Map<string, { url: string; expires: number }>();
const wanted = new Set<string>();
const listeners = new Set<() => void>();
let version = 0;
let timer: ReturnType<typeof setTimeout> | null = null;

function notify() {
  version++;
  listeners.forEach((l) => l());
}

async function fetchLinks() {
  timer = null;
  const paths = [...wanted];
  wanted.clear();
  if (paths.length === 0) return;
  const { data, error } = await supabase.storage.from('avatars').createSignedUrls(paths, LINK_SECONDS);
  if (error || !data) return; // z. B. offline → Initialen
  const expires = Date.now() + (LINK_SECONDS - 60) * 1000;
  for (const item of data) {
    if (item.path && item.signedUrl) links.set(item.path, { url: item.signedUrl, expires });
  }
  notify();
}

function request(path: string) {
  if (wanted.has(path)) return;
  wanted.add(path);
  if (!timer) timer = setTimeout(fetchLinks, 30);
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Gemerkter Link; fehlt er oder läuft bald ab, wird ein neuer angefragt */
function currentLink(path: string): string | null {
  const link = links.get(path);
  if (!link || link.expires < Date.now()) request(path);
  return link?.url ?? null;
}

/** Link zum Foto (null = noch nicht geladen oder kein Foto → Initialen zeigen) */
export function useAvatarUrl(path: string | null | undefined): string | null {
  useSyncExternalStore(subscribe, () => version, () => version);
  return path ? currentLink(path) : null;
}

// ---------------------------------------------------------------------------
// Foto wählen, verkleinern, hochladen
// ---------------------------------------------------------------------------

/**
 * Foto aus der Mediathek wählen, quadratisch zuschneiden, verkleinern und als Foto des
 * Spielers speichern. Gibt false zurück, wenn abgebrochen wurde.
 */
export async function pickAndUploadAvatar(player: {
  id: string;
  group_id: string;
  avatar_path: string | null;
}): Promise<boolean> {
  const picked = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1 });
  if (picked.canceled || !picked.assets?.[0]) return false;
  const asset = picked.assets[0];

  const side = Math.min(asset.width, asset.height);
  const context = ImageManipulator.manipulate(asset.uri);
  if (side > 0) {
    context.crop({
      originX: Math.round((asset.width - side) / 2),
      originY: Math.round((asset.height - side) / 2),
      width: side,
      height: side,
    });
  }
  context.resize({ width: AVATAR_SIZE, height: AVATAR_SIZE });
  const image = await context.renderAsync();
  const saved = await image.saveAsync({ format: SaveFormat.JPEG, compress: AVATAR_QUALITY });
  const body = await (await fetch(saved.uri)).arrayBuffer();

  const path = `${player.group_id}/${player.id}/${newId()}.jpg`;
  const upload = await supabase.storage.from('avatars').upload(path, body, { contentType: 'image/jpeg' });
  if (upload.error) throw upload.error;
  const { error } = await supabase.rpc('set_avatar', { p_player: player.id, p_path: path });
  if (error) {
    await supabase.storage.from('avatars').remove([path]);
    throw error;
  }
  if (player.avatar_path) await supabase.storage.from('avatars').remove([player.avatar_path]);
  return true;
}

/** Foto entfernen (danach wieder Initialen) */
export async function removeAvatar(player: { id: string; avatar_path: string | null }): Promise<void> {
  const { error } = await supabase.rpc('set_avatar', { p_player: player.id, p_path: null });
  if (error) throw error;
  if (player.avatar_path) await supabase.storage.from('avatars').remove([player.avatar_path]);
}

/** Fotos mehrerer Spieler löschen (vor dem Löschen eines Spielers, einer Gruppe oder des Kontos) */
export async function deleteAvatarFiles(paths: (string | null | undefined)[]): Promise<void> {
  const list = paths.filter((p): p is string => !!p);
  if (list.length > 0) await supabase.storage.from('avatars').remove(list);
}
