/**
 * lander S8 (spec 5; L5, L9, A1): a press makes a lander due on its gate2, derived from items and never stored.
 * The press line asks the pilot to spawn it, or, with an open hand-off in the directory, says it queues for the next
 * session, whose first prompt names it (`deck/test/run.test.mjs`). Every test takes its own store.
 */

import './no-open.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { KIND_GATE2, KIND_HANDOFF, SIGN_OFF } from '../items.mjs';
import { landerDue, landingReply } from '../landing-replies.mjs';
import { callTool } from '../server-tools.mjs';
import { addReply, listItems, noteLaneFilled, postItem } from '../store.mjs';
import { tempDeck, withTicket } from '../testUtils.mjs';

const itemOf = (id) => listItems().find((item) => item.id === id);

function aRepo(t) {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'pilot-queue-repo-'));
  t.after(() => fs.rmSync(repo, { recursive: true, force: true }));
  fs.mkdirSync(path.join(repo, '.git'));
  return repo;
}

/** A gate2 the user has signed, in `repo`. */
function aSigned(repo) {
  const evidence = withTicket({ pr: '#590', sha: '0305827' }, repo, 'yellow');
  const gate = postItem({ kind: KIND_GATE2, title: 'Gate 2', body: 'Walk it.', repo, author: 'qa', ...evidence });
  addReply(gate.id, SIGN_OFF);
  return gate;
}

const resolving = (id) => callTool('deck_reply', { id, text: 'Resolving', author: 'pilot:pilot-lander' }, { spawn: () => { throw new Error('nothing spawns'); }, env: {} });
const deckLines = (id, before) => itemOf(id).replies.slice(before).filter((message) => message.from === 'deck');

test('a signed gate2 with no lander is due', (t) => {
  tempDeck(t);
  const repo = aRepo(t);
  const gate = aSigned(repo);

  assert.deepEqual(landerDue(listItems(), repo), [gate.id]);
  assert.deepEqual(landerDue(listItems(), aRepo(t)), [], 'another directory has none');

  assert.equal(landingReply(itemOf(gate.id), 'Resolving', 'pilot', new Date().toISOString()), false, "the pilot's Resolving with no conflict stays plain");
  resolving(gate.id);
  assert.deepEqual(landerDue(listItems(), repo), [], "the lander's Resolving claims it");
});

test('with the pilot at its hand-off the press queues the lander', (t) => {
  tempDeck(t);
  const repo = aRepo(t);
  const gate = aSigned(repo);
  const before = itemOf(gate.id).replies.length;

  noteLaneFilled(gate.id, []);
  const [due] = deckLines(gate.id, before);
  assert.match(due.text, new RegExp(`lander due: spawn pilot-lander ${gate.id}`));

  postItem({ kind: KIND_HANDOFF, title: 'Handoff: the pilot is at 34%', body: 'Stash at docs/handoff/x.md.', repo });
  const after = itemOf(gate.id).replies.length;
  noteLaneFilled(gate.id, []);
  const lines = deckLines(gate.id, after);
  assert.equal(lines.length, 1, 'one line');
  assert.match(lines[0].text, /lander queued for the next session/);
  assert.doesNotMatch(lines[0].text, /spawn/, 'no spawn line wakes the old session');
});

test('two due landers queue oldest first, and none while a lander works (the head alone: run.test.mjs)', (t) => {
  tempDeck(t);
  const repo = aRepo(t);
  const first = aSigned(repo);
  const second = aSigned(repo);

  assert.deepEqual(landerDue(listItems(), repo), [first.id, second.id], 'oldest first');

  resolving(first.id);
  assert.deepEqual(landerDue(listItems(), repo), [], 'one lander per repository: the second waits on the first');
});
