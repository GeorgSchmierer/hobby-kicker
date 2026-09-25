/**
 * Tests für Gastspieler (A6). Start: npm run test:db
 */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { before, describe, it } from 'node:test';

import { createTestDb } from './helpers.mjs';

let q, one, newUser, as;
let admin, member, stranger, groupId, guest;

const player = (id) => one('select * from public.players where id = $1', [id]);

describe('Gastspieler', () => {
  before(async () => {
    ({ q, one, newUser, as } = await createTestDb());
    admin = await newUser('admin@example.com');
    member = await newUser('member@example.com');
    stranger = await newUser('stranger@example.com');
    groupId = (await as(admin, () => one(`select public.create_group('Montagskick') as id`))).id;
    const { invite_code } = await one('select invite_code from public.groups where id = $1', [groupId]);
    await as(member, () => q('select public.join_group($1)', [invite_code]));
    await one(`insert into public.players (group_id, name) values ($1, 'Stammspieler') returning id`, [groupId]);
    guest = randomUUID();
  });

  it('Mitglied legt einen Gast an (Stärke laut Stufe, als Gast markiert)', async () => {
    await as(member, () => q('select public.add_guest($1, $2, $3, $4)', [guest, groupId, '  Paul ', 8]));
    const p = await player(guest);
    assert.equal(p.name, 'Paul');
    assert.equal(p.is_guest, true);
    assert.equal(Number(p.defense), 8);
    assert.equal(Number(p.attack), 8);
  });

  it('Nochmal senden legt keinen zweiten Gast an', async () => {
    await as(member, () => q('select public.add_guest($1, $2, $3, $4)', [guest, groupId, 'Paul', 8]));
    assert.equal((await q(`select * from public.players where name = 'Paul'`)).length, 1);
  });

  it('Name eines Stammspielers geht nicht, Fremde dürfen nicht', async () => {
    await assert.rejects(as(member, () => q('select public.add_guest($1, $2, $3, $4)', [randomUUID(), groupId, 'stammspieler', 6])));
    await assert.rejects(
      as(stranger, () => q('select public.add_guest($1, $2, $3, $4)', [randomUUID(), groupId, 'X', 6])),
      /kein Mitglied/
    );
    await assert.rejects(as(member, () => q('select public.add_guest($1, $2, $3, $4)', [randomUUID(), groupId, 'Y', 12])), /Stärke/);
  });

  it('Gast spielt mit und wird normal gewertet', async () => {
    const ids = [];
    for (const name of ['A', 'B', 'C']) {
      ids.push((await one(`insert into public.players (group_id, name) values ($1, $2) returning id`, [groupId, name])).id);
    }
    const sid = (
      await as(member, () =>
        one('select public.start_session($1, $2::jsonb) as id', [groupId, JSON.stringify([[guest, ids[0]], [ids[1], ids[2]]])])
      )
    ).id;
    const [red, blue] = (await q('select id from public.teams where session_id = $1 order by idx', [sid])).map((t) => t.id);
    await as(member, () => q(`select public.record_match($1, $2, $3, 'b', null, null)`, [sid, red, blue]));
    const p = await player(guest);
    assert.equal(p.games_played, 1);
    assert.ok(Number(p.defense) < 8);
  });

  it('Ausblenden darf jedes Mitglied, Übernehmen nur Admins', async () => {
    await assert.rejects(as(member, () => q('select public.finish_guest($1, true)', [guest])), /nur Admins/);
    await as(member, () => q('select public.finish_guest($1, false)', [guest]));
    assert.equal((await player(guest)).active, false);
  });

  it('Kommt der Gast wieder, wird er mit seinen alten Werten eingeblendet', async () => {
    const before = await player(guest);
    await as(member, () => q('select public.add_guest($1, $2, $3, $4)', [guest, groupId, 'Paul', 6]));
    const after = await player(guest);
    assert.equal(after.active, true);
    assert.equal(Number(after.defense), Number(before.defense));
  });

  it('Admin übernimmt den Gast als festen Spieler', async () => {
    await as(admin, () => q('select public.finish_guest($1, true)', [guest]));
    const p = await player(guest);
    assert.equal(p.is_guest, false);
    assert.equal(p.active, true);
    await assert.rejects(as(admin, () => q('select public.finish_guest($1, false)', [guest])), /gibt es nicht/);
  });

  it('Fremde können keine Gäste ausblenden', async () => {
    const other = randomUUID();
    await as(member, () => q('select public.add_guest($1, $2, $3, $4)', [other, groupId, 'Lisa', 6]));
    await assert.rejects(as(stranger, () => q('select public.finish_guest($1, false)', [other])), /gibt es nicht/);
  });
});
