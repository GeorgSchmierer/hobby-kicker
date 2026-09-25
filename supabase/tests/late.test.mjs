/**
 * Tests für Nachzügler (A4): später dazukommen, Tausch, Wertung nur für eigene Partien.
 * Start: npm run test:db
 */
import assert from 'node:assert/strict';
import { before, describe, it } from 'node:test';

import { createTestDb } from './helpers.mjs';

let q, one, newUser, as;
let admin, member, stranger, groupId, sessionId, red, blue, ids, late, late2;

const teamOf = async (player) =>
  (await one(
    `select tp.team_id from public.team_players tp join public.teams t on t.id = tp.team_id
     where t.session_id = $1 and tp.player_id = $2`,
    [sessionId, player]
  ))?.team_id ?? null;

const games = async (player) =>
  Number((await one('select games_played from public.players where id = $1', [player])).games_played);

describe('Nachzügler', () => {
  before(async () => {
    ({ q, one, newUser, as } = await createTestDb());
    admin = await newUser('admin@example.com');
    member = await newUser('member@example.com');
    stranger = await newUser('stranger@example.com');
    groupId = (await as(admin, () => one(`select public.create_group('Montagskick') as id`))).id;
    const { invite_code } = await one('select invite_code from public.groups where id = $1', [groupId]);
    await as(member, () => q('select public.join_group($1)', [invite_code]));

    ids = [];
    for (const name of ['A', 'B', 'C', 'D']) {
      ids.push((await one(`insert into public.players (group_id, name) values ($1, $2) returning id`, [groupId, name])).id);
    }
    late = (await one(`insert into public.players (group_id, name) values ($1, 'Spät') returning id`, [groupId])).id;
    late2 = (await one(`insert into public.players (group_id, name) values ($1, 'Noch später') returning id`, [groupId])).id;
    sessionId = (
      await as(member, () =>
        one('select public.start_session($1, $2::jsonb) as id', [groupId, JSON.stringify([ids.slice(0, 2), ids.slice(2)])])
      )
    ).id;
    const teams = await q('select id, idx from public.teams where session_id = $1 order by idx', [sessionId]);
    [red, blue] = teams.map((t) => t.id);
    // erste Partie ohne Nachzügler
    await as(member, () => q(`select public.record_match($1, $2, $3, 'a', null, null)`, [sessionId, red, blue]));
  });

  it('Mitglied fügt Nachzügler hinzu – er zählt erst ab der nächsten Partie', async () => {
    await as(member, () => q('select public.add_late_player($1, $2, $3)', [sessionId, late, red]));
    assert.equal(await teamOf(late), red);
    assert.equal(await games(late), 0);
    await as(member, () => q(`select public.record_match($1, $2, $3, 'b', null, null)`, [sessionId, red, blue]));
    assert.equal(await games(late), 1);
    assert.equal(await games(ids[0]), 2);
  });

  it('Jede Wertungsänderung kennt das Team, für das gespielt wurde', async () => {
    const rows = await q(
      `select rc.player_id, rc.team_id from public.rating_changes rc
       join public.results r on r.id = rc.result_id order by r.seq, rc.id`
    );
    assert.equal(rows.length, 4 + 5);
    assert.ok(rows.every((r) => r.team_id));
    assert.equal(rows.filter((r) => r.player_id === late).length, 1);
  });

  it('Tausch: Nachzügler kommt zu Blau, C wechselt von Blau zu Rot', async () => {
    await as(member, () => q('select public.add_late_player($1, $2, $3, $4, $5)', [sessionId, late2, blue, ids[2], red]));
    assert.equal(await teamOf(late2), blue);
    assert.equal(await teamOf(ids[2]), red);
    await as(member, () => q(`select public.record_match($1, $2, $3, 'a', null, null)`, [sessionId, red, blue]));
    // C hat Partie 1+2 für Blau gespielt, Partie 3 für Rot
    const cTeams = await q(
      `select rc.team_id from public.rating_changes rc join public.results r on r.id = rc.result_id
       where rc.player_id = $1 order by r.seq`,
      [ids[2]]
    );
    assert.deepEqual(cTeams.map((r) => r.team_id), [blue, blue, red]);
  });

  it('Rückgängig nach Tausch setzt die Werte richtig zurück', async () => {
    const last = (await one('select id from public.results order by seq desc limit 1')).id;
    const before = await q(
      'select player_id, defense_before from public.rating_changes where result_id = $1',
      [last]
    );
    assert.equal(before.length, 6);
    await as(admin, () => q('select public.undo_last_result($1, $2)', [groupId, last]));
    for (const row of before) {
      const now = await one('select defense from public.players where id = $1', [row.player_id]);
      assert.equal(Number(now.defense), Number(row.defense_before));
    }
    assert.equal(await games(late2), 0);
  });

  it('Doppelt hinzufügen, fremde Spieler oder Fremde werden abgelehnt', async () => {
    await assert.rejects(as(member, () => q('select public.add_late_player($1, $2, $3)', [sessionId, late, blue])), /schon in einem Team/);
    await assert.rejects(as(stranger, () => q('select public.add_late_player($1, $2, $3)', [sessionId, late, blue])), /gibt es nicht/);
    await assert.rejects(
      as(member, () => q('select public.add_late_player($1, $2, $3, $4, $5)', [sessionId, late, red, ids[3], red])),
      /schon in einem Team|Ungültiger Tausch/
    );
  });

  it('Entfernen nur, solange er noch nicht mitgespielt hat', async () => {
    // late2 hat (nach dem Rückgängig) noch keine Partie gespielt
    await as(member, () => q('select public.remove_session_player($1, $2)', [sessionId, late2]));
    assert.equal(await teamOf(late2), null);
    await assert.rejects(as(member, () => q('select public.remove_session_player($1, $2)', [sessionId, late])), /schon mitgespielt/);
  });

  it('Aufstellung direkt schreiben ist nicht erlaubt', async () => {
    await assert.rejects(
      as(member, () => q('insert into public.team_players (team_id, player_id, group_id) values ($1, $2, $3)', [blue, late2, groupId]))
    );
  });
});
