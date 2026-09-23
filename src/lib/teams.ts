/**
 * Faire Team-Einteilung (CLAUDE.md, Abschnitt 6).
 *
 * Kosten einer Einteilung (kleiner = fairer):
 *   weightTotal   · Spannweite(Summe g je Team)
 * + weightDefense · Spannweite(Summe d je Team)
 * + weightAttack  · Spannweite(Summe a je Team)
 *
 * Suche: viele zufällige Starteinteilungen, jeweils verbessert durch Tauschen
 * (und Verschieben, solange die Teamgrößen ausgeglichen bleiben), bis kein Schritt mehr hilft.
 */
import { TEAM_PARAMS } from './params';

export type RatedPlayer = {
  id: string;
  defense: number;
  attack: number;
};

export type TeamStats = {
  size: number;
  defense: number;
  attack: number;
  /** Summe der Gesamtstärken g = (d + a) / 2 */
  total: number;
};

export type Split = {
  /** Spieler-IDs je Team */
  teams: string[][];
  cost: number;
  /** Eindeutiger Schlüssel, unabhängig von der Reihenfolge der Teams und Spieler */
  key: string;
};

export type Weights = {
  weightTotal: number;
  weightDefense: number;
  weightAttack: number;
};

export type SearchOptions = Partial<
  Weights & { restarts: number; timeBudgetMs: number; keepBest: number }
> & {
  /** Zufallsquelle 0 ≤ x < 1 (für Tests austauschbar) */
  random?: () => number;
};

export const strength = (p: RatedPlayer) => (p.defense + p.attack) / 2;

const range = (values: number[]) => Math.max(...values) - Math.min(...values);

export function teamStats(players: RatedPlayer[]): TeamStats {
  let defense = 0;
  let attack = 0;
  for (const p of players) {
    defense += p.defense;
    attack += p.attack;
  }
  return { size: players.length, defense, attack, total: (defense + attack) / 2 };
}

export function splitCost(teams: RatedPlayer[][], weights: Weights = TEAM_PARAMS): number {
  const stats = teams.map(teamStats);
  return costFromSums(
    stats.map((s) => s.defense),
    stats.map((s) => s.attack),
    weights
  );
}

function costFromSums(defense: number[], attack: number[], w: Weights): number {
  const total = defense.map((d, i) => (d + attack[i]) / 2);
  return (
    w.weightTotal * range(total) + w.weightDefense * range(defense) + w.weightAttack * range(attack)
  );
}

export function splitKey(teams: string[][]): string {
  return teams
    .map((t) => [...t].sort().join(','))
    .sort()
    .join('|');
}

/** Teamgrößen: möglichst gleich, maximal 1 Spieler Unterschied. */
export function teamSizes(playerCount: number, teamCount: number): number[] {
  const base = Math.floor(playerCount / teamCount);
  const extra = playerCount % teamCount;
  return Array.from({ length: teamCount }, (_, i) => base + (i < extra ? 1 : 0));
}

const EPS = 1e-9;

/**
 * Sucht viele unterschiedliche, möglichst faire Einteilungen.
 * Ergebnis ist nach Kosten sortiert (beste zuerst).
 */
