/**
 * Tests der Datenbank-Sicherheitsregeln (Row Level Security) und Server-Funktionen.
 * Läuft ohne Docker/Internet mit PGlite (echtes Postgres in Node).
 * Supabase-Teile (auth.users, auth.uid(), Rollen) werden hier nachgebildet.
 *
 * Start: npm run test:db
 */
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { before, describe, it } from 'node:test';

const MIGRATIONS = join(import.meta.dirname, '..', 'migrations');

// Nachbildung der Supabase-Umgebung
const SUPABASE_STUB = `
  create schema extensions;
  create extension pgcrypto schema extensions;
  create schema auth;
  create table auth.users (id uuid primary key default gen_random_uuid(), email text);
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
  $$;
  create role anon nologin;
  create role authenticated nologin;
  grant usage on schema public, auth, extensions to anon, authenticated;
  grant execute on function auth.uid() to anon, authenticated;
  alter default privileges in schema public grant all on tables to anon, authenticated;
  alter default privileges in schema public grant all on sequences to anon, authenticated;
  alter default privileges in schema public grant execute on functions to anon, authenticated;
`;

let db;

async function newUser(email) {
  const { rows } = await db.query('insert into auth.users (email) values ($1) returning id', [email]);
  return rows[0].id;
}

/** Führt fn als angemeldeter Nutzer aus (wie ein Aufruf aus der App). */
async function as(userId, fn) {
  await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [userId ?? '']);
  await db.exec(userId ? 'set role authenticated' : 'set role anon');
  try {
    return await fn();
  } finally {
    await db.exec('reset role');
    await db.query(`select set_config('request.jwt.claim.sub', '', false)`);
  }
}

const q = async (sql, params) => (await db.query(sql, params)).rows;
const one = async (sql, params) => (await q(sql, params))[0];

