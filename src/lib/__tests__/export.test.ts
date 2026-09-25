import { strFromU8, unzipSync } from 'fflate';

import { buildSheets, toXlsx } from '../export';

jest.mock('../supabase', () => ({ supabase: {} }));

const raw = {
  groupName: 'Montagskick',
  players: [
    { id: 'p1', name: 'Anna', defense: 6.5, attack: 7, games_played: 2, active: true, is_guest: false },
    { id: 'p2', name: 'Björn & Co', defense: 5, attack: 5, games_played: 2, active: true, is_guest: false },
    { id: 'p3', name: 'Paul', defense: 6, attack: 6, games_played: 1, active: false, is_guest: true },
  ],
  sessions: [
    {
      id: 's1',
      played_on: '2026-09-22',
      teams: [
        { id: 't2', idx: 1, team_players: [{ player_id: 'p2' }, { player_id: 'p3' }] },
        { id: 't1', idx: 0, team_players: [{ player_id: 'p1' }] },
      ],
      results: [
        {
          id: 'r2',
          seq: 8,
          kind: 'tournament' as const,
          matches: [{ id: 'm2', team_a: 't2', team_b: 't1', goals_a: null, goals_b: null, score_a: 1 }],
          rating_changes: [],
        },
        {
          id: 'r1',
          seq: 7,
          kind: 'match' as const,
          matches: [{ id: 'm1', team_a: 't1', team_b: 't2', goals_a: 3, goals_b: 1, score_a: 1 }],
          rating_changes: [
            { id: 2, player_id: 'p2', defense_before: 5.1, attack_before: 5.1, defense_after: 5, attack_after: 5 },
            { id: 1, player_id: 'p1', defense_before: 6.4, attack_before: 6.9, defense_after: 6.5, attack_after: 7 },
          ],
        },
      ],
    },
  ],
};

describe('Daten-Export', () => {
  const sheets = buildSheets(raw);

  it('fünf Blätter in fester Reihenfolge', () => {
    expect(sheets.map((s) => s.name)).toEqual(['Spieler', 'Spieltage', 'Teams', 'Ergebnisse', 'Wertungsverlauf']);
  });

  it('Spieler mit Werten und Status, keine E-Mail-Adressen', () => {
    expect(sheets[0].rows[0]).toEqual(['Anna', 6.5, 7, 6.75, 2, 'aktiv']);
    expect(sheets[0].rows[2][5]).toBe('Gast');
    expect(JSON.stringify(sheets)).not.toMatch(/@/);
  });

  it('Teams, Ergebnisse (auch Turnier) und Wertungsverlauf in richtiger Reihenfolge', () => {
    expect(sheets[2].rows).toEqual([
      ['22.09.2026', 'Rot', 'Anna'],
      ['22.09.2026', 'Blau', 'Björn & Co, Paul'],
    ]);
    expect(sheets[3].rows).toEqual([
      ['22.09.2026', 7, 'Partie', 'Rot', 'Blau', '3:1', 'Rot gewinnt'],
      ['22.09.2026', 8, 'Turnier', 'Blau', 'alle anderen', '', 'Blau gewinnt das Turnier'],
    ]);
    expect(sheets[4].rows.map((r) => r[2])).toEqual(['Anna', 'Björn & Co']);
  });

  it('Excel-Datei: gültiges Paket mit allen Blättern, Sonderzeichen sicher', async () => {
    const files = unzipSync(toXlsx(sheets));
    expect(Object.keys(files)).toEqual(
      expect.arrayContaining(['[Content_Types].xml', 'xl/workbook.xml', 'xl/worksheets/sheet5.xml'])
    );
    const workbook = strFromU8(files['xl/workbook.xml']);
    expect(workbook).toContain('name="Wertungsverlauf"');
    const players = strFromU8(files['xl/worksheets/sheet1.xml']);
    expect(players).toContain('Björn &amp; Co');
    expect(players).toContain('<v>6.75</v>');
  });
});
