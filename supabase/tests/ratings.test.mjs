/**
 * Tests der Wertungsanpassung (CLAUDE.md, Abschnitt 7), Spieltage, Ergebnisse und Rückgängig.
 * Die erwarteten Werte werden hier unabhängig nach der Formel aus CLAUDE.md nachgerechnet.
 *
 * Start: npm run test:db
 */
import assert from 'node:assert/strict';
import { before, beforeEach, describe, it } from 'node:test';

import { createTestDb } from './helpers.mjs';

// Startwerte wie in CLAUDE.md
const D = 10;
const K = 0.3;
const NEW_FACTOR = 1.5;
const NEW_GAMES = 5;

const strength = (team) => team.reduce((sum, p) => sum + (p.defense + p.attack) / 2, 0);
const expected = (sA, sB) => 1 / (1 + 10 ** ((sB - sA) / D));
const margin = (goalDiff) =>
  goalDiff === null ? 1 : Math.min(2, 1 + 0.5 * Math.log(1 + Math.abs(goalDiff)));
const kFor = (p) => K * (p.games_played < NEW_GAMES ? NEW_FACTOR : 1);
const clamp = (v) => Math.min(11, Math.max(1, v));

/** Erwartete neue Werte nach einer Partie A gegen B */
function rate(teamA, teamB, scoreA, goalDiff = null) {
  const eA = expected(strength(teamA), strength(teamB));
  const m = margin(goalDiff);
  const out = new Map();
  for (const p of teamA) {
    const delta = kFor(p) * m * (scoreA - eA);
    out.set(p.id, { defense: clamp(p.defense + delta), attack: clamp(p.attack + delta) });
  }
  for (const p of teamB) {
    const delta = -kFor(p) * m * (scoreA - eA);
    out.set(p.id, { defense: clamp(p.defense + delta), attack: clamp(p.attack + delta) });
  }
  return out;
}

const near = (actual, expectedValue, label) =>
  assert.ok(
    Math.abs(Number(actual) - expectedValue) <= 0.006,
    `${label}: ${actual} ≠ ${expectedValue.toFixed(4)}`
  );

let q, one, newUser, as;
let admin, member, stranger, groupId, otherGroupId;

async function addPlayer(name, defense, attack, games = 0) {
  const row = await one(
    `insert into public.players (group_id, name, defense, attack, games_played)
     values ($1, $2, $3, $4, $5) returning id`,
    [groupId, name, defense, attack, games]
  );
  return row.id;
}

async function players(ids) {
  const rows = await q(
    'select id, defense::float8 as defense, attack::float8 as attack, games_played from public.players where id = any($1)',
    [ids]
  );
  return ids.map((id) => rows.find((r) => r.id === id));
}

async function startSession(user, teams) {
  const { id } = await as(user, () =>
    one('select public.start_session($1, $2::jsonb) as id', [groupId, JSON.stringify(teams)])
  );
  const teamRows = await q('select id from public.teams where session_id = $1 order by idx', [id]);
  return { id, teamIds: teamRows.map((t) => t.id) };
}

