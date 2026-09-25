import { badgeMessage, badgeTitle } from '../badges';

jest.mock('../supabase', () => ({ supabase: {} }));

describe('Abzeichen-Texte', () => {
  it('Titel mit Stufe beim Jubiläum', () => {
    expect(badgeTitle({ kind: 'jubilaeum', level: 50 })).toBe('Jubiläum: 50 Spiele');
    expect(badgeTitle({ kind: 'comeback', level: 1 })).toBe('Comeback-König');
  });

  it('Hinweis nach dem Spiel', () => {
    expect(badgeMessage('Anna', { kind: 'siegesserie', level: 1 })).toBe(
      'Anna hat ein Abzeichen bekommen: 🔥 Siegesserie'
    );
  });
});