describe('Datenbank-Sicherheit (M2)', () => {
  let admin, member, stranger, groupId, inviteCode;

  before(async () => {
    db = await PGlite.create({ extensions: { pgcrypto } });
    await db.exec(SUPABASE_STUB);
    for (const file of readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql')).sort()) {
      await db.exec(readFileSync(join(MIGRATIONS, file), 'utf8'));
    }
    admin = await newUser('admin@example.com');
    member = await newUser('member@example.com');
    stranger = await newUser('stranger@example.com');
  });

  it('legt beim ersten Login ein Profil an', async () => {
    const profile = await one('select * from public.profiles where id = $1', [admin]);
    assert.ok(profile);
  });

  it('Gruppe anlegen: Ersteller wird Admin, Code hat 8 Zeichen', async () => {
    groupId = (await as(admin, () => one(`select public.create_group('Montagskick') as id`))).id;
    const group = await as(admin, () => one('select * from public.groups where id = $1', [groupId]));
    inviteCode = group.invite_code;
    assert.match(inviteCode, /^[A-HJ-NP-Z2-9]{8}$/);
    const me = await as(admin, () =>
      one('select role from public.group_members where group_id = $1 and user_id = $2', [groupId, admin])
    );
    assert.equal(me.role, 'admin');
  });

  it('Nicht-Mitglieder sehen die Gruppe nicht', async () => {
    const rows = await as(stranger, () => q('select * from public.groups'));
    assert.equal(rows.length, 0);
  });

  it('Gäste ohne Login können keine Gruppe anlegen', async () => {
    await assert.rejects(as(null, () => q(`select public.create_group('Hack')`)));
  });

  it('Gruppen können nicht direkt (ohne Server-Funktion) angelegt werden', async () => {
    await assert.rejects(
      as(stranger, () => q(`insert into public.groups (name, invite_code) values ('X', 'AAAAAAAA')`))
    );
  });

  it('Beitreten: falscher Code gibt null, richtiger Code macht zum Mitglied', async () => {
    const wrong = await as(member, () => one(`select public.join_group('FALSCH12') as id`));
    assert.equal(wrong.id, null);
    const lowercaseWithSpace = inviteCode.toLowerCase().slice(0, 4) + ' ' + inviteCode.slice(4);
    const right = await as(member, () => one('select public.join_group($1) as id', [lowercaseWithSpace]));
    assert.equal(right.id, groupId);
    const role = await as(member, () =>
      one('select role from public.group_members where group_id = $1 and user_id = $2', [groupId, member])
    );
    assert.equal(role.role, 'member');
  });

  it('Mitglieder können sich nicht selbst zum Admin machen', async () => {
    await as(member, () =>
      q(`update public.group_members set role = 'admin' where user_id = $1`, [member])
    );
    const role = await one('select role from public.group_members where user_id = $1', [member]);
    assert.equal(role.role, 'member');
  });

  it('Nur Admins legen Spieler an, ändern und löschen sie', async () => {
    await assert.rejects(
      as(member, () =>
        q(`insert into public.players (group_id, name) values ($1, 'Mogel')`, [groupId])
      )
    );
    const player = await as(admin, () =>
      one(
        `insert into public.players (group_id, name, defense, attack) values ($1, 'Tommi', 7, 6) returning *`,
        [groupId]
      )
    );
    assert.equal(Number(player.defense), 7);

    // Mitglied versucht Stärke zu ändern -> keine Zeile betroffen
    await as(member, () =>
      q('update public.players set attack = 11 where id = $1', [player.id])
    );
    // Mitglied versucht zu löschen -> keine Zeile betroffen
    await as(member, () => q('delete from public.players where id = $1', [player.id]));
    const after = await one('select * from public.players where id = $1', [player.id]);
    assert.equal(Number(after.attack), 6);

    await as(admin, () => q('update public.players set attack = 8 where id = $1', [player.id]));
    const changed = await one('select attack from public.players where id = $1', [player.id]);
    assert.equal(Number(changed.attack), 8);
  });

  it('Mitglieder sehen die Spieler inkl. Stärken, Fremde nicht', async () => {
    const seen = await as(member, () => q('select name, defense, attack from public.players'));
    assert.equal(seen.length, 1);
    const hidden = await as(stranger, () => q('select * from public.players'));
    assert.equal(hidden.length, 0);
  });

  it('Spielzähler kann niemand von Hand ändern', async () => {
    await assert.rejects(as(admin, () => q('update public.players set games_played = 99')));
  });

  it('Stärkewerte bleiben zwischen 1 und 11', async () => {
    await assert.rejects(
      as(admin, () => q(`update public.players set defense = 12 where group_id = $1`, [groupId]))
    );
  });

  it('Spieler-Änderungen werden protokolliert', async () => {
    const log = await as(member, () =>
      q(`select action from public.audit_log where group_id = $1 order by id`, [groupId])
    );
    const actions = log.map((r) => r.action);
    assert.ok(actions.includes('player_insert'));
    assert.ok(actions.includes('player_update'));
  });

  it('Profile: Mitspieler sichtbar, Fremde nicht; nur eigenes änderbar', async () => {
    const seen = await as(member, () => q('select id from public.profiles'));
    const ids = seen.map((r) => r.id).sort();
    assert.deepEqual(ids, [admin, member].sort());
    await as(member, () => q(`update public.profiles set display_name = 'Hack' where id = $1`, [admin]));
    const adminProfile = await one('select display_name from public.profiles where id = $1', [admin]);
    assert.equal(adminProfile.display_name, null);
  });

  it('Einladungscode erneuern: nur Admin, alter Code wird ungültig', async () => {
    await assert.rejects(
      as(member, () => q('select public.regenerate_invite_code($1)', [groupId]))
    );
    const { code } = await as(admin, () =>
      one('select public.regenerate_invite_code($1) as code', [groupId])
    );
    assert.notEqual(code, inviteCode);
    const old = await as(stranger, () => one('select public.join_group($1) as id', [inviteCode]));
    assert.equal(old.id, null);
    inviteCode = code;
  });

  it('Nach 5 Fehlversuchen in 15 Minuten wird gesperrt', async () => {
    // stranger hat oben schon 1 Fehlversuch
    for (let i = 0; i < 4; i++) {
      await as(stranger, () => q(`select public.join_group('XXXXXXXX')`));
    }
    await assert.rejects(
      as(stranger, () => q('select public.join_group($1)', [inviteCode])),
      /Zu viele Fehlversuche/
    );
  });

  it('Admin kann sich nicht selbst herabstufen', async () => {
    await as(admin, () =>
      q(`update public.group_members set role = 'member' where user_id = $1`, [admin])
    );
    assert.equal((await one('select role from public.group_members where user_id = $1', [admin])).role, 'admin');
  });

  it('Der einzige Admin kann die Gruppe nicht verlassen, solange andere drin sind', async () => {
    await assert.rejects(
      as(admin, () => q('select public.leave_group($1)', [groupId])),
      /einzige Admin/
    );
  });

  it('Konto löschen: nächstes Mitglied wird Admin, Gruppe bleibt', async () => {
    await as(admin, () => q('select public.delete_my_account()'));
    assert.equal((await q('select * from auth.users where id = $1', [admin])).length, 0);
    assert.equal((await q('select * from public.profiles where id = $1', [admin])).length, 0);
    const role = await one('select role from public.group_members where user_id = $1', [member]);
    assert.equal(role.role, 'admin');
    assert.equal((await q('select * from public.players where group_id = $1', [groupId])).length, 1);
  });

  it('Letztes Mitglied verlässt die Gruppe: Gruppe und Spieler werden gelöscht', async () => {
    await as(member, () => q('select public.leave_group($1)', [groupId]));
    assert.equal((await q('select * from public.groups where id = $1', [groupId])).length, 0);
    assert.equal((await q('select * from public.players where group_id = $1', [groupId])).length, 0);
  });
});
