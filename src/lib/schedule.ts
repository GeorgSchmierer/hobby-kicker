/**
 * Fester Termin (A1) und Zu-/Absagen (A2) – reine Rechenlogik ohne Server.
 * Termine werden über ihr Datum angesprochen ("2026-09-30"), immer in deutscher Zeit.
 */

export type Schedule = {
  /** 1 = Montag … 7 = Sonntag */
  weekday: number;
  /** "19:00" */
  start_time: string;
  location: string | null;
  max_players: number | null;
};

export type Rsvp = {
  player_id: string;
  attending: boolean;
  answered_at: string;
};

export const WEEKDAYS = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'];
const WEEKDAYS_SHORT = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];

/** Heutiges Datum in deutscher Zeit als "JJJJ-MM-TT" */
export function berlinToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Berlin',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

function toUtc(date: string): Date {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function fromUtc(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function addDays(date: string, days: number): string {
  const d = toUtc(date);
  d.setUTCDate(d.getUTCDate() + days);
  return fromUtc(d);
}

/** Wochentag eines Datums: 1 = Montag … 7 = Sonntag */
export function isoWeekday(date: string): number {
  return toUtc(date).getUTCDay() || 7;
}

/** Die nächsten `count` Termine ab `from` (einschließlich) */
export function upcomingDates(weekday: number, from: string, count: number): string[] {
  const first = addDays(from, (weekday - isoWeekday(from) + 7) % 7);
  return Array.from({ length: count }, (_, i) => addDays(first, i * 7));
}

export type NextEvent = {
  date: string;
  /** Tage bis zum Termin: 0 = heute, 1 = morgen */
  daysAway: number;
  /** Termine dazwischen, die ausfallen */
  skipped: string[];
};

/**
 * Nächster stattfindender Termin ab heute (ein Termin gilt bis zum Ende seines Tages).
 * Abgesagte Termine werden übersprungen und in `skipped` gemeldet.
 */
export function nextEvent(
  schedule: Pick<Schedule, 'weekday'>,
  cancelled: string[],
  today: string
): NextEvent | null {
  const skipped: string[] = [];
  for (const date of upcomingDates(schedule.weekday, today, 26)) {
    if (cancelled.includes(date)) {
      skipped.push(date);
      continue;
    }
    return { date, daysAway: Math.round((toUtc(date).getTime() - toUtc(today).getTime()) / 86400000), skipped };
  }
  return null;
}

/** "Di, 30.09." */
export function formatEventDate(date: string): string {
  const [, m, d] = date.split('-');
  return `${WEEKDAYS_SHORT[isoWeekday(date) - 1]}, ${d}.${m}.`;
}

/** "19:00" aus "19:00:00" */
export function formatTime(time: string): string {
  return time.slice(0, 5);
}

/** "Heute", "Morgen" oder "Di, 30.09." */
export function relativeDay(event: Pick<NextEvent, 'date' | 'daysAway'>): string {
  if (event.daysAway === 0) return 'Heute';
  if (event.daysAway === 1) return 'Morgen';
  return formatEventDate(event.date);
}

/** Prüft eine Uhrzeit-Eingabe wie "19:00" oder "7:30"; gibt "HH:MM" oder null zurück */
export function parseTime(input: string): string | null {
  const match = input.trim().match(/^(\d{1,2})[:.](\d{2})$/);
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (h > 23 || m > 59) return null;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export type RsvpOverview = {
  /** zugesagt und mit Platz (in Reihenfolge der Zusage) */
  attending: string[];
  /** zugesagt, aber über der Höchstzahl */
  waitlist: string[];
  declined: string[];
  /** noch keine Antwort */
  open: string[];
};

/**
 * Teilt die Spieler nach ihren Antworten auf. Wer zuerst zusagt, bekommt zuerst einen Platz;
 * sagt jemand ab, rückt der Nächste von der Warteliste nach.
 */
export function rsvpOverview(playerIds: string[], rsvps: Rsvp[], maxPlayers: number | null): RsvpOverview {
  const known = new Set(playerIds);
  const answers = rsvps.filter((r) => known.has(r.player_id));
  const yes = answers
    .filter((r) => r.attending)
    .sort((a, b) => a.answered_at.localeCompare(b.answered_at))
    .map((r) => r.player_id);
  const limit = maxPlayers ?? Infinity;
  const answered = new Set(answers.map((r) => r.player_id));
  return {
    attending: yes.slice(0, limit),
    waitlist: yes.slice(limit),
    declined: answers.filter((r) => !r.attending).map((r) => r.player_id),
    open: playerIds.filter((id) => !answered.has(id)),
  };
}
