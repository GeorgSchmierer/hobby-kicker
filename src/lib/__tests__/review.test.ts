import { reviewText, reviewYears, yearReview } from '../review';
import { buildGames } from '../stats';

const match = (a: string[], b: string[], scoreA: number, playedOn: string, seq: number) => ({
  id: `r${seq}`,
  seq,
  kind: 'match' as const,
  playedOn,
  matches: [{ teamA: a, teamB: b, scoreA }],
});

describe('Jahresrückblick', () => {
  const games = buildGames([
    match(['a'], ['b'], 1, '2025-12-01', 1),
    match(['a'], ['b'], 1, '2026-01-05', 2),
    match(['a'], ['c'], 1, '2026-01-12', 3),
    match(['b'], ['a'], 1, '2026-02-02', 4),
    match(['b'], ['c'], 0.5, '2026-02-02', 5),
  ]);
  const sessions = [
    { sessionId: 's0', playedOn: '2025-12-01', participants: ['a', 'b'] },
    { sessionId: 's1', playedOn: '2026-01-05', participants: ['a', 'b'] },
    { sessionId: 's2', playedOn: '2026-01-12', participants: ['a', 'c'] },
    { sessionId: 's3', playedOn: '2026-02-02', participants: ['a', 'b', 'c'] },
  ];
  const review = yearReview({
    year: '2026',
    games,
    sessions,
    changes: [
      { playerId: 'b', playedOn: '2026-02-02', before: 5, after: 5.8 },
      { playerId: 'a', playedOn: '2026-01-05', before: 6, after: 6.3 },
      { playerId: 'a', playedOn: '2025-12-01', before: 5, after: 6 },
    ],
    goals: [
      { playedOn: '2026-01-05', goals: 7 },
      { playedOn: '2025-12-01', goals: 3 },
    ],
    playerIds: ['a', 'b', 'c'],
  });

  it('zählt Spieltage, Spiele und Tore nur im Jahr', () => {
    expect(review).toMatchObject({ sessions: 3, games: 4, goals: 7 });
  });

  it('meiste Spiele, größter Aufsteiger, längste Serie, am häufigsten dabei', () => {
    expect(review.mostGames).toEqual({ playerId: 'a', value: 3 });
    expect(review.biggestRiser?.playerId).toBe('b');
    expect(review.longestStreak).toEqual({ playerId: 'a', value: 2 });
    expect(review.mostPresent).toMatchObject({ playerId: 'a', value: 3, total: 3 });
  });

  it('Text zum Teilen', () => {
    const text = reviewText(review, 'Montagskick', (id) => id.toUpperCase(), { playerId: 'a', points: 6 });
    expect(text).toContain('Jahresrückblick 2026 – Montagskick');
    expect(text).toContain('3 Spieltage, 4 Spiele, 7 Tore');
    expect(text).toContain('Tabellenerster: A (6 Punkte)');
    expect(text).toContain('Größter Aufsteiger: B (+0,8)');
  });

  it('laufendes Jahr erst ab Dezember, vergangene Jahre immer', () => {
    expect(reviewYears(['2026', '2025'], '2026-09-26')).toEqual(['2025']);
    expect(reviewYears(['2026', '2025'], '2026-12-01')).toEqual(['2026', '2025']);
  });
});
