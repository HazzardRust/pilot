// lander S1 (spec 1; L2, L3, L4): the lander's own definition pins what it may and may not do. It moves `pilot` only
// by saying `Land again`, resolves with `resolving-merge-conflicts`, and never edits destructively mid-merge.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const lander = () => fs.readFileSync(path.join(ROOT, 'agents', 'pilot-lander.md'), 'utf8');
const flat = (text) => text.replace(/\s+/g, ' ');

test('the lander never pushes pilot', () => {
  const text = lander();
  for (const phrase of ['never git push', 'Land again', 'resolving-merge-conflicts', 'Your first act, conflict or none, is to reply `Resolving`']) {
    assert.ok(flat(text).includes(phrase), `agents/pilot-lander.md does not name "${phrase}"`);
  }
  assert.doesNotMatch(text, /^\s*(?:[$>]\s*)?(?:node\s+\S+\s+)?pilot land\b/m, 'the lander runs no `pilot land` command line');
  assert.doesNotMatch(text, /Bash\(git push/, 'no git push grant');
});

test('the lander never edits destructively mid-merge', () => {
  const never = /## Never mid-merge\n([\s\S]*?)(?=\n## |$)/.exec(lander());
  assert.ok(never, 'agents/pilot-lander.md lost its ## Never mid-merge heading');
  const text = flat(never[1]);
  for (const phrase of ['sed -i', 'checkout --ours', '--abort']) {
    assert.ok(text.includes(phrase), `## Never mid-merge does not name "${phrase}"`);
  }
  assert.match(text, /\bnever\b/i);
});

// lander S10 (spec 8; L12, A2): on `landed` the lander prunes the run's worktrees and hands the pilot one line.
test('the lander hands back one line', () => {
  const tail = /\n## Clean tail\n([\s\S]*?)(?=\n## |$)/.exec(lander());
  assert.ok(tail, 'agents/pilot-lander.md lost its ## Clean tail heading');
  const text = flat(tail[1]);
  // one-integration-line S9 (spec 3): the line carries land's `main gets pilot:`, merge-first is gone.
  for (const phrase of ['landed <sha7> · main gets pilot:', 'pilot worktrees prune --run', 'deck_post', 'no body', 'deck_status', 'closing report posted']) {
    assert.ok(text.includes(phrase), `## Clean tail does not name "${phrase}"`);
  }
  assert.match(lander(), /^tools:.*deck__deck_post\b.*deck__deck_status\b/m, 'the lander is not granted deck_post and deck_status');
  // lander-tail S2 (spec 3; ADR 0171): a landed run's prune keeps only tracked dirt and a live holder.
  for (const phrase of ['land dir', 'tracked change', 'kept merged-dirty <path>', 'kept live <pid> <path>']) {
    assert.ok(text.includes(phrase), `## Clean tail does not say what a landed run's prune keeps: "${phrase}"`);
  }
  assert.ok(!text.includes('only merged-clean'), '## Clean tail still says the prune removes only merged-clean worktrees');
  // lander-tail S1 seam: deck_status requires `slices`, so the finished call passes an empty list.
  assert.ok(text.includes('`slices: []`'), '## Clean tail\'s deck_status call does not pass `slices: []`');
});

// lander S5 seam (spec 3): QA posts a gate2 the lander prepared only on its `clean at <sha>`.
test('the lander says clean at its prepared merge', () => {
  assert.ok(flat(lander()).includes('clean at <sha>'), 'agents/pilot-lander.md does not send `clean at <sha>`');
});
