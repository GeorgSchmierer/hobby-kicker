/**
 * Statistiken aus den vorhandenen Ergebnissen – reine Rechenfunktionen, keine Datenbank.
 *
 * Gezählt wird pro Ergebnis-Eintrag: eine Partie ist ein Spiel; ein „Turniersieger“ zählt
 * für das Siegerteam als EIN Sieg und für alle anderen Teams als EINE Niederlage
 * (sonst hätte der Turniersieg bei 4 Teams dreifaches Gewicht in der Siegquote).
 */

export type Outcome = 'W' | 'D' | 'L';

/** Ein Ergebnis mit den beteiligten Teams (Spieler-IDs) */
export type ResultInput = {
  id: string;
  seq: number;
  kind: 'match' | 'tournament';
  playedOn: string;
  /** Partien dieses Ergebnisses; Teams als Spieler-ID-Listen */
  matches: { teamA: string[]; teamB: string[]; scoreA: number }[];
};

/** Ein Spiel aus Sicht eines Spielers */
export type Game = {
  resultId: string;
  seq: number;
  playedOn: string;
  playerId: string;
  outcome: Outcome;
  teammates: string[];
  opponents: string[];
};

export function buildGames(results: ResultInput[]): Game[] {
  const games: Game[] = [];
  for (const r of [...results].sort((a, b) => a.seq - b.seq)) {
    const base = { resultId: r.id, seq: r.seq, playedOn: r.playedOn };
    if (r.kind === 'tournament') {
      const winners = r.matches[0]?.teamA ?? [];
      const losers = r.matches.flatMap((m) => m.teamB);
      for (const p of winners) {
        games.push({ ...base, playerId: p, outcome: 'W', teammates: others(winners, p), opponents: losers });
      }
      for (const m of r.matches) {
        for (const p of m.teamB) {
          games.push({ ...base, playerId: p, outcome: 'L', teammates: others(m.teamB, p), opponents: winners });
        }
      }
      continue;
    }
    for (const m of r.matches) {
      const outA: Outcome = m.scoreA === 1 ? 'W' : m.scoreA === 0 ? 'L' : 'D';
      const outB: Outcome = outA === 'W' ? 'L' : outA === 'L' ? 'W' : 'D';
      for (const p of m.teamA) {
        games.push({ ...base, playerId: p, outcome: outA, teammates: others(m.teamA, p), opponents: m.teamB });
      }
      for (const p of m.teamB) {
        games.push({ ...base, playerId: p, outcome: outB, teammates: others(m.teamB, p), opponents: m.teamA });
      }
    }
  }
  return games;
}

const others = (team: string[], p: string) => team.filter((x) => x !== p);

export type Summary = {
  played: number;
  wins: number;
  draws: number;
  losses: number;
  /** Siege / Spiele (Unentschieden zählt als halber Sieg); null ohne Spiele */
  winRate: number | null;
  /** letzte bis zu 5 Spiele, ältestes zuerst */
  form: Outcome[];
  /** aktuelle Serie gleicher Ergebnisse */
  streak: { outcome: Outcome; length: number } | null;
  longestWinStreak: number;
};

export function summarize(games: Game[], playerId: string): Summary {
  const mine = games.filter((g) => g.playerId === playerId).sort((a, b) => a.seq - b.seq);
  const wins = mine.filter((g) => g.outcome === 'W').length;
  const draws = mine.filter((g) => g.outcome === 'D').length;
  const losses = mine.length - wins - draws;

  let longest = 0;
  let run = 0;
  for (const g of mine) {
    run = g.outcome === 'W' ? run + 1 : 0;
    longest = Math.max(longest, run);
  }

  let streak: Summary['streak'] = null;
  if (mine.length > 0) {
    const last = mine[mine.length - 1].outcome;
    let length = 0;
    for (let i = mine.length - 1; i >= 0 && mine[i].outcome === last; i--) length++;
    streak = { outcome: last, length };
  }

  return {
    played: mine.length,
    wins,
    draws,
    losses,
    winRate: mine.length ? (wins + draws / 2) / mine.length : null,
    form: mine.slice(-5).map((g) => g.outcome),
    streak,
    longestWinStreak: longest,
  };
}

export type PairStat = { otherId: string; played: number; winRate: number };

function pairStats(games: Game[], playerId: string, field: 'teammates' | 'opponents'): PairStat[] {
  const byOther = new Map<string, { played: number; points: number }>();
  for (const g of games) {
    if (g.playerId !== playerId) continue;
    for (const other of g[field]) {
      const s = byOther.get(other) ?? { played: 0, points: 0 };
      s.played += 1;
      s.points += g.outcome === 'W' ? 1 : g.outcome === 'D' ? 0.5 : 0;
      byOther.set(other, s);
    }
  }
  return [...byOther.entries()].map(([otherId, s]) => ({
    otherId,
    played: s.played,
    winRate: s.points / s.played,
  }));
}

