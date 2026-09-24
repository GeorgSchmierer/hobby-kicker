/**
 * „Zum Home-Bildschirm hinzufügen“: Gerät erkennen, prüfen ob die App schon installiert
 * geöffnet ist, und auf Android den eingebauten Installations-Dialog des Browsers anbieten.
 */
import { useSyncExternalStore } from 'react';
import { Platform } from 'react-native';

export type DeviceKind = 'ios' | 'android' | 'desktop';

export function detectDevice(userAgent: string, maxTouchPoints = 0): DeviceKind {
  if (/iPhone|iPad|iPod/i.test(userAgent)) return 'ios';
  // iPads melden sich teils als Mac – erkennbar am Touchscreen
  if (/Macintosh/i.test(userAgent) && maxTouchPoints > 1) return 'ios';
  if (/Android/i.test(userAgent)) return 'android';
  return 'desktop';
}

/** Link wurde in einer App wie WhatsApp oder Instagram geöffnet (dort geht „installieren“ nicht) */
export function isInAppBrowser(userAgent: string): boolean {
  return /FBAN|FBAV|Instagram|WhatsApp|Line\/|Snapchat|; wv\)/i.test(userAgent);
}

export function currentDevice(): DeviceKind {
  if (Platform.OS === 'ios') return 'ios';
  if (Platform.OS === 'android') return 'android';
  if (typeof navigator === 'undefined') return 'desktop';
  return detectDevice(navigator.userAgent, navigator.maxTouchPoints ?? 0);
}

export function currentlyInAppBrowser(): boolean {
  return Platform.OS === 'web' && typeof navigator !== 'undefined' && isInAppBrowser(navigator.userAgent);
}

/** Läuft die App gerade vom Home-Bildschirm (ohne Browserleiste) oder als echte App? */
export function isInstalled(): boolean {
  if (Platform.OS !== 'web') return true;
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia?.('(display-mode: standalone)').matches === true ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

// Android/Chrome bietet einen eigenen Installations-Dialog an – den merken wir uns
type InstallPromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };
let deferredPrompt: InstallPromptEvent | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

if (Platform.OS === 'web' && typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferredPrompt = event as InstallPromptEvent;
    notify();
  });
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    notify();
  });
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** true, wenn der Browser einen direkten „Installieren“-Dialog anbieten kann (v. a. Android) */
export function useCanPromptInstall(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => deferredPrompt !== null,
    () => false
  );
}

/** Zeigt den Installations-Dialog des Browsers; true, wenn installiert wurde */
export async function promptInstall(): Promise<boolean> {
  if (!deferredPrompt) return false;
  const event = deferredPrompt;
  deferredPrompt = null;
  notify();
  await event.prompt();
  const choice = await event.userChoice;
  return choice.outcome === 'accepted';
}
