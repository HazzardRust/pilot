/**
 * The phase is the live ticket's state (ticket-states spec 4, 9; L4, L8, L9, L10; ADR 0060): one
 * ticket per directory is live, marked `live: true` with its `takenAt`; the phase is that
 * ticket's state, read from items alone, and with no live ticket there is none. The tab draws no
 * phase (ticket-state-accents L7; ADR 0105). `take` is
 * refused while another ticket here is live, `park` clears `live` and keeps the state, and the
 * closing report ends it too. The away rule and the gates read the same live ticket.
 */

import './no-open.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

import { aTicket as storedTicket, deckOnAPort, respelt, shapedTicketBody, tempDeck } from '../testUtils.mjs';
import { callTool, createDeckHttpServer } from '../server.mjs';

const { KIND_TICKET, SIGN_OFF, liveTicketOf, livePhaseOf } = await import('../items.mjs');
const { tabsOf } = await import('../tabs.mjs');
const { renderHomePage } = await import('../ui/render.mjs');
const { DeckRefusal, addReply, listItems, parkTicket, postItem, registerRun, removeDeck, resolveItem, takeTicket } = await import('../store.mjs');
const { TOOLS } = await import('../tools.mjs');

const AT = '2026-10-01T09:00:00.000Z';
const MINE = path.join('D:', 'work', 'pilot');
const THEIRS = path.join('D:', 'work', 'kettle');
const GATE1 = { artefact: 'docs/design/x/architecture.md', sha: '0305827', locked: 3, slices: '| S1 |', sliceCount: 3, branch: 'feat/x' };

const aRun = (over = {}) => ({ id: 'run_000000000001', repo: MINE, pid: process.pid, startedAt: AT, ...over });
const exitedPid = () => spawnSync(process.execPath, ['-e', '0']).pid;
const aRow = (id, over = {}) => ({ id, kind: KIND_TICKET, title: id, body: 'b', repo: MINE, postedAt: AT, replies: [], ...over });

const aTicket = (words = 'fix the thing', repo = MINE) =>
  postItem({ kind: KIND_TICKET, sliceCount: 60, title: words, body: shapedTicketBody(words), repo });
const aGate1 = (ticket, repo = MINE) => postItem({ kind: 'gate1', title: 'Gate 1', body: 'The design.', repo, ...GATE1, ticket });
const aGate2 = (ticket) => postItem({ kind: 'gate2', title: 'Gate 2', body: 'Walk it.', repo: MINE, pr: '#1', sha: '0305827', ticket });
const reread = (id) => listItems().find((item) => item.id === id);
const sign = (gate) => (addReply(gate.id, SIGN_OFF), resolveItem(gate.id, 'Signed off.'));
const refusedNaming = (...words) => (error) =>
  error instanceof DeckRefusal && words.every((word) => error.message.includes(word));

/** The strip link of the one repository tab on a home page. */
const tabLinkOf = (page) => {
  const strip = page.match(/<nav class="runs-strip"[^>]*>([\s\S]*?)<\/nav>/)[1];
  return strip.match(/<a [^>]*>[\s\S]*?<\/a>/g)[1];
};
const stripOf = (items) => tabLinkOf(renderHomePage(items, [aRun()], MINE));

/**
 * The tab says no phase (ticket-state-accents spec 5, L7; ADR 0105): no state word and no colour,
 * because the state lives on the threads. Read as the whole link: its name, then its count.
 */
const saysNoPhase = (link, why) => {
  assert.doesNotMatch(link, /phase/, `${why}: no phase class or attribute`);
  assert.doesNotMatch(link, /planning|implementing|concluding|planned|awaiting sign-off/, `${why}: no state word`);
  assert.match(link, /^<a [^>]*>pilot<span class="count">\d+<\/span><\/a>$/, `${why}: its name and count`);
};

test('with no live ticket livePhaseOf is null', () => {
  assert.equal(livePhaseOf([], MINE), null, 'nothing posted');
  const open = [aRow('t1', { state: 'yellow' }), aRow('t2', { state: 'green' })];
  assert.equal(livePhaseOf(open, MINE), null, 'open tickets in every colour, none live');
  assert.equal(liveTicketOf(open, MINE), undefined);
  assert.equal(livePhaseOf([aRow('t3', { live: true, state: 'green', resolvedAt: AT })], MINE), null, 'a closed ticket is never live');
  assert.equal(livePhaseOf([aRow('t4', { live: true, repo: THEIRS })], MINE), null, "another directory's live ticket");
});

test('the strip draws no phase word', () => {
  for (const state of ['red', 'yellow', 'green']) {
    const items = [aRow('t1', { live: true, state })];
    assert.equal(livePhaseOf(items, MINE), state, `a live ${state} ticket`);
    assert.equal(Object.hasOwn(tabsOf([aRun()], items)[0], 'phase'), false, 'the tab carries no phase');
    saysNoPhase(stripOf(items), `a live ${state} ticket`);
  }
  saysNoPhase(stripOf([aRow('t2', { state: 'green' })]), 'a parked green ticket in hand');
});

