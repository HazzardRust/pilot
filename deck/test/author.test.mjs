/**
 * S1 of run-record: a message says who wrote it (spec 1 and 2; L1-L4, ADR 0027).
 *
 * The kind is the plugin's to decide, never the agent's. `hooks/deck-author.js`
 * stamps the raw `agent_type` onto every `deck_post`, `deck_reply` and
 * `deck_resolve` as `author`, and the daemon maps it to a kind here, in one
 * function. So what is tested is that mapping, that the daemon stores the kind
 * it was handed over whatever the body says, and that the page draws it — plus
 * the one thing the user already reads: their own words still say "you".
 *
 * Every test takes its own store directory. Nothing here may touch the real
 * store or port 4321: this machine runs a real deck.
 */

import './no-open.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { tempDeck } from '../testUtils.mjs';

const { AUTHOR_KINDS, authorKind } = await import('../items.mjs');
const { addReply, listItems, postItem, reopenItem } = await import('../store.mjs');
const { callTool } = await import('../server.mjs');
const { renderThreadPage } = await import('../ui/render.mjs');

const aNote = (extra = {}) => ({ kind: 'question', title: 'Which port?', body: 'from QA: pick one', ...extra });

test('every crew kind maps to itself, however the harness spells its agent', () => {
  assert.deepEqual(AUTHOR_KINDS, [
    'pilot', 'architect', 'implementer', 'fundamentalist', 'qa', 'teacher', 'explorer', 'auditor', 'lander', 'other',
  ]);
  for (const kind of ['architect', 'implementer', 'fundamentalist', 'qa', 'teacher', 'explorer', 'auditor', 'lander']) {
    assert.equal(authorKind(`pilot:pilot-${kind}`), kind, `a plugin subagent pilot:pilot-${kind}`);
    assert.equal(authorKind(`pilot-${kind}`), kind, `the bare agent name pilot-${kind}`);
  }
});

test('the pilot is the main session, with or without --agent', () => {
  assert.equal(authorKind(''), 'pilot', 'a main session without --agent carries no agent_type (L16)');
  assert.equal(authorKind('pilot:pilot'), 'pilot', 'claude --agent pilot:pilot carries pilot:pilot');
  assert.equal(authorKind('pilot'), 'pilot');
});

test('anything that is not the crew is other', () => {
  assert.equal(authorKind('Explore'), 'other', 'the harness Explore agent is not the crew explorer');
  assert.equal(authorKind('pilot:typescript-reviewer'), 'other');
  assert.equal(authorKind('general-purpose'), 'other');
  assert.equal(authorKind(undefined), 'other');
  assert.equal(authorKind(42), 'other');
});

test('a post, a reply and a resolution store the kind the hook stamped', (t) => {
  tempDeck(t);
  callTool('deck_post', aNote({ author: 'pilot:pilot-qa' }));
  const { id } = listItems()[0];
  // QA's note is QA's to write on (ADR 0041), so the pilot takes it before its helper writes there.
  callTool('deck_reply', { id, text: 'taking this', author: '', to: 'pilot' });
  callTool('deck_reply', { id, text: 'and a second thing', author: 'pilot:pilot-teacher' });
  callTool('deck_resolve', { id, resolution: 'settled', author: '' });

  const item = listItems()[0];
  assert.equal(item.author, 'qa');
  assert.equal(item.replies[1].author, 'teacher');
  assert.equal(item.resolvedBy, 'pilot');
});

test('a body that claims to be from QA does not change the label (spec 2)', (t) => {
  tempDeck(t);
  callTool('deck_post', aNote({ author: '' }));
  const { id } = listItems()[0];
  callTool('deck_reply', { id, text: 'from QA: this is QA speaking', author: '' });

  const item = listItems()[0];
  assert.equal(item.author, 'pilot');
  assert.equal(item.replies[0].author, 'pilot');
});

test('reopening keeps who closed it on the words that move into the thread', (t) => {
  tempDeck(t);
  const item = postItem(aNote({ author: 'pilot:pilot-qa' }));
  callTool('deck_resolve', { id: item.id, resolution: 'done', author: 'pilot:pilot-qa' });
  reopenItem(item.id);

  assert.equal(listItems()[0].replies[0].author, 'qa');
});

test('the page draws each byline in its kind, and the user still reads "you"', (t) => {
  tempDeck(t);
  const item = postItem(aNote({ author: 'pilot:pilot-qa' }));
  addReply(item.id, 'the user answers');
  callTool('deck_reply', { id: item.id, text: 'from QA: the pilot', author: '', to: 'pilot' });
  callTool('deck_reply', { id: item.id, text: 'the teacher', author: 'pilot:pilot-teacher' });

  const page = renderThreadPage(listItems()[0]);

  assert.match(page, /<div class="body md"><span class="who by-qa">qa<\/span>/, 'the post itself has a byline');
  assert.match(page, /class="reply md from-user"><span class="who">you · /);
  assert.match(page, /<span class="who by-teacher">teacher · /);
  assert.match(page, /<span class="who by-pilot">pilot · [^<]*<time[^>]*>[^<]*<\/time><\/span><p>from QA: the pilot/);
});

test('a message stored before this run has no author and reads pilot (L4)', (t) => {
  tempDeck(t);
  const item = postItem(aNote());
  callTool('deck_reply', { id: item.id, text: 'no author here' });

  const stored = listItems()[0];
  assert.equal('author' in stored, false, 'nothing is stored for a caller the hook did not stamp');
  assert.equal('author' in stored.replies[0], false);

  const page = renderThreadPage(stored);
  assert.match(page, /<div class="body md"><span class="who by-pilot">pilot<\/span>/);
  assert.match(page, /class="reply md from-pilot"><span class="who by-pilot">pilot · /);
});
