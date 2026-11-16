/**
 * The crew's prose names the run remote and runs the prune (pilot-fork S9, spec 5, 7, 9;
 * L6, L12, L13, A1). Run branches live on the run remote `pilot base` printed, slice PRs
 * open only on origin. The closing step's branch prune left with lander S10: land deletes the slice branches
 * (lander S9) and the lander prunes the worktrees.
 * Prompt files are pinned by text: each assertion names the rule a rewrite must keep.
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
  for (const name of CREW) {
    const text = read(`agents/${name}.md`);
    assert.doesNotMatch(text, /origin\/pilot(?![\w-])/, `${name}: pilot lives on the run remote`);
    assert.doesNotMatch(text, /origin\/<pr-branch>/, `${name}: a slice's PR branch lives on the run remote`);
    // The fundamentalist's `<base>` is the feature PR's base, origin's default branch.
    if (name !== 'pilot-fundamentalist') assert.doesNotMatch(text, /origin\/<base>/, `${name}: a slice's base can be a run branch`);
  }
  assert.match(IMPLEMENTER, /<remote>\/<pr-branch>/, 'the fix worktree is cut from the run remote');
  assert.match(read('agents/pilot-architect.md'), /<remote>\/pilot/, 'the design worktree is cut from the run remote\'s pilot');
});

// pilot-develop-line S4 (A8): the slice branch still pushes to the run remote; no remote gets a slice PR.
test('the implementer pushes its slice branch and opens no PR on any remote', () => {
  const push = section(IMPLEMENTER, 'Commit, push, report');
  assert.doesNotMatch(push, /gh pr create/, 'no remote gets a slice PR');
  assert.match(push, /Push the branch to `<remote>`/, 'the branch pushes to the run remote');
  assert.match(push, /Open no PR/, 'the push-only path is the only path');
  assert.match(push, /`local`[^.]*push nothing/i, 'local mode pushes nothing');
  assert.match(push, /git rebase <remote>\/feat\/<slug>/, 'the rebase reads the run remote');
});

test('the brief carries the remote', () => {
  assert.match(read('agents/pilot-architect.md'), /`Remote: <name>`[^.]*`pilot base`[^.]*`origin`[^.]*`Remote: local`/, 'brief.md names the run remote from pilot base\'s line');
  assert.match(IMPLEMENTER, /`<remote>`[^.]*brief's `Remote:`/, 'the implementer reads it from the brief');
});
