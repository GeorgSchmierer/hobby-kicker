import {
  awards,
  buildGames,
  dreamPartner,
  favouriteOpponent,
  mvpTitles,
  nemesis,
  attendance,
  playedMonths,
  playedYears,
  sessionMvps,
  strengthHistory,
  summarize,
  withoutGuests,
  type ResultInput,
} from '../stats';

let seq = 0;
const match = (teamA: string[], teamB: string[], scoreA: number, playedOn = '2026-09-01'): ResultInput => ({
  id: `r${++seq}`,
  seq,
  kind: 'match',
  playedOn,
  matches: [{ teamA, teamB, scoreA }],
});

describe('buildGames', () => {
  it('Partie: Sieger W, Verlierer L, Mitspieler und Gegner richtig', () => {
    const games = buildGames([match(['a', 'b'], ['c', 'd'], 1)]);
    const a = games.find((g) => g.playerId === 'a')!;
    expect(a.outcome).toBe('W');
    expect(a.teammates).toEqual(['b']);
    expect(a.opponents).toEqual(['c', 'd']);
    expect(games.find((g) => g.playerId === 'c')!.outcome).toBe('L');
  });

  it('Unentschieden für beide Seiten D', () => {
    const games = buildGames([match(['a'], ['b'], 0.5)]);
    expect(games.map((g) => g.outcome)).toEqual(['D', 'D']);
  });

  it('Turniersieger zählt als EIN Sieg bzw. EINE Niederlage pro Spieler', () => {
    const games = buildGames([
      {
        id: 't',
        seq: 1,
        kind: 'tournament',
        playedOn: '2026-09-01',
        matches: [
          { teamA: ['a', 'b'], teamB: ['c', 'd'], scoreA: 1 },
          { teamA: ['a', 'b'], teamB: ['e', 'f'], scoreA: 1 },
        ],
      },
    ]);
    expect(games.filter((g) => g.playerId === 'a')).toHaveLength(1);
    expect(games.find((g) => g.playerId === 'a')!.opponents).toEqual(['c', 'd', 'e', 'f']);
    expect(games.find((g) => g.playerId === 'e')!.outcome).toBe('L');
    expect(games.find((g) => g.playerId === 'e')!.teammates).toEqual(['f']);
    expect(games).toHaveLength(6);
  });
});

describe('summarize', () => {
  const games = buildGames([
    match(['a'], ['b'], 0), // a L
    match(['a'], ['b'], 1), // a W
    match(['a'], ['b'], 1), // a W
    match(['a'], ['b'], 0.5), // a D
    match(['a'], ['b'], 1), // a W
    match(['a'], ['b'], 1), // a W
    match(['a'], ['b'], 1), // a W
  ]);

  it('zählt Siege, Unentschieden, Niederlagen; Unentschieden = halber Sieg', () => {
    const s = summarize(games, 'a');
    expect([s.played, s.wins, s.draws, s.losses]).toEqual([7, 5, 1, 1]);
    expect(s.winRate).toBeCloseTo(5.5 / 7);
  });

  it('Formkurve (letzte 5) und aktuelle Serie', () => {
    const s = summarize(games, 'a');
    expect(s.form).toEqual(['W', 'D', 'W', 'W', 'W']);
    expect(s.streak).toEqual({ outcome: 'W', length: 3 });
    expect(s.longestWinStreak).toBe(3);
    expect(summarize(games, 'b').streak).toEqual({ outcome: 'L', length: 3 });
  });

  it('ohne Spiele: keine Quote, keine Serie', () => {
    const s = summarize(games, 'nobody');
    expect(s.winRate).toBeNull();
    expect(s.streak).toBeNull();
  });
});

