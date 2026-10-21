/**
 * Slice S12, spec 21: a resolved thread can be reopened by the user.
 *
 * The pilot closes a thread and the user may disagree. Until now their only
 * move was to post nothing — `writeToThread` refuses a closed thread, so the
 * argument was over whoever was right. Reopening gives the disagreement back to
 * the user: one button on the thread's own page, one click, no confirm.
 *
 * What the tests are shaped around is the second half of the claim, which is
 * the expensive half: the item is open *in every sense*. Openness is read in
 * seven places and only one of them is this slice's own code, so most of what
 * is below asserts against the real reader — the home page's queue, `deck_read`
 * with `open`, the `Yours` column, and a session parked in `deck_wait` — rather than against
 * `isOpen` twice. A path missed here is a thread the user has reopened that the
 * pilot never hears about, which is the failure the whole slice exists to stop.
 */

import './no-open.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

import { deckOnAPort, tempDeck } from '../testUtils.mjs';
import { CLOSED_WITH, appearsInYours, messagesOf, threadState } from '../items.mjs';

const { awaitsPilot } = createRequire(import.meta.url)('../../hooks/lib/deck.js');
import { queueOf } from '../status.mjs';
import { renderHomePage, renderThreadPage } from '../ui/render.mjs';

const { addReply, closeItem, currentSeq, listItems, listStoredRuns, postItem, reopenItem, resolveItem } =
  await import('../store.mjs');

// --- harness ---------------------------------------------------------------

const aQuestion = () => ({ kind: 'question', title: 'Which port?', body: '4321?', repo: 'D:/work/pilot' });

/** A thread the pilot has closed, which is where every test here starts. */
const aClosedThread = (resolution = 'we went with 4321') =>
  resolveItem(postItem(aQuestion()).id, resolution);

const reread = (id) => listItems().find((candidate) => candidate.id === id);

const callApi = (base, name, args = {}) =>
  fetch(`${base}/api/tool`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name, arguments: args }),
  });

const payloadOf = async (response) => {
  const result = await response.json();
  assert.equal(result.content?.[0]?.type, 'text', `expected MCP text, got ${JSON.stringify(result)}`);
  return JSON.parse(result.content[0].text);
};

const pressReopen = (base, id) =>
  fetch(`${base}/reopen`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ id }),
    redirect: 'manual',
  });

const replyInBrowser = (base, id, text) =>
  fetch(`${base}/reply`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ id, text }),
    redirect: 'manual',
  });

// --- the store: the resolution moves into the thread ------------------------

test('reopening clears the resolution and leaves the closing words in the thread', (t) => {
  tempDeck(t);
  const closed = aClosedThread('we went with 4321');

  const item = reopenItem(closed.id);

  assert.equal(item.resolvedAt, undefined, 'nothing is left saying the thread is closed');
  assert.equal(item.resolution, undefined, 'and the field the renderer reads is cleared with it');
});

// --- L8: reopening is silent -------------------------------------------------

test('reopening adds no user message and leaves the sequence number alone', (t) => {
  tempDeck(t);
  const closed = aClosedThread('we went with 4321');
  const seqBefore = currentSeq();

  const item = reopenItem(closed.id);

  assert.deepEqual(item.replies.filter((reply) => reply.from === 'user'), [], 'the user said nothing by pressing Reopen');
  assert.ok(!messagesOf(item).some((message) => message.text === 'Reopened.'), 'and the thread holds no "Reopened."');
  assert.equal(currentSeq(), seqBefore, "the deck's sequence number is where it was");
});

test("a pilot's resolution is still kept as its no-seq history line", (t) => {
  tempDeck(t);
  const closed = aClosedThread('we went with 4321');

  const messages = messagesOf(reopenItem(closed.id));

  assert.equal(messages.length, 1, 'the closing words, and nothing after them');
  assert.deepEqual(
    { from: messages[0].from, text: messages[0].text, repliedAt: messages[0].repliedAt },
    { from: 'pilot', text: 'Closed with: we went with 4321', repliedAt: closed.resolvedAt },
    'the pilot said it, when it said it, and the words are kept exactly',
  );
  assert.equal(messages[0].seq, undefined, 'with no sequence number, so it wakes nobody');
});

test('a wait taken before the reopen is not woken by it', (t) => {
  tempDeck(t);
  const closed = aClosedThread();
  const baseline = currentSeq();

  const item = reopenItem(closed.id);

  assert.equal(awaitsPilot(item, baseline), false, 'a reopened thread is not the user speaking');
  assert.equal(currentSeq(), baseline, 'and nothing past the baseline was written for a wait to find');
});

test('a thread the user closed and then reopened wakes no wait taken after the Close', (t) => {
  // The user's "Closed." carries a seq and wakes the pilot when it is pressed; the
  // reopening after it adds nothing, so it is not handed over a second time.
  tempDeck(t);
  const item = postItem(aQuestion());
  closeItem(item.id);
  const baseline = currentSeq();

  const reopened = reopenItem(item.id);

  assert.equal(awaitsPilot(reopened, baseline), false, 'the Close was already heard; the Reopen says nothing new');
  assert.equal(currentSeq(), baseline);
});

