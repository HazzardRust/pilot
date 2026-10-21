'use strict';

/**
 * user-threads-open S2 (L4): a thread the user opened is the user's to close. Both
 * hooks tell the pilot to answer it with deck_reply and never ask deck_resolve of it,
 * the way they already treat an unsigned gate. The Stop gate runs in-process over a
 * stubbed `deck_read`; the inbox notice is a pure function of the replies.
 */

const test = require('node:test');
const assert = require('node:assert');

const deck = require('../lib/deck.js');
const stopGate = require('../stop-gate.js');
const inbox = require('../inbox-alert.js');

/** A thread the user opened with Create, whose last word is `last`. */
const userThread = (last) => ({
  id: 'itm_user',
  kind: 'user',
  title: 'Can the deck run on 4322?',
  replies: [{ from: 'user', seq: 5, text: 'And while you are at it, which port is free?' }].concat(last ? [last] : []),
});

/** `deck_read` hands back `items`; the session arrived at seq 1 and posted nothing. */
function stubDeck(t, items) {
  const saved = { tool: deck.tool, readState: deck.readState, readPosted: deck.readPosted };
  deck.tool = async () => ({ items: items });
  deck.readState = () => ({ baseline: 1, cursor: 1 });
  deck.readPosted = () => [];
  t.after(() => Object.assign(deck, saved));
}

test('a user reply on a user thread holds the stop with the user-thread sentence and asks no deck_resolve for it', async (t) => {
  stubDeck(t, [userThread()]);
  const said = await stopGate.run({ session_id: 's', cwd: process.cwd() });
  assert.equal(said && said.decision, 'block');
  assert.ok(said.reason.includes(deck.USER_THREAD_SENTENCE), 'the sentence sits under the thread');
  assert.match(said.reason, /Once you have replied, the turn may end/, 'alone, it reads the reply ending');
  assert.match(said.reason, /you have not answered it, so this turn is not over yet/, 'the opener says answer');
  assert.doesNotMatch(said.reason, /not closed/);
  assert.match(said.reason, /the next move is the user's./, 'and the ending is not about closing');
  assert.doesNotMatch(said.reason, /closing it is/);
  assert.doesNotMatch(said.reason, /close the thread with deck_resolve/);
});

test('the inbox notice on a user-thread reply gives the sentence, not the close', () => {
  const said = inbox.notice([{ itemId: 'itm_user', kind: 'user', title: 'Can the deck run on 4322?', text: 'Which port is free?', seq: 5 }]).additionalContext;
  assert.ok(said.includes(deck.USER_THREAD_SENTENCE));
  assert.doesNotMatch(said, /close it with deck_resolve/);
});

test('beside an ordinary thread, only the ordinary one is closed and only the user thread carries the sentence', async (t) => {
  const question = { id: 'itm_q', kind: 'question', title: 'Which port?', replies: [{ from: 'user', seq: 6, text: '4322.' }] };
  stubDeck(t, [userThread(), question]);
  const said = await stopGate.run({ session_id: 's', cwd: process.cwd() });
  assert.match(said.reason, /close the thread with deck_resolve/, 'one thread to close, not each');
  const at = said.reason.indexOf(deck.USER_THREAD_SENTENCE);
  assert.ok(at > said.reason.indexOf('itm_user') && at < said.reason.indexOf('itm_q'), 'the sentence sits under the user thread');
  assert.equal(said.reason.split(deck.USER_THREAD_SENTENCE).length, 2, 'and only there');
});

test('the still-unanswered line for a lone user thread names the sentence and not deck_resolve', (t) => {
  const saved = deck.readPosted;
  deck.readPosted = () => [];
  t.after(() => { deck.readPosted = saved; });
  const said = inbox.stillUnanswered([userThread()], 's', process.cwd(), { baseline: 1 }, []);
  assert.match(said, /itm_user/);
  assert.ok(said.includes(deck.USER_THREAD_SENTENCE));
  assert.doesNotMatch(said, /deck_resolve it or/);
  assert.match(said, /Act on each, then answer with deck_reply\./);
});

test('the still-unanswered line beside a question keeps the deck_resolve wording and the sentence', (t) => {
  const saved = deck.readPosted;
  deck.readPosted = () => [];
  t.after(() => { deck.readPosted = saved; });
  const question = { id: 'itm_q', kind: 'question', title: 'Which port?', replies: [{ from: 'user', seq: 6, text: '4322.' }] };
  const said = inbox.stillUnanswered([userThread(), question], 's', process.cwd(), { baseline: 1 }, []);
  assert.match(said, /deck_resolve it or answer with deck_reply/);
  assert.ok(said.includes(deck.USER_THREAD_SENTENCE));
});

test('the chat is answered, and the sentence says the chat never closes', () => {
  const said = inbox.notice([{ itemId: 'itm_chat', kind: 'chat', title: 'Chat', text: 'Hello', seq: 5 }]).additionalContext;
  assert.ok(said.includes(deck.USER_THREAD_SENTENCE));
  assert.ok(said.includes('Answer it with deck_reply, never deck_resolve: the user closes a thread they opened, and the chat never closes.'));
});
