/**
 * Spieltage, Ergebnisse und Wertungsänderungen (M3).
 * Die App liest nur; alles Schreibende läuft über Server-Funktionen in der Datenbank
 * (supabase/migrations/…_results_ratings.sql), die auch die Wertung berechnen.
 */
import { supabase } from './supabase';

export type SessionSummary = {
  id: string;
  played_on: string;
  created_at: string;
  team_count: number;
  result_count: number;
};

export type SessionTeam = { id: string; idx: number; playerIds: string[] };

export type Match = {
  id: string;
  team_a: string;
  team_b: string;
  goals_a: number | null;
  goals_b: number | null;
  /** aus Sicht von Team A: 1 Sieg, 0,5 Unentschieden, 0 Niederlage */
  score_a: number;
};

/** Änderung eines Spielers durch ein Ergebnis (bei Turnieren über alle Partien zusammengefasst) */
export type RatingChange = {
  player_id: string;
  defense_before: number;
  attack_before: number;
  defense_after: number;
  attack_after: number;
};

export type Result = {
  id: string;
  seq: number;
  kind: 'match' | 'tournament';
  created_at: string;
  matches: Match[];
  changes: RatingChange[];
};

export type SessionDetail = {
  id: string;
  group_id: string;
  played_on: string;
  created_by: string | null;
  teams: SessionTeam[];
  results: Result[];
  /** Stimmen für „MVP des Tages“ */
  votes: { voter_id: string; player_id: string }[];
};

export type Outcome = 'a' | 'b' | 'draw';

export async function listSessions(groupId: string): Promise<SessionSummary[]> {
  const { data, error } = await supabase
    .from('sessions')
    .select('id, played_on, created_at, teams(count), results(count)')
    .eq('group_id', groupId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map((s: any) => ({
    id: s.id,
    played_on: s.played_on,
    created_at: s.created_at,
    team_count: s.teams?.[0]?.count ?? 0,
    result_count: s.results?.[0]?.count ?? 0,
  }));
}

export async function loadSession(sessionId: string): Promise<SessionDetail | null> {
  const { data, error } = await supabase
    .from('sessions')
    .select(
      `id, group_id, played_on, created_by,
       teams (id, idx, team_players (player_id)),
       results (id, seq, kind, created_at,
         matches (id, team_a, team_b, goals_a, goals_b, score_a),
         rating_changes (id, player_id, defense_before, attack_before, defense_after, attack_after)),
       mvp_votes (voter_id, player_id)`
    )
    .eq('id', sessionId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const s: any = data;
  return {
    id: s.id,
    group_id: s.group_id,
    played_on: s.played_on,
    created_by: s.created_by,
    teams: (s.teams ?? [])
      .map((t: any) => ({
        id: t.id,
        idx: t.idx,
        playerIds: (t.team_players ?? []).map((tp: any) => tp.player_id),
      }))
      .sort((a: SessionTeam, b: SessionTeam) => a.idx - b.idx),
    results: (s.results ?? [])
      .map((r: any) => ({
        id: r.id,
        seq: Number(r.seq),
        kind: r.kind,
        created_at: r.created_at,
        matches: (r.matches ?? []).map((m: any) => ({ ...m, score_a: Number(m.score_a) })),
        changes: summarizeChanges(r.rating_changes ?? []),
      }))
      .sort((a: Result, b: Result) => a.seq - b.seq),
    votes: s.mvp_votes ?? [],
  };
}

/** Je Spieler: Werte vor der ersten und nach der letzten Änderung dieses Ergebnisses */
function summarizeChanges(rows: any[]): RatingChange[] {
  const byPlayer = new Map<string, RatingChange>();
  for (const row of [...rows].sort((a, b) => Number(a.id) - Number(b.id))) {
    const existing = byPlayer.get(row.player_id);
    byPlayer.set(row.player_id, {
      player_id: row.player_id,
      defense_before: existing?.defense_before ?? Number(row.defense_before),
      attack_before: existing?.attack_before ?? Number(row.attack_before),
      defense_after: Number(row.defense_after),
      attack_after: Number(row.attack_after),
    });
  }
  return [...byPlayer.values()];
}

/** ID des zuletzt eingetragenen Ergebnisses der Gruppe (nur das kann rückgängig gemacht werden) */
export async function latestResultId(groupId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('results')
    .select('id')
    .eq('group_id', groupId)
    .order('seq', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data?.id ?? null;
}

/** Spieltag von heute (der zuletzt angelegte), falls es einen gibt */
export async function todaysSession(groupId: string): Promise<SessionSummary | null> {
  const sessions = await listSessions(groupId);
  const today = localDate(new Date()); // gleiche Zeitzone wie der Server (Europe/Berlin)
  return sessions.find((s) => s.played_on === today) ?? null;
}

export async function startSession(groupId: string, teams: string[][]): Promise<string> {
  const { data, error } = await supabase.rpc('start_session', { p_group: groupId, p_teams: teams });
  if (error) throw error;
  return data as string;
}

export async function recordMatch(input: {
  sessionId: string;
  teamA: string;
  teamB: string;
  outcome: Outcome;
  goals?: { a: number; b: number } | null;
}): Promise<string> {
  const { data, error } = await supabase.rpc('record_match', {
    p_session: input.sessionId,
    p_team_a: input.teamA,
    p_team_b: input.teamB,
    p_outcome: input.outcome,
    p_goals_a: input.goals?.a ?? null,
    p_goals_b: input.goals?.b ?? null,
  });
  if (error) throw error;
  return data as string;
}

export async function recordTournamentWinner(sessionId: string, winnerTeam: string): Promise<string> {
  const { data, error } = await supabase.rpc('record_tournament_winner', {
    p_session: sessionId,
    p_winner: winnerTeam,
  });
  if (error) throw error;
  return data as string;
}

export async function undoLastResult(groupId: string, resultId: string): Promise<void> {
  const { error } = await supabase.rpc('undo_last_result', {
    p_group: groupId,
    p_expected_result: resultId,
  });
  if (error) throw error;
}

export async function voteMvp(sessionId: string, playerId: string): Promise<void> {
  const { error } = await supabase.rpc('vote_mvp', { p_session: sessionId, p_player: playerId });
  if (error) throw error;
}

export async function deleteSession(sessionId: string): Promise<void> {
  const { error } = await supabase.rpc('delete_session', { p_session: sessionId });
  if (error) throw error;
}

/** Datum als JJJJ-MM-TT in Ortszeit (wie die Datenbank es speichert) */
function localDate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** „Mi., 23.09.2026“ */
export function formatDate(isoDate: string): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('de-DE', {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}
