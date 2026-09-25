import { formatEuro, openBalances, parseEuro, splitCents, type Expense } from '../cash';

jest.mock('../supabase', () => ({ supabase: {} }));

describe('Kassenbuch', () => {
  it('Aufteilung stimmt auf den Cent, Rest an die Ersten', () => {
    expect(splitCents(6000, 7)).toEqual([858, 857, 857, 857, 857, 857, 857]);
    expect(splitCents(1000, 3)).toEqual([334, 333, 333]);
    expect(splitCents(1200, 12).every((c) => c === 100)).toBe(true);
    for (const [total, n] of [[6000, 7], [999, 4], [1, 5], [100000, 13]]) {
      expect(splitCents(total, n).reduce((a, b) => a + b, 0)).toBe(total);
    }
    expect(splitCents(100, 0)).toEqual([]);
  });

  it('Euro anzeigen und eingeben', () => {
    expect(formatEuro(857)).toBe('8,57 €');
    expect(formatEuro(125000)).toBe('1.250,00 €');
    expect(parseEuro('60')).toBe(6000);
    expect(parseEuro('60,5')).toBe(6050);
    expect(parseEuro('60.50 €')).toBe(6050);
    expect(parseEuro('0')).toBeNull();
    expect(parseEuro('abc')).toBeNull();
    expect(parseEuro('1,234')).toBeNull();
  });

  it('offene Beträge je Spieler, bezahlte zählen nicht', () => {
    const e = (id: string, shares: [string, number, boolean][]): Expense => ({
      id,
      session_id: 's',
      description: 'Halle',
      amount_cents: 0,
      created_at: '',
      played_on: '2026-09-26',
      shares: shares.map(([player_id, amount_cents, paid]) => ({
        expense_id: id,
        player_id,
        amount_cents,
        paid_at: paid ? 'x' : null,
      })),
    });
    const open = openBalances([
      e('1', [['a', 500, false], ['b', 500, true]]),
      e('2', [['a', 300, false], ['b', 300, false]]),
    ]);
    expect(open.map((o) => [o.playerId, o.open, o.shares.length])).toEqual([
      ['a', 800, 2],
      ['b', 300, 1],
    ]);
  });
});
