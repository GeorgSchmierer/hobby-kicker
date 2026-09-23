/**
 * Tests der MVP-Abstimmung. Start: npm run test:db
 */
import assert from 'node:assert/strict';
import { before, describe, it } from 'node:test';

import { createTestDb } from './helpers.mjs';

let q, one, newUser, as;
let admin, member, stranger, groupId, sessionId, played, benched;

describe('MVP des Tages', () => {
  before(async () => {
    ({ q, one, newUser, as } = await createTestDb());
    admin = await newUser('admin@example.com');
    member = await newUser('member@example.com');
    stranger = await newUser('stranger@example.com');
    groupId = (await as(admin, () => one(`select public.create_group('Montagskick') as id`))).id;
    const { invite_code } = await one('select invite_code from public.groups where id = $1', [groupId]);
    await as(member, () => q('select public.join_group($1)', [invite_code]));

    const ids = [];
    for (const name of ['A', 'B', 'C', 'D', 'Bank']) {
      ids.push((await one(`insert into public.players (group_id, name) values ($1, $2) returning id`, [groupId, name])).id);
    }
    played = ids.slice(0, 4);
    benched = ids[4];
    sessionId = (
      await as(member, () =>
        one('select public.start_session($1, $2::jsonb) as id', [
          groupId,
          JSON.stringify([played.slice(0, 2), played.slice(2)]),
        ])
      )
    ).id;
  });

  it('Mitglieder stimmen ab, eine Stimme pro Person, änderbar', async () => {
    await as(member, () => q('select public.vote_mvp($1, $2)', [sessionId, played[0]]));
    await as(admin, () => q('select public.vote_mvp($1, $2)', [sessionId, played[0]]));
    await as(member, () => q('select public.vote_mvp($1, $2)', [sessionId, played[1]]));
    const votes = await as(member, () =>
      q('select voter_id, player_id from public.mvp_votes where session_id = $1', [sessionId])
    );
    assert.equal(votes.length, 2);
    assert.equal(votes.find((v) => v.voter_id === member).player_id, played[1]);
  });

  it('Nur wer mitgespielt hat, kann MVP werden', async () => {
    await assert.rejects(
      as(member, () => q('select public.vote_mvp($1, $2)', [sessionId, benched])),
      /nicht mitgespielt/
    );
  });

  it('Fremde können weder abstimmen noch Stimmen sehen', async () => {
    await assert.rejects(as(stranger, () => q('select public.vote_mvp($1, $2)', [sessionId, played[0]])));
    assert.equal((await as(stranger, () => q('select * from public.mvp_votes'))).length, 0);
  });

  it('Stimmen lassen sich nicht direkt schreiben (auch nicht für andere)', async () => {
    await assert.rejects(
      as(member, () =>
        q(
          'insert into public.mvp_votes (session_id, voter_id, player_id, group_id) values ($1, $2, $3, $4)',
          [sessionId, stranger, played[0], groupId]
        )
      )
    );
  });

  it('Gelöschter Spieltag nimmt die Stimmen mit', async () => {
    await as(admin, () => q('select public.delete_session($1)', [sessionId]));
    assert.equal((await q('select * from public.mvp_votes')).length, 0);
  });
});
