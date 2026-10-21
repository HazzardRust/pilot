/**
 * session-row S2 (spec 4, 5, 9, 10, 11; L3-L6, L9): a thread read returns the window asked for.
 *
 * A message is the post (message 1) or one of its replies, in that order. `messages: N` is
 * the last N, `-N` the first N, `"all"` the whole; with none, a thread under five messages
 * comes back whole and a longer one as its last five. Only what a read shows is handed over.
 *
 * Every test takes its own store directory; nothing here touches port 4321 or the real store.
 */

import './no-open.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';

import { deckOnAPort, tempDeck } from '../testUtils.mjs';

const { addReply, listItems, postItem } = await import('../store.mjs');
const { messagesOf } = await import('../items.mjs');
const { callTool } = await import('../server.mjs');
// Taken inside the tests, so each fails on behaviour rather than on a missing export.
const windowOf = async (...args) => (await import('../read.mjs')).windowOf(...args);
const selectItems = async (...args) => (await import('../read.mjs')).selectItems(...args);

const ALPHA = path.join(os.tmpdir(), 'pilot-read-window-repo');

/** A thread of `count` messages: the post `m1`, then replies `m2`..`m<count>`. */
function thread(count, over = {}) {
  const replies = Array.from({ length: count - 1 }, (_, index) => ({
    from: index % 2 === 0 ? 'user' : 'pilot',
    text: `m${index + 2}`,
    seq: index + 2,
  }));
  return { id: 'itm_thread', kind: 'question', title: 'T', body: 'm1', state: 'open', replies, ...over };
}

const texts = (item) => messagesOf(item).map((message) => message.text);
const read = (args) => JSON.parse(callTool('deck_read', args).content[0].text);

/** A question in ALPHA with `count` messages in the store, the replies the user's. */
function storedThread(count) {
  const item = postItem({ kind: 'question', title: 'Q', body: 'm1', repo: ALPHA, author: '' });
  for (let n = 2; n <= count; n += 1) addReply(item.id, `m${n}`);
  return item;
}

test('messages 3 is the last three', async () => {
  const shown = await windowOf(thread(10), 3);
  assert.deepEqual(texts(shown), ['m8', 'm9', 'm10']);
  assert.deepEqual(shown.window, { shown: 3, total: 10, left: 'earliest' });
  assert.equal('body' in shown, false, 'the post is outside the window, so its body is dropped');
  assert.equal(shown.title, 'T', 'the title always stays');
});

test('messages -2 is the post and the first reply', async () => {
  const shown = await windowOf(thread(10), -2);
  assert.equal(shown.body, 'm1');
  assert.deepEqual(texts(shown), ['m2']);
  assert.deepEqual(shown.window, { shown: 2, total: 10, left: 'latest' });
});

test('a window as wide as the thread is the thread, and -1 is the post alone', async () => {
  for (const messages of [10, 11, -10, -11]) {
    const shown = await windowOf(thread(10), messages);
    assert.equal(shown.window, undefined, `messages ${messages} leaves nothing out`);
    assert.equal(messagesOf(shown).length, 9);
  }
  const post = await windowOf(thread(10), -1);
  assert.equal(post.body, 'm1');
  assert.deepEqual(texts(post), []);
  assert.deepEqual(post.window, { shown: 1, total: 10, left: 'latest' });
  assert.equal((await windowOf({ id: 'itm_bare', title: 'T', body: 'm1' }, 1)).body, 'm1', 'a post with no replies is whole');
});

test('all, zero and a word', (t) => {
  tempDeck(t);
  const item = storedThread(10);

  const whole = read({ id: item.id, messages: 'all' }).items[0];
  assert.equal(whole.body, 'm1');
  assert.equal(messagesOf(whole).length, 9);
  assert.equal(whole.window, undefined, 'a whole thread carries no window');

  for (const messages of [0, 'last', 1.5]) {
    assert.throws(
      () => callTool('deck_read', { id: item.id, messages }),
      (error) => error.name === 'DeckRefusal' && error.message.includes('messages'),
      `messages ${JSON.stringify(messages)} is refused naming the field`,
    );
  }
});

test('under five comes back whole', async () => {
  const shown = await windowOf(thread(4));
  assert.equal(shown.body, 'm1');
  assert.deepEqual(texts(shown), ['m2', 'm3', 'm4']);
  assert.equal(shown.window, undefined);
});

test('five comes back whole', async () => {
  const shown = await windowOf(thread(5));
  assert.equal(shown.body, 'm1');
  assert.deepEqual(texts(shown), ['m2', 'm3', 'm4', 'm5']);
  assert.equal(shown.window, undefined);
});

