import { formatRating, stepRating } from '../ratings';

describe('stepRating', () => {
  it('springt von Kommawerten zur nächsten ganzen Zahl', () => {
    expect(stepRating(8.4, -1)).toBe(8);
    expect(stepRating(8.4, 1)).toBe(9);
    expect(stepRating(6.25, -1)).toBe(6);
    expect(stepRating(6.25, 1)).toBe(7);
  });

  it('geht von ganzen Zahlen einen ganzen Schritt', () => {
    expect(stepRating(8, -1)).toBe(7);
    expect(stepRating(8, 1)).toBe(9);
  });

  it('bleibt zwischen 1 und 11', () => {
    expect(stepRating(1, -1)).toBe(1);
    expect(stepRating(11, 1)).toBe(11);
    expect(stepRating(10.6, 1)).toBe(11);
    expect(stepRating(1.3, -1)).toBe(1);
  });

  it('ignoriert winzige Rechenungenauigkeiten', () => {
    expect(stepRating(7.000000001, 1)).toBe(8);
    expect(stepRating(6.999999999, -1)).toBe(6);
  });
});

describe('formatRating', () => {
  it('zeigt eine Nachkommastelle mit Komma', () => {
    expect(formatRating(8.4)).toBe('8,4');
    expect(formatRating(7)).toBe('7,0');
  });
});
