/**
 * Anmeldung per E-Mail-Code (kein Passwort). Siehe Entscheidungslog in CLAUDE.md.
 */
import type { Session } from '@supabase/supabase-js';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import { supabase } from './supabase';

type Profile = { id: string; display_name: string | null };

type Auth = {
  /** true, solange beim Start noch geprüft wird, ob jemand angemeldet ist */
  loading: boolean;
  session: Session | null;
  profile: Profile | null;
  sendCode: (email: string) => Promise<void>;
  verifyCode: (email: string, code: string) => Promise<void>;
  setDisplayName: (name: string) => Promise<void>;
  signOut: () => Promise<void>;
  deleteAccount: () => Promise<void>;
};

const AuthContext = createContext<Auth | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [sessionLoaded, setSessionLoaded] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setSessionLoaded(true);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => data.subscription.unsubscribe();
  }, []);

  const userId = session?.user.id;
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    supabase
      .from('profiles')
      .select('id, display_name')
      .eq('id', userId)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return;
        setProfile(data ?? { id: userId, display_name: null });
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const sendCode = useCallback(async (email: string) => {
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim().toLowerCase(),
      options: { shouldCreateUser: true },
    });
    if (error) throw error;
  }, []);

  const verifyCode = useCallback(async (email: string, code: string) => {
    const { error } = await supabase.auth.verifyOtp({
      email: email.trim().toLowerCase(),
      token: code.replace(/\s/g, ''),
      type: 'email',
    });
    if (error) throw error;
  }, []);

  const setDisplayName = useCallback(
    async (name: string) => {
      if (!userId) return;
      const display_name = name.trim();
      const { error } = await supabase.from('profiles').update({ display_name }).eq('id', userId);
      if (error) throw error;
      setProfile({ id: userId, display_name });
    },
    [userId]
  );

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  const deleteAccount = useCallback(async () => {
    const { error } = await supabase.rpc('delete_my_account');
    if (error) throw error;
    // Das Konto gibt es nicht mehr – nur noch lokal abmelden
    await supabase.auth.signOut({ scope: 'local' });
  }, []);

  const value = useMemo<Auth>(
    () => ({
      // Profil gehört erst dann zur Sitzung, wenn es für genau diesen Nutzer geladen ist
      loading: !sessionLoaded || (!!userId && profile?.id !== userId),
      session,
      profile: userId && profile?.id === userId ? profile : null,
      sendCode,
      verifyCode,
      setDisplayName,
      signOut,
      deleteAccount,
    }),
    [sessionLoaded, userId, session, profile, sendCode, verifyCode, setDisplayName, signOut, deleteAccount]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): Auth {
  const auth = useContext(AuthContext);
  if (!auth) throw new Error('useAuth muss innerhalb von <AuthProvider> verwendet werden.');
  return auth;
}
