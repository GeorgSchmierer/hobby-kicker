/**
 * Lädt alle Ergebnisse einer Gruppe und bereitet sie für die Statistik auf (src/lib/stats.ts).
 * Wer in einer Partie für welches Team gespielt hat, steht in rating_changes (team_id) –
 * nicht in team_players, denn dort steht nur die aktuelle Aufstellung (Nachzügler, Tausch).
 */
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';

import { explainResult } from './explain';
import {
  buildGames,
  mvpTitles,
  withoutGuests,
  type Game,
  type PlayedSession,
  type ResultInput,
} from './stats';
import { supabase } from './supabase';

export type StrengthChange = {
  seq: number;
  playedOn: string;
  playerId: string;
  /** Gesamtstärke g = (d + a) / 2 vorher und nachher */
  before: number;
  after: number;
};

/** Eine Wertungsänderung mit Begründung in einem Satz (TODO C5) */
export type ExplainedChange = { seq: number; playedOn: string; playerId: string; text: string };

export type GroupStats = {
  games: Game[];
  changes: StrengthChange[];
  explained: ExplainedChange[];
  /** gespielte Spieltage mit Teilnehmern (ohne Gäste) – für die Anwesenheitsquote */
  sessions: PlayedSession[];
  /** Anzahl „MVP des Tages“-Titel je Spieler */
  mvp: Map<string, number>;
};

export async function loadGroupStats(groupId: string): Promise<GroupStats> {
  const [resultsRes, votesRes, guestsRes, settingsRes] = await Promise.all([
    supabase
      .from('results')
      .select(
        `id, seq, kind, session_id, sessions (played_on),
         matches (id, team_a, team_b, goals_a, goals_b, score_a),
         rating_changes (id, match_id, team_id, player_id, defense_before, attack_before, defense_after, attack_after, games_before)`
      )
      .eq('group_id', groupId)
      .order('seq'),
    supabase.from('mvp_votes').select('session_id, player_id').eq('group_id', groupId),
    // Gäste erscheinen nicht in der Statistik (TODO A6)
    supabase.from('players').select('id').eq('group_id', groupId).eq('is_guest', true),
    supabase.from('rating_settings').select('scale_d').eq('id', 1).maybeSingle(),
  ]);
  const scaleD = Number(settingsRes.data?.scale_d ?? 10);
  if (resultsRes.error) throw resultsRes.error;
  if (votesRes.error) throw votesRes.error;
  if (guestsRes.error) throw guestsRes.error;
  const guests = new Set((guestsRes.data ?? []).map((p: any) => String(p.id)));

  const results: ResultInput[] = [];
  const changes: StrengthChange[] = [];
  const explained: ExplainedChange[] = [];
  const played = new Map<string, PlayedSession>();
  for (const r of (resultsRes.data ?? []) as any[]) {
    const playedOn: string = r.sessions?.played_on ?? '';
    const seq = Number(r.seq);
    const lineup = (matchId: string, teamId: string): string[] =>
      (r.rating_changes ?? [])
        .filter((c: any) => c.match_id === matchId && c.team_id === teamId)
        .map((c: any) => c.player_id);
    results.push({
      id: r.id,
      seq,
      kind: r.kind,
      playedOn,
      matches: (r.matches ?? []).map((m: any) => ({
        teamA: lineup(m.id, m.team_a),
        teamB: lineup(m.id, m.team_b),
        scoreA: Number(m.score_a),
      })),
    });
    const texts = explainResult(
      {
        kind: r.kind,
        matches: (r.matches ?? []).map((m: any) => ({ ...m, score_a: Number(m.score_a) })),
        details: (r.rating_changes ?? []).map((c: any) => ({
          ...c,
          defense_before: Number(c.defense_before),
          attack_before: Number(c.attack_before),
          defense_after: Number(c.defense_after),
          attack_after: Number(c.attack_after),
          games_before: Number(c.games_before),
        })),
      },
      scaleD
    );
    const session =
      played.get(r.session_id) ?? { sessionId: r.session_id, playedOn, participants: [] as string[] };
    for (const c of r.rating_changes ?? []) {
      if (!guests.has(c.player_id) && !session.participants.includes(c.player_id)) {
        session.participants.push(c.player_id);
      }
    }
    played.set(r.session_id, session);
    for (const [playerId, text] of texts) {
      if (!guests.has(playerId)) explained.push({ seq, playedOn, playerId, text });
    }
    for (const c of [...(r.rating_changes ?? [])].filter((c: any) => !guests.has(c.player_id)).sort((a: any, b: any) => Number(a.id) - Number(b.id))) {
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
    (votesRes.data ?? [])
      .filter((v: any) => !guests.has(v.player_id))
      .map((v: any) => ({ sessionId: v.session_id, playerId: v.player_id }))
  );
  return {
    games: withoutGuests(buildGames(results), guests),
    changes,
    explained,
    sessions: [...played.values()],
    mvp,
  };
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
