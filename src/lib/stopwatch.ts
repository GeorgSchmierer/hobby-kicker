/**
 * Stoppuhr mit Abpfiff – außerhalb der Bildschirme, damit sie weiterläuft,
 * wenn man kurz zurück zum Spieltag wechselt. Der Bildschirm liest den Zustand
 * über useStopwatch() und ruft nur die Funktionen unten auf.
 */
import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { useSyncExternalStore } from 'react';
import { Vibration } from 'react-native';

const KEEP_AWAKE_TAG = 'stoppuhr';
const MIN_MS = 60_000;
const MAX_MS = 90 * 60_000;

export type StopwatchState = {
  durationMs: number;
  /** Zeitpunkt des Abpfiffs, solange die Uhr läuft */
  endsAt: number | null;
  /** Restzeit, solange die Uhr steht */
  remainingMs: number;
  /** Abpfiff ist erfolgt */
  whistled: boolean;
  /** Zeitpunkt der letzten Aktualisierung (für die Anzeige) */
  now: number;
};

let state: StopwatchState = {
  durationMs: 10 * 60_000,
  endsAt: null,
  remainingMs: 10 * 60_000,
  whistled: false,
  now: Date.now(),
};
const listeners = new Set<() => void>();
let ticker: ReturnType<typeof setInterval> | null = null;
let player: AudioPlayer | null = null;

function update(patch: Partial<StopwatchState>) {
  state = { ...state, ...patch, now: Date.now() };
  listeners.forEach((listener) => listener());
}

function whistle(): AudioPlayer {
  if (!player) {
    player = createAudioPlayer(require('@/assets/sounds/whistle.wav'));
    // Pfiff auch hörbar, wenn das iPhone auf lautlos steht
    setAudioModeAsync({ playsInSilentMode: true }).catch(() => {});
  }
  return player;
}

function stopTicker() {
  if (ticker) clearInterval(ticker);
  ticker = null;
  deactivateKeepAwake(KEEP_AWAKE_TAG).catch(() => {});
}

function tick() {
  if (state.endsAt !== null && Date.now() >= state.endsAt) {
    stopTicker();
    update({ endsAt: null, remainingMs: 0, whistled: true });
    blowWhistle();
    return;
  }
  update({});
}

export function remainingMs(s: StopwatchState): number {
  return s.endsAt !== null ? Math.max(0, s.endsAt - s.now) : s.remainingMs;
}

export function blowWhistle() {
  const p = whistle();
  p.volume = 1;
  p.seekTo(0);
  p.play();
  Vibration.vibrate([0, 300, 150, 300, 150, 900]);
}

export function startStopwatch() {
  const remaining = state.remainingMs > 0 ? state.remainingMs : state.durationMs;
  // Im Browser darf Ton nur nach einem Tippen starten – deshalb hier einmal stumm „anwerfen“
  const p = whistle();
  p.volume = 0;
  p.play();
  setTimeout(() => {
    p.pause();
    p.seekTo(0);
    p.volume = 1;
  }, 80);
  activateKeepAwakeAsync(KEEP_AWAKE_TAG).catch(() => {});
  if (ticker) clearInterval(ticker);
  ticker = setInterval(tick, 250);
  update({ endsAt: Date.now() + remaining, remainingMs: remaining, whistled: false });
}

export function pauseStopwatch() {
  stopTicker();
  update({ remainingMs: remainingMs({ ...state, now: Date.now() }), endsAt: null });
}

export function resetStopwatch(durationMs = state.durationMs) {
  stopTicker();
  player?.pause();
  const d = Math.min(MAX_MS, Math.max(MIN_MS, durationMs));
  update({ durationMs: d, remainingMs: d, endsAt: null, whistled: false });
}

export function adjustStopwatch(minutes: number) {
  resetStopwatch(state.durationMs + minutes * 60_000);
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Aktueller Zustand (für Tests) */
export function getStopwatchState(): StopwatchState {
  return state;
}

export function useStopwatch(): StopwatchState {
  return useSyncExternalStore(subscribe, () => state, () => state);
}
