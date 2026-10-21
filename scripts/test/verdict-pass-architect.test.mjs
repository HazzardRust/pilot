/**
 * Spec 1 of `docs/design/verdict-pass/architecture.md`, on `agents/pilot-architect.md`: a stash is
 * an A‹n› in §6 carrying the default, the tradeoff and the path rejected; the architect never
 * waits on it and writes no verdict. Each pin is a phrase a rewording must keep.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { flat, read, sectionOf } from './lib/area-file.mjs';

const stash = () => {
  const text = sectionOf(read('agents/pilot-architect.md'), 'Decide, and stash what is not yours');
  assert.notEqual(text, '', 'no stash heading');
  return flat(text);
};

test('a stash names its id and the rejected path', () => {
  const s = stash();
  assert.match(s, /A‹n›/, 'a stash is named A‹n›');
  assert.match(s, /the path you rejected/i, 'a stash records the path rejected');
});

test('the architect never waits on a stash', () => {
  // Regression guard: this phrase predates the slice.
  assert.match(stash(), /carry on; do not wait/i);
});

test('verdicts are the pilot\'s', () => {
  assert.match(stash(), /write no `Verdict:` line/i);
});
