import { bestSwap, directPlacements, suggestPlacement } from './late';
import { splitCost, type RatedPlayer } from './teams';

const p = (id: string, value: number, attack = value): RatedPlayer => ({ id, defense: value, attack });

describe('Nachzügler einplanen', () => {
  it('kommt in das fairste der kleinsten Teams', () => {
    const teams = [
      [p('a', 8), p('b', 6)],
      [p('c', 5), p('d', 5)],
    ];
    const { direct } = suggestPlacement(teams, p('new', 4));
    // Rot 14 / Blau 10 → der Nachzügler (4) gleicht Blau aus
    expect(direct.team).toBe(1);
    expect(direct.move).toBeNull();
  });

  it('beachtet die Teamgrößen: nur in ein Team mit den wenigsten Spielern', () => {
    const teams = [[p('a', 2), p('b', 2)], [p('c', 9), p('d', 9), p('e', 9)], [p('f', 5), p('g', 5)]];
    const options = directPlacements(teams, p('new', 9));
    expect(options.map((o) => o.team).sort()).toEqual([0, 2]);
    expect(options[0].team).toBe(0);
  });

  it('der Vorschlag ist wirklich das fairste Team (alle Möglichkeiten nachgerechnet)', () => {
    const teams = [[p('a', 7, 3)], [p('b', 3, 7)], [p('c', 5)]];
    const newcomer = p('new', 8, 2);
    const { direct } = suggestPlacement(teams, newcomer);
    const costs = teams.map((_, i) =>
      splitCost(teams.map((t, j) => (j === i ? [...t, newcomer] : t)))
    );
    expect(direct.cost).toBeCloseTo(Math.min(...costs));
  });

  it('schlägt einen Tausch vor, wenn er deutlich fairer ist', () => {
    // Blau hat nur 2 (starke) Spieler, der starke Nachzügler müsste dorthin → Blau viel zu stark.
    // Besser: Nachzügler zu Rot, ein Roter wechselt zu Blau.
    const teams = [
      [p('a', 5), p('b', 5), p('c', 5)],
      [p('d', 9), p('e', 9)],
    ];
    const { direct, swap } = suggestPlacement(teams, p('new', 8));
    expect(direct.team).toBe(1);
    expect(swap).not.toBeNull();
    expect(swap!.team).toBe(0);
    expect(swap!.move!.to).toBe(1);
    expect(swap!.cost).toBeLessThan(direct.cost);
    // Größen danach: 3 und 3
    expect(swap!.teams.map((t) => t.length)).toEqual([3, 3]);
  });

  it('kein Tausch, wenn es direkt schon fair genug ist', () => {
    const teams = [
      [p('a', 5), p('b', 5)],
      [p('c', 5), p('d', 5)],
    ];
    expect(suggestPlacement(teams, p('new', 5)).swap).toBeNull();
  });

  it('Tausch schiebt nur in ein Team mit den wenigsten Spielern', () => {
    const teams = [[p('a', 9), p('b', 9), p('c', 9)], [p('d', 1), p('e', 1)], [p('f', 5), p('g', 5), p('h', 5)]];
    const swap = bestSwap(teams, p('new', 9))!;
    expect(swap.move!.to).toBe(1);
    const sizes = swap.teams.map((t) => t.length);
    expect(Math.max(...sizes) - Math.min(...sizes)).toBeLessThanOrEqual(1);
  });
});
