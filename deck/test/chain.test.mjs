/**
 * S1 of run-chaining: a stored ticket starts itself when the run before it
 * finishes cleanly (spec 3, 4, 5 clean finish only, 9; L3-L5).
 *
 * The daemon decides the chain in one function, `chainNext`, called from
 * `deck_status` on a clean finish: it posts a hand-off carrying the head ticket's
 * spec and takes the ticket. `stopReason` then ignores a finish that a resolved
 * chain hand-off has superseded, so the chained session keeps listening. Every
 * test takes its own store and port; nothing touches 4321.
 */

import './no-open.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { deckOnAPort, guard, postStored, shapedTicketBody, snapshotAt, takeLive, tempDeck } from '../testUtils.mjs';
import { HANDOFF_FAILED, KIND_GATE1, KIND_HANDOFF, KIND_TICKET, SIGN_OFF, liveTicketOf, nextTicketOf, stateOf } from '../items.mjs';
import * as runs from '../runs.mjs';

const { FINISHED_CLEAN } = runs;

const {
  MAX_TEXT_BYTES,
  addPilotMessage,
  addReply,
  listItems,
  parkTicket,
  postItem,
  registerRun,
  reopenItem,
  resolveItem,
  setSlices,
  takeTicket,
} = await import('../store.mjs');
const { chainNext, isSuperseded } = await import('../chain.mjs');
const { callTool } = await import('../server.mjs');
const { renderHomePage, renderThreadPage } = await import('../ui/render.mjs');

const ALPHA = path.resolve('D:/work/alpha');
const BETA = path.resolve('D:/work/beta');

const callApi = (base, name, args = {}) =>
  fetch(`${base}/api/tool`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name, arguments: args }),
  });
const textOf = async (response) => (await response.json()).content[0].text;

const aTicket = (title, body, repo = ALPHA) => postItem({ kind: KIND_TICKET, sliceCount: 60, title, body: shapedTicketBody(body), repo });
// What the ticket shape adds around a body, so a test near the byte limit still sits there.
const SHAPE_BYTES = Buffer.byteLength(shapedTicketBody(''), 'utf8');
const finish = (run, finished = FINISHED_CLEAN) => setSlices(run.id, [], undefined, { slug: 'feature-one', finished });
const reread = (id) => listItems().find((item) => item.id === id);
const handoffs = () => listItems().filter((item) => item.kind === KIND_HANDOFF);

test('a clean finish with an open ticket posts one hand-off carrying the ticket\'s spec and takes the ticket', (t) => {
  tempDeck(t);
  const run = registerRun({ repo: ALPHA, pid: process.pid });
  const ticket = aTicket('Run 2: slices S4-S6', 'Spec: 1. the tab lists tickets.');
  finish(run);

  const { handoff } = chainNext(ALPHA);

  assert.equal(handoff.kind, KIND_HANDOFF);
  assert.equal(handoff.title, 'Next run: Run 2: slices S4-S6');
  assert.equal(handoff.body, ticket.body, 'the hand-off carries the spec itself, so a failed /clear loses nothing');
  assert.equal(handoff.next, ticket.id);
  assert.equal(path.resolve(handoff.repo), ALPHA);
  assert.deepEqual(handoffs().map((item) => item.id), [handoff.id], 'exactly one');
  assert.equal(reread(ticket.id).live, true, 'the ticket is taken once, by this hand-off');
});

// ticket-states spec 13, L16, L19: the chain takes the head ticket live rather than resolving it.
test('after a chain hand-off the head ticket is open and live', (t) => {
  tempDeck(t);
  const run = registerRun({ repo: ALPHA, pid: process.pid });
  const ticket = aTicket('Next', 'spec');
  finish(run);

  const { handoff } = chainNext(ALPHA);

  const taken = reread(ticket.id);
  assert.equal(handoff.next, ticket.id);
  assert.equal(taken.resolvedAt, undefined, 'the ticket stays open');
  assert.equal(taken.resolution, undefined, 'and carries no resolution');
  assert.equal(taken.live, true, 'it is the live ticket');
  assert.equal(liveTicketOf(listItems(), ALPHA)?.id, ticket.id);
  assert.equal(stateOf(taken), 'red', 'its state is kept');
});

