import { isNewer, shortVersion } from '../updates';

describe('Update-Erkennung', () => {
  it('meldet eine neue Version nur, wenn sich die Kennung unterscheidet', () => {
    expect(isNewer('bbb', 'aaa')).toBe(true);
    expect(isNewer('aaa', 'aaa')).toBe(false);
  });

  it('meldet nichts, wenn keine Kennung bekannt ist (lokal oder Server nicht erreichbar)', () => {
    expect(isNewer(null, 'aaa')).toBe(false);
    expect(isNewer('bbb', '')).toBe(false);
  });

  it('zeigt die Version kurz an', () => {
    expect(shortVersion('3918a76f0c2e5d')).toBe('3918a76');
    expect(shortVersion('')).toBe('Entwicklung');
  });
});
