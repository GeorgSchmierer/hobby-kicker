/**
 * Tests der Saison-Tabelle (C2): Punkte, Turniersieg, Gäste, Nachzügler, Saisongrenzen.
 * Start: npm run test:db
 */
import assert from 'node:assert/strict';
import { before, describe, it } from 'node:test';

import { createTestDb } from './helpers.mjs';

let q, one, newUser, as;
let admin, member, stranger, groupId;
const P = {};

async function session(teams, playedOn) {
  const sid = (
    await as(member, () => one('select public.start_session($1, $2::jsonb) as id', [groupId, JSON.stringify(teams)]))
  ).id;
  if (playedOn) await q('update public.sessions set played_on = $2 where id = $1', [sid, playedOn]);
  const ids = (await q('select id from public.teams where session_id = $1 order by idx', [sid])).map((t) => t.id);
  return { sid, ids };
}

const table = (user, from = null, to = null) =>
  as(user, () => q('select * from public.standings($1, $2::date, $3::date)', [groupId, from, to]));
const row = (rows, name) => rows.find((r) => r.player_id === P[name]);

describe('Saison-Tabelle', () => {
  before(async () => {
    ({ q, one, newUser, as } = await createTestDb());
    admin = await newUser('admin@example.com');
    member = await newUser('member@example.com');
    stranger = await newUser('stranger@example.com');
    groupId = (await as(admin, () => one(`select public.create_group('Montagskick') as id`))).id;
    const { invite_code } = await one('select invite_code from public.groups where id = $1', [groupId]);
    await as(member, () => q('select public.join_group($1)', [invite_code]));
    for (const name of ['A', 'B', 'C', 'D', 'E', 'F', 'Spät']) {
      P[name] = (await one(`insert into public.players (group_id, name) values ($1, $2) returning id`, [groupId, name])).id;
    }
    P.Gast = (await one(`insert into public.players (group_id, name, is_guest) values ($1, 'Gast', true) returning id`, [groupId])).id;

    // 2025: A+B schlagen C+D
    const s1 = await session([[P.A, P.B], [P.C, P.D]], '2025-11-10');
    await as(member, () => q(`select public.record_match($1, $2, $3, 'a', null, null)`, [s1.sid, s1.ids[0], s1.ids[1]]));
    // 2026: A+Gast gegen C+D unentschieden, dann kommt „Spät“ zu C+D und sie gewinnen
    const s2 = await session([[P.A, P.Gast], [P.C, P.D]], '2026-03-02');
    await as(member, () => q(`select public.record_match($1, $2, $3, 'draw', null, null)`, [s2.sid, s2.ids[0], s2.ids[1]]));
    await as(member, () => q('select public.add_late_player($1, $2, $3)', [s2.sid, P['Spät'], s2.ids[1]]));
    await as(member, () => q(`select public.record_match($1, $2, $3, 'b', null, null)`, [s2.sid, s2.ids[0], s2.ids[1]]));
    // 2026: Turnier mit 3 Teams, Sieger E+F
    const s3 = await session([[P.E, P.F], [P.A, P.B], [P.C, P.D]], '2026-06-01');
    await as(member, () => q('select public.record_tournament_winner($1, $2)', [s3.sid, s3.ids[0]]));
  });

  it('Gesamttabelle: Sieg 3, Unentschieden 1, Niederlage 0', async () => {
    const t = await table(member);
    assert.deepEqual(
      { ...row(t, 'A') },
      { player_id: P.A, played: 4, wins: 1, draws: 1, losses: 2, points: 4 }
    );
    assert.equal(row(t, 'C').points, 1 + 3); // Unentschieden + Sieg
  });

  it('Turniersieg zählt als EIN Sieg bzw. EINE Niederlage', async () => {
    const t = await table(member);
    assert.equal(row(t, 'E').played, 1);
    assert.equal(row(t, 'E').wins, 1);
    assert.equal(row(t, 'C').losses, 2); // 2025 + Turnier
  });

  it('Nachzügler zählt nur für seine Partien, Gäste erscheinen nicht', async () => {
    const t = await table(member);
    assert.equal(row(t, 'Spät').played, 1);
    assert.equal(row(t, 'Gast'), undefined);
  });

  it('Saisongrenzen: nur Spiele im Zeitraum', async () => {
    const y2025 = await table(member, '2025-01-01', '2025-12-31');
    assert.equal(row(y2025, 'A').played, 1);
    assert.equal(row(y2025, 'E'), undefined);
    const spring = await table(member, '2026-03-02', '2026-03-02');
    assert.equal(row(spring, 'A').played, 2);
  });

  it('Sortierung: Punkte, dann Siege, dann weniger Spiele', async () => {
    const t = await table(member);
    for (let i = 1; i < t.length; i++) {
      const [a, b] = [t[i - 1], t[i]];
      assert.ok(a.points > b.points || (a.points === b.points && (a.wins > b.wins || (a.wins === b.wins && a.played <= b.played))));
    }
  });

  it('Punkte sind zentral einstellbar', async () => {
    await q('update public.rating_settings set points_win = 2');
    assert.equal(row(await table(member), 'E').points, 2);
    await q('update public.rating_settings set points_win = 3');
  });

  it('Fremde sehen die Tabelle nicht', async () => {
    await assert.rejects(table(stranger), /kein Mitglied/);
  });

  it('Saisons: nur Admins legen an, Mitglieder sehen sie', async () => {
    await assert.rejects(
      as(member, () => q(`insert into public.seasons (group_id, name, starts_on, ends_on) values ($1, 'X', '2026-01-01', '2026-12-31')`, [groupId]))
    );
    await as(admin, () =>
      q(`insert into public.seasons (group_id, name, starts_on, ends_on) values ($1, 'Saison 26', '2026-02-01', '2026-07-31')`, [groupId])
    );
    assert.equal((await as(member, () => q('select * from public.seasons'))).length, 1);
    assert.equal((await as(stranger, () => q('select * from public.seasons'))).length, 0);
    await assert.rejects(
      as(admin, () => q(`insert into public.seasons (group_id, name, starts_on, ends_on) values ($1, 'Falsch', '2026-05-01', '2026-01-01')`, [groupId]))
    );
  });
});
