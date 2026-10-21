/**
 * S10 of yellow-agent (spec 1, L10): the store holds no sub-deck state. A `deck.json` written by
 * 0.7.19, with a sub-deck run under its main deck and a yellow ticket that sub-deck held, loads: the
 * held ticket is an ordinary yellow ticket, never live and never next in the main slot, the sub run is
 * neither live nor listed, and the next write stores neither the `holder` nor the run.
 */

import './no-open.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { KIND_TICKET, nextTicketOf } from '../items.mjs';
import { listItems, listLiveRuns, listStoredRuns, registerRun, storeFile } from '../store.mjs';
import { shapedTicketBody, tempDeck } from '../testUtils.mjs';

const MAIN = path.resolve('D:/work/pilot');
const SUB = path.resolve('D:/work/pilot-subdeck');
const NOW = new Date().toISOString();

const ticket = (id, title, state, extra = {}) => ({
  id, kind: KIND_TICKET, title, body: shapedTicketBody(title), repo: MAIN, state, sliceCount: 3, createdAt: NOW, ...extra,
});

/** The shapes 0.7.19 wrote: a live sub-deck run naming its `parent`, a held ticket, a paused sub run. */
function write0719(t) {
  tempDeck(t);
  const deck = {
    version: 1,
    seq: 3,
    items: [
      ticket('t1', 'Held by the sub-deck', 'yellow', { live: true, holder: SUB, takenAt: NOW }),
      ticket('t2', 'Queued yellow', 'yellow'),
      ticket('t3', 'Queued green', 'green'), // 0.7.19 spelled planning green; the v2 upgrade reads it red
    ],
    runs: [
      { id: 'r-main', repo: MAIN, pid: process.pid, startedAt: NOW, lastActivity: NOW },
      { id: 'r-sub', repo: SUB, pid: process.pid, parent: MAIN, startedAt: NOW, lastActivity: NOW, feature: 'x' },
      { id: 'r-paused', repo: path.resolve('D:/work/pilot-old'), pid: 1, parent: MAIN, paused: true, startedAt: NOW, lastActivity: NOW },
    ],
  };
  fs.writeFileSync(storeFile(), JSON.stringify(deck));
}

const stored = () => JSON.parse(fs.readFileSync(storeFile(), 'utf8'));

test('nextTicketOf never returns a yellow ticket', () => {
  const items = [ticket('t1', 'Yellow head', 'yellow'), ticket('t2', 'Yellow too', 'yellow')];
  assert.equal(nextTicketOf(items, MAIN), undefined);
  assert.equal(nextTicketOf(items, MAIN, 'sub'), undefined, 'a role argument left by an old caller changes nothing');
});

test('a stored holder is ignored on read and dropped on write', (t) => {
  write0719(t);
  const held = listItems().find((item) => item.id === 't1');
  assert.equal(held.holder, undefined, 'no holder on read');
  assert.equal(held.live, undefined, 'the held yellow ticket is not live in the one slot');
  assert.equal(held.state, 'yellow', 'and is kept, queued yellow');
  assert.equal(nextTicketOf(listItems(), MAIN, 'red')?.id, 't3', 'the main session sees one slot: the red head is next');

  registerRun({ repo: MAIN, pid: process.pid });
  const written = stored().items.find((item) => item.id === 't1');
  assert.equal('holder' in written, false, 'the next write drops it');
  assert.equal(written.state, 'yellow');
});

test('a stored sub run is not live and is not listed', (t) => {
  write0719(t);
  assert.deepEqual(listStoredRuns().map((run) => run.id), ['r-main']);
  assert.deepEqual(listLiveRuns().map((run) => run.id), ['r-main']);

  registerRun({ repo: SUB, pid: process.pid, parent: MAIN });
  const runs = stored().runs;
  assert.equal(runs.some((run) => 'parent' in run || 'paused' in run), false, 'no run is written with a parent');
});
