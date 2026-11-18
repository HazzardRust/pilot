/**
 * never-stuck QA Q3: a superseding hand-off closes the one it supersedes.
 *
 * Found at QA on 2026-11-18: a second `pilot handoff` in the same directory left the older handoff item open, with its
 * own Handoff failed button, beside the new one. Posting a hand-off now closes every older open hand-off of its
 * directory, `superseded by <new id>`, in the same write; another directory's is left alone.
 */

import './no-open.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';

import { tempDeck } from '../testUtils.mjs';

const { listItems, postItem } = await import('../store.mjs');
const { isOpen, noteFor } = await import('../items.mjs');

const A = path.join('D:', 'work', 'alpha');
const B = path.join('D:', 'work', 'beta');
const reread = (id) => listItems().find((item) => item.id === id);

test('a new hand-off closes the older open one of its directory, and no other', (t) => {
  tempDeck(t);
  const older = postItem({ kind: 'handoff', title: 'Handoff: first', body: 'b', repo: A });
  const elsewhere = postItem({ kind: 'handoff', title: 'Handoff: beta', body: 'b', repo: B });
  const newer = postItem({ kind: 'handoff', title: 'Handoff: second', body: 'b', repo: A });

  assert.equal(isOpen(reread(older.id)), false, 'the superseded hand-off is closed');
  assert.equal(reread(older.id).resolution, `superseded by ${newer.id}`);
  assert.ok(isOpen(reread(newer.id)), 'the new one stays open');
  assert.ok(isOpen(reread(elsewhere.id)), "another directory's hand-off is untouched");
  assert.equal(reread(older.id).notice, undefined, 'a hand-off closes silently');
  assert.equal(noteFor(reread(older.id)), `superseded by ${newer.id}`, 'its card no longer says to press Handoff failed');
});

test("a chain hand-off is never superseded: only its Handoff failed hands its tickets back", (t) => {
  tempDeck(t);
  const chain = postItem({ kind: 'handoff', title: 'Next run: x', body: 'b', repo: A, next: 'itm_t1' });
  postItem({ kind: 'handoff', title: 'Handoff: manual', body: 'b', repo: A });
  assert.ok(isOpen(reread(chain.id)));
});
