/**
 * Lädt alle Ergebnisse einer Gruppe und bereitet sie für die Statistik auf (src/lib/stats.ts).
 */
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';

import { buildGames, mvpTitles, type Game, type ResultInput } from './stats';
import { supabase } from './supabase';

export type StrengthChange = {
  seq: number;
  playedOn: string;
  playerId: string;
  /** Gesamtstärke g = (d + a) / 2 vorher und nachher */
  before: number;
  after: number;
};

export type GroupStats = {
  games: Game[];
  changes: StrengthChange[];
  /** Anzahl „MVP des Tages“-Titel je Spieler */
  mvp: Map<string, number>;
};

export async function loadGroupStats(groupId: string): Promise<GroupStats> {
  const [resultsRes, teamsRes, votesRes] = await Promise.all([
    supabase
      .from('results')
      .select(
        `id, seq, kind, sessions (played_on),
         matches (team_a, team_b, score_a),
         rating_changes (id, player_id, defense_before, attack_before, defense_after, attack_after)`
      )
      .eq('group_id', groupId)
      .order('seq'),
    supabase.from('teams').select('id, team_players (player_id)').eq('group_id', groupId),
    supabase.from('mvp_votes').select('session_id, player_id').eq('group_id', groupId),
  ]);
  if (resultsRes.error) throw resultsRes.error;
  if (teamsRes.error) throw teamsRes.error;
  if (votesRes.error) throw votesRes.error;

  const members = new Map<string, string[]>(
    (teamsRes.data ?? []).map((t: any) => [t.id, (t.team_players ?? []).map((tp: any) => tp.player_id)])
  );

  const results: ResultInput[] = [];
  const changes: StrengthChange[] = [];
  for (const r of (resultsRes.data ?? []) as any[]) {
    const playedOn: string = r.sessions?.played_on ?? '';
    const seq = Number(r.seq);
    results.push({
      id: r.id,
      seq,
      kind: r.kind,
      playedOn,
      matches: (r.matches ?? []).map((m: any) => ({
        teamA: members.get(m.team_a) ?? [],
        teamB: members.get(m.team_b) ?? [],
        scoreA: Number(m.score_a),
      })),
    });
    for (const c of [...(r.rating_changes ?? [])].sort((a: any, b: any) => Number(a.id) - Number(b.id))) {
      changes.push({
        seq,
        playedOn,
        playerId: c.player_id,
        before: (Number(c.defense_before) + Number(c.attack_before)) / 2,
        after: (Number(c.defense_after) + Number(c.attack_after)) / 2,
      });
    }
  }
  const mvp = mvpTitles(
    (votesRes.data ?? []).map((v: any) => ({ sessionId: v.session_id, playerId: v.player_id }))
  );
  return { games: buildGames(results), changes, mvp };
}

/** Statistik der Gruppe, wird beim Öffnen des Bildschirms frisch geladen */
export function useGroupStats(groupId: string | undefined) {
  const [stats, setStats] = useState<GroupStats | null>(null);
  const [error, setError] = useState<unknown>(null);

  useFocusEffect(
    useCallback(() => {
      if (!groupId) return;
      let cancelled = false;
      loadGroupStats(groupId)
        .then((s) => {
          if (!cancelled) {
            setStats(s);
            setError(null);
          }
        })
        .catch((e) => !cancelled && setError(e));
      return () => {
        cancelled = true;
      };
    }, [groupId])
  );

  return { stats, error };
}

/** Heutiges Datum als JJJJ-MM-TT (Ortszeit) */
export function todayIso(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
