/**
 * yellow-lane S2 (spec 2, 3): the yellow lane is spelled beside the main lane. `lanesFrom` names a
 * queued yellow lane's next on its lane line and in its `Yellow:` clause, and `deck_ticket co-pilot`,
 * `release` and `need` answer with both clauses on one line. Every test takes its own store.
 */

import './no-open.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';

import { KIND_WALKTHROUGH } from '../items.mjs';
import { lanesFrom } from '../lanes.mjs';
import { postItem } from '../store.mjs';
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

test('the queued yellow lane names its next', () => {
  const items = [{ kind: 'ticket', id: 'itm_y1', title: 'y', repo: REPO, state: 'yellow' }];
  const queued = lanesFrom(items, REPO, { coPilot: null });
  assert.equal(queued.coPilot, 'co-pilot: empty → next itm_y1');
  assert.equal(queued.yellowClause, 'Yellow: empty, next itm_y1');

  const held = lanesFrom(items, REPO, { coPilot: { ticket: 'itm_y1', live: true } });
  assert.equal(held.coPilot, 'co-pilot: itm_y1');
  assert.equal(held.yellowClause, 'Yellow: itm_y1');

  const none = lanesFrom([], REPO, { coPilot: null });
  assert.equal(none.coPilot, 'co-pilot: none');
  assert.equal(none.yellowClause, 'Yellow: empty');
});

test('release answers both lanes', async (t) => {
  const base = await deckOnAPort(t);
  const building = aTicket('building', 'yellow', REPO);
  const live = takeLive(aTicket('live', 'red', REPO).id);

  await deckTicket(base, { id: building.id, action: 'co-pilot' });
  assert.equal(await deckTicket(base, { id: building.id, action: 'release' }), `Co-pilot ${building.id}: released. Yellow: empty, next ${building.id}. Planning: ${live.id} live. Concluding: empty.`);
});

test('co-pilot and need answer both lanes', async (t) => {
  const base = await deckOnAPort(t);
  const building = aTicket('building', 'yellow', REPO);
  const queued = aTicket('queued', 'red', REPO);
  const needed = aTicket('needs the user', 'yellow', REPO);
  postItem({ kind: KIND_WALKTHROUGH, title: 'Walk it', body: 'Steps.', repo: REPO, ticket: needed.id });

  assert.equal(await deckTicket(base, { id: building.id, action: 'co-pilot' }), `Co-pilot ${building.id}: live. Yellow: ${building.id}. Planning: empty, next ${queued.id}. Concluding: empty.`);
  assert.equal(await deckTicket(base, { id: needed.id, action: 'need' }), `Needed ${needed.id}: green. Yellow: ${building.id}. Planning: empty, next ${queued.id}. Concluding: empty, next ${needed.id}.`);
});
