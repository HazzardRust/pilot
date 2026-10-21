/**
 * Merge-first S3, spec 5; L5, L13.
 *
 * The merge step cannot be skipped silently: `postItem` refuses a `gate1` while its ticket's
 * repository holds another open red ticket and `mergeDecisionOf` finds no resolved architect
 * item naming the gate1's ticket. Derived on read, so nothing stores a `merged` field.
 */

import './no-open.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';

import { DeckRefusal, listItems, postItem, resolveItem } from '../store.mjs';
import { shapedTicketBody, takeLive, tempDeck } from '../testUtils.mjs';

const ALPHA = 'D:/work/alpha';
const BETA = 'D:/work/beta';
const ARCHITECT = 'pilot:pilot-architect';
const GATE1 = { artefact: 'docs/design/x/architecture.md', sha: '31efcb0', locked: 3, slices: '| S1 | x | 1 |', sliceCount: 1, surface: false, branch: 'feat/x' };

const ticket = (title, repo = ALPHA) => postItem({ kind: 'ticket', title, body: shapedTicketBody(title), repo, sliceCount: 30 });
const gate1 = (ticketId, repo = ALPHA) => postItem({ kind: 'gate1', title: 'Gate 1', body: 'The artefact.', repo, ticket: ticketId, ...GATE1 });
// `author` undefined is the pilot: the inbox and Stop hooks call unstamped (A8).
const mergeThread = (ticketId, author) =>
  postItem({ kind: 'question', title: 'Merge into the live ticket?', body: 'itm_a shares its surface', repo: ALPHA, ticket: ticketId, author });
const gate1s = () => listItems().filter((item) => item.kind === 'gate1');

test('a gate1 is refused while another red ticket waits and no merge decision names its ticket', (t) => {
  tempDeck(t);
  const live = takeLive(ticket('the live one').id);
  const first = ticket('first');
  const second = ticket('second');

  assert.throws(
    () => gate1(live.id),
    (error) =>
      error instanceof DeckRefusal &&
      error.message ===
        `the architect's merge step has not run for ${live.id}: no resolved merge thread names it (red queue: ${first.id}, ${second.id}); resume the architect for its Merge first step; never deck_ticket merge it yourself`,
  );
  assert.equal(gate1s().length, 0, 'no gate1 stored');
});

test("a gate1 posts once the architect's merge thread naming its ticket is resolved", (t) => {
  tempDeck(t);
  const live = takeLive(ticket('the live one').id);
  ticket('other');
  const thread = mergeThread(live.id, ARCHITECT);
  resolveItem(thread.id, 'merged nothing: other is a different surface', ARCHITECT);

  assert.equal(gate1(live.id).ticket, live.id);
});

test('a gate1 posts when its ticket is the only red ticket in the repository', (t) => {
  tempDeck(t);
  const live = takeLive(ticket('the only one').id);

  assert.equal(gate1(live.id).ticket, live.id);
});

test("another repository's red ticket does not hold a gate1", (t) => {
  tempDeck(t);
  const live = takeLive(ticket('the live one').id);
  ticket('elsewhere', BETA);

  assert.equal(gate1(live.id).ticket, live.id);
});

test('a pilot-posted question naming the ticket does not count as a merge decision', (t) => {
  tempDeck(t);
  const live = takeLive(ticket('the live one').id);
  ticket('other');
  const asked = mergeThread(live.id, undefined);
  resolveItem(asked.id, 'merged nothing', undefined);

  assert.throws(() => gate1(live.id), /the architect's merge step has not run/);
  assert.equal(gate1s().length, 0, 'no gate1 stored');
});

test("an architect's decision on another ticket does not release a gate1", (t) => {
  tempDeck(t);
  const other = ticket('other');
  const live = takeLive(ticket('the live one').id);
  resolveItem(mergeThread(other.id, ARCHITECT).id, 'merged nothing', ARCHITECT);

  assert.throws(() => gate1(live.id), /the architect's merge step has not run/);
});

// A backslash is a separator on win32 only; POSIX reads it as part of a name (L8).
test('a red ticket in the same repository spelt with backslashes still holds a gate1', { skip: process.platform !== 'win32' && 'a backslash separates on Windows only' }, (t) => {
  tempDeck(t);
  const live = takeLive(ticket('the live one').id);
  // Off Windows a backslash is no separator, so the other spelling there is a trailing slash.
  ticket('other', process.platform === 'win32' ? 'D:\\work\\alpha' : `${ALPHA}/`);

  assert.throws(() => gate1(live.id), /the architect's merge step has not run/);
});

test('a red ticket in the same repository spelt with a trailing separator still holds a gate1', (t) => {
  tempDeck(t);
  const live = takeLive(ticket('the live one').id);
  ticket('other', ALPHA + path.sep);

  assert.throws(() => gate1(live.id), /the architect's merge step has not run/);
});