test('Handoff failed on a chain hand-off puts its live ticket down, so it is the next ticket again', (t) => {
  tempDeck(t);
  const run = registerRun({ repo: ALPHA, pid: process.pid });
  const ticket = aTicket('Next', 'spec');
  finish(run);
  const { handoff } = chainNext(ALPHA);

  addReply(handoff.id, HANDOFF_FAILED);

  assert.equal(reread(ticket.id).live, undefined, 'no longer live');
  assert.equal(nextTicketOf(listItems(), ALPHA, 'red')?.id, ticket.id, 'back at the head of Tickets');
});

test('the chain refuses while a ticket is live', (t) => {
  tempDeck(t);
  const run = registerRun({ repo: ALPHA, pid: process.pid });
  const live = aTicket('Live', 'spec one');
  aTicket('Waiting', 'spec two');
  takeTicket(live.id);
  finish(run);

  assert.deepEqual(chainNext(ALPHA), { handoff: null, reason: 'ticket live' });
  assert.equal(handoffs().length, 0, 'nothing is posted');
  assert.equal(reread(live.id).live, true, 'the live ticket is left as it was');
});

test('a lone live ticket leaves the chain no next ticket', (t) => {
  tempDeck(t);
  const run = registerRun({ repo: ALPHA, pid: process.pid });
  takeTicket(aTicket('Live', 'spec').id);
  finish(run);

  assert.deepEqual(chainNext(ALPHA), { handoff: null, reason: 'no ticket' });
});

test('the tab\'s next marker and the chain name the same ticket', (t) => {
  tempDeck(t);
  const run = registerRun({ repo: ALPHA, pid: process.pid });
  const live = aTicket('Live', 'spec zero');
  const first = aTicket('First', 'spec one');
  aTicket('Second', 'spec two');
  takeTicket(live.id);
  // The rows the tab marks `next`, anchored on the ticket row element rather than the inlined CSS.
  const markedNext = () =>
    [...renderHomePage(listItems(), [{ ...run, feature: 'x' }], ALPHA).matchAll(/<li data-state="[a-z]+"(?: class="in-hand")?>(.*?)<\/li>/gs)]
      .map(([, row]) => row)
      .filter((row) => row.includes('<span class="next">next</span>'));

  const marked = markedNext();
  assert.equal(marked.length, 1, 'one ticket is marked next');
  assert.ok(marked[0].includes(first.id), 'the first red ticket that is not live, not the live one');
  assert.equal(nextTicketOf(listItems(), ALPHA, 'red')?.id, first.id);

  parkTicket(live.id);
  resolveItem(live.id, 'done');
  finish(run);
  assert.equal(chainNext(ALPHA).handoff.next, first.id, 'the chain takes the ticket the tab marked');
});

const aYellow = (title, given = {}) => postStored({ kind: KIND_TICKET, title, body: shapedTicketBody(title), repo: ALPHA, state: 'yellow', ...given });

// yellow-agent S9 (L6, L10): the daemon starts, waits and pauses no sub-deck.
test('a signed gate1 starts no process and says nothing of a sub-deck', async (t) => {
  const started = [];
  const base = await deckOnAPort(t, { start: (...args) => started.push(args) });
  const ticket = postStored({ kind: KIND_TICKET, title: 'fix the thing', body: shapedTicketBody('f'), repo: ALPHA });
  takeLive(ticket.id);
  const evidence = { artefact: 'docs/design/x/architecture.md', sha: '0305827', locked: 3, slices: '| S1 |', sliceCount: 3, branch: 'feat/x' };
  const gate = postItem({ kind: KIND_GATE1, title: 'Gate 1', body: 'The design.', repo: ALPHA, ...evidence, ticket: ticket.id });
  addReply(gate.id, SIGN_OFF);

  const answer = await fetch(`${base}/api/tool`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'deck_resolve', arguments: { id: gate.id, resolution: 'Signed off.' } }),
  });
  assert.equal(answer.status, 200);
  const said = (await answer.json()).content[0].text;

  assert.equal(said, `Closed ${gate.id}: Signed off.`, 'nothing appended');
  assert.deepEqual(started, [], 'nothing started');
  assert.equal(stateOf(reread(ticket.id)), 'yellow');
});

