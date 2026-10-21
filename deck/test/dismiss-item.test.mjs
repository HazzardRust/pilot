/**
 * Slice S17, spec 27: a hand-off item can be dismissed from its own page.
 *
 * A hand-off is posted by a hook, not by the pilot arguing with the user (S12),
 * and A11 makes an unknown kind a perfectly good item with no rendering of its
 * own. Nothing closed it until now — it sat on the home queue and in the
 * status line's waiting count until the pilot happened to read it, which for a
 * kind the pilot never replies to could be never. `dismissItem` is the human at
 * the item's own page saying "seen, done" without pretending an argument
 * happened: the same `resolvedAt` `resolveItem` sets, a fixed resolution
 * instead of a typed one, and none of `resolveItem`'s side effects, for the
 * same reason `reopenItem` calls none of them — this is the human at the page,
 * not a session working.
 *
 * The undo is the Reopen button spec 21 already gives every closed thread, so
 * there is no confirmation here either.
 */

import './no-open.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { deckOnAPort, postStored, tempDeck } from '../testUtils.mjs';
import { CLOSED_WITH, isOpen, messagesOf } from '../items.mjs';
import { queueOf } from '../status.mjs';
import { renderHomePage, renderThreadPage } from '../ui/render.mjs';

const {
  currentSeq,
  dismissItem,
  dismissRun,
  listItems,
  postItem,
  registerRun,
  reopenItem,
  resolveItem,
  storeFile,
} = await import('../store.mjs');

// --- harness ---------------------------------------------------------------

const REPO = 'D:/work/pilot';

const aNote = (overrides = {}) => ({
  kind: 'note',
  title: 'Context is at 40%',
  body: 'Bring the artefact current.',
  repo: REPO,
  ...overrides,
});

const aQuestion = () => ({ kind: 'question', title: 'Which port?', body: '4321?', repo: REPO });

const reread = (id) => listItems().find((candidate) => candidate.id === id);

// `listStoredRuns` excludes a dismissed run on purpose (D13) — dismissal is
// exactly what makes a run un-fresh — so proving one *stays* dismissed reads
// the raw store file underneath it, the same way `reopen.test.mjs` reads the
// status line's count through the file rather than through a narrowed view.
const rawRuns = () => JSON.parse(fs.readFileSync(storeFile(), 'utf8')).runs ?? [];

const pressDismiss = (base, id) =>
  fetch(`${base}/dismiss-item`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ id }),
    redirect: 'manual',
  });

// --- the store ---------------------------------------------------------------

test('dismissItem closes the thread with a fixed resolution and touches neither the run nor the seq', (t) => {
  tempDeck(t);
  const run = registerRun({ repo: REPO, pid: process.pid });
  const item = postStored(aNote());
  // Dismissed after the post, not before it: postItem's own touchRuns would
  // otherwise clear this on its way past, and the run would read undismissed
  // for a reason that has nothing to do with what this test is proving.
  dismissRun(run.id);
  const seqBefore = currentSeq();

  dismissItem(item.id);

  const after = reread(item.id);
  assert.ok(after.resolvedAt, 'the thread reads closed, the same field resolveItem sets');
  assert.equal(after.resolution, 'Dismissed by the user.', 'the fixed resolution, not a typed one (A9)');
  assert.equal(messagesOf(after).length, 0, 'no reply is pushed — this is not an argument');
  assert.equal(currentSeq(), seqBefore, 'no seq bump — nobody parked in deck_wait needs to hear about this');
  assert.ok(
    rawRuns().find((candidate) => candidate.id === run.id).dismissedAt,
    'touchRuns was never called, so the run the user dismissed stays dismissed',
  );
});

test('dismissing a thread that is already closed is refused, the same as any other write to one', (t) => {
  tempDeck(t);
  const closed = resolveItem(postStored(aNote()).id, 'closed already');

  assert.throws(() => dismissItem(closed.id), /is closed/);
});

// L27: Dismiss is for a kind the deck does not know, not a way around the
// pilot's own tools. Only the button's visibility enforced that until now, so
// a crafted same-origin POST could close a question the pilot is parked on —
// dismissItem must refuse it itself, the same as any other refusal here.
test('dismissItem refuses a kind the deck already knows how to hand off, and takes an unknown kind as before', (t) => {
  tempDeck(t);
  const question = postItem(aQuestion());
  const note = postStored(aNote());

  assert.throws(() => dismissItem(question.id), { name: 'DeckRefusal' }, 'a question is the pilot\'s to close');
  assert.ok(isOpen(reread(question.id)), 'and the refusal wrote nothing');

  dismissItem(note.id);
  assert.ok(!isOpen(reread(note.id)), 'an unknown kind is still dismissed exactly as before');
});