test('a reply typed into a closed thread reopens it and wakes the pilot as that reply', (t) => {
  tempDeck(t);
  const closed = aClosedThread();
  const baseline = currentSeq();

  const item = addReply(closed.id, 'no, 4325');

  const last = messagesOf(item).at(-1);
  assert.equal(last.text, 'no, 4325', 'the reply is the last thing in the thread');
  assert.equal(last.seq, currentSeq(), "and carries the deck's new sequence number");
  assert.ok(last.seq > baseline, "past the wait's baseline");
  assert.ok(awaitsPilot(item, baseline), 'so the pilot is woken, by the reply itself');
});

test('the reopened thread shows a reply box and no "Reopened."', (t) => {
  tempDeck(t);
  const closed = aClosedThread();

  const page = renderThreadPage(reopenItem(closed.id), listItems());

  assert.match(page, /<textarea/, 'the box is back');
  assert.ok(!page.includes('Reopened.'), 'and nothing on the page says the user said something they did not');
  assert.ok(!page.includes('action="/reopen"'), 'nor is there a Reopen left to press');
});

test('closing and reopening twice keeps both sets of closing words', (t) => {
  tempDeck(t);
  const closed = aClosedThread('the first answer');
  reopenItem(closed.id);
  resolveItem(closed.id, 'the second answer');

  const texts = messagesOf(reopenItem(closed.id)).map((message) => message.text);

  assert.deepEqual(texts, [
    `${CLOSED_WITH} the first answer`,
    `${CLOSED_WITH} the second answer`,
  ], 'nothing the pilot wrote is ever written over, which is why it is moved and not left in place');
});

test('a thread nobody closed cannot be reopened, and neither can one that is not there', (t) => {
  tempDeck(t);
  const open = postItem(aQuestion());

  assert.throws(() => reopenItem(open.id), /already open/, 'only deck_resolve closes a thread');
  assert.throws(() => reopenItem('itm_nothing'), /no item itm_nothing/);
  assert.equal(messagesOf(reread(open.id)).length, 0, 'and a refusal writes nothing into the thread');
});

// --- everywhere openness is read -------------------------------------------

test('a reopened item is back on the home queue, in Yours, and in deck_read', async (t) => {
  const base = await deckOnAPort(t);
  const closed = aClosedThread();

  const whileClosed = await payloadOf(await callApi(base, 'deck_read', { open: true }));
  assert.deepEqual(whileClosed.items, [], 'the closed thread is nobody\'s next action');
  assert.equal(queueOf(listItems()).length, 0, 'and it is off the queue the home page draws');

  reopenItem(closed.id);

  const after = await payloadOf(await callApi(base, 'deck_read', { open: true }));
  assert.deepEqual(after.items.map((item) => item.id), [closed.id], 'deck_read hands it back');
  assert.deepEqual(queueOf(listItems()).map((item) => item.id), [closed.id], 'the queue has it again');
  assert.ok(appearsInYours(reread(closed.id)), 'and Yours calls it the user\'s next action');
  assert.equal(threadState(reread(closed.id)), 'the pilot replied', 'its closing words are the last thing said');

  const home = renderHomePage(listItems(), listStoredRuns(), 'D:/work/pilot');
  assert.ok(home.includes('Which port?'), 'so the user sees it on the page they started from');
});

// --- the thread takes messages again ---------------------------------------

test('a reply typed after reopening is what deck_wait hands the pilot', async (t) => {
  const base = await deckOnAPort(t);
  const item = postItem(aQuestion());
  await callApi(base, 'deck_resolve', { id: item.id, resolution: 'we went with 4321' });

  assert.equal((await pressReopen(base, item.id)).status, 303, 'the user reopens it from the page');

  // The reopening itself hands the pilot nothing (L8), so a short wait times out empty.
  const drained = await payloadOf(await callApi(base, 'deck_wait', { since: 0, timeout: 400 }));
  assert.deepEqual(drained.replies, [], 'the reopening woke nothing');

  const waiting = callApi(base, 'deck_wait', { since: drained.seq, timeout: 30_000 });
  await replyInBrowser(base, item.id, 'no, 4325, 4321 is the machine\'s');

  const payload = await payloadOf(await waiting);
  assert.deepEqual(
    payload.replies.map((reply) => ({ itemId: reply.itemId, text: reply.text })),
    [{ itemId: item.id, text: 'no, 4325, 4321 is the machine\'s' }],
    'a reply on a reopened thread is delivered like any other',
  );
});

test('deck_resolve closes a reopened thread again', async (t) => {
  const base = await deckOnAPort(t);
  const closed = aClosedThread();
  reopenItem(closed.id);

  await callApi(base, 'deck_resolve', { id: closed.id, resolution: 'settled: 4325' });

  const item = reread(closed.id);
  assert.equal(item.resolution, 'settled: 4325', 'the pilot is still the only one who closes one');
  assert.ok(item.resolvedAt, 'and it is closed');
  assert.equal(queueOf(listItems()).length, 0, 'so it is off the queue again');
});

