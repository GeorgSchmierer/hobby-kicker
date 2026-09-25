/**
 * Warteschlange für den Offline-Modus (A5): Spieltag starten und Ergebnisse eintragen werden
 * zuerst auf dem Gerät gespeichert und dann an den Server geschickt – sofort, wenn Netz da ist,
 * sonst später automatisch. Die Wertung rechnet weiterhin der Server (beim Ankommen).
 *
 * Doppelte Einträge: Jeder Eintrag hat eine eigene ID (nochmal senden wertet nicht doppelt),
 * und Ergebnisse tragen die laufende Nummer der Partie. Hat ein anderes Handy dieselbe Partie
 * schon eingetragen, lehnt der Server ab – der Eintrag wird verworfen und es gibt einen Hinweis.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';
import { AppState, Platform } from 'react-native';

import { isNetworkError } from './offline-cache';
import { errorMessage, supabase } from './supabase';

export type StartOp = {
  kind: 'start';
  /** = ID des Spieltags */
  id: string;
  groupId: string;
  teamIds: string[];
  /** Spieler-IDs je Team, Reihenfolge = Teamfarbe */
  teams: string[][];
  playedOn: string;
  createdAt: string;
  userId: string | null;
};

export type ResultOp = {
  kind: 'result';
  /** = ID des Ergebnisses */
  id: string;
  groupId: string;
  sessionId: string;
  matchNo: number;
  resultKind: 'match' | 'tournament';
  /** bei Turnier: der Sieger */
  teamA: string;
  teamB: string | null;
  outcome: 'a' | 'b' | 'draw' | null;
  goals: { a: number; b: number } | null;
  createdAt: string;
};

export type GuestOp = {
  kind: 'guest';
  /** = ID des Spielers (bei wiederkehrendem Gast die alte ID) */
  id: string;
  groupId: string;
  name: string;
  /** Startwert für Abwehr und Angriff */
  rating: number;
  createdAt: string;
};

export type Op = StartOp | ResultOp | GuestOp;

export type Notice = { id: string; text: string };

type State = {
  ops: Op[];
  notices: Notice[];
  /** true, wenn zuletzt kein Server erreichbar war */
  offline: boolean;
  /** zählt hoch, sobald etwas beim Server angekommen ist (Bildschirme laden dann neu) */
  syncCount: number;
  /** kurz true, nachdem ohne Netz Gespeichertes vollständig angekommen ist („Alles gespeichert ✓“) */
  recovered: boolean;
  loaded: boolean;
};

const STORAGE_KEY = 'hobby-kicker/v2/outbox';
const RETRY_MS = 20_000;
/** Bei schlechtem Netz nicht ewig warten: nach dieser Zeit gilt der Eintrag als „wartet auf Netz“ */
const SEND_TIMEOUT_MS = 10_000;

let state: State = {
  ops: [],
  notices: [],
  offline: false,
  syncCount: 0,
  recovered: false,
  loaded: false,
};
const RECOVERED_SHOWN_MS = 3000;
let recoveredTimer: ReturnType<typeof setTimeout> | undefined;
const listeners = new Set<() => void>();
/** Fehler der Einträge, die der Server abgelehnt hat (für den, der gerade wartet) */
const failures = new Map<string, unknown>();

function setState(next: Partial<State>, persist = true) {
  state = { ...state, ...next };
  listeners.forEach((l) => l());
  if (persist) {
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ ops: state.ops, notices: state.notices })).catch(
      () => {}
    );
  }
}

const ready: Promise<void> = AsyncStorage.getItem(STORAGE_KEY)
  .then((raw) => {
    const saved = raw ? JSON.parse(raw) : null;
    setState({ ops: saved?.ops ?? [], notices: saved?.notices ?? [], loaded: true }, false);
  })
  .catch(() => setState({ loaded: true }, false))
  .then(() => {
    flush();
  });

/** Neue zufällige ID (UUID v4) */
export function newId(): string {
  const c = globalThis.crypto as Crypto | undefined;
  if (c?.randomUUID) return c.randomUUID();
  const bytes = new Uint8Array(16);
  if (c?.getRandomValues) c.getRandomValues(bytes);
  else for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

async function send(op: Op): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('Zeitüberschreitung')), SEND_TIMEOUT_MS);
  });
  try {
    // Kommt die Antwort doch noch an, schadet das nicht: erneutes Senden wertet nicht doppelt
    await Promise.race([request(op), timeout]);
  } finally {
    clearTimeout(timer);
  }
}

async function request(op: Op): Promise<void> {
  if (op.kind === 'guest') {
    const { error } = await supabase.rpc('add_guest', {
      p_id: op.id,
      p_group: op.groupId,
      p_name: op.name,
      p_rating: op.rating,
    });
    if (error) throw error;
    return;
  }
  const { error } =
    op.kind === 'start'
      ? await supabase.rpc('start_session_v2', {
          p_id: op.id,
          p_group: op.groupId,
          p_teams: op.teams,
          p_team_ids: op.teamIds,
          p_played_on: op.playedOn,
        })
      : await supabase.rpc('record_result_v2', {
          p_id: op.id,
          p_session: op.sessionId,
          p_match_no: op.matchNo,
          p_kind: op.resultKind,
          p_team_a: op.teamA,
          p_team_b: op.teamB,
          p_outcome: op.outcome,
          p_goals_a: op.goals?.a ?? null,
          p_goals_b: op.goals?.b ?? null,
        });
  if (error) throw error;
}

