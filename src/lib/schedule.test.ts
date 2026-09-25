import {
  addDays,
  berlinToday,
  formatEventDate,
  isoWeekday,
  nextEvent,
  parseTime,
  relativeDay,
  rsvpOverview,
  upcomingDates,
} from './schedule';

describe('Datum', () => {
  it('rechnet in deutscher Zeit (kurz nach Mitternacht schon der neue Tag)', () => {
    // 22:30 UTC im Sommer = 00:30 in Deutschland
    expect(berlinToday(new Date('2026-09-29T22:30:00Z'))).toBe('2026-09-30');
    expect(berlinToday(new Date('2026-09-29T21:30:00Z'))).toBe('2026-09-29');
  });

  it('Wochentage und Monatswechsel', () => {
    expect(isoWeekday('2026-09-28')).toBe(1); // Montag
    expect(isoWeekday('2026-10-04')).toBe(7); // Sonntag
    expect(addDays('2026-09-28', 7)).toBe('2026-10-05');
    expect(addDays('2026-12-29', 7)).toBe('2027-01-05');
  });

  it('formatiert kurz', () => {
    expect(formatEventDate('2026-09-29')).toBe('Di, 29.09.');
  });
});

describe('Nächster Termin', () => {
  it('liefert die nächsten Termine am richtigen Wochentag, heute eingeschlossen', () => {
    expect(upcomingDates(2, '2026-09-29', 3)).toEqual(['2026-09-29', '2026-10-06', '2026-10-13']);
    expect(upcomingDates(2, '2026-09-30', 1)).toEqual(['2026-10-06']);
  });

  it('heute und morgen', () => {
    expect(nextEvent({ weekday: 2 }, [], '2026-09-29')).toEqual({ date: '2026-09-29', daysAway: 0, skipped: [] });
    const tomorrow = nextEvent({ weekday: 2 }, [], '2026-09-28')!;
    expect(tomorrow.daysAway).toBe(1);
    expect(relativeDay(tomorrow)).toBe('Morgen');
  });

  it('überspringt abgesagte Termine', () => {
    const next = nextEvent({ weekday: 2 }, ['2026-09-29', '2026-10-06'], '2026-09-28')!;
    expect(next.date).toBe('2026-10-13');
    expect(next.skipped).toEqual(['2026-09-29', '2026-10-06']);
    expect(relativeDay(next)).toBe('Di, 13.10.');
  });
});

describe('Uhrzeit-Eingabe', () => {
  it('akzeptiert übliche Schreibweisen', () => {
    expect(parseTime('19:00')).toBe('19:00');
    expect(parseTime(' 7.30 ')).toBe('07:30');
  });
  it('lehnt Unsinn ab', () => {
    expect(parseTime('25:00')).toBeNull();
    expect(parseTime('19')).toBeNull();
    expect(parseTime('abc')).toBeNull();
  });
});

describe('Zusagen-Übersicht', () => {
  const players = ['a', 'b', 'c', 'd', 'e'];
  const rsvps = [
    { player_id: 'c', attending: true, answered_at: '2026-09-25T10:00:03+00:00' },
    { player_id: 'a', attending: true, answered_at: '2026-09-25T10:00:01+00:00' },
    { player_id: 'b', attending: true, answered_at: '2026-09-25T10:00:02+00:00' },
    { player_id: 'd', attending: false, answered_at: '2026-09-25T10:00:00+00:00' },
    { player_id: 'x', attending: true, answered_at: '2026-09-25T09:00:00+00:00' }, // unbekannt/inaktiv
  ];

  it('ohne Höchstzahl sind alle Zusagen dabei, in Reihenfolge der Zusage', () => {
    expect(rsvpOverview(players, rsvps, null)).toEqual({
      attending: ['a', 'b', 'c'],
      waitlist: [],
      declined: ['d'],
      open: ['e'],
    });
  });

  it('mit Höchstzahl kommen die Spätesten auf die Warteliste', () => {
    const o = rsvpOverview(players, rsvps, 2);
    expect(o.attending).toEqual(['a', 'b']);
    expect(o.waitlist).toEqual(['c']);
  });

  it('sagt jemand ab, rückt die Warteliste nach', () => {
    const changed = rsvps.map((r) =>
      r.player_id === 'a' ? { ...r, attending: false, answered_at: '2026-09-25T11:00:00+00:00' } : r
    );
    const o = rsvpOverview(players, changed, 2);
    expect(o.attending).toEqual(['b', 'c']);
    expect(o.waitlist).toEqual([]);
  });
});
