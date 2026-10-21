/**
 * S3 of yellow-agent (spec 8; L11, ADR 0087): the main slot is never yellow. A main session
 * starting where the newest run record belongs to an open yellow ticket is not handed that run
 * as its own: `GET /api/record` without `ticket` serves no record, so the SessionStart hook says
 * no "Recovering an unfinished run", and `pilot run` at start chains the red head instead of
 * refusing. Never the record before it (old L4). `recordFor` itself is unchanged: the paused
 * stop and the green conclude still read the newest record.
 *
 * Every test takes its own store and port; nothing here touches 4321 or the real home.
 */

import './no-open.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';

import { KIND_HANDOFF, KIND_TICKET } from '../items.mjs';
import { listItems, recordFor, registerRun } from '../store.mjs';
import { callTool } from '../server.mjs';
import { chainNext } from '../chain.mjs';
import { deckOnAPort, postStored, shapedTicketBody } from '../testUtils.mjs';

const MAIN = path.resolve('D:/work/pilot');

const aTicket = (title, state) =>
  postStored({ kind: KIND_TICKET, title, body: shapedTicketBody(title), repo: MAIN, sliceCount: 3, ...(state ? { state } : {}) });

/** An unfinished run record of `ticket`, written by a main-deck run in MAIN: the newest there. */
const anUnfinishedRecord = (ticket, slug = 'build-it') => {
  const run = registerRun({ repo: MAIN, pid: process.pid });
  callTool('deck_status', { run: run.id, slug, ticket: ticket.id, feature: slug, next: 'S2 next', slices: [{ slice: 'S1', state: 'integrated' }] });
  return run;
};

const served = async (base) => (await fetch(`${base}/api/record?repo=${encodeURIComponent(MAIN)}`)).json();

test('a main directory is served no record when its newest record\'s ticket is yellow', async (t) => {
  const base = await deckOnAPort(t);
  // An older record of another ticket first: a yellow newest means null, never this one (old L4).
  anUnfinishedRecord(aTicket('Older', 'green'), 'older');
  anUnfinishedRecord(aTicket('Build it', 'yellow'));

  const body = await served(base);
  assert.equal(body.record, null, 'no record, and not the one before it');
  assert.equal('role' in body, false, 'the answer names no role');
});

test('a green ticket\'s record is still served', async (t) => {
  const base = await deckOnAPort(t);
  const ticket = aTicket('Build it', 'green');
  anUnfinishedRecord(ticket);

  const body = await served(base);
  assert.equal(body.record?.ticket, ticket.id, 'the green conclude reads its record');
});

test('recordFor still returns the newest record', async (t) => {
  await deckOnAPort(t);
  const ticket = aTicket('Build it', 'yellow');
  anUnfinishedRecord(ticket);

  assert.equal(recordFor(MAIN)?.ticket, ticket.id, 'the paused stop and the green conclude read it unchanged');
});

test('the record route names the yellow head, its plan and its record (S6)', async (t) => {
  const base = await deckOnAPort(t);
  const plan = { artefact: 'docs/design/build-it/architecture.md', branch: 'feat/build-it', sha: 'abc1234', sliceCount: 3 };
  aTicket('Not signed yet', 'yellow');
  const ticket = postStored({ kind: KIND_TICKET, title: 'Build it', body: shapedTicketBody('Build it'), repo: MAIN, sliceCount: 3, state: 'yellow', plan: { ...plan, slug: 'build-it', gate1: 'itm_gate1' } });
  anUnfinishedRecord(ticket);

  const { yellow } = await served(base);
  assert.deepEqual(yellow.ticket, { id: ticket.id, title: 'Build it' }, 'the first open yellow ticket with a plan');
  assert.deepEqual(yellow.plan, plan, 'its signed plan, by reference');
  assert.equal(yellow.record?.next, 'S2 next', 'and its record');
});

test('a directory with no yellow ticket is served yellow null (S6)', async (t) => {
  const base = await deckOnAPort(t);
  aTicket('Build it', 'green');
  assert.equal((await served(base)).yellow, null);
});

test('a main start beside a yellow unfinished record chains the red head', async (t) => {
  await deckOnAPort(t);
  anUnfinishedRecord(aTicket('Build it', 'yellow'));
  const red = aTicket('Next thing');

  const { handoff } = chainNext(MAIN, { atStart: true });
  assert.equal(handoff?.next, red.id, 'the red head is handed over, not "a run is unfinished"');
  assert.equal(listItems().filter((item) => item.kind === KIND_HANDOFF).length, 1);
});
