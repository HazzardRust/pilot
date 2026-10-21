/**
 * S5 of idle-main-lane (spec 5; L2): `deck_ticket co-pilot` and `release` end their reply with the
 * main lane's clause, the daemon's own (`lanesOf(repo).stageClause`), so the pilot reads what its
 * lane holds on the line that sets or frees its co-pilot. Every test takes its own store.
 */

import './no-open.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';

import { aTicket, deckOnAPort, takeLive } from '../testUtils.mjs';

const REPO = path.resolve('D:/work/pilot');

const deckTicket = async (base, args) => {
  const answer = await fetch(`${base}/api/tool`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'deck_ticket', arguments: args }),
  });
  const said = await answer.json();
  return said.content?.[0]?.text ?? said.error;
};

test('co-pilot answers with an empty main lane and its pick', async (t) => {
  const base = await deckOnAPort(t);
  const building = aTicket('building', 'yellow', REPO);
  const queued = aTicket('queued', 'red', REPO);

  assert.equal(await deckTicket(base, { id: building.id, action: 'co-pilot' }), `Co-pilot ${building.id}: live. Yellow: ${building.id}. Planning: empty, next ${queued.id}. Concluding: empty.`);
});

test('release answers with a live main ticket', async (t) => {
  const base = await deckOnAPort(t);
  const building = aTicket('building', 'yellow', REPO);
  const live = takeLive(aTicket('live', 'red', REPO).id);

  await deckTicket(base, { id: building.id, action: 'co-pilot' });
  assert.equal(await deckTicket(base, { id: building.id, action: 'release' }), `Co-pilot ${building.id}: released. Yellow: empty, next ${building.id}. Planning: ${live.id} live. Concluding: empty.`);
});

test('release with nothing queued says the lane is empty', async (t) => {
  const base = await deckOnAPort(t);
  const building = aTicket('building', 'yellow', REPO);

  await deckTicket(base, { id: building.id, action: 'co-pilot' });
  assert.equal(await deckTicket(base, { id: building.id, action: 'release' }), `Co-pilot ${building.id}: released. Yellow: empty, next ${building.id}. Planning: empty. Concluding: empty.`);
});

test('a second repository\'s ticket reads its own main lane', async (t) => {
  const base = await deckOnAPort(t);
  aTicket('queued here', 'red', REPO);
  const elsewhere = aTicket('building elsewhere', 'yellow', path.resolve('D:/work/other'));

  assert.equal(await deckTicket(base, { id: elsewhere.id, action: 'co-pilot' }), `Co-pilot ${elsewhere.id}: live. Yellow: ${elsewhere.id}. Planning: empty. Concluding: empty.`);
});