test('POST /subdeck/pause is not a route', async (t) => {
  const base = await deckOnAPort(t);
  // A stored sub-deck run (S10 drops the field) is what a pause used to find and mark.
  registerRun({ repo: `${ALPHA}-subdeck`, pid: process.pid, parent: ALPHA });
  const answer = await fetch(`${base}/subdeck/pause`, {
    method: 'POST',
    headers: { origin: base, 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ repo: ALPHA }),
  });
  assert.equal(answer.status, 404);
});

test('/api/chain refuses a foreign Origin and a non-JSON body', async (t) => {
  const base = await deckOnAPort(t);
  aTicket('Red', 'g');
  const foreign = await fetch(`${base}/api/chain`, {
    method: 'POST',
    headers: { origin: 'http://evil.example', 'content-type': 'application/json' },
    body: JSON.stringify({ repo: ALPHA }),
  });
  assert.equal(foreign.status, 403, 'a cross-site page cannot start a run');
  const form = await fetch(`${base}/api/chain`, {
    method: 'POST',
    headers: { 'content-type': 'text/plain' },
    body: JSON.stringify({ repo: ALPHA }),
  });
  assert.equal(form.status, 415, 'a body a cross-site form can send is refused');
  assert.equal(handoffs().length, 0, 'neither took the ticket');
});

// three-lanes spec 7, A4: one chain fills both stage lanes, green first, then red.
test("the main deck's chain takes a green ticket first, then red, never the yellow", (t) => {
  tempDeck(t);
  const run = registerRun({ repo: ALPHA, pid: process.pid });
  const yellow = aYellow('Yellow');
  const green = postStored({ kind: KIND_TICKET, title: 'Green', body: shapedTicketBody('r'), repo: ALPHA, state: 'green' });
  const red = aTicket('Red', 'g');
  finish(run);

  const { handoff, taken } = chainNext(ALPHA);
  assert.equal(handoff.next, green.id, 'green first');
  assert.deepEqual(taken, [green.id, red.id], 'then red');
  assert.equal(reread(yellow.id).live, undefined, 'never the yellow');
});

// overview-one-ticket spec 22, L19: a blocker ends in `need`, so no run finishes `blocked` and nothing chains past one.
test('a "blocked" finish chains nothing, and the chain names no blocked finish', (t) => {
  tempDeck(t);
  const run = registerRun({ repo: ALPHA, pid: process.pid });
  aTicket('Next', 'n');
  finish(run, 'blocked');

  assert.deepEqual(chainNext(ALPHA), { handoff: null, reason: 'not finished cleanly' });
  assert.equal(handoffs().length, 0);
  assert.equal(runs.FINISHED_BLOCKED, undefined, 'runs.mjs spells no blocked finish');
});

test("attended: a 'needed' finish does not chain", (t) => {
  tempDeck(t);
  const run = registerRun({ repo: ALPHA, pid: process.pid });
  postStored({ kind: KIND_TICKET, title: 'Green', body: shapedTicketBody('r'), repo: ALPHA, state: 'green' });
  aTicket('Red', 'g');
  for (const finished of ['needed', 'blocked']) {
    finish(run, finished);
    assert.deepEqual(chainNext(ALPHA), { handoff: null, reason: 'not finished cleanly' }, finished);
  }
  assert.equal(handoffs().length, 0);
});

test('deck_post answers a ticket differently: it starts itself and must not be resolved (QA F4)', (t) => {
  tempDeck(t);
  const answer = callTool('deck_post', { kind: KIND_TICKET, sliceCount: 60, title: 'Run 2', body: shapedTicketBody(), repo: ALPHA });
  const text = answer.content[0].text;

  assert.match(text, /starts itself/);
  assert.match(text, /after a clean finish here/);
  assert.match(text, /do not deck_resolve it/);
  assert.doesNotMatch(text, /The human answers it/, 'nobody answers a ticket the way a question is answered');
});

