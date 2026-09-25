/**
 * Tests für Spieler-Fotos (B1): wer darf sehen, hochladen, löschen. Start: npm run test:db
 */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { before, describe, it } from 'node:test';

import { createTestDb } from './helpers.mjs';

let q, one, newUser, as;
let admin, member, owner, stranger, groupId, ownPlayer, otherPlayer;

const upload = (user, name) =>
  as(user, () => q(`insert into storage.objects (bucket_id, name) values ('avatars', $1)`, [name]));
const visible = (user) => as(user, () => q(`select name from storage.objects where bucket_id = 'avatars'`));

describe('Spieler-Fotos', () => {
  before(async () => {
    ({ q, one, newUser, as } = await createTestDb());
    admin = await newUser('admin@example.com');
    member = await newUser('member@example.com');
    owner = await newUser('owner@example.com');
    stranger = await newUser('stranger@example.com');
    groupId = (await as(admin, () => one(`select public.create_group('Montagskick') as id`))).id;
    const { invite_code } = await one('select invite_code from public.groups where id = $1', [groupId]);
    await as(member, () => q('select public.join_group($1)', [invite_code]));
    await as(owner, () => q('select public.join_group($1)', [invite_code]));
    ownPlayer = (await one(`insert into public.players (group_id, name, user_id) values ($1, 'Ich', $2) returning id`, [groupId, owner])).id;
    otherPlayer = (await one(`insert into public.players (group_id, name) values ($1, 'Andere') returning id`, [groupId])).id;
  });

  it('Spieler lädt sein eigenes Foto hoch und setzt es', async () => {
    const path = `${groupId}/${ownPlayer}/${randomUUID()}.jpg`;
    await upload(owner, path);
    await as(owner, () => q('select public.set_avatar($1, $2)', [ownPlayer, path]));
    assert.equal((await one('select avatar_path from public.players where id = $1', [ownPlayer])).avatar_path, path);
  });

  it('Mitglieder sehen die Fotos der Gruppe, Fremde nicht', async () => {
    assert.equal((await visible(member)).length, 1);
    assert.equal((await visible(stranger)).length, 0);
  });

  it('Normale Mitglieder dürfen fremde Fotos nicht hochladen oder setzen', async () => {
    await assert.rejects(upload(member, `${groupId}/${otherPlayer}/${randomUUID()}.jpg`));
    await assert.rejects(
      as(member, () => q('select public.set_avatar($1, null)', [ownPlayer])),
      /nur Admins oder der Spieler selbst/
    );
  });

  it('Admin darf Fotos aller Spieler ändern', async () => {
    const path = `${groupId}/${otherPlayer}/${randomUUID()}.jpg`;
    await upload(admin, path);
    await as(admin, () => q('select public.set_avatar($1, $2)', [otherPlayer, path]));
  });

  it('Falscher Pfad (andere Gruppe/anderer Spieler) wird abgelehnt', async () => {
    await assert.rejects(upload(owner, `${randomUUID()}/${ownPlayer}/${randomUUID()}.jpg`));
    await assert.rejects(upload(owner, `${groupId}/${ownPlayer}/../x.jpg`));
    await assert.rejects(
      as(owner, () => q('select public.set_avatar($1, $2)', [ownPlayer, `${groupId}/${otherPlayer}/${randomUUID()}.jpg`])),
      /Ungültiger Speicherort/
    );
  });

  it('Löschen: nur wer ändern darf', async () => {
    const deleted = await as(member, () => q(`delete from storage.objects where bucket_id = 'avatars' returning name`));
    assert.equal(deleted.length, 0);
    const own = await as(owner, () => q(`delete from storage.objects where bucket_id = 'avatars' returning name`));
    assert.equal(own.length, 1);
  });
});
