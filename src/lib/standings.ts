/**
 * Saison-Tabelle (TODO C2): Punkte rechnet der Server (Funktion `standings`, Punkte in
 * rating_settings). Saisons legt der Admin fest; ohne Saisons gelten die Kalenderjahre.
 */
import { withCache } from './offline-cache';
import { supabase } from './supabase';

export type StandingRow = {
  playerId: string;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  points: number;
};

export type Season = { id: string; name: string; starts_on: string; ends_on: string };

/** Auswahl oben über der Tabelle */
export type Period = { key: string; label: string; from: string | null; to: string | null };

/** Für „Punkte pro Spiel“ braucht es ein paar Spiele, sonst führt jeder mit 1 Sieg aus 1 Spiel */
export const MIN_GAMES_PER_GAME_RANKING = 3;

export async function loadStandings(groupId: string, period: Period): Promise<StandingRow[]> {
  return withCache(`standings/${groupId}/${period.key}`, async () => {
    const { data, error } = await supabase.rpc('standings', {
      p_group: groupId,
      p_from: period.from,
      p_to: period.to,
    });
    if (error) throw error;
    return ((data ?? []) as any[]).map((r) => ({
      playerId: r.player_id,
      played: r.played,
      wins: r.wins,
      draws: r.draws,
      losses: r.losses,
      points: r.points,
    }));
  });
}

export async function loadSeasons(groupId: string): Promise<Season[]> {
  return withCache(`seasons/${groupId}`, async () => {
    const { data, error } = await supabase
      .from('seasons')
      .select('id, name, starts_on, ends_on')
      .eq('group_id', groupId)
      .order('starts_on', { ascending: false });
    if (error) throw error;
    return (data ?? []) as Season[];
  });
}

export async function addSeason(groupId: string, season: Omit<Season, 'id'>): Promise<void> {
  const { error } = await supabase.from('seasons').insert({ group_id: groupId, ...season });
  if (error) throw error;
}

export async function deleteSeason(id: string): Promise<void> {
  const { error } = await supabase.from('seasons').delete().eq('id', id);
  if (error) throw error;
}

/**
 * Zeiträume zur Auswahl: die festgelegten Saisons (neueste zuerst), sonst die Jahre mit Spielen;
 * dazu immer „Gesamt“. Vorausgewählt: die laufende Saison bzw. das laufende Jahr.
 */
export function periodOptions(
  seasons: Season[],
  playedYears: string[],
  today: string
): { options: Period[]; defaultKey: string } {
  const all: Period = { key: 'all', label: 'Gesamt', from: null, to: null };
  const list: Period[] =
    seasons.length > 0
      ? seasons.map((s) => ({ key: s.id, label: s.name, from: s.starts_on, to: s.ends_on }))
      : [...new Set([today.slice(0, 4), ...playedYears])]
          .sort()
          .reverse()
          .map((y) => ({ key: y, label: y, from: `${y}-01-01`, to: `${y}-12-31` }));
  const running = list.find((p) => (!p.from || p.from <= today) && (!p.to || today <= p.to));
  return { options: [...list, all], defaultKey: running?.key ?? list[0]?.key ?? all.key };
}

/** Sortierung nach Punkten pro Spiel (erst ab ein paar Spielen), sonst wie vom Server geliefert */
export function sortByPointsPerGame(rows: StandingRow[]): StandingRow[] {
  return rows
    .filter((r) => r.played >= MIN_GAMES_PER_GAME_RANKING)
    .sort((a, b) => b.points / b.played - a.points / a.played || b.played - a.played);
}

/** „01.02.2026“ → „2026-02-01“ (null, wenn kein gültiges Datum) */
export function parseGermanDate(input: string): string | null {
  const m = input.trim().match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (!m) return null;
  const [d, mo, y] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(Date.UTC(y, mo - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== mo - 1 || date.getUTCDate() !== d) return null;
  return date.toISOString().slice(0, 10);
}

/** „2026-02-01“ → „01.02.2026“ */
export function formatGermanDate(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}.${m}.${y}`;
}
