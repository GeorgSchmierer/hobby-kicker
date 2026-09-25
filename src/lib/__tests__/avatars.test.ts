import { avatarColor, initials } from '../avatars';

jest.mock('../supabase', () => ({ supabase: {} }));
jest.mock('../outbox', () => ({ newId: () => 'id' }));
jest.mock('expo-image-manipulator', () => ({ ImageManipulator: {}, SaveFormat: { JPEG: 'jpeg' } }));
jest.mock('expo-image-picker', () => ({}));

describe('Avatare', () => {
  it('Initialen aus dem Namen', () => {
    expect(initials('Tommi')).toBe('TO');
    expect(initials('Max Mustermann')).toBe('MM');
    expect(initials('  anna   lena  berg ')).toBe('AB');
    expect(initials('Ö')).toBe('Ö');
    expect(initials('')).toBe('?');
  });

  it('Farbe ist fest aus dem Namen abgeleitet', () => {
    expect(avatarColor('Tommi')).toBe(avatarColor('tommi '));
    expect(avatarColor('Tommi')).toMatch(/^#[0-9A-F]{6}$/);
    const colors = new Set(['Anna', 'Ben', 'Carl', 'Dora', 'Emil', 'Fritz', 'Gabi'].map(avatarColor));
    expect(colors.size).toBeGreaterThan(3);
  });
});