// --- the page ---------------------------------------------------------------

test('a closed thread carries one Reopen control and an open thread carries none', (t) => {
  tempDeck(t);
  const closed = aClosedThread();

  const open = renderThreadPage(postItem(aQuestion()), listItems());
  assert.ok(!open.includes('/reopen'), 'there is nothing to reopen while the thread is open');

  const page = renderThreadPage(reread(closed.id), listItems());
  assert.equal((page.match(/action="\/reopen"/g) ?? []).length, 1, 'exactly one control');
  assert.match(page, /<form class="reopen" method="post" action="\/reopen" data-in-place>/);
  assert.ok(page.includes(`name="id" value="${closed.id}"`), 'naming the thread it is on');
  assert.match(page, /<button type="submit">Reopen<\/button>/, 'one click, no confirm');
  assert.ok(!/class="sure"/.test(page), 'nothing asks the user twice');
  assert.ok(page.includes('we went with 4321'), 'and the resolution is still on the page above it');
});

test('the home page offers no way to reopen anything', (t) => {
  tempDeck(t);
  const closed = aClosedThread();
  reopenItem(closed.id);
  resolveItem(closed.id, 'closed again');

  const everything = renderHomePage(listItems(), listStoredRuns(), 'D:/work/pilot', true);

  assert.ok(everything.includes('Which port?'), 'the settled thread is listed');
  assert.ok(!everything.includes('/reopen'), 'but reopening is the thread page\'s, and only its');
});

// --- the route --------------------------------------------------------------

test('pressing Reopen lands the browser back on the thread at its reply box', async (t) => {
  const base = await deckOnAPort(t);
  const closed = aClosedThread();

  const answer = await pressReopen(base, closed.id);

  assert.equal(answer.status, 303);
  assert.equal(answer.headers.get('location'), `/thread/${closed.id}#reply`);
  assert.ok(reread(closed.id).resolvedAt === undefined, 'and the thread really was reopened');
});

test('the deck refuses a reopening posted from somewhere else', async (t) => {
  const base = await deckOnAPort(t);
  const closed = aClosedThread();

  const answer = await fetch(`${base}/reopen`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', origin: 'http://evil.example' },
    body: new URLSearchParams({ id: closed.id }),
    redirect: 'manual',
  });

  assert.equal(answer.status, 403, 'the same guard every other write on the page is behind');
  assert.ok(reread(closed.id).resolvedAt, 'and the thread is still closed');
});

// --- a reply typed while the pilot was closing the thread -------------------

test('a reply typed into a thread the pilot has just closed reopens it and is kept', async (t) => {
  // Gate 2, 2026-09-22: the user had a thread page open, the pilot resolved it
  // underneath them, and the reply they had typed was refused and lost — "i dont
  // want that to happen again". Their words are the thing to protect, so the post
  // is taken rather than turned away: it reopens the thread exactly as the Reopen
  // control does, then records what they said. Refusing and re-filling the box was
  // the alternative, and it still costs them a second send.
  const base = await deckOnAPort(t);
  const closed = aClosedThread();

  const answer = await replyInBrowser(base, closed.id, 'I do not agree, and here is why.');

  assert.equal(answer.status, 303, 'the reply is taken, not refused');

  const item = reread(closed.id);
  assert.equal(item.resolvedAt, undefined, 'the thread is open again');
  assert.equal(item.resolution, undefined, 'with no resolution left standing over it');
  assert.deepEqual(
    item.replies.filter((reply) => reply.from === 'user').map((reply) => reply.text),
    ['I do not agree, and here is why.'],
    'the words they actually typed, and no "Reopened." before them',
  );
  assert.ok(
    messagesOf(item).some((message) => message.text.startsWith(CLOSED_WITH)),
    'and the resolution is in the thread as the pilot\'s own closing words',
  );
});

test('the thread page after that reply shows what was typed and a box to type more', async (t) => {
  const base = await deckOnAPort(t);
  const closed = aClosedThread();

  await replyInBrowser(base, closed.id, 'I do not agree, and here is why.');

  const page = renderThreadPage(reread(closed.id));

  assert.match(page, /I do not agree, and here is why\./, 'their reply is on the page');
  assert.match(page, /<textarea/, 'and the box is back, because the thread is open again');
});

test('a reply the deck refuses reopens nothing, so a closed thread stays closed', (t) => {
  // The reopen in `addReply` sits *after* the two checks, and this is what says so:
  // a refusal must not leave the thread open with nothing in it to justify opening.
  tempDeck(t);
  const closed = aClosedThread('we went with 4321');

  assert.throws(() => addReply(closed.id, ''), { name: 'DeckRefusal' }, 'an empty reply');
  assert.throws(
    () => addReply(closed.id, 'the key is AKIAIOSFODNN7EXAMPLE'),
    { name: 'DeckRefusal', message: /AWS access key/ },
    'and one carrying a credential',
  );

  const item = reread(closed.id);
  assert.ok(item.resolvedAt, 'the thread is still closed');
  assert.equal(item.resolution, 'we went with 4321', 'with its resolution untouched');
});
