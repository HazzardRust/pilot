/**
 * The crew's prose names the run remote and runs the prune (pilot-fork S9, spec 5, 7, 9;
 * L6, L12, L13, A1). Run branches live on the run remote `pilot base` printed, slice PRs
 * open only on origin. The closing step's branch prune left with lander S10: land deletes the slice branches
 * (lander S9) and the lander prunes the worktrees.
 * Prompt files are linted for what they must not say; the sentences that name the remote are not pinned.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/** Normalised to LF and to one line: git checks these out with CRLF on Windows. */
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/\s+/g, ' ');

/** The text under one `## ` heading, up to the next. */
function section(text, heading) {
  const start = text.indexOf(` ## ${heading} `);
  assert.notEqual(start, -1, `no "## ${heading}" heading`);
  const rest = text.slice(start + heading.length + 4);
  const end = rest.indexOf(' ## ');
  return end === -1 ? rest : rest.slice(0, end);
}

const PILOT = read('agents/pilot.md');
const IMPLEMENTER = read('agents/pilot-implementer.md');
const CREW = ['pilot', 'pilot-implementer', 'pilot-qa', 'pilot-fundamentalist', 'pilot-architect'];

test('no crew prompt hard-codes origin for a run branch', () => {
  // lint: no crew prompt names origin/pilot, origin/<pr-branch> or origin/<base> for a run branch
  for (const name of CREW) {
    const text = read(`agents/${name}.md`);
    assert.doesNotMatch(text, /origin\/pilot(?![\w-])/, `${name}: pilot lives on the run remote`);
    assert.doesNotMatch(text, /origin\/<pr-branch>/, `${name}: a slice's PR branch lives on the run remote`);
    // The fundamentalist's `<base>` is the feature PR's base, origin's default branch.
    if (name !== 'pilot-fundamentalist') assert.doesNotMatch(text, /origin\/<base>/, `${name}: a slice's base can be a run branch`);
  }
});

// pilot-develop-line S4 (A8): the slice branch still pushes to the run remote; no remote gets a slice PR.
test('the implementer pushes its slice branch and opens no PR on any remote', () => {
  const push = section(IMPLEMENTER, 'Commit, push, report');
  // lint: the implementer's push section never tells it to `gh pr create`
  assert.doesNotMatch(push, /gh pr create/, 'no remote gets a slice PR');
});
