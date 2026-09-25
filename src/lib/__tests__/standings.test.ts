import { formatGermanDate, parseGermanDate, periodOptions, sortByPointsPerGame } from '../standings';

jest.mock('../supabase', () => ({ supabase: {} }));

describe('Saison-Auswahl', () => {
  it('ohne Saisons: Jahre (auch das laufende) plus Gesamt, laufendes Jahr vorausgewählt', () => {
    const { options, defaultKey } = periodOptions([], ['2025'], '2026-09-26');
    expect(options.map((o) => o.label)).toEqual(['2026', '2025', 'Gesamt']);
    expect(options[1]).toMatchObject({ from: '2025-01-01', to: '2025-12-31' });
    expect(defaultKey).toBe('2026');
  });

  it('mit Saisons: laufende Saison vorausgewählt', () => {
    const seasons = [
      { id: 's2', name: 'Saison 26/27', starts_on: '2026-08-01', ends_on: '2027-07-31' },
      { id: 's1', name: 'Saison 25/26', starts_on: '2025-08-01', ends_on: '2026-07-31' },
    ];
    const { options, defaultKey } = periodOptions(seasons, ['2025', '2026'], '2026-09-26');
    expect(options.map((o) => o.label)).toEqual(['Saison 26/27', 'Saison 25/26', 'Gesamt']);
    expect(defaultKey).toBe('s2');
  });

  it('keine laufende Saison: neueste vorausgewählt', () => {
    const seasons = [{ id: 's1', name: 'Frühjahr', starts_on: '2026-03-01', ends_on: '2026-06-30' }];
    expect(periodOptions(seasons, [], '2026-09-26').defaultKey).toBe('s1');
  });
});

describe('Punkte pro Spiel', () => {
  it('Vielspieler sind nicht automatisch vorne, wenige Spiele zählen nicht', () => {
    const rows = [
      { playerId: 'viel', played: 20, wins: 10, draws: 0, losses: 10, points: 30 },
      { playerId: 'gut', played: 5, wins: 4, draws: 0, losses: 1, points: 12 },
      { playerId: 'neu', played: 1, wins: 1, draws: 0, losses: 0, points: 3 },
    ];
    expect(sortByPointsPerGame(rows).map((r) => r.playerId)).toEqual(['gut', 'viel']);
  });
});

describe('Datum', () => {
  it('liest deutsche Datumsangaben', () => {
    expect(parseGermanDate('1.2.2026')).toBe('2026-02-01');
    expect(parseGermanDate('31.02.2026')).toBeNull();
    expect(parseGermanDate('2026-02-01')).toBeNull();
    expect(formatGermanDate('2026-02-01')).toBe('01.02.2026');
  });
});