test('the chain hand-off says typing /clear starts the run, on its card and its thread (QA F2)', (t) => {
  tempDeck(t);
  const run = registerRun({ repo: ALPHA, pid: process.pid });
  const ticket = aTicket('Run 2: slices S4-S6', 'Spec: 1. the tab lists tickets.');
  finish(run);
  const { handoff } = chainNext(ALPHA);

  const card = renderHomePage(listItems(), [{ ...run, feature: 'x' }], ALPHA);
  assert.match(card, /Typing <code>\/clear<\/code> in this repository's terminal starts this run\./);

  const thread = renderThreadPage(handoff, listItems());
  assert.match(thread, /Typing <code>\/clear<\/code> in this repository's terminal starts this run\./);

  // The pilot's own context stash is the same kind and the same card shape, but
  // carries no `next` and is not this run-starting hand-off: it says nothing here.
  const stash = postItem({ kind: KIND_HANDOFF, title: 'Context is at 40%', body: 'Stash at x.md.', repo: ALPHA });
  const stashThread = renderThreadPage(stash, listItems());
  assert.doesNotMatch(stashThread, /starts this run/);
});

test('an abandoned finish, no ticket, or an open hand-off posts nothing', async (t) => {
  await t.test('abandoned', (inner) => {
    tempDeck(inner);
    const run = registerRun({ repo: ALPHA, pid: process.pid });
    aTicket('Next', 'spec');
    finish(run, 'abandoned by the user');
    assert.deepEqual(chainNext(ALPHA), { handoff: null, reason: 'not finished cleanly' });
  });
  await t.test('no record at all', (inner) => {
    tempDeck(inner);
    aTicket('Next', 'spec');
    assert.deepEqual(chainNext(ALPHA), { handoff: null, reason: 'not finished cleanly' });
  });
  await t.test('no ticket, or only another directory\'s', (inner) => {
    tempDeck(inner);
    const run = registerRun({ repo: ALPHA, pid: process.pid });
    aTicket('Theirs', 'spec', BETA);
    finish(run);
    assert.deepEqual(chainNext(ALPHA), { handoff: null, reason: 'no ticket' });
  });
  await t.test('an open chain hand-off', (inner) => {
    tempDeck(inner);
    const run = registerRun({ repo: ALPHA, pid: process.pid });
    aTicket('One', 'spec one');
    aTicket('Two', 'spec two');
    finish(run);
    chainNext(ALPHA);
    assert.deepEqual(chainNext(ALPHA), { handoff: null, reason: 'hand-off open' });
    assert.equal(handoffs().length, 1);
  });
});

test('two tickets chain oldest first', (t) => {
  tempDeck(t);
  const run = registerRun({ repo: ALPHA, pid: process.pid });
  aTicket('First', 'spec one');
  const second = aTicket('Second', 'spec two');
  finish(run);
  const first = chainNext(ALPHA).handoff;
  assert.equal(first.body, shapedTicketBody('spec one'));
  resolveItem(first.id, 'picked up');
  // The first ticket is live until its run closes it; only then does the second chain.
  parkTicket(first.next);
  resolveItem(first.next, 'done');

  finish(run);
  const next = chainNext(ALPHA).handoff;

  assert.equal(next.next, second.id);
  assert.equal(next.body, shapedTicketBody('spec two'));
});

test('deck_status with the clean finish posts the hand-off through /api/tool', async (t) => {
  const base = await deckOnAPort(t);
  const run = registerRun({ repo: ALPHA, pid: process.pid });
  const ticket = aTicket('Next', 'the spec of the next run');

  const status = await callApi(base, 'deck_status', { run: run.id, slug: 'feature-one', slices: [], finished: FINISHED_CLEAN });

  assert.equal(status.status, 200, await status.clone().text());
  assert.equal(handoffs().length, 1);
  assert.equal(handoffs()[0].next, ticket.id);
});

test('a chained session is not told to stop listening; the finishing session still is', async (t) => {
  const base = await deckOnAPort(t);
  const run = registerRun({ repo: ALPHA, pid: process.pid });
  aTicket('Next', 'the spec of the next run');
  await callApi(base, 'deck_status', { run: run.id, slug: 'feature-one', slices: [], finished: FINISHED_CLEAN });
  const wait = () => callApi(base, 'deck_wait', { since: 999, timeout: 50, repo: ALPHA, run: run.id });

  assert.equal(await textOf(await wait()), `stop listening: the run is finished (${FINISHED_CLEAN})`);

  // The lane resolves the hand-off as it hands it to the session /clear made; that
  // session is the same run, and the finish it would otherwise read is not its own.
  resolveItem(handoffs()[0].id, 'picked up');
  assert.doesNotMatch(await textOf(await wait()), /stop listening/);
});

test('a resolved chain hand-off does not excuse a later, separate clean finish (kills the postedAt >= saidAt mutant)', async (t) => {
  // The mutant that turns `item.postedAt >= saidAt` (chain.mjs) into a bare `true`
  // makes `isSuperseded` say yes to any resolved chain hand-off at all, regardless
  // of when it was posted. This run chains, resolves the hand-off as the fresh
  // session would, and then finishes cleanly a second time: the second finish is
  // not the one the resolved hand-off superseded, so the wait must still say
  // stop listening — a mutated `isSuperseded` would wrongly swallow that stop.
  const base = await deckOnAPort(t);
  const run = registerRun({ repo: ALPHA, pid: process.pid });
  aTicket('Next', 'the spec of the next run');
  const wait = () => callApi(base, 'deck_wait', { since: 999, timeout: 50, repo: ALPHA, run: run.id });

  await callApi(base, 'deck_status', { run: run.id, slug: 'feature-one', slices: [], finished: FINISHED_CLEAN });
  resolveItem(handoffs()[0].id, 'picked up');
  assert.doesNotMatch(await textOf(await wait()), /stop listening/, 'the chained session keeps listening');

  await new Promise((resolve) => setTimeout(resolve, 5));
  await callApi(base, 'deck_status', { run: run.id, slug: 'feature-one', slices: [], finished: FINISHED_CLEAN });

  assert.equal(
    await textOf(await wait()),
    `stop listening: the run is finished (${FINISHED_CLEAN})`,
    'a second, later clean finish is its own and is not excused by the earlier resolved hand-off',
  );
});

test('isSuperseded treats a hand-off posted the very same millisecond as the finish as having superseded it (pin)', () => {
  const stamp = '2026-09-26T00:00:00.000Z';
  const handoff = { kind: KIND_HANDOFF, repo: ALPHA, next: 'itm_ticket00000001', resolvedAt: stamp, postedAt: stamp };
  assert.equal(isSuperseded({ finishedAt: stamp }, [handoff], ALPHA), true, 'a tie supersedes: >=, not >');
});

test('a later deck_status on the finished slug, without finished, does not bring the stop back', async (t) => {
  const base = await deckOnAPort(t);
  const run = registerRun({ repo: ALPHA, pid: process.pid });
  aTicket('Run 2 of feature-one', 'begin at step 4 with S4-S6');
  await callApi(base, 'deck_status', { run: run.id, slug: 'feature-one', slices: [], finished: FINISHED_CLEAN });
  resolveItem(handoffs()[0].id, 'picked up');
  await new Promise((resolve) => setTimeout(resolve, 5));

  // A split ticket's next run keeps the slug and sends its table; `finished` stays on the record.
  await callApi(base, 'deck_status', { run: run.id, slug: 'feature-one', slices: [] });
  const wait = await callApi(base, 'deck_wait', { since: 999, timeout: 50, repo: ALPHA, run: run.id });

  assert.doesNotMatch(await textOf(wait), /stop listening/);
});

test('a pilot\'s own open stash hand-off does not hold the chain back', (t) => {
  tempDeck(t);
  const run = registerRun({ repo: ALPHA, pid: process.pid });
  postItem({ kind: KIND_HANDOFF, title: 'Context is at 40%', body: 'Stash at x.md.', repo: ALPHA });
  aTicket('Next', 'spec');
  finish(run);

  assert.ok(chainNext(ALPHA).handoff, 'only an open chain hand-off holds it');
});

// Spec 9, L4: the hand-off carries the ticket's comments after its body, in order,
// labelled by who said them, with the deck's own close and reopen markers left out.
const COMMENTS = '\n\n## Comments on this ticket\n\n';
const commentsOf = (id) => reread(id).replies;
const line = (reply, who) => `**${who}** (${reply.repliedAt}): ${reply.text}`;

test('a ticket with two comments chains to a hand-off holding the body, then both comments in order', (t) => {
  tempDeck(t);
  const run = registerRun({ repo: ALPHA, pid: process.pid });
  const ticket = aTicket('Next', 'Spec: 1. the tab lists tickets.');
  addReply(ticket.id, 'Also sort them by age.');
  addPilotMessage(ticket.id, 'Noted: sorted oldest first.');
  const [first, second] = commentsOf(ticket.id);
  finish(run);

  const { handoff } = chainNext(ALPHA);

  assert.equal(handoff.body, `${ticket.body}${COMMENTS}${line(first, 'user')}\n\n${line(second, 'pilot')}`);
});

test('a ticket with no comments chains to a hand-off whose body is byte-identical to the ticket\'s', (t) => {
  tempDeck(t);
  const run = registerRun({ repo: ALPHA, pid: process.pid });
  const ticket = aTicket('Next', 'Spec: 1. the tab lists tickets.\n');
  finish(run);

  assert.equal(chainNext(ALPHA).handoff.body, ticket.body);
});

test('each comment is labelled by who said it', (t) => {
  tempDeck(t);
  const run = registerRun({ repo: ALPHA, pid: process.pid });
  const ticket = aTicket('Next', 'spec');
  addReply(ticket.id, 'from the user');
  addPilotMessage(ticket.id, 'from a helper', 'explorer');
  finish(run);

  const { body } = chainNext(ALPHA).handoff;

  assert.match(body, /^\*\*user\*\* \([^)]+\): from the user$/m);
  assert.match(body, /^\*\*explorer\*\* \([^)]+\): from a helper$/m, 'the author, not the bare from, names a helper');
});

