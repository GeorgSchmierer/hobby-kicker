/**
 * Tests für den Offline-Modus (A5): eigene IDs, erneutes Senden, doppelte Einträge.
 * Start: npm run test:db
 */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { before, describe, it } from 'node:test';

import { createTestDb } from './helpers.mjs';

let q, one, newUser, as;
let admin, member, stranger, groupId, ids, today;
const sessionId = randomUUID();
const teamIds = [randomUUID(), randomUUID(), randomUUID()];

const start = (user, sid = sessionId, date = today) =>
  as(user, () =>
    one('select public.start_session_v2($1, $2, $3::jsonb, $4::uuid[], $5::date) as id', [
      sid,
      groupId,
      JSON.stringify([ids.slice(0, 2), ids.slice(2, 4), ids.slice(4, 6)]),
      sid === sessionId ? teamIds : [randomUUID(), randomUUID(), randomUUID()],
      date,
    ])
  );

const record = (user, id, no, a, b, outcome = 'a', kind = 'match') =>
  as(user, () =>
    one('select public.record_result_v2($1, $2, $3, $4, $5, $6, $7, null, null) as status', [
      id, sessionId, no, kind, a, b, outcome,
    ])
  ).then((r) => r.status);

const gamesOf = async (player) =>
  Number((await one('select games_played from public.players where id = $1', [player])).games_played);

describe('Offline-Modus', () => {
  before(async () => {
    ({ q, one, newUser, as } = await createTestDb());
    admin = await newUser('admin@example.com');
    member = await newUser('member@example.com');
    stranger = await newUser('stranger@example.com');
    groupId = (await as(admin, () => one(`select public.create_group('Montagskick') as id`))).id;
    const { invite_code } = await one('select invite_code from public.groups where id = $1', [groupId]);
    await as(member, () => q('select public.join_group($1)', [invite_code]));
    ids = [];
    for (const name of ['A', 'B', 'C', 'D', 'E', 'F']) {
      ids.push((await one(`insert into public.players (group_id, name) values ($1, $2) returning id`, [groupId, name])).id);
    }
    today = (await one('select public.berlin_today()::text as d')).d;
  });

  it('Spieltag mit eigenen IDs anlegen; nochmal senden legt nichts doppelt an', async () => {
    assert.equal((await start(member)).id, sessionId);
    assert.equal((await start(member)).id, sessionId);
    assert.equal((await q('select * from public.sessions')).length, 1);
    const teams = await q('select id, idx from public.teams where session_id = $1 order by idx', [sessionId]);
    assert.deepEqual(teams.map((t) => t.id), teamIds);
  });

  it('Datum: bis 3 Tage zurück erlaubt, Zukunft nicht', async () => {
    const past = (await one(`select (public.berlin_today() - 2)::text as d`)).d;
    const future = (await one(`select (public.berlin_today() + 1)::text as d`)).d;
    const tooOld = (await one(`select (public.berlin_today() - 4)::text as d`)).d;
    await start(member, randomUUID(), past);
    await assert.rejects(start(member, randomUUID(), future), /Datum/);
    await assert.rejects(start(member, randomUUID(), tooOld), /Datum/);
  });

  it('Fremde können keinen Spieltag anlegen und nichts eintragen', async () => {
    await assert.rejects(start(stranger, randomUUID()), /kein Mitglied/);
    await assert.rejects(record(stranger, randomUUID(), 1, teamIds[0], teamIds[1]), /gibt es nicht/);
  });

  it('Ergebnis nochmal senden wird nur einmal gewertet', async () => {
    const id = randomUUID();
    assert.equal(await record(member, id, 1, teamIds[0], teamIds[1]), 'saved');
    assert.equal(await record(member, id, 1, teamIds[0], teamIds[1]), 'already');
    assert.equal(await gamesOf(ids[0]), 1);
    assert.equal((await q('select * from public.results')).length, 1);
  });

  it('Zweites Handy trägt dieselbe Partie ein → abgelehnt, erster Eintrag gilt', async () => {
    await assert.rejects(record(admin, randomUUID(), 1, teamIds[1], teamIds[0], 'b'), /DOPPELT/);
    assert.equal(await gamesOf(ids[0]), 1);
  });

  it('Gleiche Nummer, aber andere Paarung ist kein Doppel (z. B. unbekannte Partie dazwischen)', async () => {
    assert.equal(await record(admin, randomUUID(), 1, teamIds[1], teamIds[2]), 'saved');
  });

  it('Nächste Partie mit gleicher Paarung und neuer Nummer ist erlaubt', async () => {
    assert.equal(await record(member, randomUUID(), 3, teamIds[0], teamIds[1], 'draw'), 'saved');
    assert.equal(await gamesOf(ids[0]), 2);
  });

  it('Turniersieger: doppelt eingetragen wird abgelehnt', async () => {
    assert.equal(await record(member, randomUUID(), 4, teamIds[2], null, null, 'tournament'), 'saved');
    await assert.rejects(record(admin, randomUUID(), 4, teamIds[0], null, null, 'tournament'), /DOPPELT/);
    // Sieger (Team 3: E, F) gegen beide anderen Teams gewertet
    const rows = await q(`select count(*)::int as n from public.matches m join public.results r on r.id = m.result_id where r.kind = 'tournament'`);
    assert.equal(rows[0].n, 2);
  });

  it('Rückgängig funktioniert auch für so eingetragene Ergebnisse', async () => {
    const last = (await one('select id from public.results order by seq desc limit 1')).id;
    await as(admin, () => q('select public.undo_last_result($1, $2)', [groupId, last]));
    assert.equal((await q(`select * from public.results where kind = 'tournament'`)).length, 0);
  });
});