test('dismissing an item that is not there is refused', (t) => {
  tempDeck(t);
  assert.throws(() => dismissItem('itm_nothing'), /no item itm_nothing/);
});

// --- everywhere openness is read ---------------------------------------------

test('a dismissed item leaves the home queue and the status line\'s waiting count', (t) => {
  tempDeck(t);
  const item = postStored(aNote());

  assert.deepEqual(queueOf(listItems()).map((candidate) => candidate.id), [item.id], 'waiting, like any open item');

  dismissItem(item.id);

  assert.deepEqual(queueOf(listItems()), [], 'off the queue the home page draws');
});

// --- the page -----------------------------------------------------------------

test('Dismiss renders for an unknown kind and for none of the known ones', (t) => {
  tempDeck(t);
  const note = postStored(aNote());
  // The sign-off first: the deck holds one back while a question is open (L22).
  const signoff = postItem({ kind: 'signoff', title: 'Ship it?', body: 'Ready?', repo: REPO });
  const question = postItem(aQuestion());
  const walkthrough = postItem({
    kind: 'walkthrough',
    title: 'Try the feature',
    body: 'Go through it',
    repo: REPO,
    screens: ['open the app'],
  });

  const notePage = renderThreadPage(reread(note.id), listItems());
  assert.match(notePage, /action="\/dismiss-item"/, 'a kind the deck does not know carries Dismiss');
  assert.match(notePage, /<button type="submit">Dismiss<\/button>/, 'one click, no confirm');
  assert.ok(!/class="sure"/.test(notePage), 'nothing asks the user twice');

  for (const known of [question, signoff, walkthrough]) {
    const page = renderThreadPage(reread(known.id), listItems());
    assert.ok(
      !page.includes('action="/dismiss-item"'),
      `a ${known.kind} page carries no Dismiss — the deck already knows what to do with it`,
    );
  }
});

test('a closed thread reads simply "closed", whoever closed it', (t) => {
  tempDeck(t);
  const dismissed = postStored(aNote());
  dismissItem(dismissed.id);
  const resolved = postItem(aQuestion());
  resolveItem(resolved.id, 'we went with 4321');

  const dismissedPage = renderThreadPage(reread(dismissed.id), listItems());
  const resolvedPage = renderThreadPage(reread(resolved.id), listItems());

  for (const page of [dismissedPage, resolvedPage]) {
    assert.match(page, /class="who">closed · /, 'who closed it now lives in the resolution text, not the byline');
    assert.ok(!page.includes('closed by the pilot'), 'the byline no longer names the pilot by default');
  }
  assert.match(dismissedPage, /Dismissed by the user\./, 'and the words above it say who');
  assert.match(resolvedPage, /we went with 4321/);
});

// --- the route ------------------------------------------------------------

test('pressing Dismiss closes the thread and lands the browser back on it', async (t) => {
  const base = await deckOnAPort(t);
  const item = postStored(aNote());

  const answer = await pressDismiss(base, item.id);

  assert.equal(answer.status, 303);
  assert.equal(answer.headers.get('location'), `/thread/${item.id}`);
  assert.ok(reread(item.id).resolvedAt, 'and the thread really was dismissed');
});

test('the deck refuses a dismissal posted from somewhere else', async (t) => {
  const base = await deckOnAPort(t);
  const item = postStored(aNote());

  const answer = await fetch(`${base}/dismiss-item`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', origin: 'http://evil.example' },
    body: new URLSearchParams({ id: item.id }),
    redirect: 'manual',
  });

  assert.equal(answer.status, 403, 'the same guard every other write on the page is behind');
  assert.ok(isOpen(reread(item.id)), 'and the thread is still open');
});

// --- and on the card, since Gate 2 (spec 27, amended 2026-09-23) -----------

/**
 * The user at Gate 2, overruling L27's "thread page only" and spec 27's own
 * "the home-page card is unchanged — a hand-off card has no form today and
 * gains none": a card of a kind the deck does not know carries Dismiss and
 * Reply, so being finished with one no longer means opening it first.
 *
 * Dismiss is the same route and the same one click. What is new is that the
 * button is an *option* — `name="choice"`, which the route reads not at all —
 * so the card marks itself taken through the mechanism spec 18 already has,
 * rather than through a second one invented for it.
 *
 * The runs are left empty on purpose: a tab built from items alone is a real
 * page state (D4 of run-tabs), and what these are about is the card.
 */