test('deck_read takes the window it is asked for', (t) => {
  tempDeck(t);
  const item = storedThread(10);

  const last = read({ id: item.id, messages: 3 }).items[0];
  assert.deepEqual(texts(last), ['m8', 'm9', 'm10'], 'messages 3 is the last three');
  const first = read({ id: item.id, messages: -2 }).items[0];
  assert.equal(first.body, 'm1', 'messages -2 starts at the post');
  assert.deepEqual(texts(first), ['m2']);
});

test('six comes back as its last five', async () => {
  const shown = await windowOf(thread(6));
  assert.deepEqual(texts(shown), ['m2', 'm3', 'm4', 'm5', 'm6']);
  assert.deepEqual(shown.window, { shown: 5, total: 6, left: 'earliest' });

  // The chat that overflowed the tool-result cap: about 127k characters over 400 messages.
  const said = 'x'.repeat(310);
  const chat = thread(400, { kind: 'chat', body: said });
  for (const reply of chat.replies) reply.text = said;
  assert.ok(JSON.stringify(chat).length > 125_000, 'the fixture is the size of the chat that overflowed');
  const length = JSON.stringify(await windowOf(chat)).length;
  assert.ok(length < 2_000, `the windowed chat serialises to ${length} characters`);
});

test('an open read windows each item', async () => {
  const items = [thread(6, { id: 'itm_six' }), thread(3, { id: 'itm_three' })];

  const [six, three] = await selectItems(items, { open: true });
  assert.deepEqual(texts(six), ['m2', 'm3', 'm4', 'm5', 'm6']);
  assert.deepEqual(six.window, { shown: 5, total: 6, left: 'earliest' });
  assert.deepEqual(texts(three), ['m2', 'm3'], 'a short thread in the same read is whole');

  const [line] = await selectItems(items, { open: true, brief: true });
  assert.equal(line.replies, 5, 'a brief read still counts every reply');
  assert.equal(line.window, undefined);
});

test('a reply windowed out is not handed over', async (t) => {
  const base = await deckOnAPort(t);
  const item = storedThread(8);

  const answer = read({ id: item.id, repo: ALPHA });
  assert.deepEqual(texts(answer.items[0]), ['m4', 'm5', 'm6', 'm7', 'm8']);

  const stored = listItems().find((candidate) => candidate.id === item.id);
  assert.deepEqual(
    messagesOf(stored).map((reply) => reply.deliveredTo ?? null),
    [null, null, 'pilot', 'pilot', 'pilot', 'pilot', 'pilot'],
    'only the five messages shown are handed over',
  );

  const waited = await fetch(`${base}/api/tool`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'deck_wait', arguments: { since: 0, timeout: 1000, repo: ALPHA } }),
  }).then((response) => response.json());
  const replies = JSON.parse(waited.content[0].text).replies.map((reply) => reply.text);
  assert.ok(replies.includes('m3'), `pilot wait still takes the 3rd message: ${JSON.stringify(replies)}`);
});

test('the hooks read whole threads', async (t) => {
  const base = await deckOnAPort(t);
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'pilot-read-window-home-'));
  const before = {
    HOME: process.env.HOME,
    USERPROFILE: process.env.USERPROFILE,
    PILOT_DECK_PORT: process.env.PILOT_DECK_PORT,
    CLAUDE_PROJECT_DIR: process.env.CLAUDE_PROJECT_DIR,
  };
  process.env.HOME = home;
  process.env.USERPROFILE = home;
  process.env.PILOT_DECK_PORT = new URL(base).port;
  delete process.env.CLAUDE_PROJECT_DIR;
  t.after(() => {
    for (const [name, value] of Object.entries(before)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
    fs.rmSync(home, { recursive: true, force: true });
  });

  const stash = postItem({ kind: 'handoff', title: 'Handoff', body: 'Stash at docs/x.md.', repo: ALPHA });
  for (let n = 2; n <= 6; n += 1) addReply(stash.id, `m${n}`);

  const lane = createRequire(import.meta.url)('../../hooks/session-handoff.js');
  const answer = await lane.run({
    session_id: '2600840c-2a13-45b7-87fc-0000000000s2',
    transcript_path: path.join(home, 'transcript.jsonl'),
    cwd: ALPHA,
    hook_event_name: 'SessionStart',
    source: 'clear',
  });
  const said = answer?.payload?.hookSpecificOutput?.additionalContext ?? '';
  assert.ok(said.includes('Stash at docs/x.md.'), `the long hand-off's body is delivered: ${said.slice(0, 200)}`);
});
