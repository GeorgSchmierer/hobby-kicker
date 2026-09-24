/**
 * Erkennt, ob eine neue Version der Web-App online ist.
 * Beim Bau auf Vercel bekommt jede Version eine Kennung (Git-Commit), die sowohl in die App
 * (EXPO_PUBLIC_APP_VERSION) als auch in die Datei /version.json geschrieben wird (siehe vercel.json).
 * Die App vergleicht beides beim Zurückkehren in den Vordergrund und alle paar Minuten.
 */
import { useEffect, useState } from 'react';
import { AppState, Platform } from 'react-native';

/** Kennung dieser Version – lokal beim Entwickeln nicht gesetzt */
export const APP_VERSION = process.env.EXPO_PUBLIC_APP_VERSION ?? '';

const CHECK_EVERY_MS = 5 * 60_000;

/** Kurzform für die Anzeige, z. B. „3918a76“ */
export function shortVersion(version: string = APP_VERSION): string {
  return version ? version.slice(0, 7) : 'Entwicklung';
}

export async function fetchLatestVersion(): Promise<string | null> {
  try {
    const response = await fetch(`/version.json?t=${Date.now()}`, { cache: 'no-store' });
    if (!response.ok) return null;
    const data = (await response.json()) as { version?: string };
    return data.version ?? null;
  } catch {
    return null;
  }
}

export function isNewer(latest: string | null, current: string = APP_VERSION): boolean {
  return !!latest && !!current && latest !== current;
}

/** true, sobald eine neuere Version online ist */
export function useUpdateAvailable(): boolean {
  const [available, setAvailable] = useState(false);

  useEffect(() => {
    if (Platform.OS !== 'web' || !APP_VERSION) return;
    let stopped = false;
    const check = async () => {
      const latest = await fetchLatestVersion();
      if (!stopped && isNewer(latest)) setAvailable(true);
    };

    check();
    const timer = setInterval(check, CHECK_EVERY_MS);
    // Handy holt die App aus dem Hintergrund zurück → gleich nachsehen
    const onVisible = () => document.visibilityState === 'visible' && check();
    document.addEventListener('visibilitychange', onVisible);
    const sub = AppState.addEventListener('change', (state) => state === 'active' && check());
    return () => {
      stopped = true;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
      sub.remove();
    };
  }, []);

  return available;
}

/** Neue Version laden */
export function applyUpdate() {
  if (Platform.OS === 'web') window.location.reload();
}
