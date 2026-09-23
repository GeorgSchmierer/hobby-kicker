import {
  averageWinChances,
  formatPercent,
  funTeamNames,
  FUN_TEAM_NAMES,
  teamsShareText,
  winChance,
} from '../fun';

describe('winChance', () => {
  it('gleich starke Teams haben je 50 %', () => {
    expect(winChance(30, 30, 10)).toBeCloseTo(0.5);
  });

  it('entspricht der Wertungs-Formel (10 Punkte stärker bei D = 10 → 91 %)', () => {
    expect(winChance(40, 30, 10)).toBeCloseTo(10 / 11);
    expect(winChance(30, 40, 10)).toBeCloseTo(1 / 11);
  });

  it('beide Chancen ergeben zusammen 100 %', () => {
    expect(winChance(27.5, 31, 10) + winChance(31, 27.5, 10)).toBeCloseTo(1);
  });
});

describe('averageWinChances', () => {
  it('bei zwei Teams gleich der direkten Siegchance', () => {
    const [a, b] = averageWinChances([35, 30], 10);
    expect(a).toBeCloseTo(winChance(35, 30, 10));
    expect(b).toBeCloseTo(winChance(30, 35, 10));
  });

  it('bei gleich starken Teams überall 50 %', () => {
    for (const c of averageWinChances([20, 20, 20, 20], 10)) expect(c).toBeCloseTo(0.5);
  });
});

describe('funTeamNames', () => {
  it('liefert für denselben Spieltag immer dieselben Namen', () => {
    expect(funTeamNames('abc-123', 3)).toEqual(funTeamNames('abc-123', 3));
  });

  it('keine doppelten Namen, alle aus der Liste', () => {
    const names = funTeamNames('xyz', 4);
    expect(new Set(names).size).toBe(4);
    for (const n of names) expect(FUN_TEAM_NAMES).toContain(n);
  });

  it('verschiedene Spieltage bekommen (meist) andere Namen', () => {
    const seen = new Set(Array.from({ length: 20 }, (_, i) => funTeamNames(`s${i}`, 1)[0]));
    expect(seen.size).toBeGreaterThan(5);
  });
});

describe('teamsShareText', () => {
  it('enthält Teams, Spieler und Siegchance', () => {
    const text = teamsShareText({
      groupName: 'Montagskick',
      dateLabel: 'Mo., 28.09.2026',
      teams: [
        { colorName: 'Rot', emoji: '🔴', funName: 'FC Bierbauch', total: 27.5, players: ['Anna', 'Ben'] },
        { colorName: 'Blau', emoji: '🔵', total: 27, players: ['Chris', 'Dani'] },
      ],
      chances: [0.53, 0.47],
    });
    expect(text).toContain('⚽ Montagskick – Mo., 28.09.2026');
    expect(text).toContain('🔴 *Team Rot* „FC Bierbauch“ (Stärke 27,5)');
    expect(text).toContain('Anna, Ben');
    expect(text).toContain('Siegchance: Rot 53 % – 47 % Blau');
  });
});

describe('formatPercent', () => {
  it('rundet auf ganze Prozent', () => {
    expect(formatPercent(0.584)).toBe('58 %');
  });
});
