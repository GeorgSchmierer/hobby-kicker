/**
 * Spielplan für 3 oder 4 Teams (A3): wer spielt als Nächstes gegen wen, wer pausiert.
 * Der Plan richtet sich nach den tatsächlich gespielten Partien – wird einmal anders gespielt
 * als vorgeschlagen, passt sich der Rest an.
 *
 * Regeln für die nächste Partie (in dieser Reihenfolge):
 * 1. Teams mit weniger Spielen kommen zuerst dran (alle spielen gleich oft).
 * 2. Paarungen, die es seltener gab, haben Vorrang (jeder gegen jeden).
 * 3. Wer eben pausiert hat, spielt jetzt (möglichst niemand pausiert zweimal hintereinander).
 * 4. Wer schon zweimal hintereinander gespielt hat, darf verschnaufen.
 *
 * Bei 3 Teams pausiert so nie jemand zweimal hintereinander. Bei 4 Teams geht das nicht
 * zusammen mit „jeder gegen jeden“ (sonst spielten immer dieselben Paarungen im Wechsel):
 * Es ergibt sich Rot–Blau, Gelb–Lila, Rot–Gelb, Blau–Lila, … – je zwei Partien bilden eine
 * Runde, in der alle einmal spielen (passt auch für zwei Plätze gleichzeitig), und nur beim
 * Wechsel zur nächsten Runde pausiert jemand zweimal.
 * Teams werden über ihre Position 0 … n−1 angesprochen.
 */

export type Pairing = [number, number];

export type PlannedGame = {
  a: number;
  b: number;
  /** Teams, die während dieser Partie pausieren */
  pausing: number[];
};

function allPairs(teamCount: number): Pairing[] {
  const pairs: Pairing[] = [];
  for (let a = 0; a < teamCount; a++) for (let b = a + 1; b < teamCount; b++) pairs.push([a, b]);
  return pairs;
}

const pairKey = (a: number, b: number) => (a < b ? `${a}-${b}` : `${b}-${a}`);

/** Vorschlag für die nächste Partie nach den bisherigen Partien */
export function nextGame(teamCount: number, history: Pairing[]): PlannedGame {
  const games = Array(teamCount).fill(0);
  const met = new Map<string, number>();
  for (const [a, b] of history) {
    games[a]++;
    games[b]++;
    met.set(pairKey(a, b), (met.get(pairKey(a, b)) ?? 0) + 1);
  }
  const last = history.at(-1);
  const beforeLast = history.at(-2);
  const pausedLast = last ? [...Array(teamCount).keys()].filter((t) => !last.includes(t)) : [];
  const playedTwice = (t: number) => !!last && !!beforeLast && last.includes(t) && beforeLast.includes(t);

  let best: Pairing = [0, 1];
  let bestScore: number[] | null = null;
  for (const [a, b] of allPairs(teamCount)) {
    const score = [
      games[a] + games[b],
      met.get(pairKey(a, b)) ?? 0,
      -pausedLast.filter((t) => t === a || t === b).length,
      Number(playedTwice(a)) + Number(playedTwice(b)),
    ];
    if (!bestScore || compare(score, bestScore) < 0) {
      best = [a, b];
      bestScore = score;
    }
  }
  const [a, b] = best;
  return { a, b, pausing: [...Array(teamCount).keys()].filter((t) => t !== a && t !== b) };
}

function compare(x: number[], y: number[]): number {
  for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return x[i] - y[i];
  return 0;
}

/** Anzahl Partien, bis jeder einmal gegen jeden gespielt hat (3 Teams: 3, 4 Teams: 6) */
export function roundSize(teamCount: number): number {
  return (teamCount * (teamCount - 1)) / 2;
}

/**
 * Die nächsten Partien bis zum Ende der laufenden Runde
 * (ist eine Runde gerade fertig, die komplette nächste Runde).
 */
export function upcomingGames(teamCount: number, history: Pairing[]): PlannedGame[] {
  const size = roundSize(teamCount);
  const count = size - (history.length % size);
  const simulated = [...history];
  const plan: PlannedGame[] = [];
  for (let i = 0; i < count; i++) {
    const game = nextGame(teamCount, simulated);
    plan.push(game);
    simulated.push([game.a, game.b]);
  }
  return plan;
}