// F1: a comment (or the sum of the ticket's comments) can push the hand-off past
// MAX_TEXT_BYTES; postItem would then throw before resolveItem ran, leaving the
// head ticket blocking the whole queue. Comments are added in order only while the
// body still fits, and the truncated body names the ticket so nothing is lost.
test('an oversized comment does not block the chain: earlier comments are kept, the rest point at the ticket (F1)', (t) => {
  tempDeck(t);
  const run = registerRun({ repo: ALPHA, pid: process.pid });
  const ticket = aTicket('Next', 'Spec: 1. the tab lists tickets.');
  addReply(ticket.id, 'Also sort them by age.');
  const [first] = commentsOf(ticket.id);
  addReply(ticket.id, 'x'.repeat(MAX_TEXT_BYTES - 50));
  finish(run);

  const { handoff } = chainNext(ALPHA);

  assert.ok(handoff, 'the hand-off is still posted');
  assert.ok(Buffer.byteLength(handoff.body, 'utf8') <= MAX_TEXT_BYTES, 'the body stays at or under the byte limit');
  assert.match(handoff.body, new RegExp(`\\*\\*user\\*\\* \\([^)]+\\): Also sort them by age\\.`), 'the comment that fits is kept, in order');
  assert.equal(handoff.body.trimEnd().endsWith(`Further comments are on ${ticket.id}.`), true, 'the body names the ticket for what was left out');
  assert.equal(reread(ticket.id).live, true, 'the ticket is still taken despite the oversized comment');
});