let flushing: Promise<void> | null = null;

/** Alles Wartende an den Server schicken (der Reihe nach). Läuft nie doppelt. */
export function flush(): Promise<void> {
  if (!flushing) {
    flushing = (async () => {
      await ready;
      let delivered = false;
      const hadBacklog = state.offline;
      while (state.ops.length > 0) {
        const op = state.ops[0];
        try {
          await send(op);
        } catch (error) {
          if (isNetworkError(error)) {
            setState({ offline: true }, false);
            break;
          }
          // Vom Server abgelehnt: Eintrag (und davon abhängige) verwerfen, Hinweis zeigen
          failures.set(op.id, error);
          const dropped = new Set([op.id]);
          if (op.kind === 'start') {
            state.ops.filter((o) => o.kind === 'result' && o.sessionId === op.id).forEach((o) => dropped.add(o.id));
          }
          setState({
            ops: state.ops.filter((o) => !dropped.has(o.id)),
            notices: [...state.notices, { id: op.id, text: describeFailure(op, error) }],
          });
          continue;
        }
        delivered = true;
        setState({ ops: state.ops.slice(1), offline: false });
      }
      if (state.ops.length === 0 && state.offline) setState({ offline: false }, false);
      if (delivered) setState({ syncCount: state.syncCount + 1 }, false);
      if (delivered && hadBacklog && state.ops.length === 0) {
        setState({ recovered: true }, false);
        clearTimeout(recoveredTimer);
        recoveredTimer = setTimeout(() => setState({ recovered: false }, false), RECOVERED_SHOWN_MS);
      }
    })().finally(() => {
      flushing = null;
    });
  }
  return flushing;
}

function describeFailure(op: Op, error: unknown): string {
  const reason = errorMessage(error).replace(/^DOPPELT:\s*/, '');
  if (op.kind === 'start') return `Ein ohne Netz gestarteter Spieltag wurde nicht gespeichert: ${reason}`;
  if (op.kind === 'guest') return `Der Gast „${op.name}“ wurde nicht gespeichert: ${reason}`;
  return `Ein ohne Netz eingetragenes Ergebnis wurde verworfen: ${reason}`;
}

/**
 * Eintrag speichern und gleich versuchen zu senden.
 * 'saved' = beim Server angekommen, 'queued' = wartet auf Netz.
 * Lehnt der Server ab, wird der Fehler geworfen (wie bisher ohne Warteschlange).
 */
export async function submit(op: Op): Promise<'saved' | 'queued'> {
  await ready;
  setState({ ops: [...state.ops, op] });
  await flush();
  if (failures.has(op.id)) {
    const error = failures.get(op.id);
    failures.delete(op.id);
    // Wer gerade wartet, bekommt die Meldung direkt – kein zusätzlicher Hinweis
    setState({ notices: state.notices.filter((n) => n.id !== op.id) });
    throw error;
  }
  return state.ops.some((o) => o.id === op.id) ? 'queued' : 'saved';
}

export function dismissNotice(id: string) {
  setState({ notices: state.notices.filter((n) => n.id !== id) });
}

export function outboxState(): State {
  return state;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useOutbox(): State {
  return useSyncExternalStore(subscribe, outboxState, outboxState);
}

/** Noch nicht angekommener Spieltag (ohne Netz gestartet) */
export function pendingStart(sessionId: string): StartOp | undefined {
  return state.ops.find((o): o is StartOp => o.kind === 'start' && o.id === sessionId);
}

export function pendingStarts(groupId: string): StartOp[] {
  return state.ops.filter((o): o is StartOp => o.kind === 'start' && o.groupId === groupId);
}

export function pendingGuests(groupId: string, ops: Op[] = state.ops): GuestOp[] {
  return ops.filter((o): o is GuestOp => o.kind === 'guest' && o.groupId === groupId);
}

export function pendingResults(sessionId: string): ResultOp[] {
  return state.ops.filter((o): o is ResultOp => o.kind === 'result' && o.sessionId === sessionId);
}

// Automatisch erneut senden: wenn das Netz zurückkommt, die App wieder in den Vordergrund
// kommt, und regelmäßig, solange etwas wartet
if (Platform.OS === 'web' && typeof window !== 'undefined') {
  window.addEventListener('online', () => flush());
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') flush();
  });
} else {
  AppState.addEventListener('change', (s) => s === 'active' && flush());
}
const retryTimer = setInterval(() => {
  if (state.ops.length > 0) flush();
}, RETRY_MS);
// In Tests (Node) soll der Zeitgeber das Beenden nicht aufhalten
(retryTimer as unknown as { unref?: () => void }).unref?.();