const cardFor = (id, page) =>
  [...page.matchAll(/<article[^>]*>[\s\S]*?<\/article>/g)]
    .map(([card]) => card)
    .find((card) => card.includes(id)) ?? '';

test('a card of a kind the deck does not know carries Dismiss and Reply', (t) => {
  tempDeck(t);
  const note = postStored(aNote());

  const card = cardFor(note.id, renderHomePage(listItems(), [], REPO));

  assert.match(card, /<form method="post" action="\/dismiss-item">/, 'the route the thread page uses');
  assert.ok(card.includes(`name="id" value="${note.id}"`), 'naming this item and no other');
  assert.match(
    card,
    /<button type="submit" name="choice" value="Dismiss"[^>]*>Dismiss<\/button>/,
    'an option like any other, so the spec 18 mark is the one that already exists',
  );
  assert.ok(
    card.includes(`<a class="to-thread" href="/thread/${note.id}#reply">Reply</a>`),
    'and Reply is a plain link into the thread`s own box',
  );
  assert.ok(!card.includes('<textarea'), 'no box on the card: typing belongs on the thread');
  assert.ok(!card.includes('class="sure"'), 'and nothing asks twice — Reopen is the undo (L26)');
});

test('a question card and a sign-off card are untouched by it', (t) => {
  tempDeck(t);
  // The sign-off first: the deck holds one back while a question is open (L22).
  const signoff = postItem({ kind: 'signoff', title: 'Ship it?', body: 'Ready?', repo: REPO });
  const question = postItem(aQuestion());
  const page = renderHomePage(listItems(), [], REPO);

  for (const known of [question, signoff]) {
    const card = cardFor(known.id, page);
    assert.match(card, /action="\/reply"/, `a ${known.kind} card still answers on the reply route`);
    assert.ok(!card.includes('/dismiss-item'), `a ${known.kind} card carries no Dismiss`);
    assert.ok(!card.includes('to-thread'), 'nor a Reply link: it has options to press');
  }
});

test('a dismissed card offers nothing at all, on the page it was dismissed from', (t) => {
  tempDeck(t);
  const note = postStored(aNote());
  dismissItem(note.id);

  const card = cardFor(note.id, renderHomePage(listItems(), [], REPO, true));

  assert.ok(card, 'the card is still there to look up with Everything on');
  assert.ok(!card.includes('/dismiss-item'), 'but a closed thread is not dismissed again');
  assert.ok(!card.includes('to-thread'), 'and the row is gone with it');
});

test('the card`s own fields dismiss the item through the route, choice and all', async (t) => {
  const base = await deckOnAPort(t);
  const item = postStored(aNote());

  // Exactly what a browser running no script posts from that card: the hidden
  // id, and the button that was pressed. The route reads the id and ignores the
  // rest, which is what lets the spec 18 mark ride on a field of its own.
  const answer = await fetch(`${base}/dismiss-item`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ id: item.id, choice: 'Dismiss' }),
    redirect: 'manual',
  });

  assert.equal(answer.status, 303);
  assert.equal(answer.headers.get('location'), `/thread/${item.id}`, 'landing on the thread it closed');
  assert.ok(reread(item.id).resolvedAt, 'the item really was dismissed');
  assert.deepEqual(
    messagesOf(reread(item.id)),
    [],
    'and `choice` reached no thread: it is the mark`s field, not a reply',
  );
});

test('the thread page`s own Dismiss is unchanged by the card gaining one', (t) => {
  tempDeck(t);
  const note = postStored(aNote());

  const page = renderThreadPage(reread(note.id), listItems());

  assert.match(page, /<form class="dismiss-item" method="post" action="\/dismiss-item" data-in-place>/);
  assert.match(page, /<button type="submit">Dismiss<\/button>/, 'one click, no `choice`, no confirm');
});

// --- undoing it -------------------------------------------------------------

test('Reopen after Dismiss puts the item back with the dismissal still in the thread', (t) => {
  tempDeck(t);
  const item = postStored(aNote());
  dismissItem(item.id);

  const reopened = reopenItem(item.id);

  assert.equal(reopened.resolvedAt, undefined, 'open again');
  assert.equal(reopened.resolution, undefined);
  const texts = messagesOf(reopened).map((message) => message.text);
  assert.deepEqual(
    texts,
    [`${CLOSED_WITH} Dismissed by the user.`],
    'the dismissal is kept in the thread as the closing words, exactly as a resolution would be',
  );
  assert.deepEqual(queueOf(listItems()).map((candidate) => candidate.id), [item.id], 'and it is waiting again');
});
