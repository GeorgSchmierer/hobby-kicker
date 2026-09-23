import {
  findFairSplits,
  pickSplit,
  splitCost,
  splitKey,
  teamSizes,
  type RatedPlayer,
} from '../teams';

/** Reproduzierbarer Zufall für Tests */
function seeded(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randomPlayers(count: number, random: () => number): RatedPlayer[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `p${i}`,
    defense: Math.round((1 + random() * 10) * 10) / 10,
    attack: Math.round((1 + random() * 10) * 10) / 10,
  }));
}

function byId(players: RatedPlayer[]) {
  return new Map(players.map((p) => [p.id, p]));
}

/** Probiert alle Einteilungen mit ausgeglichenen Größen durch (nur für kleine Gruppen). */
function bruteForceBestCost(players: RatedPlayer[], teamCount: number): number {
  const sizes = teamSizes(players.length, teamCount);
  const teams: RatedPlayer[][] = Array.from({ length: teamCount }, () => []);
  let best = Infinity;
  const place = (i: number) => {
    if (i === players.length) {
      const sorted = teams.map((t) => t.length).sort();
      if (sorted.join() === [...sizes].sort().join()) best = Math.min(best, splitCost(teams));
      return;
    }
    for (const team of teams) {
      if (team.length >= sizes[0]) continue; // sizes[0] ist die größte Teamgröße
      team.push(players[i]);
      place(i + 1);
      team.pop();
    }
  };
  place(0);
  return best;
}

describe('teamSizes', () => {
  it('verteilt möglichst gleich, maximal 1 Unterschied', () => {
    expect(teamSizes(10, 2)).toEqual([5, 5]);
    expect(teamSizes(11, 2)).toEqual([6, 5]);
    expect(teamSizes(14, 4)).toEqual([4, 4, 3, 3]);
  });
});

describe('splitCost', () => {
  it('rechnet nach der Formel aus CLAUDE.md', () => {
    const teamA = [{ id: 'a', defense: 8, attack: 4 }]; // d 8, a 4, g 6
    const teamB = [{ id: 'b', defense: 5, attack: 5 }]; // d 5, a 5, g 5
    // 1,0 · |6 − 5| + 0,5 · |8 − 5| + 0,5 · |4 − 5| = 1 + 1,5 + 0,5
    expect(splitCost([teamA, teamB])).toBeCloseTo(3);
  });
});

describe('findFairSplits', () => {
  it('teilt jeden Spieler genau einem Team zu, Größen unterscheiden sich um max. 1', () => {
    const random = seeded(1);
    for (let n = 8; n <= 24; n += 3) {
      for (const k of [2, 3, 4]) {
        const players = randomPlayers(n, random);
        const splits = findFairSplits(players, k, { random });
        expect(splits.length).toBeGreaterThan(0);
        for (const split of splits) {
          expect(split.teams).toHaveLength(k);
          const all = split.teams.flat().sort();
          expect(all).toEqual(players.map((p) => p.id).sort());
          const sizes = split.teams.map((t) => t.length);
          expect(Math.max(...sizes) - Math.min(...sizes)).toBeLessThanOrEqual(1);
        }
      }
    }
  });

  it('findet bei kleinen Gruppen die beste mögliche Einteilung', () => {
    const random = seeded(42);
    const cases: [number, number][] = [
      [8, 2],
      [9, 2],
      [9, 3],
      [10, 2],
      [8, 4],
    ];
    for (const [n, k] of cases) {
      for (let round = 0; round < 3; round++) {
        const players = randomPlayers(n, random);
        const [best] = findFairSplits(players, k, { random });
        expect(best.cost).toBeCloseTo(bruteForceBestCost(players, k), 6);
      }
    }
  });

  it('verteilt Verteidiger und Stürmer gleichmäßig', () => {
    const players: RatedPlayer[] = [
      ...['v1', 'v2', 'v3', 'v4'].map((id) => ({ id, defense: 10, attack: 2 })),
      ...['s1', 's2', 's3', 's4'].map((id) => ({ id, defense: 2, attack: 10 })),
    ];
    const [best] = findFairSplits(players, 2, { random: seeded(7) });
    expect(best.cost).toBeCloseTo(0);
    for (const team of best.teams) {
      expect(team.filter((id) => id.startsWith('v'))).toHaveLength(2);
    }
  });

  it('gibt nach Kosten sortierte, unterschiedliche Einteilungen zurück', () => {
    const players = randomPlayers(16, seeded(3));
    const splits = findFairSplits(players, 2, { random: seeded(4) });
    const keys = new Set(splits.map((s) => s.key));
    expect(keys.size).toBe(splits.length);
    for (let i = 1; i < splits.length; i++) {
      expect(splits[i].cost).toBeGreaterThanOrEqual(splits[i - 1].cost);
    }
    // gespeicherte Kosten stimmen mit der Formel überein
    const lookup = byId(players);
    for (const s of splits) {
      const teams = s.teams.map((t) => t.map((id) => lookup.get(id)!));
      expect(s.cost).toBeCloseTo(splitCost(teams), 6);
    }
  });

  it('ist schnell genug fürs Handy (24 Spieler, 4 Teams)', () => {
    const players = randomPlayers(24, seeded(5));
    const start = Date.now();
    findFairSplits(players, 4);
    expect(Date.now() - start).toBeLessThan(1000);
  });

  it('meldet einen Fehler bei zu wenigen Spielern', () => {
    expect(() => findFairSplits(randomPlayers(2, seeded(1)), 3)).toThrow();
  });
});

describe('pickSplit', () => {
  const split = (key: string, cost: number) => ({ teams: [], cost, key });

  it('wählt nur Einteilungen nah an der besten und vermeidet die aktuelle', () => {
    const splits = [split('a', 0.5), split('b', 1.0), split('c', 1.4), split('d', 5)];
    const random = seeded(9);
    for (let i = 0; i < 50; i++) {
      const picked = pickSplit(splits, 'a', random, 1.0)!;
      expect(['b', 'c']).toContain(picked.key);
    }
  });

  it('bleibt bei der einzigen guten Einteilung, wenn es keine andere gibt', () => {
    expect(pickSplit([split('a', 0), split('b', 9)], 'a', Math.random, 1.0)!.key).toBe('a');
  });

  it('erkennt gleiche Einteilungen unabhängig von der Reihenfolge', () => {
    expect(splitKey([['b', 'a'], ['d', 'c']])).toBe(splitKey([['c', 'd'], ['a', 'b']]));
  });
});
