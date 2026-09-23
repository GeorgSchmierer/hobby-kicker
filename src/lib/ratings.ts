import { RATING_LIMITS } from './params';

/** Auf eine Nachkommastelle runden und zwischen 1 und 11 halten */
export function clampRating(value: number): number {
  const rounded = Math.round(value * 10) / 10;
  return Math.min(RATING_LIMITS.max, Math.max(RATING_LIMITS.min, rounded));
}

/**
 * Plus/Minus beim Bearbeiten: zur nächsten ganzen Zahl springen (8,4 → 8 bzw. 9),
 * von einer ganzen Zahl aus einen ganzen Schritt (8 → 7 bzw. 9). Bleibt zwischen 1 und 11.
 */
export function stepRating(value: number, direction: 1 | -1): number {
  const v = Math.round(value * 100) / 100;
  const next = Number.isInteger(v) ? v + direction : direction > 0 ? Math.ceil(v) : Math.floor(v);
  return clampRating(next);
}

/** Zahl deutsch mit einer Nachkommastelle, z. B. 6,5 */
export function formatRating(value: number): string {
  return value.toFixed(1).replace('.', ',');
}
