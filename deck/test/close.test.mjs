/**
 * Slice S6, spec 7: the user can close a question. Slice S9, spec 14: Close
 * asks first, in the row it always shared with Reply; since S3 of
 * handoff-failed-confirm, in place on the one seam (`confirm.test.mjs` presses it).
 *
 * An open `question` thread has a Close button beside Reply. The first press
 * shows a confirm in its place; the same press again closes the thread and
 * hands the pilot a user message `Closed.` through `deck_read`/`deck_wait`,
 * like any reply (L12), which the pilot reads as "go with your recommended
 * default" (L23). A `signoff` or a `walkthrough` never gets Close, because a
 * gate is passed by the user's explicit word and never by a button that also
 * means "go away" (L11). Reopen still undoes it.
 */

import './no-open.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { deckOnAPort, tempDeck } from '../testUtils.mjs';
import { CLOSED, CLOSED_BY_USER, KIND_CHAT, isOpen, messagesOf } from '../items.mjs';
import { renderHomePage, renderThreadPage } from '../ui/render.mjs';

const {
  closeItem,
  createThread,
  currentSeq,
  listItems,
  listStoredRuns,
  postItem,
  registerRun,
  reopenItem,
  resolveItem,
} = await import('../store.mjs');

// --- harness ---------------------------------------------------------------

const REPO = 'D:/work/pilot';

const aQuestion = () => ({ kind: 'question', title: 'Which port?', body: '4321?', repo: REPO });
const aSignoff = () => ({ kind: 'signoff', title: 'Ship it?', body: 'Ready?', repo: REPO });
const aWalkthrough = () => ({
  kind: 'walkthrough',
  title: 'Try the feature',
  body: 'Go through it',
  repo: REPO,
  screens: ['open the app'],
});

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

const pressClose = (base, id, headers = {}, fields = {}) =>
  fetch(`${base}/close`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', ...headers },
    body: new URLSearchParams({ id, ...fields }),
    redirect: 'manual',
  });

// --- the store ---------------------------------------------------------------

test('closeItem closes a question with the fixed resolution and a seq\'d user message "Closed."', (t) => {
  tempDeck(t);
  const item = postItem(aQuestion());
  const seqBefore = currentSeq();

  closeItem(item.id);

  const after = reread(item.id);
  assert.equal(CLOSED_BY_USER, 'Closed by you.');
  assert.equal(CLOSED, 'Closed.');
  assert.ok(!isOpen(after), 'the thread reads closed');
  assert.equal(after.resolution, CLOSED_BY_USER);
  const last = messagesOf(after).at(-1);
  assert.equal(last.from, 'user', 'the user\'s line, so deck_wait hands it over as a reply');
  assert.equal(last.text, CLOSED);
  assert.equal(last.seq, seqBefore + 1, 'with a sequence number, or the pilot would never hear it (L12)');
  assert.equal(currentSeq(), seqBefore + 1);
});

test('closeItem refuses a signoff and a walkthrough, and writes nothing (L11)', (t) => {
  tempDeck(t);
  for (const gate of [postItem(aSignoff()), postItem(aWalkthrough())]) {
    const seqBefore = currentSeq();
    assert.throws(() => closeItem(gate.id), { name: 'DeckRefusal' }, `a ${gate.kind} is passed by the user's word`);
    assert.ok(isOpen(reread(gate.id)), 'still open');
    assert.equal(messagesOf(reread(gate.id)).length, 0, 'nothing said');
    assert.equal(currentSeq(), seqBefore, 'nobody woken');
  }
});

test('closeItem refuses a kind the deck does not know — that is Dismiss\'s', (t) => {
  tempDeck(t);
  const handoff = postItem({ kind: 'handoff', title: 'Context is at 40%', body: 'b', repo: REPO });
  assert.throws(() => closeItem(handoff.id), { name: 'DeckRefusal' });
  assert.ok(isOpen(reread(handoff.id)));
});

test('closeItem refuses a thread already closed and one that is not there', (t) => {
  tempDeck(t);
  const closed = resolveItem(postItem(aQuestion()).id, 'we went with 4321');
  assert.throws(() => closeItem(closed.id), /is closed/);
  assert.throws(() => closeItem('itm_nothing'), /no item itm_nothing/);
});

