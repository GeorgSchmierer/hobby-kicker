/**
 * Gruppen, Mitglieder und Spieler – liegen online in Supabase.
 * Was jemand sehen und ändern darf, prüft die Datenbank (Row Level Security);
 * die App blendet Admin-Funktionen nur zusätzlich aus.
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

import { useAuth } from './auth';
import { withCache } from './offline-cache';
import { newId, pendingGuests, submit, useOutbox } from './outbox';
import { clampRating } from './ratings';
import { supabase } from './supabase';

export type Role = 'admin' | 'member';

export type Group = {
  id: string;
  name: string;
  invite_code: string;
  role: Role;
};

export type Player = {
  id: string;
  name: string;
  defense: number;
  attack: number;
  active: boolean;
  games_played: number;
  /** verknüpftes Nutzerkonto (Mitglied), falls zugeordnet */
  user_id: string | null;
  /** Gastspieler: wird eingeteilt und gewertet, aber nicht in Tabelle/Statistik gezeigt */
  is_guest: boolean;
};

export type Member = {
  user_id: string;
  role: Role;
  joined_at: string;
  display_name: string | null;
};

export type PlayerInput = Pick<Player, 'name' | 'defense' | 'attack' | 'active'> & { id?: string };

type GroupState = {
  /** null = wird noch geladen */
  groups: Group[] | null;
  current: Group | null;
  isAdmin: boolean;
  players: Player[];
  playersLoaded: boolean;
  selectGroup: (id: string) => void;
  refreshGroups: () => Promise<void>;
  refreshPlayers: () => Promise<void>;
  createGroup: (name: string) => Promise<void>;
  joinGroup: (code: string) => Promise<void>;
  renameGroup: (name: string) => Promise<void>;
  regenerateInviteCode: () => Promise<void>;
  leaveGroup: () => Promise<void>;
  savePlayer: (player: PlayerInput) => Promise<void>;
  deletePlayer: (id: string) => Promise<void>;
  loadMembers: () => Promise<Member[]>;
  setMemberRole: (userId: string, role: Role) => Promise<void>;
  removeMember: (userId: string) => Promise<void>;
  setMemberName: (userId: string, name: string) => Promise<void>;
  /** Mitglied einem Spieler zuordnen (null = Zuordnung aufheben) */
  linkPlayer: (userId: string, playerId: string | null) => Promise<void>;
  /** Gast anlegen (auch ohne Netz); gibt die Spieler-ID zurück */
  addGuest: (name: string, rating: number) => Promise<string>;
  /** Nach dem Spieltag: Gast übernehmen (nur Admin) oder ausblenden */
  finishGuest: (playerId: string, keep: boolean) => Promise<void>;
};

const GroupContext = createContext<GroupState | null>(null);

const currentGroupKey = (userId: string) => `hobby-kicker/v2/current-group/${userId}`;

function toPlayer(row: Record<string, unknown>): Player {
  return {
    id: String(row.id),
    name: String(row.name),
    defense: Number(row.defense),
    attack: Number(row.attack),
    active: Boolean(row.active),
    games_played: Number(row.games_played),
    user_id: row.user_id ? String(row.user_id) : null,
    is_guest: Boolean(row.is_guest),
  };
}