test('a body already near the byte limit, plus a comment that cannot fit beside a closing line, still chains (F1 fallback)', (t) => {
  // A ticket's own body is stored at up to MAX_TEXT_BYTES (store.mjs's own bound), so
  // body + a closing pointer line can itself pass the limit even when no comment is
  // kept at all. The hand-off must still fit, and the ticket must still be taken.
  tempDeck(t);
  const run = registerRun({ repo: ALPHA, pid: process.pid });
  const ticket = aTicket('Next', 'x'.repeat(MAX_TEXT_BYTES - 5 - SHAPE_BYTES));
  addReply(ticket.id, 'hi');
  finish(run);

  const { handoff } = chainNext(ALPHA);

  assert.ok(handoff, 'the hand-off is still posted');
  assert.ok(Buffer.byteLength(handoff.body, 'utf8') <= MAX_TEXT_BYTES, 'the body stays at or under the byte limit');
  assert.equal(reread(ticket.id).live, true, 'the ticket is still taken');
});

test('a ticket with no comments hands over its body byte for byte even when the body sits near the byte limit', (t) => {
  tempDeck(t);
  const run = registerRun({ repo: ALPHA, pid: process.pid });
  const ticket = aTicket('Next', 'x'.repeat(MAX_TEXT_BYTES - 10 - SHAPE_BYTES));
  finish(run);

  assert.equal(chainNext(ALPHA).handoff.body, ticket.body);
});

