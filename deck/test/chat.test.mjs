/**
 * Slice S2 of deferred-ledger, spec 4–7: the user talks to the pilot in Chat.
 *
 * A repository's chat is one item of kind `chat`, made by the daemon inside
 * `registerRun`'s one write (L5, ADR 0031). It is open and never waiting: the
 * queue, a tab's count and Notifications skip it through `isQueued` (L6), and
 * no writer can end it (L7). It is not in `KINDS`, so `deck_post` neither
 * advertises nor accepts it (L4). A message sent in it reaches the parked
 * `deck_wait` of its own repository and no other, through the reply path every
 * thread already uses.
 */

import './no-open.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';

import { deckOnAPort, tempDeck } from '../testUtils.mjs';
import { KINDS, KIND_CHAT, appearsInYours, isKnownKind, isOpen, isQueued, messagesOf } from '../items.mjs';
import { queueOf } from '../status.mjs';
import { tabsOf } from '../tabs.mjs';
import { TOOLS } from '../tools.mjs';
import { renderHomePage, renderThreadPage } from '../ui/render.mjs';

const {
  addPilotMessage,
  dismissItem,
  listItems,
  listRuns,
  listStoredRuns,
  postItem,
  registerRun,
  resolveItem,
} = await import('../store.mjs');

// --- harness ---------------------------------------------------------------

const ALPHA = 'D:/work/alpha';
const BETA = 'D:/work/beta';

/** The L7 sentence, which every refusal to end a chat says. */
const NEVER_CLOSED = /a chat is never closed; answer it with deck_reply/;

const chatsOf = (items = listItems()) => items.filter((item) => item.kind === KIND_CHAT);
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

const sendInChat = (base, id, text) =>
  fetch(`${base}/reply`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', origin: base },
    body: new URLSearchParams({ id, text, choice: '' }),
    redirect: 'manual',
  });

const sleeper = (t) => {
  const child = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 120000)'], { stdio: 'ignore' });
  t.after(() => child.kill());
  return child;
};
const exited = (child) => new Promise((resolve) => child.on('exit', resolve));

// --- the kind --------------------------------------------------------------

test('chat is a kind the deck knows, but not one deck_post advertises (L4)', () => {
  assert.equal(KIND_CHAT, 'chat');
  assert.ok(isKnownKind(KIND_CHAT), 'known, so Dismiss is never drawn or accepted for it');
  assert.ok(!KINDS.includes(KIND_CHAT), 'and not in KINDS, which is the tool surface');
  const post = TOOLS.find((tool) => tool.name === 'deck_post');
  assert.doesNotMatch(JSON.stringify(post), /\bchat\b/, 'the deck_post description never names it');
});

test('isQueued is open and not a chat; isOpen is unchanged (L6)', () => {
  assert.equal(isQueued({ kind: 'question' }), true);
  assert.equal(isQueued({ kind: 'question', resolvedAt: '2026-09-24T00:00:00Z' }), false);
  assert.equal(isQueued({ kind: KIND_CHAT }), false);
  assert.equal(isOpen({ kind: KIND_CHAT }), true, 'the chat is open; deck_read {open:true} returns it');
  assert.equal(appearsInYours({ kind: KIND_CHAT }), false, 'but never waiting, so never in Yours');
});

// --- one per repository ------------------------------------------------------

test('registering a run gives its repository exactly one chat, and a second registration adds none', (t) => {
  tempDeck(t);
  registerRun({ repo: ALPHA, pid: process.pid });
  registerRun({ repo: ALPHA, pid: process.pid });
  registerRun({ repo: `${ALPHA}/`, pid: process.pid });
  if (process.platform === 'win32') registerRun({ repo: 'd:/WORK/Alpha', pid: process.pid });

  const chats = chatsOf();
  assert.equal(chats.length, 1, 'one chat per repoKey, however the path is spelled');
  assert.equal(chats[0].repo, ALPHA, 'hung on the repository that registered first');
  assert.ok(isOpen(chats[0]));
  assert.deepEqual(messagesOf(chats[0]), [], 'and nothing said in it yet');

  registerRun({ repo: BETA, pid: process.pid });
  assert.deepEqual(
    chatsOf().map((chat) => chat.repo),
    [ALPHA, BETA],
    'a second repository gets its own',
  );
});

