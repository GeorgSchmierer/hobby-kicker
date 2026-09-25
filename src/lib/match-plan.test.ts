import { nextGame, roundSize, upcomingGames, type Pairing } from './match-plan';

/** Spielt `count` Partien nach Plan und gibt den Verlauf zurück */
function simulate(teamCount: number, count: number, start: Pairing[] = []): Pairing[] {
  const history = [...start];
  while (history.length < count) {
    const g = nextGame(teamCount, history);
    history.push([g.a, g.b]);
  }
  return history;
}

function gamesPerTeam(teamCount: number, history: Pairing[]): number[] {
  const games = Array(teamCount).fill(0);
  for (const [a, b] of history) {
    games[a]++;
    games[b]++;
  }
  return games;
}

/** Wie oft pausiert ein Team zweimal (bzw. `times`-mal) hintereinander? */
function pauseStreaks(teamCount: number, history: Pairing[], times = 2): number {
  let count = 0;
  for (let i = times - 1; i < history.length; i++) {
    for (let t = 0; t < teamCount; t++) {
      if (history.slice(i - times + 1, i + 1).every((g) => !g.includes(t))) count++;
    }
  }
  return count;
}

describe.each([3, 4])('Spielplan mit %i Teams', (teamCount) => {
  const history = simulate(teamCount, roundSize(teamCount) * 4);

  it('alle spielen gleich oft (höchstens ein Spiel Unterschied, nach jeder Runde gleich)', () => {
    for (let n = 1; n <= history.length; n++) {
      const games = gamesPerTeam(teamCount, history.slice(0, n));
      expect(Math.max(...games) - Math.min(...games)).toBeLessThanOrEqual(1);
      if (n % roundSize(teamCount) === 0) expect(new Set(games).size).toBe(1);
    }
  });

  it('Pausen: bei 3 Teams nie zweimal hintereinander, bei 4 höchstens 2-mal pro Runde, nie dreimal', () => {
    const rounds = history.length / roundSize(teamCount);
    expect(pauseStreaks(teamCount, history)).toBeLessThanOrEqual(teamCount === 3 ? 0 : 2 * rounds);
    expect(pauseStreaks(teamCount, history, 3)).toBe(0);
  });

  it('in jeder Runde spielt jeder genau einmal gegen jeden', () => {
    const size = roundSize(teamCount);
    for (let r = 0; r < 4; r++) {
      const keys = history.slice(r * size, (r + 1) * size).map(([a, b]) => `${Math.min(a, b)}-${Math.max(a, b)}`);
      expect(new Set(keys).size).toBe(size);
    }
  });

  it('zeigt die Pausierenden richtig an', () => {
    const g = nextGame(teamCount, []);
    expect(g.pausing).toHaveLength(teamCount - 2);
    expect(g.pausing).not.toContain(g.a);
    expect(g.pausing).not.toContain(g.b);
  });
});

describe('Spielplan passt sich an', () => {
  it('wird anders gespielt als vorgeschlagen, kommt der Pausierende trotzdem dran', () => {
    // Vorschlag wäre Rot–Blau, gespielt wird Blau–Gelb → Rot hat pausiert und muss jetzt spielen
    const g = nextGame(3, [[1, 2]]);
    expect([g.a, g.b]).toContain(0);
  });

  it('4 Teams: nach Rot–Blau spielen Gelb und Lila, dann neue Paarungen', () => {
    const g = nextGame(4, [[0, 1]]);
    expect([g.a, g.b]).toEqual([2, 3]);
    expect(simulate(4, 6)).toEqual([
      [0, 1],
      [2, 3],
      [0, 2],
      [1, 3],
      [0, 3],
      [1, 2],
    ]);
  });

  it('zeigt die restlichen Partien der laufenden Runde, danach eine ganze neue Runde', () => {
    expect(upcomingGames(3, [])).toHaveLength(3);
    expect(upcomingGames(3, [[0, 1]])).toHaveLength(2);
    expect(upcomingGames(4, simulate(4, 6))).toHaveLength(6);
  });

  it('nach unregelmäßigem Verlauf holen die Benachteiligten auf', () => {
    const start: Pairing[] = [
      [0, 1],
      [0, 1],
      [0, 2],
    ];
    const history = simulate(4, 20, start);
    // Rot hat 3 Spiele Vorsprung und setzt aus, bis alle aufgeholt haben – danach gelten die Regeln wieder
    expect(pauseStreaks(4, history.slice(6), 3)).toBe(0);
    const games = gamesPerTeam(4, history);
    expect(Math.max(...games) - Math.min(...games)).toBeLessThanOrEqual(1);
    expect(pauseStreaks(3, simulate(3, 20, [[1, 2], [1, 2]]).slice(2))).toBe(0);
  });
});