test('reopen and close markers are not comments', (t) => {
  tempDeck(t);
  const run = registerRun({ repo: ALPHA, pid: process.pid });
  const ticket = aTicket('Next', 'spec');
  addReply(ticket.id, 'first real comment');
  resolveItem(ticket.id, 'not now');
  reopenItem(ticket.id);
  addReply(ticket.id, 'second real comment');
  finish(run);

  const { body } = chainNext(ALPHA).handoff;
  const said = body.split(COMMENTS)[1].split('\n\n').map((block) => block.replace(/^.*?: /, ''));

  assert.deepEqual(said, ['first real comment', 'second real comment']);
  assert.doesNotMatch(body, /Closed with:|Reopened\.|Closed\./);
});

// --- handoff-over-mark S1: a finish under the mark takes the next ticket in place ---

const DECK_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const advisory = () => guard.marksFor(guard.PILOT_REFERENCE_WINDOW).advisory;

test('a finish under the mark takes the head and posts nothing', (t) => {
  tempDeck(t);
  const run = registerRun({ repo: ALPHA, pid: process.pid });
  const ticket = aTicket('Next', 'spec');
  finish(run);
  const asked = [];

  const result = chainNext(ALPHA, { pastMark: (dir) => (asked.push(dir), false) });

  assert.deepEqual(result, { handoff: null, reason: 'under the mark', taken: [ticket.id] });
  assert.deepEqual(asked, [ALPHA], 'the mark is read for the finishing directory');
  assert.deepEqual(handoffs(), [], 'no hand-off, so nothing for pilot run to /clear on');
  assert.equal(reread(ticket.id).live, true, 'the head is taken live in place');
});

test("the chain follows the guard's mark through the default pastMark", async (t) => {
  for (const [tokens, under] of [[advisory() - 1, true], [advisory() + 1, false]]) {
    await t.test(`${tokens} tokens`, (st) => {
      tempDeck(st);
      snapshotAt(st, ALPHA, tokens);
      const run = registerRun({ repo: ALPHA, pid: process.pid });
      const ticket = aTicket('Next', 'spec');
      finish(run);

      const result = chainNext(ALPHA);

      if (under) assert.deepEqual(result, { handoff: null, reason: 'under the mark', taken: [ticket.id] });
      else assert.equal(result.handoff.next, ticket.id);
    });
  }
});

test('over the mark the hand-off stands', (t) => {
  tempDeck(t);
  const run = registerRun({ repo: ALPHA, pid: process.pid });
  const ticket = aTicket('Run 2', 'spec');
  finish(run);

  const { handoff } = chainNext(ALPHA, { pastMark: () => true });

  assert.equal(handoff.title, 'Next run: Run 2');
  assert.equal(reread(ticket.id).live, true);
});

test('no reading hands off as today', (t) => {
  tempDeck(t);
  const run = registerRun({ repo: ALPHA, pid: process.pid });
  const ticket = aTicket('Next', 'spec');
  finish(run);

  const { handoff } = chainNext(ALPHA, { pastMark: () => null });

  assert.equal(handoff.next, ticket.id, 'null is never read as under (spec 4, L9)');
  assert.equal(handoffs().length, 1);
});

test('no deck test reads the real home snapshot', () => {
  assert.ok(os.homedir().startsWith(path.join(os.tmpdir(), 'pilot-home-')), "the default pastMark reads a home of the suite's own");
});

test('no copy of the mark in deck/', () => {
  const mark = new RegExp(['225', '000'].join(',?'));
  const holders = fs.readdirSync(DECK_DIR, { recursive: true })
    .filter((name) => !name.split(path.sep).includes('node_modules') && /\.(mjs|js|json|md|html|css)$/.test(name))
    .filter((name) => mark.test(fs.readFileSync(path.join(DECK_DIR, name), 'utf8')));
  assert.deepEqual(holders, []);
});
