/**
 * Lokaler Speicher für M1: Spieler, Anwesenheit und Anzahl Teams liegen nur auf dem Gerät.
 * In M2 wird das durch Supabase ersetzt.
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

import { RATING_LIMITS } from './params';
import type { Split } from './teams';

export type Player = {
  id: string;
  name: string;
  defense: number;
  attack: number;
  active: boolean;
};

export type TeamCount = 2 | 3 | 4;

type SavedState = {
  players: Player[];
  presentIds: string[];
  teamCount: TeamCount;
};

/** Das aktuell angezeigte Würfel-Ergebnis (wird nicht gespeichert). */
export type Draw = {
  /** Alle gefundenen guten Einteilungen, für „Neu würfeln“ */
  candidates: Split[];
  /** Angezeigte Teams (Spieler-IDs), evtl. von Hand geändert */
  teams: string[][];
  /** Schlüssel der zuletzt gewürfelten Einteilung */
  key: string;
};

const STORAGE_KEY = 'hobby-kicker/v1/state';
const EMPTY: SavedState = { players: [], presentIds: [], teamCount: 2 };

type Store = SavedState & {
  loaded: boolean;
  draw: Draw | null;
  savePlayer: (player: Omit<Player, 'id'> & { id?: string }) => void;
  deletePlayer: (id: string) => void;
  setPresent: (id: string, present: boolean) => void;
  setAllPresent: (present: boolean) => void;
  setTeamCount: (count: TeamCount) => void;
  setDraw: (draw: Draw | null) => void;
};

const StoreContext = createContext<Store | null>(null);

export function clampRating(value: number): number {
  const rounded = Math.round(value * 10) / 10;
  return Math.min(RATING_LIMITS.max, Math.max(RATING_LIMITS.min, rounded));
}

function newId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<SavedState>(EMPTY);
  const [loaded, setLoaded] = useState(false);
  const [draw, setDraw] = useState<Draw | null>(null);

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

  const savePlayer = useCallback<Store['savePlayer']>((input) => {
    const player: Player = {
      ...input,
      id: input.id ?? newId(),
      name: input.name.trim(),
      defense: clampRating(input.defense),
      attack: clampRating(input.attack),
    };
    setState((s) => {
      const exists = s.players.some((p) => p.id === player.id);
      const players = exists
        ? s.players.map((p) => (p.id === player.id ? player : p))
        : [...s.players, player];
      const presentIds = player.active
        ? s.presentIds
        : s.presentIds.filter((id) => id !== player.id);
      return { ...s, players, presentIds };
    });
  }, []);

  const deletePlayer = useCallback((id: string) => {
    setState((s) => ({
      ...s,
      players: s.players.filter((p) => p.id !== id),
      presentIds: s.presentIds.filter((p) => p !== id),
    }));
  }, []);

  const setPresent = useCallback((id: string, present: boolean) => {
    setState((s) => ({
      ...s,
      presentIds: present
        ? [...new Set([...s.presentIds, id])]
        : s.presentIds.filter((p) => p !== id),
    }));
  }, []);

  const setAllPresent = useCallback((present: boolean) => {
    setState((s) => ({
      ...s,
      presentIds: present ? s.players.filter((p) => p.active).map((p) => p.id) : [],
    }));
  }, []);

  const setTeamCount = useCallback((teamCount: TeamCount) => {
    setState((s) => ({ ...s, teamCount }));
  }, []);

  const value = useMemo<Store>(
    () => ({
      ...state,
      loaded,
      draw,
      savePlayer,
      deletePlayer,
      setPresent,
      setAllPresent,
      setTeamCount,
      setDraw,
    }),
    [state, loaded, draw, savePlayer, deletePlayer, setPresent, setAllPresent, setTeamCount]
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): Store {
  const store = useContext(StoreContext);
  if (!store) throw new Error('useStore muss innerhalb von <StoreProvider> verwendet werden.');
  return store;
}

/** Zahl deutsch mit einer Nachkommastelle, z. B. 6,5 */
export function formatRating(value: number): string {
  return value.toFixed(1).replace('.', ',');
}