test('deck_post with kind chat is refused: the deck makes a chat itself (L4)', async (t) => {
  tempDeck(t);
  assert.throws(
    () => postItem({ kind: KIND_CHAT, title: 'Chat', body: 'hi', repo: ALPHA }),
    { name: 'DeckRefusal', message: /the deck makes a repository's chat itself/ },
  );
  assert.equal(chatsOf().length, 0);
});

// --- never waiting --------------------------------------------------------------

test('the queue, the tab\'s open and Notifications omit the chat (spec 6)', (t) => {
  tempDeck(t);
  registerRun({ repo: ALPHA, pid: process.pid });
  const question = postItem({ kind: 'question', title: 'Which port?', body: '4321?', repo: ALPHA });
  const [chat] = chatsOf();

  const items = listItems();
  assert.deepEqual(queueOf(items).map((item) => item.id), [question.id]);
  const [tab] = tabsOf(listRuns(), items);
  assert.deepEqual(tab.open.map((item) => item.id), [question.id], 'the tab counts only what waits');

  const page = renderHomePage(items, listStoredRuns(), ALPHA);
  const notifications = page.slice(page.indexOf('data-live="notifications"'), page.indexOf('id="chat"'));
  assert.match(notifications, new RegExp(`data-thread="${question.id}"`));
  assert.doesNotMatch(notifications, new RegExp(chat.id), 'no notice for the chat');
});

test('an ended run whose only open item is its chat is pruned on the next registration (L6)', async (t) => {
  tempDeck(t);
  const child = sleeper(t);
  registerRun({ repo: ALPHA, pid: child.pid });
  child.kill();
  await exited(child);

  registerRun({ repo: BETA, pid: process.pid });

  assert.deepEqual(
    listStoredRuns().map((run) => run.repo),
    [BETA],
    'a chat does not keep a record alive',
  );
  assert.equal(chatsOf().length, 2, 'and the chat itself is never dropped (L14)');
});

// --- never ended -------------------------------------------------------------------

test('resolveItem and dismissItem refuse a chat with the L7 sentence', (t) => {
  tempDeck(t);
  registerRun({ repo: ALPHA, pid: process.pid });
  const [chat] = chatsOf();

  assert.throws(() => resolveItem(chat.id, 'done'), { name: 'DeckRefusal', message: NEVER_CLOSED });
  assert.throws(() => dismissItem(chat.id), { name: 'DeckRefusal', message: NEVER_CLOSED });
  assert.ok(isOpen(reread(chat.id)), 'still open');
});

test('deck_resolve and POST /dismiss-item on the chat are refused over the wire', async (t) => {
  const base = await deckOnAPort(t);
  registerRun({ repo: ALPHA, pid: process.pid });
  const [chat] = chatsOf();

  const resolved = await callApi(base, 'deck_resolve', { id: chat.id, resolution: 'done' });
  assert.equal(resolved.status, 400);
  assert.match((await resolved.json()).error, NEVER_CLOSED);

  const dismissed = await fetch(`${base}/dismiss-item`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', origin: base },
    body: new URLSearchParams({ id: chat.id }),
    redirect: 'manual',
  });
  assert.equal(dismissed.status, 400);
  assert.match(await dismissed.text(), NEVER_CLOSED);
  assert.ok(isOpen(reread(chat.id)));
});

test('the chat\'s thread page draws no Close, Dismiss or Reopen (spec 7)', (t) => {
  tempDeck(t);
  registerRun({ repo: ALPHA, pid: process.pid });
  const [chat] = chatsOf();

  const page = renderThreadPage(chat, listItems(), listRuns());
  assert.match(page, /action="\/reply"/, 'it still has a reply box');
  assert.doesNotMatch(page, /action="\/close"/);
  assert.doesNotMatch(page, /action="\/dismiss-item"/);
  assert.doesNotMatch(page, /action="\/reopen"/);
});

// --- the panel ---------------------------------------------------------------------