describe('Traumduo, Angstgegner, Lieblingsgegner', () => {
  const games = buildGames([
    match(['a', 'b'], ['c', 'd'], 1),
    match(['a', 'b'], ['c', 'd'], 1),
    match(['a', 'b'], ['c', 'd'], 1),
    match(['a', 'c'], ['b', 'd'], 0),
    match(['a', 'c'], ['b', 'd'], 0),
    match(['a', 'c'], ['b', 'd'], 0),
  ]);

  it('Traumduo: mit b immer gewonnen, mit c nie', () => {
    expect(dreamPartner(games, 'a')).toEqual({ otherId: 'b', played: 3, winRate: 1 });
  });

  it('Angstgegner: gegen b immer verloren', () => {
    expect(nemesis(games, 'a')).toEqual({ otherId: 'b', played: 3, winRate: 0 });
  });

  it('Lieblingsgegner: gegen c immer gewonnen', () => {
    expect(favouriteOpponent(games, 'a')).toEqual({ otherId: 'c', played: 3, winRate: 1 });
  });

  it('zu wenige gemeinsame Spiele zählen nicht', () => {
    const few = buildGames([match(['x', 'y'], ['z'], 1)]);
    expect(dreamPartner(few, 'x')).toBeNull();
  });
});

describe('strengthHistory', () => {
  it('Startwert und je Ergebnis der Endwert (Turnier-Zwischenschritte zusammengefasst)', () => {
    const points = strengthHistory(
      [
        { seq: 1, playedOn: '2026-09-01', playerId: 'a', before: 6, after: 6.2 },
        { seq: 2, playedOn: '2026-09-08', playerId: 'a', before: 6.2, after: 6.3 },
        { seq: 2, playedOn: '2026-09-08', playerId: 'a', before: 6.3, after: 6.45 },
        { seq: 2, playedOn: '2026-09-08', playerId: 'b', before: 5, after: 4.9 },
      ],
      'a'
    );
    expect(points.map((p) => p.strength)).toEqual([6, 6.2, 6.45]);
  });
});

describe('awards', () => {
  it('vergibt Serienkiller, Siegertyp, Dauerbrenner und Aufsteiger', () => {
    const games = buildGames([
      match(['a'], ['b'], 1),
      match(['a'], ['b'], 1),
      match(['a'], ['b'], 1),
      match(['a'], ['b'], 1),
      match(['a'], ['c'], 1),
      match(['a'], ['b'], 1),
    ]);
    const list = awards(
      games,
      ['a', 'b', 'c'],
      [
        { playerId: 'a', playedOn: '2026-09-20', delta: 0.3 },
        { playerId: 'b', playedOn: '2026-01-01', delta: 2 }, // zu lange her
      ],
      '2026-09-24'
    );
    const byTitle = Object.fromEntries(list.map((a) => [a.title, a]));
    expect(byTitle['Serienkiller'].playerId).toBe('a');
    expect(byTitle['Serienkiller'].detail).toBe('6 Siege in Folge');
    expect(byTitle['Siegertyp'].playerId).toBe('a');
    expect(byTitle['Dauerbrenner'].playerId).toBe('a');
    expect(byTitle['Aufsteiger (30 Tage)'].playerId).toBe('a');
  });

  it('ohne genug Spiele gibt es keine Titel', () => {
    expect(awards([], ['a'], [], '2026-09-24')).toEqual([]);
  });
});

describe('MVP', () => {
  it('MVP ist, wer die meisten Stimmen hat – bei Gleichstand alle', () => {
    expect(sessionMvps([{ playerId: 'a' }, { playerId: 'a' }, { playerId: 'b' }])).toEqual(['a']);
    expect(sessionMvps([{ playerId: 'a' }, { playerId: 'b' }]).sort()).toEqual(['a', 'b']);
    expect(sessionMvps([])).toEqual([]);
  });

  it('zählt Titel über alle Spieltage und vergibt „MVP-Sammler“', () => {
    const titles = mvpTitles([
      { sessionId: 's1', playerId: 'a' },
      { sessionId: 's1', playerId: 'a' },
      { sessionId: 's1', playerId: 'b' },
      { sessionId: 's2', playerId: 'a' },
      { sessionId: 's3', playerId: 'b' },
    ]);
    expect(titles.get('a')).toBe(2);
    expect(titles.get('b')).toBe(1);
    const list = awards([], ['a', 'b'], [], '2026-09-24', titles);
    expect(list).toEqual([
      { emoji: '⭐', title: 'MVP-Sammler', playerId: 'a', detail: '2× MVP des Tages' },
    ]);
  });
});

