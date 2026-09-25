import { explainResult, formatDelta } from '../explain';

const row = (player: string, team: string, value: number, after: number, games = 10, match = 'm1') => ({
  match_id: match,
  team_id: team,
  player_id: player,
  defense_before: value,
  attack_before: value,
  defense_after: after,
  attack_after: after,
  games_before: games,
});

const match = (score_a: number, goals: [number, number] | null = null, id = 'm1', a = 'A', b = 'B') => ({
  id,
  team_a: a,
  team_b: b,
  goals_a: goals?.[0] ?? null,
  goals_b: goals?.[1] ?? null,
  score_a,
});

describe('Warum hat sich mein Wert geändert?', () => {
  it('Außenseiter gewinnt: deutliches Plus', () => {
    // Team A (2 × 4) gegen Team B (2 × 6): A ist Außenseiter
    const texts = explainResult(
      {
        kind: 'match',
        matches: [match(1)],
        details: [row('a1', 'A', 4, 4.25), row('a2', 'A', 4, 4.25), row('b1', 'B', 6, 5.75), row('b2', 'B', 6, 5.75)],
      },
      10
    );
    expect(texts.get('a1')).toMatch(/^Ihr habt als Außenseiter gewonnen \(Siegchance 28 %\), deshalb \+0,3\.$/);
    expect(texts.get('b1')).toMatch(/^Ihr habt als Favorit verloren \(Siegchance 72 %\), deshalb −0,3\.$/);
  });

  it('Favorit gewinnt: nur kleines Plus; Torstand wird genannt', () => {
    const texts = explainResult(
      {
        kind: 'match',
        matches: [match(0, [1, 5])],
        details: [row('a1', 'A', 4, 3.95), row('b1', 'B', 6, 6.05)],
      },
      10
    );
    expect(texts.get('b1')).toBe(
      'Ihr wart klarer Favorit und habt gewonnen (Siegchance 61 %), deshalb nur +0,05. Der deutliche Torstand (5:1) verstärkt das.'
    );
  });

  it('Unentschieden bei gleich starken Teams, Hinweis für Neulinge', () => {
    const texts = explainResult(
      { kind: 'match', matches: [match(0.5)], details: [row('a1', 'A', 5, 5, 2), row('b1', 'B', 5, 5)] },
      10
    );
    expect(texts.get('a1')).toBe(
      'Unentschieden in einer ausgeglichenen Partie, kaum Änderung (±0,0). Als Neuling ändern sich die Werte noch schneller.'
    );
  });

  it('Turnier: Sieger und Verlierer zusammengefasst', () => {
    const texts = explainResult(
      {
        kind: 'tournament',
        matches: [match(1, null, 'm1', 'A', 'B'), match(1, null, 'm2', 'A', 'C')],
        details: [
          row('a1', 'A', 5, 5.1, 10, 'm1'),
          row('a1', 'A', 5.1, 5.2, 10, 'm2'),
          row('b1', 'B', 5, 4.9, 10, 'm1'),
          row('c1', 'C', 5, 4.9, 10, 'm2'),
        ],
      },
      10
    );
    expect(texts.get('a1')).toMatch(/^Turniersieg gegen alle anderen Teams .*deshalb \+0,2\.$/);
    expect(texts.get('b1')).toMatch(/^Das Turnier hat ein anderes Team gewonnen/);
  });

  it('Änderung schön formatiert', () => {
    expect(formatDelta(0.3)).toBe('+0,3');
    expect(formatDelta(-0.05)).toBe('−0,05');
    expect(formatDelta(0.001)).toBe('±0,0');
  });
});