describe('Wertung und Ergebnisse (M3)', () => {
  before(async () => {
    ({ q, one, newUser, as } = await createTestDb());
    admin = await newUser('admin@example.com');
    member = await newUser('member@example.com');
    stranger = await newUser('stranger@example.com');
    groupId = (await as(admin, () => one(`select public.create_group('Montagskick') as id`))).id;
    const { invite_code } = await one('select invite_code from public.groups where id = $1', [groupId]);
    await as(member, () => q('select public.join_group($1)', [invite_code]));
    otherGroupId = (await as(stranger, () => one(`select public.create_group('Andere') as id`))).id;
  });

  let a1, a2, b1, b2;
  beforeEach(async () => {
    // Jeder Test bekommt frische Spieler: Team A stärker als Team B
    await q('delete from public.results');
    await q('delete from public.sessions');
    await q('delete from public.players');
    a1 = await addPlayer('A1', 8, 6);
    a2 = await addPlayer('A2', 7, 7);
    b1 = await addPlayer('B1', 5, 6);
    b2 = await addPlayer('B2', 6, 4);
  });

  it('Sieg ohne Torstand: Werte ändern sich nach der Formel, Spielzähler +1', async () => {
    const before = await players([a1, a2, b1, b2]);
    const { id, teamIds } = await startSession(member, [[a1, a2], [b1, b2]]);
    await as(member, () =>
      q(`select public.record_match($1, $2, $3, 'a')`, [id, teamIds[0], teamIds[1]])
    );
    const after = await players([a1, a2, b1, b2]);
    const want = rate(before.slice(0, 2), before.slice(2), 1);
    for (const p of after) {
      near(p.defense, want.get(p.id).defense, 'Abwehr');
      near(p.attack, want.get(p.id).attack, 'Angriff');
      assert.equal(p.games_played, 1);
    }
    // Favorit gewinnt -> kleine Änderung (unter K · 1,5 · 0,5)
    assert.ok(after[0].defense - before[0].defense < 0.225);
    assert.ok(after[0].defense > before[0].defense);
    assert.ok(after[2].defense < before[2].defense);
  });

  it('Außenseiter gewinnt: Werte ändern sich deutlicher als beim Favoritensieg', async () => {
    const before = await players([a1, a2, b1, b2]);
    const { id, teamIds } = await startSession(member, [[a1, a2], [b1, b2]]);
    await as(member, () =>
      q(`select public.record_match($1, $2, $3, 'b')`, [id, teamIds[0], teamIds[1]])
    );
    const after = await players([a1, a2, b1, b2]);
    const want = rate(before.slice(0, 2), before.slice(2), 0);
    for (const p of after) near(p.defense, want.get(p.id).defense, 'Abwehr');
    assert.ok(after[2].defense - before[2].defense > 0.225);
  });

  it('Mit Torstand: Ergebnis kommt aus den Toren, Tordifferenz verstärkt die Änderung', async () => {
    const before = await players([a1, a2, b1, b2]);
    const { id, teamIds } = await startSession(member, [[a1, a2], [b1, b2]]);
    // absichtlich falsches „b“ – die Tore (3:1) zählen
    await as(member, () =>
      q(`select public.record_match($1, $2, $3, 'b', 3, 1)`, [id, teamIds[0], teamIds[1]])
    );
    const match = await one('select score_a::float8 as s from public.matches');
    assert.equal(match.s, 1);
    const after = await players([a1, a2, b1, b2]);
    const want = rate(before.slice(0, 2), before.slice(2), 1, 2);
    for (const p of after) near(p.defense, want.get(p.id).defense, 'Abwehr');
  });

  it('Torstand-Faktor ist auf 2 gedeckelt', async () => {
    const before = await players([a1, a2, b1, b2]);
    const { id, teamIds } = await startSession(member, [[a1, a2], [b1, b2]]);
    await as(member, () =>
      q(`select public.record_match($1, $2, $3, 'a', 0, 20)`, [id, teamIds[0], teamIds[1]])
    );
    const after = await players([a1, a2, b1, b2]);
    const want = rate(before.slice(0, 2), before.slice(2), 0, 20);
    for (const p of after) near(p.defense, want.get(p.id).defense, 'Abwehr');
  });

  it('Unentschieden zwischen gleich starken Teams ändert nichts', async () => {
    const even = [];
    for (const name of ['C1', 'C2', 'C3', 'C4']) even.push(await addPlayer(name, 6, 6));
    const { id, teamIds } = await startSession(member, [even.slice(0, 2), even.slice(2)]);
    await as(member, () =>
      q(`select public.record_match($1, $2, $3, 'draw')`, [id, teamIds[0], teamIds[1]])
    );
    for (const p of await players(even)) {
      assert.equal(p.defense, 6);
      assert.equal(p.attack, 6);
      assert.equal(p.games_played, 1);
    }
  });

  it('Nach 5 Partien ändert sich der Wert nur noch mit normalem K', async () => {
    await q('update public.players set games_played = 5');
    const before = await players([a1, a2, b1, b2]);
    const { id, teamIds } = await startSession(member, [[a1, a2], [b1, b2]]);
    await as(member, () =>
      q(`select public.record_match($1, $2, $3, 'b')`, [id, teamIds[0], teamIds[1]])
    );
    const after = await players([a1, a2, b1, b2]);
    const want = rate(before.slice(0, 2), before.slice(2), 0);
    for (const p of after) near(p.defense, want.get(p.id).defense, 'Abwehr');
  });

  it('Werte bleiben zwischen 1 und 11', async () => {
    await q(`update public.players set defense = 11, attack = 11 where id = $1`, [b1]);
    await q(`update public.players set defense = 1, attack = 1 where id = $1`, [a1]);
    const { id, teamIds } = await startSession(member, [[a1, a2], [b1, b2]]);
    // Schwächeres Team (a1 hat 1/1) verliert … aber a1 fällt nicht unter 1; b1 bleibt ≤ 11
    await as(member, () =>
      q(`select public.record_match($1, $2, $3, 'b', 0, 10)`, [id, teamIds[0], teamIds[1]])
    );
    const [pa1, , pb1] = await players([a1, a2, b1]);
    assert.equal(pa1.defense, 1);
    assert.equal(pb1.defense, 11);
  });

  it('Turniersieger zählt als Sieg gegen jedes andere Team', async () => {
    const c1 = await addPlayer('C1', 6, 6);
    const c2 = await addPlayer('C2', 5, 5);
    const { id, teamIds } = await startSession(member, [[a1, a2], [b1, b2], [c1, c2]]);
    await as(member, () =>
      q('select public.record_tournament_winner($1, $2)', [id, teamIds[1]])
    );
    const matches = await q('select team_a, team_b, score_a::float8 as s from public.matches');
    assert.equal(matches.length, 2);
    assert.ok(matches.every((m) => m.team_a === teamIds[1] && m.s === 1));
    const [pb1, pa1, pc1] = await players([b1, a1, c1]);
    assert.equal(pb1.games_played, 2);
    assert.equal(pa1.games_played, 1);
    assert.equal(pc1.games_played, 1);
    const result = await one('select kind from public.results');
    assert.equal(result.kind, 'tournament');
  });

  it('Rückgängig stellt die Werte exakt wieder her (nur Admin, nur das letzte Ergebnis)', async () => {
    const before = await players([a1, a2, b1, b2]);
    const { id, teamIds } = await startSession(member, [[a1, a2], [b1, b2]]);
    const first = await as(member, () =>
      one(`select public.record_match($1, $2, $3, 'a', 2, 1) as id`, [id, teamIds[0], teamIds[1]])
    );
    const middle = await players([a1, a2, b1, b2]);
    const second = await as(member, () =>
      one(`select public.record_match($1, $2, $3, 'b') as id`, [id, teamIds[0], teamIds[1]])
    );

    await assert.rejects(
      as(member, () => q('select public.undo_last_result($1, $2)', [groupId, second.id])),
      /Nur Admins/
    );
    await assert.rejects(
      as(admin, () => q('select public.undo_last_result($1, $2)', [groupId, first.id])),
      /neueres Ergebnis/
    );

    await as(admin, () => q('select public.undo_last_result($1, $2)', [groupId, second.id]));
    assert.deepEqual(await players([a1, a2, b1, b2]), middle);
    await as(admin, () => q('select public.undo_last_result($1, $2)', [groupId, first.id]));
    assert.deepEqual(await players([a1, a2, b1, b2]), before);
    assert.equal((await q('select * from public.results')).length, 0);
    assert.equal((await q('select * from public.rating_changes')).length, 0);
  });

  it('Rückgängig nimmt ein ganzes Turnier-Ergebnis zurück', async () => {
    const c1 = await addPlayer('C1', 6, 6);
    const before = await players([a1, a2, b1, b2, c1]);
    const { id, teamIds } = await startSession(member, [[a1, a2], [b1, b2], [c1]]);
    const r = await as(member, () =>
      one('select public.record_tournament_winner($1, $2) as id', [id, teamIds[2]])
    );
    await as(admin, () => q('select public.undo_last_result($1, $2)', [groupId, r.id]));
    assert.deepEqual(await players([a1, a2, b1, b2, c1]), before);
  });

  it('Fremde können keine Spieltage anlegen oder Ergebnisse eintragen', async () => {
    await assert.rejects(startSession(stranger, [[a1], [b1]]));
    const { id, teamIds } = await startSession(member, [[a1, a2], [b1, b2]]);
    await assert.rejects(
      as(stranger, () => q(`select public.record_match($1, $2, $3, 'a')`, [id, teamIds[0], teamIds[1]]))
    );
    const hidden = await as(stranger, () => q('select * from public.sessions'));
    assert.equal(hidden.length, 0);
  });

  it('Niemand kann Ergebnisse oder Wertungen direkt schreiben', async () => {
    const { id } = await startSession(member, [[a1, a2], [b1, b2]]);
    await assert.rejects(
      as(admin, () =>
        q(`insert into public.results (group_id, session_id, kind) values ($1, $2, 'match')`, [groupId, id])
      )
    );
    // Stellschrauben: Änderung wird still verhindert (keine Zeile betroffen)
    await as(admin, () => q('update public.rating_settings set k = 5'));
    assert.equal((await one('select k::float8 as k from public.rating_settings')).k, K);
    await assert.rejects(as(admin, () => q('select public.rate_match(gen_random_uuid())')));
  });

  it('Spieltag prüft die Teams: keine doppelten und keine fremden Spieler', async () => {
    await assert.rejects(startSession(member, [[a1, a2], [a1, b1]]), /nur in einem Team/);
    const foreign = await as(stranger, () =>
      one(`insert into public.players (group_id, name) values ($1, 'Fremd') returning id`, [otherGroupId])
    );
    await assert.rejects(startSession(member, [[a1, foreign.id], [b1]]), /gehört nicht/);
    await assert.rejects(startSession(member, [[a1, a2, b1, b2]]), /2 bis 4 Teams/);
  });

  it('Spieler mit Verlauf lassen sich nicht löschen, ohne Verlauf schon', async () => {
    const { id, teamIds } = await startSession(member, [[a1, a2], [b1, b2]]);
    await as(member, () => q(`select public.record_match($1, $2, $3, 'a')`, [id, teamIds[0], teamIds[1]]));
    await assert.rejects(as(admin, () => q('delete from public.players where id = $1', [a1])));
    const fresh = await addPlayer('Neu', 6, 6);
    await as(admin, () => q('delete from public.players where id = $1', [fresh]));
    assert.equal((await q('select * from public.players where id = $1', [fresh])).length, 0);
  });

  it('Spieltag ohne Ergebnis darf gelöscht werden, mit Ergebnis nicht', async () => {
    const empty = await startSession(member, [[a1], [b1]]);
    await as(member, () => q('select public.delete_session($1)', [empty.id]));
    const played = await startSession(member, [[a1, a2], [b1, b2]]);
    await as(member, () =>
      q(`select public.record_match($1, $2, $3, 'a')`, [played.id, played.teamIds[0], played.teamIds[1]])
    );
    await assert.rejects(
      as(admin, () => q('select public.delete_session($1)', [played.id])),
      /mit Ergebnissen/
    );
  });

  it('Wertungen landen nicht einzeln im Audit-Log, das Ergebnis schon', async () => {
    await q('delete from public.audit_log');
    const { id, teamIds } = await startSession(member, [[a1, a2], [b1, b2]]);
    await as(member, () => q(`select public.record_match($1, $2, $3, 'a')`, [id, teamIds[0], teamIds[1]]));
    const actions = (await q('select action from public.audit_log order by id')).map((r) => r.action);
    assert.deepEqual(actions, ['session_started', 'result_recorded']);
  });

  it('Gruppe mit Spieltagen und Spielern lässt sich komplett löschen', async () => {
    const { id, teamIds } = await startSession(member, [[a1, a2], [b1, b2]]);
    await as(member, () => q(`select public.record_match($1, $2, $3, 'a')`, [id, teamIds[0], teamIds[1]]));
    await q('delete from public.groups where id = $1', [groupId]);
    assert.equal((await q('select * from public.players where group_id = $1', [groupId])).length, 0);
    assert.equal((await q('select * from public.sessions')).length, 0);
  });
});
