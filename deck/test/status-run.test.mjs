/**
 * S6 of thread-kinds: the tab's table holds one run (spec 7, 8, 9; F6, L9).
 *
 * The deck keeps one slice table per session, and a record per slug. A call for a
 * slug lays its rows over that slug's record table, never over another slug's rows
 * still on the run, so a new run starts the tab empty. The closing call, the one
 * carrying `finished`, empties the tab's table and the tree drawn from it; the
 * record keeps every row.
 *
 * Every test takes its own store; nothing here touches 4321.
 */

import './no-open.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { guard, shapedTicketBody, snapshotAt, tempDeck } from '../testUtils.mjs';
import { KIND_TICKET } from '../items.mjs';
import { FINISHED_CLEAN } from '../runs.mjs';

const { listRuns, postItem, recordsFor, registerRun, setSlices } = await import('../store.mjs');
const { callTool } = await import('../server.mjs');

const MINE = path.join('D:', 'work', 'pilot');
const PILOT_MD = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'agents', 'pilot.md');

const tab = (run) => listRuns().find((candidate) => candidate.id === run.id).slices;
const recordOf = (slug) => recordsFor(MINE).find((record) => record.slug === slug);
const names = (rows) => rows.map((row) => row.slice);

/** One run that has already posted an earlier feature's table. */
const afterAnEarlierRun = (t) => {
  tempDeck(t);
  const run = registerRun({ repo: MINE, pid: process.pid });
  setSlices(run.id, [{ slice: 'S1', state: 'merged' }, { slice: 'S2', state: 'merged', after: ['S1'] }], 'old', {
    slug: 'old',
  });
  return run;
};

test('a first call for a new slug leaves only its rows on the tab', (t) => {
  const run = afterAnEarlierRun(t);

  const { slices } = setSlices(run.id, [{ slice: 'S1', state: 'draft' }], 'new', { slug: 'new' });

  assert.deepEqual(names(slices), ['S1']);
  assert.deepEqual(tab(run), [{ slice: 'S1', state: 'draft' }], "the earlier slug's rows are gone from the tab");
});

test("the earlier slug's record still lists its rows", (t) => {
  const run = afterAnEarlierRun(t);

  setSlices(run.id, [{ slice: 'S1', state: 'draft' }], 'new', { slug: 'new' });

  assert.deepEqual(names(recordOf('old').slices), ['S1', 'S2']);
  assert.deepEqual(names(recordOf('new').slices), ['S1']);
});

test("a later call for the same slug merges over its record's table", (t) => {
  const run = afterAnEarlierRun(t);
  setSlices(run.id, [{ slice: 'S1', state: 'draft' }, { slice: 'S2', state: 'queued' }], 'new', { slug: 'new' });

  setSlices(run.id, [{ slice: 'S2', state: 'draft' }], undefined, { slug: 'new' });

  assert.deepEqual(tab(run), [
    { slice: 'S1', state: 'draft' },
    { slice: 'S2', state: 'draft' },
  ]);
});

test('a call with finished empties the tab\'s table and the tree drawn from it', (t) => {
  const run = afterAnEarlierRun(t);
  setSlices(run.id, [{ slice: 'S1', state: 'draft' }], 'new', { slug: 'new' });

  const { slices } = setSlices(run.id, [{ slice: 'S1', state: 'merged' }], undefined, {
    slug: 'new',
    finished: 'closing report posted',
  });

  assert.deepEqual(slices, [{ slice: 'S1', state: 'merged' }], 'the reply counts what the record saved');
  assert.deepEqual(tab(run), []);
});

test('the finished record keeps every row', (t) => {
  const run = afterAnEarlierRun(t);
  setSlices(run.id, [{ slice: 'S1', state: 'draft' }, { slice: 'S2', state: 'queued', after: ['S1'] }], 'new', {
    slug: 'new',
  });

  const { record } = setSlices(run.id, [{ slice: 'S2', state: 'merged', after: ['S1'] }], undefined, {
    slug: 'new',
    finished: 'closing report posted',
  });

  assert.deepEqual(record.slices, [
    { slice: 'S1', state: 'draft' },
    { slice: 'S2', state: 'merged', after: ['S1'] },
  ]);
  assert.deepEqual(recordOf('new').slices, record.slices, 'and the stored record is the same');
});

test('a later call on a finished slug lays its rows over the whole record table again', (t) => {
  const run = afterAnEarlierRun(t);
  setSlices(run.id, [{ slice: 'S1', state: 'merged' }], 'new', { slug: 'new', finished: 'closing report posted' });

  setSlices(run.id, [{ slice: 'S2', state: 'draft' }], undefined, { slug: 'new', next: 'one more slice' });

  assert.deepEqual(names(tab(run)), ['S1', 'S2']);
});

test('a call with no slug still lays its rows over the tab, drops included', (t) => {
  const run = afterAnEarlierRun(t);

  setSlices(run.id, [{ slice: 'S3', state: 'draft' }, { slice: 'S2', drop: true }]);

  assert.deepEqual(names(tab(run)), ['S1', 'S3']);
});

test('pilot.md has no TEMPORARY paragraph', () => {
  assert.doesNotMatch(fs.readFileSync(PILOT_MD, 'utf8'), /TEMPORARY/);
});

// handoff-over-mark S1, spec 1 and L2: the finishing session learns from the reply that it holds the next ticket.
test('the finish reply names the ticket taken in place', (t) => {
  tempDeck(t);
  snapshotAt(t, MINE, guard.marksFor(guard.PILOT_REFERENCE_WINDOW).advisory - 1);
  const run = registerRun({ repo: MINE, pid: process.pid });
  const ticket = postItem({ kind: KIND_TICKET, sliceCount: 60, title: 'Next', body: shapedTicketBody('spec'), repo: MINE });

  const reply = callTool('deck_status', { run: run.id, slug: 'feature-one', slices: [], finished: FINISHED_CLEAN });

  assert.match(reply.content[0].text, new RegExp(`; took ${ticket.id} live here\\.$`));
});

test('a finish over the mark says nothing was taken', (t) => {
  tempDeck(t);
  snapshotAt(t, MINE, guard.marksFor(guard.PILOT_REFERENCE_WINDOW).advisory + 1);
  const run = registerRun({ repo: MINE, pid: process.pid });
  postItem({ kind: KIND_TICKET, sliceCount: 60, title: 'Next', body: shapedTicketBody('spec'), repo: MINE });

  const reply = callTool('deck_status', { run: run.id, slug: 'feature-one', slices: [], finished: FINISHED_CLEAN });

  assert.doesNotMatch(reply.content[0].text, /took/);
});