test('an ended tab still says ended', () => {
  const ended = tabLinkOf(renderHomePage([aRow('t5', { live: true, state: 'green' })], [aRun({ pid: exitedPid() })], MINE));
  assert.match(ended, /^<a [^>]*>pilot<span class="ended">ended<\/span><span class="count">\d+<\/span><\/a>$/);
});

test('taking a ticket makes the phase its state', (t) => {
  tempDeck(t);
  const ticket = aTicket();
  const taken = takeTicket(ticket.id);
  assert.equal(taken.live, true);
  assert.ok(!Number.isNaN(Date.parse(taken.takenAt)), 'takenAt is stamped');
  assert.equal(reread(ticket.id).live, true, 'stored, not only returned');
  assert.equal(liveTicketOf(listItems(), MINE).id, ticket.id);
  assert.equal(livePhaseOf(listItems(), MINE), 'red');
  assert.equal(livePhaseOf(listItems(), respelt(MINE) + path.sep), 'red', 'sameRepo');
  assert.equal(livePhaseOf(listItems(), THEIRS), null);
  saysNoPhase(stripOf(listItems()), 'taken, the tab still says no phase (ticket-state-accents L7)');
});

test('signing its gate1 empties the main slot, its gate2 is green to take, and closing it ends it', (t) => {
  tempDeck(t);
  const ticket = aTicket();
  takeTicket(ticket.id);
  sign(aGate1(ticket.id));
  // The main slot is never yellow (yellow-agent S4, ADR 0087): the sign parks its ticket.
  assert.equal(livePhaseOf(listItems(), MINE), null);
  saysNoPhase(stripOf(listItems()), 'signed gate1');
  const gate2 = aGate2(ticket.id);
  takeTicket(ticket.id);
  assert.equal(livePhaseOf(listItems(), MINE), 'green', 'its gate2 is green to take');
  saysNoPhase(stripOf(listItems()), 'green and live');
  sign(gate2);

  postItem({ kind: 'report', title: 'Closing report', body: 'Done.', repo: MINE, ticket: ticket.id });
  assert.equal(reread(ticket.id).live, undefined, 'the closing report clears live (L9)');
  assert.equal(livePhaseOf(listItems(), MINE), null);

  const resolved = aTicket('resolved by hand');
  takeTicket(resolved.id);
  resolveItem(resolved.id, 'done');
  assert.equal(reread(resolved.id).live, undefined, 'a ticket resolved outright is closed too');

  const archived = aTicket('archived with its deck');
  takeTicket(archived.id);
  removeDeck(MINE);
  assert.equal(reread(archived.id).live, undefined, 'so is one archived with its deck');
});

test('take is refused while another ticket in the repo is live, named', (t) => {
  tempDeck(t);
  const first = aTicket('first');
  const second = aTicket('second');
  takeTicket(first.id);
  assert.throws(() => takeTicket(second.id), refusedNaming(first.id, 'live', 'park'));
  assert.equal(reread(second.id).live, undefined, 'a refused take marks nothing');
  assert.throws(() => takeTicket(first.id), refusedNaming(first.id, 'already live'));

  const theirs = aTicket('theirs', THEIRS);
  assert.equal(takeTicket(theirs.id).live, true, 'one live ticket per directory, not per deck');

  const closed = aTicket('closed');
  resolveItem(closed.id, 'done');
  assert.throws(() => takeTicket(closed.id), refusedNaming(closed.id, 'not an open ticket'));
  assert.throws(() => takeTicket('itm_0123456789ab'), refusedNaming('itm_0123456789ab'));
});

test('park keeps the state and clears live; take after park sets a new takenAt', async (t) => {
  tempDeck(t);
  const ticket = aTicket();
  const { takenAt } = takeTicket(ticket.id);
  const parked = parkTicket(ticket.id);
  assert.equal(parked.live, undefined);
  assert.equal(reread(ticket.id).state, 'red', 'the state is unchanged');
  // A parked red ticket is still the ticket in hand, so the tab keeps its colour (overview-one-ticket); the live phase goes.
  assert.equal(livePhaseOf(listItems(), MINE), null, 'parking it removes the live phase');
  assert.match(
    renderHomePage(listItems(), [aRun()], MINE),
    /<details class="ticket-queue" data-queue="red"(?:(?!<details class="ticket-queue")[\s\S])*>fix the thing</,
    'a parked red ticket stays in the red queue',
  );
  assert.throws(() => parkTicket(ticket.id), refusedNaming(ticket.id, 'not live'));

  const other = aTicket('other');
  takeTicket(other.id);
  parkTicket(other.id);
  await new Promise((resolve) => setTimeout(resolve, 5));
  const again = takeTicket(ticket.id);
  assert.ok(Date.parse(again.takenAt) > Date.parse(takenAt), 'a new takenAt');
  assert.equal(livePhaseOf(listItems(), MINE), 'red');
});