/** Mindestanzahl gemeinsamer Spiele, damit Traumduo & Co. nicht vom Zufall abhängen */
export const MIN_PAIR_GAMES = 3;

const better = (a: PairStat, b: PairStat) => b.winRate - a.winRate || b.played - a.played;

/** Mit wem gewinnt jemand am häufigsten zusammen? */
export function dreamPartner(games: Game[], playerId: string): PairStat | null {
  return pairStats(games, playerId, 'teammates').filter((s) => s.played >= MIN_PAIR_GAMES).sort(better)[0] ?? null;
}

/** Gegen wen verliert jemand am häufigsten? */
export function nemesis(games: Game[], playerId: string): PairStat | null {
  const list = pairStats(games, playerId, 'opponents')
    .filter((s) => s.played >= MIN_PAIR_GAMES && s.winRate < 0.5)
    .sort((a, b) => a.winRate - b.winRate || b.played - a.played);
  return list[0] ?? null;
}

/** Gegen wen gewinnt jemand am liebsten? */
export function favouriteOpponent(games: Game[], playerId: string): PairStat | null {
  const list = pairStats(games, playerId, 'opponents')
    .filter((s) => s.played >= MIN_PAIR_GAMES && s.winRate > 0.5)
    .sort(better);
  return list[0] ?? null;
}

/** Stärke-Verlauf aus den Wertungsänderungen: Punkte (Datum, Gesamtstärke) */
export type RatingPoint = { seq: number; playedOn: string; strength: number };

export function strengthHistory(
  changes: {
    seq: number;
    playedOn: string;
    playerId: string;
    before: number;
    after: number;
  }[],
  playerId: string
): RatingPoint[] {
  const mine = changes.filter((c) => c.playerId === playerId).sort((a, b) => a.seq - b.seq);
  if (mine.length === 0) return [];
  const points: RatingPoint[] = [{ seq: 0, playedOn: mine[0].playedOn, strength: mine[0].before }];
  for (const c of mine) {
    const last = points[points.length - 1];
    if (last.seq === c.seq) last.strength = c.after;
    else points.push({ seq: c.seq, playedOn: c.playedOn, strength: c.after });
  }
  return points;
}

export type Award = {
  emoji: string;
  title: string;
  playerId: string;
  detail: string;
};

/**
 * Auszeichnungen der Gruppe – jeweils nur, wenn es etwas zu feiern gibt.
 * `today` als JJJJ-MM-TT für „Aufsteiger der letzten 30 Tage“.
 */
export function awards(
  games: Game[],
  playerIds: string[],
  strengthChanges: { playerId: string; playedOn: string; delta: number }[],
  today: string
): Award[] {
  const list: Award[] = [];
  const summaries = new Map(playerIds.map((id) => [id, summarize(games, id)]));
  const pct = (v: number) => `${Math.round(v * 100)} %`;

  const byWinStreak = playerIds
    .map((id) => ({ id, s: summaries.get(id)! }))
    .filter(({ s }) => s.streak?.outcome === 'W' && s.streak.length >= 3)
    .sort((a, b) => b.s.streak!.length - a.s.streak!.length)[0];
  if (byWinStreak) {
    list.push({
      emoji: '🔥',
      title: 'Serienkiller',
      playerId: byWinStreak.id,
      detail: `${byWinStreak.s.streak!.length} Siege in Folge`,
    });
  }

  const best = playerIds
    .map((id) => ({ id, s: summaries.get(id)! }))
    .filter(({ s }) => s.played >= 5 && s.winRate !== null)
    .sort((a, b) => b.s.winRate! - a.s.winRate! || b.s.played - a.s.played)[0];
  if (best) {
    list.push({ emoji: '🏆', title: 'Siegertyp', playerId: best.id, detail: `${pct(best.s.winRate!)} Siegquote` });
  }

  const most = playerIds
    .map((id) => ({ id, s: summaries.get(id)! }))
    .filter(({ s }) => s.played > 0)
    .sort((a, b) => b.s.played - a.s.played)[0];
  if (most) {
    list.push({ emoji: '🏃', title: 'Dauerbrenner', playerId: most.id, detail: `${most.s.played} Spiele` });
  }

  const since = shiftDate(today, -30);
  const gains = new Map<string, number>();
  for (const c of strengthChanges) {
    if (c.playedOn >= since) gains.set(c.playerId, (gains.get(c.playerId) ?? 0) + c.delta);
  }
  const riser = [...gains.entries()].filter(([, g]) => g >= 0.1).sort((a, b) => b[1] - a[1])[0];
  if (riser) {
    list.push({
      emoji: '📈',
      title: 'Aufsteiger (30 Tage)',
      playerId: riser[0],
      detail: `Stärke +${riser[1].toFixed(1).replace('.', ',')}`,
    });
  }

  return list;
}

function shiftDate(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d + days));
  return date.toISOString().slice(0, 10);
}
