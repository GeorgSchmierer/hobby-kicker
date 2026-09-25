/**
 * Tests der Mitgliederverwaltung (Namen ändern, Spieler verknüpfen). Start: npm run test:db
 */
import assert from 'node:assert/strict';
import { before, describe, it } from 'node:test';

import { createTestDb } from './helpers.mjs';

let q, one, newUser, as;
let admin, member, other, stranger, groupId, otherGroup, maxi, bello;

describe('Mitglieder verwalten', () => {
  before(async () => {
    ({ q, one, newUser, as } = await createTestDb());
    admin = await newUser('admin@example.com');
    member = await newUser('member@example.com');
    other = await newUser('other@example.com');
    stranger = await newUser('stranger@example.com');
    groupId = (await as(admin, () => one(`select public.create_group('Montagskick') as id`))).id;
    const { invite_code } = await one('select invite_code from public.groups where id = $1', [groupId]);
    await as(member, () => q('select public.join_group($1)', [invite_code]));
    await as(other, () => q('select public.join_group($1)', [invite_code]));
    otherGroup = (await as(stranger, () => one(`select public.create_group('Andere') as id`))).id;
    maxi = (await one(`insert into public.players (group_id, name) values ($1, 'Maxi') returning id`, [groupId])).id;
    bello = (await one(`insert into public.players (group_id, name) values ($1, 'Bello') returning id`, [groupId])).id;
  });

  it('Admin ändert den Namen eines Mitglieds, wird protokolliert', async () => {
    await as(admin, () => q('select public.set_member_name($1, $2, $3)', [groupId, member, '  Max  ']));
    assert.equal((await one('select display_name from public.profiles where id = $1', [member])).display_name, 'Max');
    const log = await one(`select details from public.audit_log where action = 'member_renamed'`);
    assert.equal(log.details.after, 'Max');
  });

  it('Mitglieder und Fremde dürfen fremde Namen nicht ändern', async () => {
    await assert.rejects(as(member, () => q('select public.set_member_name($1, $2, $3)', [groupId, other, 'Hack'])), /Nur Admins/);
    await assert.rejects(as(stranger, () => q('select public.set_member_name($1, $2, $3)', [groupId, member, 'Hack'])), /Nur Admins/);
  });

  it('Admin einer anderen Gruppe kann Nicht-Mitglieder nicht umbenennen', async () => {
    await assert.rejects(as(stranger, () => q('select public.set_member_name($1, $2, $3)', [otherGroup, member, 'Hack'])), /kein Mitglied/);
  });

  it('Leerer Name wird abgelehnt', async () => {
    await assert.rejects(as(admin, () => q('select public.set_member_name($1, $2, $3)', [groupId, member, '   '])));
  });

  it('Admin verknüpft Mitglied mit Spieler, Mitglieder dürfen das nicht', async () => {
    await as(admin, () => q('update public.players set user_id = $1 where id = $2', [member, maxi]));
    assert.equal((await one('select user_id from public.players where id = $1', [maxi])).user_id, member);
    await as(member, () => q('update public.players set user_id = $1 where id = $2', [member, bello]));
    assert.equal((await one('select user_id from public.players where id = $1', [bello])).user_id, null);
  });

  it('Ein Konto gehört zu höchstens einem Spieler der Gruppe', async () => {
    await assert.rejects(as(admin, () => q('update public.players set user_id = $1 where id = $2', [member, bello])));
  });

  it('Nur Mitglieder der Gruppe können verknüpft werden', async () => {
    await assert.rejects(
      as(admin, () => q('update public.players set user_id = $1 where id = $2', [stranger, bello])),
      /kein Mitglied/
    );
  });

  it('Wer entfernt wird, verliert die Verknüpfung – der Spieler bleibt', async () => {
    await as(admin, () => q('delete from public.group_members where group_id = $1 and user_id = $2', [groupId, member]));
    const row = await one('select user_id from public.players where id = $1', [maxi]);
    assert.equal(row.user_id, null);
    // D2: Entfernen landet im Protokoll
    const log = await one(`select details from public.audit_log where action = 'member_removed'`);
    assert.equal(log.details.member, member);
  });

  it('Letztes Mitglied verlässt die Gruppe: Löschen klappt trotz Verknüpfung', async () => {
    const solo = await newUser('solo@example.com');
    const gid = (await as(solo, () => one(`select public.create_group('Solo') as id`))).id;
    await as(solo, () => q(`insert into public.players (group_id, name, user_id) values ($1, 'Ich', $2)`, [gid, solo]));
    await as(solo, () => q('select public.leave_group($1)', [gid]));
    assert.equal((await q('select * from public.groups where id = $1', [gid])).length, 0);
  });
});
