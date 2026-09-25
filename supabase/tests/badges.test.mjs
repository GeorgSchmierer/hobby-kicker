/**
 * Tests der Abzeichen (C3): Vergabe nach dem Ergebnis, Rücknahme beim Rückgängig.
 * Schwellen werden hier klein gesetzt (badge_settings), damit wenige Spiele reichen.
 * Start: npm run test:db
 */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { before, describe, it } from 'node:test';

import { createTestDb } from './helpers.mjs';

let q, one, newUser, as;
let admin, groupId;
const P = {};

async function session(teams) {
  const sid = randomUUID();
  const teamIds = teams.map(() => randomUUID());
  await as(admin, () =>
    q('select public.start_session_v2($1, $2, $3::jsonb, $4::uuid[], public.berlin_today())', [
      sid, groupId, JSON.stringify(teams.map((t) => t.map((n) => P[n]))), teamIds,
    ])
  );
  return { sid, teamIds };
}

async function play(s, a, b, outcome, no) {
  const id = randomUUID();
  await as(admin, () =>
    q('select public.record_result_v2($1, $2, $3, $4, $5, $6, $7, null, null)', [
      id, s.sid, no, 'match', s.teamIds[a], s.teamIds[b], outcome,
    ])
  );
  return id;
}

const badgesOf = async (name) =>
  (await q('select kind, level from public.badges where player_id = $1 order by kind, level', [P[name]])).map(
    (b) => (b.kind === 'jubilaeum' ? `jubilaeum-${b.level}` : b.kind)
  );

describe('Abzeichen', () => {
  before(async () => {
    ({ q, one, newUser, as } = await createTestDb());
    admin = await newUser('admin@example.com');
    groupId = (await as(admin, () => one(`select public.create_group('Montagskick') as id`))).id;
    await q('update public.badge_settings set win_streak = 3, loyal_sessions = 3, jubilee_levels = array[3, 5]');
    const add = async (name, value, guest = false) => {
      P[name] = (
        await one(
          `insert into public.players (group_id, name, defense, attack, is_guest) values ($1, $2, $3, $3, $4) returning id`,
          [groupId, name, value, guest]
        )
      ).id;
    };
    for (const n of ['A', 'B', 'C', 'D']) await add(n, 6);
    await add('Schwach1', 2);
    await add('Schwach2', 2);
    await add('Stark1', 10);
    await add('Stark2', 10);
    await add('Gast', 6, true);
  });

  let last;
  it('Siegesserie und Jubiläum nach 3 Siegen in Folge (nicht für die Verlierer)', async () => {
    const s = await session([['A', 'B'], ['C', 'D']]);
    await play(s, 0, 1, 'a', 1);
    await play(s, 0, 1, 'a', 2);
    assert.deepEqual(await badgesOf('A'), []);
    last = await play(s, 0, 1, 'a', 3);
    assert.deepEqual(await badgesOf('A'), ['jubilaeum-3', 'siegesserie']);
    assert.deepEqual(await badgesOf('C'), ['jubilaeum-3']);
  });

  it('Rückgängig nimmt die dadurch vergebenen Abzeichen wieder weg', async () => {
    await as(admin, () => q('select public.undo_last_result($1, $2)', [groupId, last]));
    assert.deepEqual(await badgesOf('A'), []);
    assert.deepEqual(await badgesOf('C'), []);
  });

  it('Comeback-König: Sieg als klarer Außenseiter', async () => {
    const s = await session([['Schwach1', 'Schwach2'], ['Stark1', 'Stark2']]);
    await play(s, 0, 1, 'a', 1);
    assert.ok((await badgesOf('Schwach1')).includes('comeback'));
    assert.ok(!(await badgesOf('Stark1')).includes('comeback'));
    // Favorit gewinnt: kein Comeback
    await play(s, 0, 1, 'b', 2);
    assert.ok(!(await badgesOf('Stark1')).includes('comeback'));
  });

  it('Treue Seele: bei den letzten 3 Spieltagen dabei', async () => {
    const s3 = await session([['A', 'Gast'], ['C', 'D']]);
    await play(s3, 0, 1, 'b', 1);
    // Spieltage mit Ergebnissen: 1 (A dabei), 2 (A nicht dabei), 3 (A dabei) → noch nicht
    assert.ok(!(await badgesOf('A')).includes('treue_seele'));
    const s4 = await session([['A', 'B'], ['C', 'D']]);
    await play(s4, 0, 1, 'b', 1);
    const s5 = await session([['A', 'B'], ['C', 'D']]);
    await play(s5, 0, 1, 'b', 1);
    assert.ok((await badgesOf('A')).includes('treue_seele'));
  });

  it('Jedes Abzeichen nur einmal, Jubiläum je Stufe', async () => {
    const kinds = await badgesOf('C');
    assert.equal(kinds.filter((k) => k === 'siegesserie').length, 1);
    assert.ok(kinds.includes('jubilaeum-3') && kinds.includes('jubilaeum-5'));
  });

  it('Gäste bekommen keine Abzeichen', async () => {
    assert.deepEqual(await badgesOf('Gast'), []);
  });
});