test('Reopen undoes a Close', (t) => {
  tempDeck(t);
  const item = postItem(aQuestion());
  closeItem(item.id);

  reopenItem(item.id);

  const after = reread(item.id);
  assert.ok(isOpen(after), 'open again');
  assert.deepEqual(
    messagesOf(after).map((message) => message.text),
    [CLOSED],
    'the history keeps the Close, adds no "Reopened.", and repeats nothing the user said under the pilot',
  );
});

// --- the page -----------------------------------------------------------------

/** The reply form's last row, on a question's own thread page. */
const sendRow = (page) => /<div class="send"[^>]*>(?:<div[^>]*>.*?<\/div>|.)*?<\/div>/s.exec(page)?.[0] ?? null;

test('Reply and Close are one row, the confirm row, and Close carries its confirm step, hidden', (t) => {
  tempDeck(t);
  const question = postItem({ ...aQuestion(), options: ['4321', '4322'] });

  const row = sendRow(renderThreadPage(reread(question.id), listItems()));
  const target = `close-${question.id}`;

  assert.ok(row, 'the reply form ends in one .send row');
  assert.match(row, /^<div class="send" data-confirm-row><button type="submit">Reply<\/button>/, 'Reply is in it, and it is the confirm row');
  // A submit, so a browser with no script posts on the first press (spec 14).
  assert.match(row, new RegExp(`<button type="submit" form="${target}" data-confirm>Close</button>`), 'Close, the trigger');
  assert.match(
    row,
    new RegExp(`<div class="step sure" hidden><p>Close this thread\\? The pilot goes with its default\\.</p><button type="submit" form="${target}">Confirm</button></div></div>$`),
    'its sentence and Confirm, hidden until asked',
  );
});

test('a Close with no options to default to asks only to close', (t) => {
  tempDeck(t);
  const user = { id: 'itm_0123456789ab', kind: 'user', title: 'Mine', body: 'b', repo: REPO, replies: [] };
  for (const item of [reread(postItem(aQuestion()).id), user]) {
    const row = sendRow(renderThreadPage(item, [item]));
    assert.match(row, /<p>Close this thread\?<\/p>/, `${item.kind}: no default to go with`);
  }
});

test("every Close button names the close form by id, which carries only the thread's own id", (t) => {
  tempDeck(t);
  const question = postItem(aQuestion());
  const target = `close-${question.id}`;

  const page = renderThreadPage(reread(question.id), listItems());

  assert.equal(
    (page.match(new RegExp(`form="${target}"`, 'g')) ?? []).length,
    2,
    'the trigger and Confirm both point at the same form',
  );
  assert.match(
    page,
    new RegExp(
      `<form id="${target}" class="close" method="post" action="/close" data-in-place>` +
        `<input type="hidden" name="id" value="${question.id}" /></form>`,
    ),
    'the form itself is otherwise empty',
  );
});

test('a signoff, a walkthrough and a chat offer Reply alone; a closed question and a card offer neither', (t) => {
  tempDeck(t);
  // The gates first: a signoff cannot go up over an open question (S10, L22).
  const signoff = postItem(aSignoff());
  const walkthrough = postItem(aWalkthrough());
  registerRun({ repo: REPO, pid: process.pid });
  const chat = listItems().find((item) => item.kind === KIND_CHAT);
  const closed = resolveItem(postItem(aQuestion()).id, 'settled');

  for (const item of [signoff, walkthrough, chat]) {
    const row = sendRow(renderThreadPage(reread(item.id), listItems()));
    assert.equal(row, '<div class="send"><button type="submit">Reply</button></div>', `no Close on this ${item.kind}`);
  }

  const closedPage = renderThreadPage(reread(closed.id), listItems());
  assert.ok(!closedPage.includes('action="/close"'), 'a closed question has no Close either');

  const home = renderHomePage(listItems(), listStoredRuns(), REPO, true);
  assert.ok(!home.includes('action="/close"'), 'Close is the thread page\'s, not a card\'s');
});

// --- the route ------------------------------------------------------------------

