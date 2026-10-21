/**
 * S11 of pilot-branch (spec 12; L8): Implementation mode is gone. The sub-deck takes the yellow
 * queue, so no tab draws a toggle, `POST /mode` is not a route, and a store written while the
 * mode existed still loads with its old `mode` entry left unread.
 */

import './no-open.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { KIND_TICKET, repoKey } from '../items.mjs';
import { listItems, postItem, registerRun, storeFile } from '../store.mjs';
import { deckOnAPort, postStored, shapedTicketBody, tempDeck } from '../testUtils.mjs';

const MAIN = path.resolve('D:/work/pilot');

const aYellowTicket = (title) => postStored({ kind: KIND_TICKET, title, body: shapedTicketBody(title), repo: MAIN, sliceCount: 2, state: 'yellow' });
const page = async (base, dir) => (await fetch(`${base}/?run=${encodeURIComponent(dir)}`)).text();

test('the deck page draws no Implementation mode toggle on any tab', async (t) => {
  const base = await deckOnAPort(t);
  registerRun({ repo: MAIN, pid: process.pid });
  const head = aYellowTicket('Build the kettle whistle');
  const html = await page(base, MAIN);
  assert.ok(html.includes(`href="/thread/${head.id}"`), 'the yellow head is listed');
  assert.doesNotMatch(html, /Implementation mode/i, 'no toggle');
  assert.doesNotMatch(html, /action="\/mode"|class="mode/, 'no mode form');
});

test('POST /mode is not a route', async (t) => {
  const base = await deckOnAPort(t);
  const answer = await fetch(`${base}/mode`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', origin: base },
    body: new URLSearchParams({ repo: MAIN, mode: 'autonomous', back: '/' }),
    redirect: 'manual',
  });
  assert.equal(answer.status, 404);
});

test('a deck.json with a stored mode entry still loads', async (t) => {
  const base = await deckOnAPort(t);
  const ticket = aYellowTicket('Build the kettle whistle');
  const deck = JSON.parse(fs.readFileSync(storeFile(), 'utf8'));
  deck.mode = { [repoKey(MAIN)]: { mode: 'autonomous' } };
  fs.writeFileSync(storeFile(), JSON.stringify(deck));

  assert.deepEqual(listItems().map((item) => item.id), [ticket.id], 'the store loads');
  const record = await (await fetch(`${base}/api/record?repo=${encodeURIComponent(MAIN)}`)).json();
  assert.deepEqual(record, { record: null, yellow: null, budget: 5, coPilot: null, lanes: { planning: 'planning: empty', concluding: 'concluding: empty', coPilot: `co-pilot: empty → next ${ticket.id}`, stageClause: 'Planning: empty. Concluding: empty', yellowClause: `Yellow: empty, next ${ticket.id}`, refusal: `yellow lane empty; ${ticket.id} is planned — deck_ticket co-pilot it first`, blocked: null }, owed: [], work: { landings: 0, designs: 0, since: null } }, 'the entry is ignored: no mode is reported');
  registerRun({ repo: MAIN, pid: process.pid });
  assert.doesNotMatch(await page(base, MAIN), /<li data-state="yellow" class="in-hand">/, 'the main deck does not take the yellow head');
});

test('a deck.json with a stored mode has none after the next write', (t) => {
  tempDeck(t);
  aYellowTicket('Build the kettle whistle');
  const deck = JSON.parse(fs.readFileSync(storeFile(), 'utf8'));
  deck.mode = { [repoKey(MAIN)]: { mode: 'autonomous' } };
  fs.writeFileSync(storeFile(), JSON.stringify(deck));

  postItem({ kind: KIND_TICKET, title: 'Any write', body: shapedTicketBody('Any write'), repo: MAIN, sliceCount: 1 });
  assert.equal('mode' in JSON.parse(fs.readFileSync(storeFile(), 'utf8')), false, 'the write stores no mode');
});
