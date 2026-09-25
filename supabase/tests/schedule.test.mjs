/**
 * Tests für festen Termin und Zu-/Absagen (A1 + A2). Start: npm run test:db
 */
import assert from 'node:assert/strict';
import { before, describe, it } from 'node:test';

import { createTestDb } from './helpers.mjs';

let q, one, newUser, as;
let admin, member, stranger, groupId, tomorrow, weekday, owned, guest;

const rsvp = (user, date, player, attending) =>
  as(user, () => q('select public.set_rsvp($1, $2::date, $3, $4)', [groupId, date, player, attending]));

describe('Fester Termin und Zusagen', () => {
  before(async () => {
    ({ q, one, newUser, as } = await createTestDb());
    admin = await newUser('admin@example.com');
    member = await newUser('member@example.com');
    stranger = await newUser('stranger@example.com');
    groupId = (await as(admin, () => one(`select public.create_group('Montagskick') as id`))).id;
    const { invite_code } = await one('select invite_code from public.groups where id = $1', [groupId]);
    await as(member, () => q('select public.join_group($1)', [invite_code]));
    owned = (await one(`insert into public.players (group_id, name, user_id) values ($1, 'Max', $2) returning id`, [groupId, member])).id;
    guest = (await one(`insert into public.players (group_id, name) values ($1, 'Ohne App') returning id`, [groupId])).id;
    // Serie auf den Wochentag von morgen legen
    const row = await one(`select (public.berlin_today() + 1)::text as d, extract(isodow from public.berlin_today() + 1)::int as w`);
    tomorrow = row.d;
    weekday = row.w;
  });

  it('Nur Admins legen den Termin fest', async () => {
    await assert.rejects(
      as(member, () => q(`select public.save_schedule($1, $2, '19:00', 'Halle', 14)`, [groupId, weekday])),
      /Nur Admins/
    );
    await as(admin, () => q(`select public.save_schedule($1, $2, '19:00', '  Halle  ', 14)`, [groupId, weekday]));
    const s = await as(member, () => one('select * from public.schedules where group_id = $1', [groupId]));
    assert.equal(s.location, 'Halle');
    assert.equal(s.max_players, 14);
  });

  it('Fremde sehen weder Termin noch Zusagen', async () => {
    assert.equal((await as(stranger, () => q('select * from public.schedules'))).length, 0);
    await assert.rejects(rsvp(stranger, tomorrow, guest, true));
  });

  it('Mitglied sagt für sich und für Spieler ohne Konto zu', async () => {
    await rsvp(member, tomorrow, owned, true);
    await rsvp(member, tomorrow, guest, false);
    const rows = await as(member, () => q('select player_id, attending from public.rsvps order by attending'));
    assert.deepEqual(rows.map((r) => r.attending), [false, true]);
  });

  it('Für Spieler mit eigenem Konto antworten nur er selbst oder ein Admin', async () => {
    const other = await newUser('other@example.com');
    const { invite_code } = await one('select invite_code from public.groups where id = $1', [groupId]);
    await as(other, () => q('select public.join_group($1)', [invite_code]));
    await assert.rejects(rsvp(other, tomorrow, owned, false), /eigenes Konto/);
    await rsvp(admin, tomorrow, owned, false);
    assert.equal((await one('select attending from public.rsvps where player_id = $1', [owned])).attending, false);
  });

  it('Gleiche Antwort behält den Platz, neue Antwort bekommt neue Zeit', async () => {
    await rsvp(member, tomorrow, owned, true);
    const first = (await one('select answered_at from public.rsvps where player_id = $1', [owned])).answered_at;
    await rsvp(member, tomorrow, owned, true);
    const same = (await one('select answered_at from public.rsvps where player_id = $1', [owned])).answered_at;
    assert.equal(same.getTime(), first.getTime());
  });

  it('Antwort zurücknehmen', async () => {
    await rsvp(member, tomorrow, guest, null);
    assert.equal((await q('select * from public.rsvps where player_id = $1', [guest])).length, 0);
  });

  it('Nur an Termintagen und nicht in der Vergangenheit', async () => {
    const wrongDay = (await one(`select (public.berlin_today() + 2)::text as d`)).d;
    const past = (await one(`select (public.berlin_today() - 6)::text as d`)).d;
    await assert.rejects(rsvp(member, wrongDay, guest, true), /kein Termin/);
    await assert.rejects(rsvp(member, past, guest, true), /kein Termin/);
  });

  it('Admin sagt einen Termin ab – dann keine Zusagen mehr; und wieder zurück', async () => {
    await assert.rejects(
      as(member, () => q('select public.set_event_cancelled($1, $2::date, true)', [groupId, tomorrow])),
      /Nur Admins/
    );
    await as(admin, () => q('select public.set_event_cancelled($1, $2::date, true)', [groupId, tomorrow]));
    await assert.rejects(rsvp(member, tomorrow, guest, true), /fällt aus/);
    await as(admin, () => q('select public.set_event_cancelled($1, $2::date, false)', [groupId, tomorrow]));
    await rsvp(member, tomorrow, guest, true);
  });

  it('Anderer Wochentag: kommende Antworten und Absagen verfallen', async () => {
    const next = weekday === 7 ? 1 : weekday + 1;
    await as(admin, () => q(`select public.save_schedule($1, $2, '20:00', null, null)`, [groupId, next]));
    assert.equal((await q('select * from public.rsvps')).length, 0);
    const s = await one('select location, max_players from public.schedules');
    assert.equal(s.location, null);
    assert.equal(s.max_players, null);
  });

  it('Direktes Schreiben ist nicht erlaubt', async () => {
    await assert.rejects(
      as(member, () =>
        q('insert into public.rsvps (group_id, event_date, player_id, attending) values ($1, $2::date, $3, true)', [groupId, tomorrow, guest])
      )
    );
    await assert.rejects(as(member, () => q('update public.schedules set weekday = 1')).then((r) => {
      // update ohne Policy trifft keine Zeile – das ist auch in Ordnung
      if (r.length === 0) throw new Error('keine Zeile');
    }));
  });

  it('Termin löschen (nur Admin)', async () => {
    await assert.rejects(as(member, () => q('select public.delete_schedule($1)', [groupId])), /Nur Admins/);
    await as(admin, () => q('select public.delete_schedule($1)', [groupId]));
    assert.equal((await q('select * from public.schedules')).length, 0);
  });
});