export function GroupProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const userId = session?.user.id;

  // Zustände merken sich, für welchen Nutzer sie gelten – so bleibt nach einem
  // Kontowechsel nichts vom vorherigen Nutzer sichtbar
  const [groupsState, setGroupsState] = useState<{ userId: string; list: Group[] } | null>(null);
  const [selection, setSelection] = useState<{ userId: string; id: string | null } | null>(null);
  const groups = groupsState && groupsState.userId === userId ? groupsState.list : null;
  const selectedId = selection && selection.userId === userId ? selection.id : null;
  const [players, setPlayers] = useState<Player[]>([]);
  const [playersFor, setPlayersFor] = useState<string | null>(null);

  const current = groups?.find((g) => g.id === selectedId) ?? groups?.[0] ?? null;
  const currentId = current?.id ?? null;

  const refreshGroups = useCallback(async () => {
    if (!userId) return;
    // ohne Netz: zuletzt geladener Stand (Offline-Modus)
    const list = await withCache(`groups/${userId}`, async () => {
      const { data, error } = await supabase
        .from('group_members')
        .select('role, groups (id, name, invite_code)')
        .eq('user_id', userId);
      if (error) throw error;
      return (data ?? [])
        .filter((row: any) => row.groups)
        .map((row: any): Group => ({ ...row.groups, role: row.role }))
        .sort((a, b) => a.name.localeCompare(b.name, 'de'));
    });
    setGroupsState({ userId, list });
  }, [userId]);

  // Beim Anmelden: Gruppen laden und zuletzt gewählte Gruppe wiederherstellen
  useEffect(() => {
    if (!userId) return;
    AsyncStorage.getItem(currentGroupKey(userId))
      .then((id) => setSelection((s) => (s?.userId === userId ? s : { userId, id })))
      .catch(() => {});
    // Daten laden: Zustand ändert sich erst nach der Antwort vom Server
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refreshGroups().catch((error) => {
      console.warn('Gruppen konnten nicht geladen werden', error);
      setGroupsState({ userId, list: [] });
    });
  }, [userId, refreshGroups]);

  const selectGroup = useCallback(
    (id: string) => {
      if (!userId) return;
      setSelection({ userId, id });
      AsyncStorage.setItem(currentGroupKey(userId), id).catch(() => {});
    },
    [userId]
  );

  const refreshPlayers = useCallback(async () => {
    if (!currentId) return;
    const list = await withCache(`players/${currentId}`, async () => {
      const { data, error } = await supabase
        .from('players')
        .select('id, name, defense, attack, active, games_played, user_id, is_guest')
        .eq('group_id', currentId);
      if (error) throw error;
      return (data ?? []).map(toPlayer);
    });
    setPlayers(list);
    setPlayersFor(currentId);
  }, [currentId]);

  // Offline-Modus: neu laden, sobald Wartendes beim Server angekommen ist (neue Werte, Gäste)
  const { ops, syncCount } = useOutbox();
  useEffect(() => {
    // Daten laden: Zustand ändert sich erst nach der Antwort vom Server
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refreshPlayers().catch((error) => console.warn('Spieler konnten nicht geladen werden', error));
  }, [refreshPlayers, syncCount]);

  // Noch nicht angekommene Gäste schon anzeigen (ohne Netz angelegt)
  const mergedPlayers = useMemo(() => {
    const loadedPlayers = playersFor === currentId ? players : [];
    if (!currentId) return loadedPlayers;
    const waiting = pendingGuests(currentId, ops);
    if (waiting.length === 0) return loadedPlayers;
    const byId = new Map(loadedPlayers.map((p) => [p.id, p]));
    for (const g of waiting) {
      const known = byId.get(g.id);
      byId.set(
        g.id,
        known
          ? { ...known, active: true }
          : {
              id: g.id,
              name: g.name,
              defense: g.rating,
              attack: g.rating,
              active: true,
              games_played: 0,
              user_id: null,
              is_guest: true,
            }
      );
    }
    return [...byId.values()];
  }, [players, playersFor, currentId, ops]);

  const addGuest = useCallback(
    async (name: string, rating: number) => {
      if (!currentId) throw new Error('Keine Gruppe gewählt.');
      const trimmed = name.trim();
      const same = mergedPlayers.find((p) => p.name.trim().toLowerCase() === trimmed.toLowerCase());
      if (same && !same.is_guest) throw new Error('Diesen Namen gibt es in der Gruppe schon.');
      // War schon mal da: alten Gast wieder einblenden (mit seinen Werten von damals)
      const id = same?.id ?? newId();
      await submit({ kind: 'guest', id, groupId: currentId, name: trimmed, rating, createdAt: new Date().toISOString() });
      return id;
    },
    [currentId, mergedPlayers]
  );

  const finishGuest = useCallback(
    async (playerId: string, keep: boolean) => {
      const { error } = await supabase.rpc('finish_guest', { p_player: playerId, p_keep: keep });
      if (error) throw error;
      await refreshPlayers();
    },
    [refreshPlayers]
  );

  const createGroup = useCallback(
    async (name: string) => {
      const { data, error } = await supabase.rpc('create_group', { group_name: name.trim() });
      if (error) throw error;
      await refreshGroups();
      selectGroup(data as string);
    },
    [refreshGroups, selectGroup]
  );

  const joinGroup = useCallback(
    async (code: string) => {
      const { data, error } = await supabase.rpc('join_group', { code });
      if (error) throw error;
      if (!data) throw new Error('Diesen Einladungscode gibt es nicht. Bitte genau prüfen.');
      await refreshGroups();
      selectGroup(data as string);
    },
    [refreshGroups, selectGroup]
  );

  const renameGroup = useCallback(
    async (name: string) => {
      if (!currentId) return;
      const { error } = await supabase.from('groups').update({ name: name.trim() }).eq('id', currentId);
      if (error) throw error;
      await refreshGroups();
    },
    [currentId, refreshGroups]
  );

  const regenerateInviteCode = useCallback(async () => {
    if (!currentId) return;
    const { error } = await supabase.rpc('regenerate_invite_code', { gid: currentId });
    if (error) throw error;
    await refreshGroups();
  }, [currentId, refreshGroups]);

  const leaveGroup = useCallback(async () => {
    if (!currentId) return;
    const { error } = await supabase.rpc('leave_group', { gid: currentId });
    if (error) throw error;
    if (userId) setSelection({ userId, id: null });
    await refreshGroups();
  }, [currentId, userId, refreshGroups]);

  const savePlayer = useCallback(
    async (input: PlayerInput) => {
      if (!currentId) return;
      const values = {
        name: input.name.trim(),
        defense: clampRating(input.defense),
        attack: clampRating(input.attack),
        active: input.active,
      };
      const { error } = input.id
        ? await supabase.from('players').update(values).eq('id', input.id)
        : await supabase.from('players').insert({ ...values, group_id: currentId });
      if (error) throw error;
      await refreshPlayers();
    },
    [currentId, refreshPlayers]
  );

  const deletePlayer = useCallback(
    async (id: string) => {
      const { error } = await supabase.from('players').delete().eq('id', id);
      if (error) throw error;
      await refreshPlayers();
    },
    [refreshPlayers]
  );

  const loadMembers = useCallback(async (): Promise<Member[]> => {
    if (!currentId) return [];
    const { data: rows, error } = await supabase
      .from('group_members')
      .select('user_id, role, joined_at')
      .eq('group_id', currentId)
      .order('joined_at');
    if (error) throw error;
    const ids = (rows ?? []).map((r) => r.user_id);
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, display_name')
      .in('id', ids);
    const names = new Map((profiles ?? []).map((p) => [p.id, p.display_name as string | null]));
    return (rows ?? []).map((r) => ({ ...r, display_name: names.get(r.user_id) ?? null }));
  }, [currentId]);

  const setMemberRole = useCallback(
    async (memberId: string, role: Role) => {
      if (!currentId) return;
      const { error } = await supabase
        .from('group_members')
        .update({ role })
        .eq('group_id', currentId)
        .eq('user_id', memberId);
      if (error) throw error;
    },
    [currentId]
  );

  const removeMember = useCallback(
    async (memberId: string) => {
      if (!currentId) return;
      const { error } = await supabase
        .from('group_members')
        .delete()
        .eq('group_id', currentId)
        .eq('user_id', memberId);
      if (error) throw error;
    },
    [currentId]
  );

  const setMemberName = useCallback(
    async (memberId: string, name: string) => {
      if (!currentId) return;
      const { error } = await supabase.rpc('set_member_name', {
        p_group: currentId,
        p_user: memberId,
        p_name: name.trim(),
      });
      if (error) throw error;
    },
    [currentId]
  );

  const linkPlayer = useCallback(
    async (memberId: string, playerId: string | null) => {
      if (!currentId) return;
      // erst alte Zuordnung lösen (ein Konto gehört zu höchstens einem Spieler)
      const unlink = await supabase
        .from('players')
        .update({ user_id: null })
        .eq('group_id', currentId)
        .eq('user_id', memberId);
      if (unlink.error) throw unlink.error;
      if (playerId) {
        const { error } = await supabase.from('players').update({ user_id: memberId }).eq('id', playerId);
        if (error) throw error;
      }
      await refreshPlayers();
    },
    [currentId, refreshPlayers]
  );

  const value = useMemo<GroupState>(
    () => ({
      groups,
      current,
      isAdmin: current?.role === 'admin',
      players: mergedPlayers,
      playersLoaded: playersFor === currentId && currentId !== null,
      selectGroup,
      refreshGroups,
      refreshPlayers,
      createGroup,
      joinGroup,
      renameGroup,
      regenerateInviteCode,
      leaveGroup,
      savePlayer,
      deletePlayer,
      loadMembers,
      setMemberRole,
      removeMember,
      setMemberName,
      linkPlayer,
      addGuest,
      finishGuest,
    }),
    [
      groups,
      current,
      currentId,
      playersFor,
      selectGroup,
      refreshGroups,
      refreshPlayers,
      createGroup,
      joinGroup,
      renameGroup,
      regenerateInviteCode,
      leaveGroup,
      savePlayer,
      deletePlayer,
      loadMembers,
      setMemberRole,
      removeMember,
      setMemberName,
      linkPlayer,
      addGuest,
      finishGuest,
      mergedPlayers,
    ]
  );

  return <GroupContext.Provider value={value}>{children}</GroupContext.Provider>;
}

export function useGroup(): GroupState {
  const group = useContext(GroupContext);
  if (!group) throw new Error('useGroup muss innerhalb von <GroupProvider> verwendet werden.');
  return group;
}