test('pressing Close lands back on the thread, and a parked deck_wait returns "Closed." for it', async (t) => {
  const base = await deckOnAPort(t);
  const item = postItem(aQuestion());

  const drained = await payloadOf(await callApi(base, 'deck_wait', { since: 0, timeout: 200 }));
  const waiting = callApi(base, 'deck_wait', { since: drained.seq, timeout: 30_000 });

  const answer = await pressClose(base, item.id);
  assert.equal(answer.status, 303);
  assert.equal(answer.headers.get('location'), `/thread/${item.id}`, 'no #reply: a closed thread has no reply box');

  const payload = await payloadOf(await waiting);
  assert.deepEqual(
    payload.replies.map((reply) => ({ itemId: reply.itemId, from: reply.from, text: reply.text })),
    [{ itemId: item.id, from: 'user', text: CLOSED }],
    'the pilot hears it like any reply',
  );
  assert.ok(!isOpen(reread(item.id)), 'and the thread is closed');
});

test('pressing Close on a signoff is refused and leaves it open', async (t) => {
  const base = await deckOnAPort(t);
  const signoff = postItem(aSignoff());

  const answer = await pressClose(base, signoff.id);

  assert.ok(answer.status >= 400 && answer.status < 500, `refused, got ${answer.status}`);
  assert.ok(isOpen(reread(signoff.id)));
});

test('the deck refuses a Close posted from somewhere else', async (t) => {
  const base = await deckOnAPort(t);
  const item = postItem(aQuestion());

  const answer = await pressClose(base, item.id, { origin: 'http://evil.example' });

  assert.equal(answer.status, 403, 'the same guard every other write on the page is behind');
  assert.ok(isOpen(reread(item.id)), 'and the question is still open');
});

// --- Close on a user thread's card (deck-polish spec 9, L9) ------------------

/** The one card on a page whose title is `title`. */
const cardOf = (page, title) => {
  const at = page.indexOf(`>${title}</a></h2>`);
  assert.ok(at > -1, `a card titled ${title} is on the page`);
  return page.slice(page.lastIndexOf('<article', at), page.indexOf('</article>', at));
};

/** An open user thread, Create's own, on a repository the deck knows. */
const aUserThread = () => {
  registerRun({ repo: REPO, pid: process.pid });
  return createThread({ name: 'Tidy the docs', repo: REPO });
};

test("a user thread's card carries Close, confirmed in place; a question's card does not", (t) => {
  tempDeck(t);
  const thread = aUserThread();
  const question = postItem(aQuestion());
  const home = renderHomePage(listItems(), listStoredRuns(), REPO, true);

  const card = cardOf(home, thread.title);
  const to = `form="close-${thread.id}"`;
  assert.match(card, new RegExp(`<div class="send" data-confirm-row><button type="submit" ${to} data-confirm>Close</button>`), 'the trigger');
  assert.match(card, new RegExp(`<div class="step sure" hidden><p>[^<]+</p><button type="submit" ${to}>Confirm</button>`), 'then its step');
  assert.match(card, new RegExp(`<form id="close-${thread.id}" class="close" method="post" action="/close" data-in-place>`));
  assert.match(card, new RegExp(`name="id" value="${thread.id}" /><input type="hidden" name="back" value="[^"]+" />`));

  assert.ok(!cardOf(home, question.title).includes('action="/close"'), "spec 9 names user threads, not questions");
});

test('closing from a card returns to the page it was pressed on', async (t) => {
  const base = await deckOnAPort(t);
  const thread = aUserThread();

  const answer = await pressClose(base, thread.id, {}, { back: '/' });

  assert.equal(answer.status, 303);
  assert.equal(answer.headers.get('location'), '/');
  const after = reread(thread.id);
  assert.ok(!isOpen(after), 'closed, after a re-read of the store');
  assert.equal(messagesOf(after).at(-1).text, CLOSED, 'and the pilot still hears "Closed."');
});

test('/close with no back still lands on the thread', async (t) => {
  const base = await deckOnAPort(t);
  const thread = aUserThread();

  const answer = await pressClose(base, thread.id);

  assert.equal(answer.headers.get('location'), `/thread/${thread.id}`);
});

test('a foreign back is not followed', async (t) => {
  const base = await deckOnAPort(t);
  const thread = aUserThread();

  const answer = await pressClose(base, thread.id, {}, { back: '//evil.example/' });

  assert.equal(answer.status, 303);
  assert.equal(answer.headers.get('location'), `/thread/${thread.id}`, 'backPath refuses it; the thread is the fallback');
});