test('the live row is marked live', (t) => {
  tempDeck(t);
  const ticket = aTicket('the live one');
  aTicket('a queued one');
  takeTicket(ticket.id);
  const page = renderHomePage(listItems(), [aRun()], MINE);
  const rowOf = (title) => {
    const end = page.indexOf(`>${title}</a>`);
    return page.slice(page.lastIndexOf('<li', end), page.indexOf('</li>', end));
  };
  assert.match(rowOf('the live one'), /<span class="live">live<\/span>/);
  assert.doesNotMatch(rowOf('a queued one'), /class="live"/);
});

test('gate1 and gate2 must name the live ticket', (t) => {
  tempDeck(t);
  const ticket = aTicket();
  assert.throws(() => aGate1(ticket.id), refusedNaming('gate1', ticket.id, 'not live', 'take'));
  takeTicket(ticket.id);
  sign(aGate1(ticket.id));
  // The sign parks its ticket, and a yellow ticket's gate2 needs no take (yellow-agent S4, ADR 0087); a green one's
  // still does (deck/test/yellow-park.test.mjs).
  assert.equal(reread(ticket.id).live, undefined);
  aGate2(ticket.id);
  assert.equal(reread(ticket.id).state, 'green');
});

test('deck_ticket takes and parks', (t) => {
  tempDeck(t);
  const { inputSchema } = TOOLS.find(({ name }) => name === 'deck_ticket');
  assert.deepEqual(inputSchema.properties.action.enum, ['up', 'down', 'take', 'park', 'merge', 'need', 'pivot', 'co-pilot', 'release', 'verdicts']);
  const ticket = aTicket();
  assert.match(callTool('deck_ticket', { id: ticket.id, action: 'take' }).content[0].text, new RegExp(`Took ${ticket.id}: live.*red`));
  assert.equal(livePhaseOf(listItems(), MINE), 'red');
  assert.match(callTool('deck_ticket', { id: ticket.id, action: 'park' }).content[0].text, new RegExp(`Parked ${ticket.id}: red, and no ticket is live here\\.`));
  assert.equal(livePhaseOf(listItems(), MINE), null);
  assert.throws(() => callTool('deck_ticket', { id: ticket.id, action: 'drop' }), DeckRefusal);
});

test("parking the concluding ticket names the planning ticket still live (QA F2)", (t) => {
  tempDeck(t);
  const planning = storedTicket('Plan it', 'red', MINE);
  const concluding = storedTicket('Ship it', 'green', MINE);
  takeTicket(planning.id);
  takeTicket(concluding.id);
  const reply = callTool('deck_ticket', { id: concluding.id, action: 'park' }).content[0].text;
  assert.equal(reply, `Parked ${concluding.id}: green; ${planning.id} is still live here.`);
});

test('a walkthrough or signoff posted with gate is refused naming gate2/gate1', (t) => {
  tempDeck(t);
  const post = (kind, gateTag) => () => postItem({ kind, title: 'T', body: 'b', repo: MINE, gate: gateTag });
  const naming = (name) => (error) => error instanceof DeckRefusal && new RegExp(`\\b${name}\\b`).test(error.message);
  assert.throws(post('walkthrough', '2'), naming('gate2'));
  assert.throws(post('signoff', '1'), naming('gate1'));
  assert.throws(post('signoff', '2'), naming('gate2'));
  assert.throws(post('question', '1'), naming('gate1'), 'any kind');
  assert.throws(post('signoff', '2'), { message: 'a signoff carries no gate; post the gate as kind gate2, with its evidence fields' });
  assert.throws(post('signoff', '3'), { message: 'a signoff carries no gate; post the gate as kind gate1 or gate2, with its evidence fields' });
  assert.deepEqual(listItems(), [], 'nothing stored');
});

test("deck_post's schema has no gate property", () => {
  const { inputSchema, description } = TOOLS.find(({ name }) => name === 'deck_post');
  assert.equal(Object.hasOwn(inputSchema.properties, 'gate'), false);
  assert.doesNotMatch(JSON.stringify(inputSchema), /human gate it is/);
  assert.ok(description.length > 0);
});

test('the phase survives a daemon restart', async (t) => {
  const base = await deckOnAPort(t);
  const repo = path.join(process.env.PILOT_DECK_DIR, 'repo');
  registerRun({ repo, pid: process.pid });
  const ticket = aTicket('restart', repo);
  takeTicket(ticket.id);

  const phaseAt = async (origin) => {
    const page = await (await fetch(`${origin}/?run=${encodeURIComponent(repo)}`)).text();
    // Read off the Tickets panel's in-hand row: the tab no longer draws it (ticket-state-accents L7).
    return page.match(/<li data-state="([a-z]+)" class="in-hand">/)?.[1];
  };
  assert.equal(await phaseAt(base), 'red');

  const again = createDeckHttpServer({ secret: null });
  await new Promise((resolve) => again.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => (again.closeAllConnections(), again.close(resolve))));
  assert.equal(await phaseAt(`http://127.0.0.1:${again.address().port}`), 'red', 'read back, not held');
});
