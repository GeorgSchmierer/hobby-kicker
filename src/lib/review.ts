/**
 * Jahresrückblick (TODO C4): hübsche Zusammenfassung eines Jahres der Gruppe – rein aus den
 * vorhandenen Daten. Der Saisonsieger kommt aus der Tabelle des Servers (Punkte).
 */
import { summarize, type Game, type PlayedSession } from './stats';

export type YearReview = {
  year: string;
  sessions: number;
  games: number;
  goals: number;
  mostGames: { playerId: string; value: number } | null;
  biggestRiser: { playerId: string; value: number } | null;
  longestStreak: { playerId: string; value: number } | null;
  mostPresent: { playerId: string; value: number; total: number } | null;
};

/** Ab wann der Rückblick für das laufende Jahr angeboten wird (Monat, 12 = Dezember) */
export const REVIEW_FROM_MONTH = 12;

/** Jahre mit Rückblick: alle vergangenen Jahre mit Spielen, das laufende ab Dezember */
export function reviewYears(playedYears: string[], today: string): string[] {
  const current = today.slice(0, 4);
  const month = Number(today.slice(5, 7));
  return playedYears.filter((y) => y < current || (y === current && month >= REVIEW_FROM_MONTH));
}

function best<T extends { value: number }>(items: T[]): T | null {
  const top = items.filter((i) => i.value > 0).sort((a, b) => b.value - a.value);
  return top[0] ?? null;
}

export function yearReview(input: {
  year: string;
  games: Game[];
  sessions: PlayedSession[];
  /** Stärke-Änderungen (Gesamtstärke vorher → nachher) */
  changes: { playerId: string; playedOn: string; before: number; after: number }[];
  /** Tore je Partie (nur Partien mit Torstand) */
  goals: { playedOn: string; goals: number }[];
  playerIds: string[];
}): YearReview {
  const { year, playerIds } = input;
  const games = input.games.filter((g) => g.playedOn.startsWith(year));
  const sessions = input.sessions.filter((s) => s.playedOn.startsWith(year));

  const rise = new Map<string, number>();
  for (const c of input.changes) {
    if (c.playedOn.startsWith(year)) rise.set(c.playerId, (rise.get(c.playerId) ?? 0) + c.after - c.before);
  }

  return {
    year,
    sessions: sessions.length,
    games: new Set(games.map((g) => g.resultId)).size,
    goals: input.goals.filter((g) => g.playedOn.startsWith(year)).reduce((sum, g) => sum + g.goals, 0),
    mostGames: best(playerIds.map((id) => ({ playerId: id, value: games.filter((g) => g.playerId === id).length }))),
    biggestRiser: best(playerIds.map((id) => ({ playerId: id, value: rise.get(id) ?? 0 }))),
    longestStreak: best(playerIds.map((id) => ({ playerId: id, value: summarize(games, id).longestWinStreak }))),
    mostPresent: best(
      playerIds.map((id) => ({
        playerId: id,
        value: sessions.filter((s) => s.participants.includes(id)).length,
        total: sessions.length,
      }))
    ),
  };
}

/** Text zum Teilen (WhatsApp) */
export function reviewText(
  review: YearReview,
  groupName: string,
  name: (id: string) => string,
  seasonWinner: { playerId: string; points: number } | null
): string {
  const lines = [`🎆 Jahresrückblick ${review.year} – ${groupName}`, ''];
  lines.push(`📅 ${review.sessions} Spieltage, ${review.games} Spiele${review.goals ? `, ${review.goals} Tore` : ''}`);
  if (seasonWinner) lines.push(`🏆 Tabellenerster: ${name(seasonWinner.playerId)} (${seasonWinner.points} Punkte)`);
  if (review.mostGames) lines.push(`⚽ Meiste Spiele: ${name(review.mostGames.playerId)} (${review.mostGames.value})`);
  if (review.biggestRiser) {
    lines.push(
      `📈 Größter Aufsteiger: ${name(review.biggestRiser.playerId)} (+${review.biggestRiser.value.toFixed(1).replace('.', ',')})`
    );
  }
  if (review.longestStreak) {
    lines.push(`🔥 Längste Siegesserie: ${name(review.longestStreak.playerId)} (${review.longestStreak.value} Siege)`);
  }
  if (review.mostPresent) {
    lines.push(
      `🫶 Am häufigsten dabei: ${name(review.mostPresent.playerId)} (${review.mostPresent.value} von ${review.mostPresent.total})`
    );
  }
  return lines.join('\n');
}
