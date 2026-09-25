/**
 * Tests des Kassenbuchs (D1): Aufteilung auf den Cent genau, Rechte, bezahlt abhaken.
 * Start: npm run test:db
 */
import assert from 'node:assert/strict';
import { before, describe, it } from 'node:test';

import { createTestDb } from './helpers.mjs';

let q, one, newUser, as;
let admin, member, stranger, groupId, sessionId, expense;
const P = {};

const shares = (eid) =>
  q(
    `select p.name, s.amount_cents, s.paid_at from public.expense_shares s
     join public.players p on p.id = s.player_id where s.expense_id = $1 order by lower(p.name)`,
    [eid]
  );

describe('Kassenbuch', () => {
  before(async () => {
    ({ q, one, newUser, as } = await createTestDb());
    admin = await newUser('admin@example.com');
    member = await newUser('member@example.com');
    stranger = await newUser('stranger@example.com');
    groupId = (await as(admin, () => one(`select public.create_group('Montagskick') as id`))).id;
    const { invite_code } = await one('select invite_code from public.groups where id = $1', [groupId]);
    await as(member, () => q('select public.join_group($1)', [invite_code]));
    for (const name of ['Anna', 'Ben', 'Carl', 'Dora', 'Emil', 'Fritz', 'Gast', 'Nicht da']) {
      P[name] = (
        await one(`insert into public.players (group_id, name, is_guest) values ($1, $2, $3) returning id`, [
          groupId, name, name === 'Gast',
        ])
      ).id;
    }
    sessionId = (
      await as(member, () =>
        one('select public.start_session($1, $2::jsonb) as id', [
          groupId,
          JSON.stringify([[P.Anna, P.Ben, P.Carl], [P.Dora, P.Emil, P.Fritz, P.Gast]]),
        ])
      )
    ).id;
  });

  it('60 € auf 7 Anwesende: Summe stimmt auf den Cent, Rest-Cent an den Ersten', async () => {
    expense = (await as(admin, () => one(`select public.add_expense($1, 'Hallenmiete', 6000) as id`, [sessionId]))).id;
    const rows = await shares(expense);
    assert.equal(rows.length, 7);
    assert.equal(rows.reduce((sum, r) => sum + r.amount_cents, 0), 6000);
    assert.deepEqual(
      rows.map((r) => r.amount_cents),
      [858, 857, 857, 857, 857, 857, 857]
    );
    assert.ok(!rows.some((r) => r.name === 'Nicht da'));
  });

  it('Gäste zahlen mit, wer nicht da war nicht', async () => {
    const rows = await shares(expense);
    assert.ok(rows.some((r) => r.name === 'Gast'));
  });

  it('Mitglieder dürfen keine Kosten eintragen oder abhaken, sehen sie aber', async () => {
    await assert.rejects(as(member, () => q(`select public.add_expense($1, 'X', 100)`, [sessionId])), /nur Admins/);
    await assert.rejects(as(member, () => q('select public.set_share_paid($1, $2, true)', [expense, P.Anna])), /nur Admins/);
    assert.equal((await as(member, () => q('select * from public.expense_shares'))).length, 7);
    assert.equal((await as(stranger, () => q('select * from public.expense_shares'))).length, 0);
  });

  it('Admin hakt ab, auch alle auf einmal, und wieder zurück', async () => {
    await as(admin, () => q('select public.set_share_paid($1, $2, true)', [expense, P.Anna]));
    assert.ok((await shares(expense)).find((r) => r.name === 'Anna').paid_at);
    await as(admin, () => q('select public.set_share_paid($1, null, true)', [expense]));
    assert.ok((await shares(expense)).every((r) => r.paid_at));
    await as(admin, () => q('select public.set_share_paid($1, $2, false)', [expense, P.Ben]));
    assert.equal((await shares(expense)).find((r) => r.name === 'Ben').paid_at, null);
  });

  it('Ungültige Beträge werden abgelehnt', async () => {
    await assert.rejects(as(admin, () => q(`select public.add_expense($1, 'X', 0)`, [sessionId])), /Betrag/);
    await assert.rejects(as(admin, () => q(`select public.add_expense($1, 'X', 2000000)`, [sessionId])), /Betrag/);
  });

  it('Kosten löschen nimmt die Anteile mit', async () => {
    await as(admin, () => q('select public.delete_expense($1)', [expense]));
    assert.equal((await q('select * from public.expense_shares')).length, 0);
  });
});
