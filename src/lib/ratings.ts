import { RATING_LIMITS } from './params';

/** Auf eine Nachkommastelle runden und zwischen 1 und 11 halten */
export function clampRating(value: number): number {
  const rounded = Math.round(value * 10) / 10;
  return Math.min(RATING_LIMITS.max, Math.max(RATING_LIMITS.min, rounded));
}

/** Zahl deutsch mit einer Nachkommastelle, z. B. 6,5 */
export function formatRating(value: number): string {
  return value.toFixed(1).replace('.', ',');
}
