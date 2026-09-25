/**
 * Nachzügler einplanen (A4): In welches Team passt ein später Kommender am fairsten?
 * Gleiche Kostenfunktion wie beim Würfeln (splitCost); Teamgrößen dürfen danach höchstens
 * um einen Spieler auseinanderliegen. Optional ein Tausch, wenn er deutlich fairer ist.
 */
import { LATE_PARAMS } from './params';
import { splitCost, type RatedPlayer } from './teams';

export type Placement = {
  /** Team (Position), in das der Nachzügler kommt */
  team: number;
  /** Tausch: Dieser Spieler wechselt aus `team` in das Team `moveTo` */
  move: { playerId: string; to: number } | null;
  cost: number;
  /** Aufstellung danach (Spieler-IDs je Team) */
  teams: string[][];
};

function apply<T extends RatedPlayer>(teams: T[][], newcomer: T, team: number, move: Placement['move']): T[][] {
  const next = teams.map((t) => [...t]);
  if (move) {
    const idx = next[team].findIndex((p) => p.id === move.playerId);
    next[move.to].push(next[team][idx]);
    next[team].splice(idx, 1);
  }
  next[team].push(newcomer);
  return next;
}

function placement<T extends RatedPlayer>(teams: T[][], newcomer: T, team: number, move: Placement['move']): Placement {
  const next = apply(teams, newcomer, team, move);
  return { team, move, cost: splitCost(next), teams: next.map((t) => t.map((p) => p.id)) };
}

/** Alle erlaubten direkten Platzierungen (nur in eines der kleinsten Teams), fairste zuerst */
export function directPlacements<T extends RatedPlayer>(teams: T[][], newcomer: T): Placement[] {
  const min = Math.min(...teams.map((t) => t.length));
  return teams
    .map((t, i) => (t.length === min ? placement(teams, newcomer, i, null) : null))
    .filter((p): p is Placement => p !== null)
    .sort((a, b) => a.cost - b.cost);
}

/** Beste Platzierung mit Tausch: Nachzügler in Team t, ein Spieler aus t wechselt in ein kleinstes Team */
export function bestSwap<T extends RatedPlayer>(teams: T[][], newcomer: T): Placement | null {
  const min = Math.min(...teams.map((t) => t.length));
  let best: Placement | null = null;
  teams.forEach((team, t) => {
    for (const player of team) {
      teams.forEach((other, u) => {
        if (u === t || other.length !== min) return;
        const option = placement(teams, newcomer, t, { playerId: player.id, to: u });
        if (!best || option.cost < best.cost) best = option;
      });
    }
  });
  return best;
}

/**
 * Vorschlag: beste direkte Platzierung, dazu ein Tausch nur, wenn er die Kosten
 * um mindestens LATE_PARAMS.swapMinGain senkt.
 */
export function suggestPlacement<T extends RatedPlayer>(
  teams: T[][],
  newcomer: T
): { direct: Placement; swap: Placement | null } {
  const direct = directPlacements(teams, newcomer)[0];
  const swap = bestSwap(teams, newcomer);
  return {
    direct,
    swap: swap && swap.cost <= direct.cost - LATE_PARAMS.swapMinGain ? swap : null,
  };
}