// Die Saison-Tabelle (Punkte) rechnet der Server: supabase/tests/seasons.test.mjs
describe('playedYears', () => {
  const games = buildGames([match(['a'], ['b'], 1, '2026-03-01'), match(['b'], ['c'], 1, '2027-01-10')]);

  it('listet die Jahre, neuestes zuerst', () => {
    expect(playedYears(games)).toEqual(['2027', '2026']);
  });
});

describe('Gäste in der Statistik', () => {
  const games = buildGames([
    {
      id: 'r1',
      seq: 1,
      kind: 'match',
      playedOn: '2026-09-25',
      matches: [{ teamA: ['a', 'gast'], teamB: ['b', 'c'], scoreA: 1 }],
    },
  ]);
  const filtered = withoutGuests(games, new Set(['gast']));

  it('Gäste haben keine eigenen Spiele in der Statistik', () => {
    expect(filtered.some((g) => g.playerId === 'gast')).toBe(false);
  });

  it('die Spiele der anderen zählen weiter, ohne den Gast als Mit- oder Gegenspieler', () => {
    expect(summarize(filtered, 'a').wins).toBe(1);
    expect(summarize(filtered, 'b').losses).toBe(1);
    expect(filtered.find((g) => g.playerId === 'a')!.teammates).toEqual([]);
    expect(filtered.find((g) => g.playerId === 'b')!.opponents).toEqual(['a']);
  });
});

describe('Anwesenheitsquote', () => {
  const sessions = [
    { sessionId: 's1', playedOn: '2026-08-04', participants: ['a', 'b'] },
    { sessionId: 's2', playedOn: '2026-09-01', participants: ['a'] },
    // 08.09. fiel aus („fällt aus“) → kein Spieltag, zählt für niemanden
    { sessionId: 's3', playedOn: '2026-09-15', participants: ['a', 'b', 'c'] },
    { sessionId: 's4', playedOn: '2025-12-01', participants: ['b'] },
  ];

  it('zählt je Spieler die Spieltage, an denen er dabei war', () => {
    const all = attendance(sessions, ['a', 'b', 'c']);
    expect(all.map((r) => [r.playerId, r.present, r.total])).toEqual([
      ['a', 3, 4],
      ['b', 3, 4],
      ['c', 1, 4],
    ]);
    expect(all[0].rate).toBeCloseTo(0.75);
  });

  it('lässt sich auf Jahr und Monat eingrenzen', () => {
    const sept = attendance(sessions, ['a', 'b'], '2026-09');
    expect(sept.map((r) => [r.playerId, r.present, r.total])).toEqual([
      ['a', 2, 2],
      ['b', 1, 2],
    ]);
    expect(attendance(sessions, ['b'], '2025')[0]).toMatchObject({ present: 1, total: 1, rate: 1 });
  });

  it('abgesagte Termine zählen nicht, ohne Spieltage ist die Quote 0', () => {
    expect(attendance(sessions, ['a'], '2026-10')[0]).toMatchObject({ present: 0, total: 0, rate: 0 });
  });

  it('Gäste stehen nicht in der Liste (nur übergebene Spieler)', () => {
    expect(attendance(sessions, ['a']).map((r) => r.playerId)).toEqual(['a']);
  });

  it('Monate eines Jahres', () => {
    expect(playedMonths(sessions, '2026')).toEqual(['2026-09', '2026-08']);
  });
});