export function findFairSplits(
  players: RatedPlayer[],
  teamCount: number,
  options: SearchOptions = {}
): Split[] {
  const {
    weightTotal = TEAM_PARAMS.weightTotal,
    weightDefense = TEAM_PARAMS.weightDefense,
    weightAttack = TEAM_PARAMS.weightAttack,
    restarts = TEAM_PARAMS.restarts,
    timeBudgetMs = TEAM_PARAMS.timeBudgetMs,
    keepBest = TEAM_PARAMS.keepBest,
    random = Math.random,
  } = options;
  const weights = { weightTotal, weightDefense, weightAttack };

  if (!Number.isInteger(teamCount) || teamCount < 2) {
    throw new Error('Es braucht mindestens 2 Teams.');
  }
  if (players.length < teamCount) {
    throw new Error('Zu wenige Spieler für diese Anzahl Teams.');
  }

  const n = players.length;
  const d = players.map((p) => p.defense);
  const a = players.map((p) => p.attack);
  const found = new Map<string, Split>();
  const start = Date.now();

  for (let r = 0; r < restarts; r++) {
    // Nach der ersten Runde auf das Zeitlimit achten
    if (r > 0 && Date.now() - start > timeBudgetMs) break;

    // Zufällige Starteinteilung: mischen und reihum verteilen -> Größen unterscheiden sich um max. 1
    const order = shuffle(
      Array.from({ length: n }, (_, i) => i),
      random
    );
    const teamOf = new Array<number>(n);
    order.forEach((playerIndex, pos) => (teamOf[playerIndex] = pos % teamCount));

    const sumD = new Array<number>(teamCount).fill(0);
    const sumA = new Array<number>(teamCount).fill(0);
    const size = new Array<number>(teamCount).fill(0);
    for (let i = 0; i < n; i++) {
      sumD[teamOf[i]] += d[i];
      sumA[teamOf[i]] += a[i];
      size[teamOf[i]]++;
    }
    let cost = costFromSums(sumD, sumA, weights);

    // Verbessern, bis kein Tausch/Verschieben mehr hilft
    let improved = true;
    while (improved && cost > EPS) {
      improved = false;
      for (let i = 0; i < n && !improved; i++) {
        const ti = teamOf[i];

        // Verschieben in ein kleineres Team (Größen bleiben ausgeglichen)
        for (let t = 0; t < teamCount && !improved; t++) {
          if (t === ti || size[t] !== size[ti] - 1) continue;
          sumD[ti] -= d[i];
          sumA[ti] -= a[i];
          sumD[t] += d[i];
          sumA[t] += a[i];
          const next = costFromSums(sumD, sumA, weights);
          if (next < cost - EPS) {
            teamOf[i] = t;
            size[ti]--;
            size[t]++;
            cost = next;
            improved = true;
          } else {
            sumD[ti] += d[i];
            sumA[ti] += a[i];
            sumD[t] -= d[i];
            sumA[t] -= a[i];
          }
        }

        // Tauschen mit einem Spieler aus einem anderen Team
        for (let j = i + 1; j < n && !improved; j++) {
          const tj = teamOf[j];
          if (tj === ti) continue;
          const dd = d[j] - d[i];
          const da = a[j] - a[i];
          if (dd === 0 && da === 0) continue;
          sumD[ti] += dd;
          sumA[ti] += da;
          sumD[tj] -= dd;
          sumA[tj] -= da;
          const next = costFromSums(sumD, sumA, weights);
          if (next < cost - EPS) {
            teamOf[i] = tj;
            teamOf[j] = ti;
            cost = next;
            improved = true;
          } else {
            sumD[ti] -= dd;
            sumA[ti] -= da;
            sumD[tj] += dd;
            sumA[tj] += da;
          }
        }
      }
    }

    const teams: string[][] = Array.from({ length: teamCount }, () => []);
    for (let i = 0; i < n; i++) teams[teamOf[i]].push(players[i].id);
    const key = splitKey(teams);
    if (!found.has(key)) found.set(key, { teams, cost, key });
  }

  return [...found.values()].sort((x, y) => x.cost - y.cost).slice(0, keepBest);
}

/**
 * Wählt für „Neu würfeln“ zufällig eine Einteilung, deren Kosten nah an der besten liegen.
 * Die gerade angezeigte Einteilung (`currentKey`) wird möglichst vermieden.
 */
export function pickSplit(
  splits: Split[],
  currentKey?: string,
  random: () => number = Math.random,
  tolerance: number = TEAM_PARAMS.rerollTolerance
): Split | undefined {
  if (splits.length === 0) return undefined;
  const best = Math.min(...splits.map((s) => s.cost));
  const good = splits.filter((s) => s.cost <= best + tolerance + EPS);
  const fresh = good.filter((s) => s.key !== currentKey);
  const pool = fresh.length > 0 ? fresh : good;
  return pool[Math.floor(random() * pool.length)];
}

function shuffle<T>(items: T[], random: () => number): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}