test('a deck\'s tab draws Chat under Notifications in the rail, open, with its messages and a reply box (spec 4, L9)', (t) => {
  tempDeck(t);
  registerRun({ repo: ALPHA, pid: process.pid });
  const [chat] = chatsOf();
  addPilotMessage(chat.id, 'On it.', 'pilot:pilot-explorer');

  const page = renderHomePage(listItems(), listStoredRuns(), ALPHA);

  const bookmark = page.indexOf('<details class="tab" id="chat" open>');
  assert.ok(bookmark !== -1, 'the Chat bookmark is drawn open');
  assert.ok(bookmark > page.indexOf('id="notifications"'), 'second in the rail, under Notifications (Gate 2)');
  const panel = page.slice(bookmark, page.indexOf('id="status"'));
  assert.match(panel, /data-live="chat"/, 'a live region, so a reply renders with no reload');
  assert.match(panel, /by-explorer">explorer/, 'bylines as elsewhere');
  assert.match(panel, /On it\./);
  assert.match(panel, /<form[^>]*action="\/reply"/);
  assert.match(panel, new RegExp(`name="id" value="${chat.id}"`));
  assert.ok(panel.includes(`<input type="hidden" name="back" value="/?run=${encodeURIComponent(ALPHA)}" />`),
    'with no script it posts and comes back to this tab');
  assert.match(panel, /<textarea[^>]*name="text"/);
  assert.match(panel, /<button type="submit" name="choice" value="">Send<\/button>/,
    'a named submit, so the page\'s reply-in-place sends it without a reload');
  assert.doesNotMatch(panel, /id="reply"/, 'never the thread page\'s own box id');
});

test('the overview draws no chat, and each tab draws its own repository\'s', (t) => {
  tempDeck(t);
  registerRun({ repo: ALPHA, pid: process.pid });
  registerRun({ repo: BETA, pid: process.pid });
  const [alpha, beta] = chatsOf();

  const overview = renderHomePage(listItems(), listStoredRuns(), '');
  assert.match(overview, /data-live="chat" data-name="Chat"><\/div>/, 'an empty region, which the stylesheet hides');

  const onBeta = renderHomePage(listItems(), listStoredRuns(), BETA);
  assert.match(onBeta, new RegExp(`value="${beta.id}"`));
  assert.doesNotMatch(onBeta, new RegExp(`value="${alpha.id}"`));
});

// --- the round trip ---------------------------------------------------------------

test('a message in A\'s chat reaches a deck_wait for A and not one for B (spec 5)', async (t) => {
  const base = await deckOnAPort(t);
  registerRun({ repo: ALPHA, pid: process.pid });
  registerRun({ repo: BETA, pid: process.pid });
  const [alpha] = chatsOf();

  const drained = await payloadOf(await callApi(base, 'deck_wait', { since: 0, timeout: 200 }));
  const forAlpha = callApi(base, 'deck_wait', { since: drained.seq, timeout: 30_000, repo: ALPHA });
  const forBeta = callApi(base, 'deck_wait', { since: drained.seq, timeout: 1_500, repo: BETA });

  const sent = await sendInChat(base, alpha.id, 'can you rename the slice?');
  assert.equal(sent.status, 303);

  const a = await payloadOf(await forAlpha);
  assert.deepEqual(
    a.replies.map((reply) => ({ itemId: reply.itemId, text: reply.text })),
    [{ itemId: alpha.id, text: 'can you rename the slice?' }],
  );
  const b = await payloadOf(await forBeta);
  assert.deepEqual(b.replies, [], 'the other repository\'s pilot hears nothing');

  const replied = await callApi(base, 'deck_reply', { id: alpha.id, text: 'Renamed.' });
  assert.equal(replied.status, 200);
  const page = await (await fetch(`${base}/?run=${encodeURIComponent(ALPHA)}`)).text();
  const panel = page.slice(page.indexOf('id="chat"'), page.indexOf('id="status"'));
  assert.match(panel, /can you rename the slice\?/);
  assert.match(panel, /Renamed\./, 'the pilot\'s reply is in the panel');
});
