/**
 * Was nur auf diesem Gerät gespeichert wird: Anwesenheit und Anzahl Teams (je Gruppe),
 * außerdem für welchen Termin die Zusagen schon in die Anwesenheit übernommen wurden
 * sowie das gerade angezeigte Würfel-Ergebnis. Spieler und Gruppen liegen online (group.tsx).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import type { Split } from './teams';

export type TeamCount = 2 | 3 | 4;

type SavedState = {
  presentIds: Record<string, string[]>;
  teamCount: Record<string, TeamCount>;
  /** Gruppe → Datum des Termins, dessen Zusagen schon übernommen wurden */
  prefilled: Record<string, string>;
};

/** Das aktuell angezeigte Würfel-Ergebnis (wird nicht gespeichert). */
export type Draw = {
  groupId: string;
  /** Alle gefundenen guten Einteilungen, für „Neu würfeln“ */
  candidates: Split[];
  /** Angezeigte Teams (Spieler-IDs), evtl. von Hand geändert */
  teams: string[][];
  /** Schlüssel der zuletzt gewürfelten Einteilung */
  key: string;
};

/** Nach dem Eintragen eines Ergebnisses: Jubel im Spieltag-Bildschirm anzeigen */
export type Celebration = {
  sessionId: string;
  /** Team-Index (Farbe) des Siegers; null = Unentschieden */
  winnerIdx: number | null;
};

const STORAGE_KEY = 'hobby-kicker/v2/matchday';
const EMPTY: SavedState = { presentIds: {}, teamCount: {}, prefilled: {} };

type Store = {
  loaded: boolean;
  draw: Draw | null;
  setDraw: (draw: Draw | null) => void;
  celebration: Celebration | null;
  setCelebration: (celebration: Celebration | null) => void;
  presentIdsFor: (groupId: string) => string[];
  teamCountFor: (groupId: string) => TeamCount;
  setPresent: (groupId: string, playerId: string, present: boolean) => void;
  setPresentIds: (groupId: string, ids: string[]) => void;
  setTeamCount: (groupId: string, count: TeamCount) => void;
  prefilledFor: (groupId: string) => string | null;
  /** Anwesenheit mit den Zusagen eines Termins füllen */
  prefillFromRsvps: (groupId: string, date: string, ids: string[]) => void;
};

const StoreContext = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<SavedState>(EMPTY);
  const [loaded, setLoaded] = useState(false);
  const [draw, setDraw] = useState<Draw | null>(null);
  const [celebration, setCelebration] = useState<Celebration | null>(null);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        if (raw) setState({ ...EMPTY, ...JSON.parse(raw) });
      })
      .catch((error) => console.warn('Gespeicherte Daten konnten nicht geladen werden', error))
      .finally(() => setLoaded(true));
  }, []);

  useEffect(() => {
    if (!loaded) return;
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state)).catch((error) =>
      console.warn('Daten konnten nicht gespeichert werden', error)
    );
  }, [state, loaded]);

  const presentIdsFor = useCallback((groupId: string) => state.presentIds[groupId] ?? [], [state]);
  const teamCountFor = useCallback((groupId: string) => state.teamCount[groupId] ?? 2, [state]);

  const setPresentIds = useCallback((groupId: string, ids: string[]) => {
    setState((s) => ({ ...s, presentIds: { ...s.presentIds, [groupId]: [...new Set(ids)] } }));
  }, []);

  const setPresent = useCallback((groupId: string, playerId: string, present: boolean) => {
    setState((s) => {
      const ids = s.presentIds[groupId] ?? [];
      const next = present ? [...new Set([...ids, playerId])] : ids.filter((id) => id !== playerId);
      return { ...s, presentIds: { ...s.presentIds, [groupId]: next } };
    });
  }, []);

  const setTeamCount = useCallback((groupId: string, count: TeamCount) => {
    setState((s) => ({ ...s, teamCount: { ...s.teamCount, [groupId]: count } }));
  }, []);

  const prefilledFor = useCallback((groupId: string) => state.prefilled[groupId] ?? null, [state]);

  const prefillFromRsvps = useCallback((groupId: string, date: string, ids: string[]) => {
    setState((s) => ({
      ...s,
      presentIds: { ...s.presentIds, [groupId]: [...new Set(ids)] },
      prefilled: { ...s.prefilled, [groupId]: date },
    }));
  }, []);

  const value = useMemo<Store>(
    () => ({
      loaded,
      draw,
      setDraw,
      celebration,
      setCelebration,
      presentIdsFor,
      teamCountFor,
      setPresent,
      setPresentIds,
      setTeamCount,
      prefilledFor,
      prefillFromRsvps,
    }),
    [
      loaded,
      draw,
      celebration,
      presentIdsFor,
      teamCountFor,
      setPresent,
      setPresentIds,
      setTeamCount,
      prefilledFor,
      prefillFromRsvps,
    ]
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): Store {
  const store = useContext(StoreContext);
  if (!store) throw new Error('useStore muss innerhalb von <StoreProvider> verwendet werden.');
  return store;
}
