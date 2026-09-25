/**
 * Spieltage, Ergebnisse und Wertungsänderungen (M3).
 * Die App liest nur; alles Schreibende läuft über Server-Funktionen in der Datenbank
 * (supabase/migrations/…_results_ratings.sql), die auch die Wertung berechnen.
 *
 * Offline-Modus (A5): Spieltag starten und Ergebnisse eintragen laufen über die Warteschlange
 * (outbox.ts). Beim Lesen werden noch wartende Einträge mit angezeigt (pending), und ohne Netz
 * kommt der zuletzt geladene Stand aus dem Zwischenspeicher (offline-cache.ts).
 */
import { isNetworkError, withCache } from './offline-cache';
import { newId, pendingResults, pendingStart, pendingStarts, submit } from './outbox';
import { berlinToday } from './schedule';
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
  /** noch auf dem Gerät, wartet auf Netz (noch nicht gewertet) */
  pending?: boolean;
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
  /** Spieltag ist noch nicht beim Server angekommen (ohne Netz gestartet) */
  pending?: boolean;
};

export type Outcome = 'a' | 'b' | 'draw';

/** Spieltage der Gruppe, neueste zuerst – inklusive der noch wartenden */
export async function listSessions(groupId: string): Promise<SessionSummary[]> {
  const fromServer = await withCache(`sessions/${groupId}`, () => fetchSessions(groupId)).catch(
    (error: unknown) => {
      if (isNetworkError(error)) return [] as SessionSummary[];
      throw error;
    }
  );
  const known = new Set(fromServer.map((s) => s.id));
  const waiting: SessionSummary[] = pendingStarts(groupId)
    .filter((op) => !known.has(op.id))
    .map((op) => ({
      id: op.id,
      played_on: op.playedOn,
      created_at: op.createdAt,
      team_count: op.teams.length,
      result_count: 0,
    }));
  return [...waiting, ...fromServer].map((s) => ({
    ...s,
    result_count: s.result_count + pendingResults(s.id).length,
  }));
}

async function fetchSessions(groupId: string): Promise<SessionSummary[]> {
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

/**
 * Ein Spieltag mit Teams und Ergebnissen. Ohne Netz: zuletzt geladener Stand bzw. der auf dem
 * Gerät gestartete Spieltag; noch wartende Ergebnisse werden hinten angehängt.
 */
export async function loadSession(sessionId: string): Promise<SessionDetail | null> {
  let detail: SessionDetail | null = null;
  let networkError: unknown = null;
  try {
    detail = await withCache(`session/${sessionId}`, () => fetchSession(sessionId));
  } catch (error) {
    if (!isNetworkError(error)) throw error;
    networkError = error;
  }
  const start = pendingStart(sessionId);
  if (!detail && start) {
    detail = {
      id: start.id,
      group_id: start.groupId,
      played_on: start.playedOn,
      created_by: start.userId,
      teams: start.teamIds.map((id, idx) => ({ id, idx, playerIds: start.teams[idx] })),
      results: [],
      votes: [],
      pending: true,
    };
  }
  if (!detail) {
    if (networkError) throw networkError;
    return null;
  }
  const teams = detail.teams;
  const known = new Set(detail.results.map((r) => r.id));
  const waiting: Result[] = pendingResults(sessionId)
    .filter((op) => !known.has(op.id))
    .map((op, i) => ({
      id: op.id,
      seq: Number.MAX_SAFE_INTEGER - 1000 + i,
      kind: op.resultKind,
      created_at: op.createdAt,
      matches:
        op.resultKind === 'tournament'
          ? teams
              .filter((t) => t.id !== op.teamA)
              .map((t) => ({
                id: `${op.id}-${t.id}`,
                team_a: op.teamA,
                team_b: t.id,
                goals_a: null,
                goals_b: null,
                score_a: 1,
              }))
          : [
              {
                id: op.id,
                team_a: op.teamA,
                team_b: op.teamB!,
                goals_a: op.goals?.a ?? null,
                goals_b: op.goals?.b ?? null,
                score_a: outcomeScore(op.goals ? goalsOutcome(op.goals) : op.outcome!),
              },
            ],
      changes: [],
      pending: true,
    }));
  return { ...detail, results: [...detail.results, ...waiting] };
}

const goalsOutcome = (g: { a: number; b: number }): Outcome =>
  g.a > g.b ? 'a' : g.a < g.b ? 'b' : 'draw';
const outcomeScore = (o: Outcome) => (o === 'a' ? 1 : o === 'b' ? 0 : 0.5);

async function fetchSession(sessionId: string): Promise<SessionDetail | null> {
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

/** Spieltag starten – klappt auch ohne Netz (wird dann nachgereicht). Gibt die ID zurück. */
export async function startSession(
  groupId: string,
  teams: string[][],
  userId: string | null = null
): Promise<string> {
  const id = newId();
  await submit({
    kind: 'start',
    id,
    groupId,
    teamIds: teams.map(() => newId()),
    teams,
    playedOn: berlinToday(),
    createdAt: new Date().toISOString(),
    userId,
  });
  return id;
}

/**
 * Partie eintragen – klappt auch ohne Netz. matchNo: laufende Nummer der Partie am Spieltag
 * (so erkennt der Server, wenn zwei Handys dieselbe Partie eintragen).
 * Rückgabe 'queued': wartet auf Netz, die Wertung folgt beim Ankommen.
 */
export async function recordMatch(input: {
  groupId: string;
  sessionId: string;
  matchNo: number;
  teamA: string;
  teamB: string;
  outcome: Outcome;
  goals?: { a: number; b: number } | null;
}): Promise<'saved' | 'queued'> {
  return submit({
    kind: 'result',
    id: newId(),
    groupId: input.groupId,
    sessionId: input.sessionId,
    matchNo: input.matchNo,
    resultKind: 'match',
    teamA: input.teamA,
    teamB: input.teamB,
    outcome: input.outcome,
    goals: input.goals ?? null,
    createdAt: new Date().toISOString(),
  });
}

/** Nur den Turniersieger eintragen – klappt auch ohne Netz */
export async function recordTournamentWinner(input: {
  groupId: string;
  sessionId: string;
  matchNo: number;
  winnerTeam: string;
}): Promise<'saved' | 'queued'> {
  return submit({
    kind: 'result',
    id: newId(),
    groupId: input.groupId,
    sessionId: input.sessionId,
    matchNo: input.matchNo,
    resultKind: 'tournament',
    teamA: input.winnerTeam,
    teamB: null,
    outcome: null,
    goals: null,
    createdAt: new Date().toISOString(),
  });
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

/** Nachzügler einem Team zuteilen, optional mit Tausch (move: Spieler wechselt in Team `to`) */
export async function addLatePlayer(input: {
  sessionId: string;
  playerId: string;
  teamId: string;
  move?: { playerId: string; toTeamId: string } | null;
}): Promise<void> {
  const { error } = await supabase.rpc('add_late_player', {
    p_session: input.sessionId,
    p_player: input.playerId,
    p_team: input.teamId,
    p_move_player: input.move?.playerId ?? null,
    p_move_to: input.move?.toTeamId ?? null,
  });
  if (error) throw error;
}

/** Spieler wieder aus dem Spieltag nehmen (nur solange er dort noch nicht gespielt hat) */
export async function removeSessionPlayer(sessionId: string, playerId: string): Promise<void> {
  const { error } = await supabase.rpc('remove_session_player', {
    p_session: sessionId,
    p_player: playerId,
  });
  if (error) throw error;
}
