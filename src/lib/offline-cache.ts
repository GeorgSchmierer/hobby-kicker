/**
 * Zwischenspeicher für den Offline-Modus (A5): Was zuletzt vom Server kam, liegt auf dem Gerät.
 * Ohne Netz zeigt die App diesen Stand statt eines Fehlers.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

const PREFIX = 'hobby-kicker/v2/cache/';

/** Ist der Fehler „kein Netz“ (und nicht eine Ablehnung durch den Server)? */
export function isNetworkError(error: unknown): boolean {
  const e = error as { message?: unknown; name?: unknown } | null;
  const message = typeof e?.message === 'string' ? e.message : '';
  // Supabase meldet fehlgeschlagene Anfragen z. B. als „TypeError: Failed to fetch“ (Chrome)
  // oder „Load failed“ (Safari); Ablehnungen der Datenbank sehen anders aus
  return (
    e?.name === 'TypeError' ||
    /Failed to fetch|Network request failed|NetworkError|Load failed|fetch failed|Zeitüberschreitung/i.test(message)
  );
}

export async function cacheRead<T>(key: string): Promise<T | null> {
  try {
    const raw = await AsyncStorage.getItem(PREFIX + key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export async function cacheWrite(key: string, value: unknown): Promise<void> {
  try {
    await AsyncStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    // Speicher voll o. Ä. – dann eben ohne Zwischenspeicher
  }
}

/**
 * Vom Server laden und merken; ohne Netz den gemerkten Stand liefern.
 * Gibt es nichts Gemerktes, wird der Netzfehler weitergereicht.
 */
export async function withCache<T>(key: string, fetcher: () => Promise<T>): Promise<T> {
  try {
    const value = await fetcher();
    await cacheWrite(key, value);
    return value;
  } catch (error) {
    if (isNetworkError(error)) {
      const cached = await cacheRead<T>(key);
      if (cached !== null) return cached;
    }
    throw error;
  }
}
