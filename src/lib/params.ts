/**
 * Alle Stellschrauben der App an einem Ort (siehe CLAUDE.md, Abschnitte 6 und 7).
 * Nach den ersten echten Spieltagen hier anpassen.
 */

/** Faire Team-Einteilung (CLAUDE.md, Abschnitt 6). */
export const TEAM_PARAMS = {
  /** Gewicht für die Spannweite der Gesamtstärke (Summe g je Team). */
  weightTotal: 1.0,
  /** Gewicht für die Spannweite der Abwehr-Summen je Team. */
  weightDefense: 0.5,
  /** Gewicht für die Spannweite der Angriffs-Summen je Team. */
  weightAttack: 0.5,
  /** Anzahl zufälliger Starteinteilungen, die jeweils verbessert werden. */
  restarts: 150,
  /** Zeitlimit für die Suche in Millisekunden (Sicherheitsnetz fürs Handy). */
  timeBudgetMs: 400,
  /** So viele unterschiedliche gute Einteilungen werden höchstens gesammelt. */
  keepBest: 30,
  /** „Neu würfeln“ wählt nur Einteilungen, deren Kosten höchstens so viel über der besten liegen. */
  rerollTolerance: 1.0,
} as const;

/** Grenzen der Stärkewerte. */
export const RATING_LIMITS = {
  min: 1,
  max: 11,
  /** Startwert für neue Spieler. */
  default: 6,
} as const;

/** Öffentliche Adresse der Web-App (für Einladungen und geteilte Teams) */
export const APP_URL = 'https://hobby-kicker.vercel.app';

/** Nachzügler einplanen (TODO A4) */
export const LATE_PARAMS = {
  /** Ein Tausch wird nur vorgeschlagen, wenn er die Kosten um mindestens so viel senkt. */
  swapMinGain: 0.5,
} as const;

/** Gastspieler (TODO A6): Startwert für Abwehr und Angriff je Stufe */
export const GUEST_LEVELS = [
  { key: 'weak', label: 'schwach', rating: 4 },
  { key: 'medium', label: 'mittel', rating: 6 },
  { key: 'strong', label: 'stark', rating: 8 },
] as const;
/** Vorauswahl beim Anlegen eines Gastes (Wunsch Projektinhaber) */
export const GUEST_DEFAULT_LEVEL = 'medium';
