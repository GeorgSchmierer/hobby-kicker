import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const publishableKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

if (!url || !publishableKey) {
  throw new Error(
    'Supabase ist nicht eingerichtet: EXPO_PUBLIC_SUPABASE_URL und EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY fehlen in der Datei .env'
  );
}

/**
 * Verbindung zu Supabase. Nur der öffentliche Publishable Key gehört in die App –
 * was jemand sehen oder ändern darf, regeln die Sicherheitsregeln in der Datenbank.
 */
export const supabase = createClient(url, publishableKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

// Auf dem Handy die Anmeldung nur auffrischen, solange die App im Vordergrund ist
if (Platform.OS !== 'web') {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') supabase.auth.startAutoRefresh();
    else supabase.auth.stopAutoRefresh();
  });
}

/** Verständliche deutsche Fehlermeldung für die Anzeige */
export function errorMessage(error: unknown): string {
  const message =
    error && typeof error === 'object' && 'message' in error ? String(error.message) : '';
  if (/Failed to fetch|Network request failed|NetworkError/i.test(message)) {
    return 'Keine Verbindung zum Server. Bist du online?';
  }
  if (/Token has expired or is invalid|otp_expired|invalid.*otp/i.test(message)) {
    return 'Der Code ist falsch oder abgelaufen.';
  }
  if (/rate limit|security purposes|too many/i.test(message)) {
    return 'Zu viele Versuche. Bitte warte kurz und versuch es dann noch einmal.';
  }
  if (/not authorized|Email address .* not authorized/i.test(message)) {
    return 'An diese E-Mail-Adresse kann gerade keine Mail geschickt werden (Testbetrieb).';
  }
  if (/team_players_player_id_fkey|rating_changes_player_id_fkey/i.test(message)) {
    return 'Dieser Spieler hat schon mitgespielt und kann nicht gelöscht werden. Setz ihn stattdessen auf „inaktiv“.';
  }
  if (/players_group_name_idx|duplicate key/i.test(message)) {
    return 'Diesen Namen gibt es in der Gruppe schon.';
  }
  if (/row-level security|permission denied/i.test(message)) {
    return 'Dafür fehlen dir die Rechte (nur Admins).';
  }
  // Eigene Meldungen der Server-Funktionen sind bereits deutsch
  return message || 'Etwas ist schiefgelaufen. Bitte versuch es noch einmal.';
}
