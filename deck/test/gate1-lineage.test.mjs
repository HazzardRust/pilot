/**
 * The deck refuses a gate1 whose design branch is off pilot's tip (design-docs-only spec 2;
 * L4, L5, L6, A2): the check runs in `callTool('deck_post')` on real repositories, a clone
 * of a local bare origin, and nothing reaches GitHub or fetches.
 */

import './no-open.mjs';
import { gitFixture } from '../../scripts/test/lib/git-fixture.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { KIND_GATE1 } from '../items.mjs';
import { assertOnPilotTip } from '../lineage.mjs';
import { DeckRefusal, listItems, postItem, resolveItem } from '../store.mjs';
import { tempDeck, withTicket } from '../testUtils.mjs';

const { callTool } = await import('../server.mjs');

const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const GATE1 = { artefact: 'docs/design/x/architecture.md', sha: '0305827', locked: 3, slices: '| S1 |' };

/** A temp dir holding a bare origin with `pilot` two commits long, and a clone of it. */
function scratch(t, { pilot = true } = {}) {
  return gitFixture(t, `gate1-lineage:scratch:${pilot}`, (root) => buildScratch(root, pilot));
}

function buildScratch(root, pilot) {
  const origin = path.join(root, 'origin.git');
  const work = path.join(root, 'work');
  git(root, 'init', '-q', '--bare', '-b', 'main', origin);
  git(root, 'clone', '-q', origin, work);
  const commit = (file, text, message = `${file}: ${text}`) => {
    fs.writeFileSync(path.join(work, file), text);
    git(work, 'add', file);
    git(work, 'commit', '-q', '-m', message);
  };
  commit('a.txt', 'base\n');
  // The artefact the gate signs, read at its sha (verdict-pass L5): no A‹n›, so no verdict owed.
  fs.mkdirSync(path.join(work, path.dirname(GATE1.artefact)), { recursive: true });
  commit(GATE1.artefact, '# X\n');
  commit('b.txt', 'pilot\n');
  if (pilot) git(work, 'push', '-q', 'origin', 'HEAD:pilot');
  return { work, commit };
}

/** Posts a gate1 for `branch` in `repo` at the branch's own sha where it resolves, through `callTool`, its red ticket put first. */
function postGate1(repo, branch) {
  let sha = GATE1.sha;
  try {
    sha = git(repo, 'rev-parse', '--verify', '-q', branch);
  } catch {
    // A plain directory, or a branch that does not resolve, keeps the fixture's sha.
  }
  const evidence = withTicket({ ...GATE1, sha }, repo);
  resolveItem(postItem({ kind: 'question', title: 'Merge?', body: 'None.', repo, ticket: evidence.ticket, author: 'pilot:pilot-architect' }).id, 'merged nothing', 'pilot:pilot-architect');
  return callTool('deck_post', { kind: KIND_GATE1, title: 'Gate 1', body: 'The design.', repo, ...evidence, branch });
}

const gate1s = () => listItems().filter((item) => item.kind === KIND_GATE1);
const refused = (...parts) => (error) => error instanceof DeckRefusal && parts.every((part) => error.message.includes(part));

test('a gate1 for a branch carrying a copied pilot commit is refused', (t) => {
  tempDeck(t);
  const { work, commit } = scratch(t);
  git(work, 'checkout', '-q', '-b', 'design/x', 'HEAD~1');
  // A replay: pilot's patch under another message, so never pilot's own sha in the same second.
  commit('b.txt', 'pilot\n', 'replayed from pilot');
  commit('docs.md', 'design\n');
  assert.throws(() => postGate1(work, 'design/x'), refused('design/x', 'carries 1 copy of', 'git rebase origin/pilot'));
  assert.equal(gate1s().length, 0, 'no gate1 stored');
});

test("a gate1 for a branch cut from pilot's tip posts", (t) => {
  tempDeck(t);
  const { work, commit } = scratch(t);
  git(work, 'checkout', '-q', '-b', 'design/x', 'origin/pilot');
  commit('docs.md', 'design\n');
  assert.match(postGate1(work, 'design/x').content[0].text, /^Posted itm_/);
  assert.equal(gate1s().length, 1);
});

test('a gate1 for a branch merely behind pilot is refused', (t) => {
  tempDeck(t);
  const { work, commit } = scratch(t);
  git(work, 'checkout', '-q', '-b', 'design/x', 'HEAD~1');
  commit('docs.md', 'design\n');
  assert.throws(() => postGate1(work, 'design/x'), refused('design/x', "is not on pilot's tip", 'git rebase origin/pilot'));
  assert.equal(gate1s().length, 0);
});

test('a gate1 in a git repo with no origin/pilot is refused', (t) => {
  tempDeck(t);
  const { work } = scratch(t, { pilot: false });
  assert.throws(() => postGate1(work, 'main'), refused('pilot base'));
  assert.equal(gate1s().length, 0);
});

test('a gate1 whose branch does not resolve is refused', (t) => {
  tempDeck(t);
  const { work } = scratch(t);
  assert.throws(() => postGate1(work, 'design/nope'), refused('design/nope', 'could not be read'));
  assert.equal(gate1s().length, 0);
});

test('a gate1 whose repo is not a git repository is not checked', (t) => {
  tempDeck(t);
  const plain = fs.mkdtempSync(path.join(os.tmpdir(), 'gate1-lineage-plain-'));
  t.after(() => fs.rmSync(plain, { recursive: true, force: true }));
  assert.match(postGate1(plain, 'design/x').content[0].text, /^Posted itm_/);
  assert.equal(gate1s().length, 1);
});

test("a gate1's repo config runs no command while the deck reads its lineage", (t) => {
  tempDeck(t);
  const { work, commit } = scratch(t);
  git(work, 'checkout', '-q', '-b', 'design/x', 'HEAD~1');
  commit('docs.md', 'design\n');
  git(work, 'config', 'core.fsmonitor', 'touch PWNED #');
  assert.throws(() => postGate1(work, 'design/x'), refused("is not on pilot's tip"));
  assert.equal(fs.existsSync(path.join(work, 'PWNED')), false, 'core.fsmonitor did not run');
});

test('a gate1 whose branch carries a NUL byte is refused, not thrown past the deck', (t) => {
  tempDeck(t);
  const { work } = scratch(t);
  assert.throws(() => postGate1(work, 'design/\0x'), refused('branch'));
  assert.equal(gate1s().length, 0);
});

test('a gate1 whose lineage git does not answer before the deadline is refused', (t) => {
  const { work, commit } = scratch(t);
  git(work, 'checkout', '-q', '-b', 'design/x', 'origin/pilot');
  commit('docs.md', 'design\n');
  assert.throws(() => assertOnPilotTip(work, 'design/x', { timeout: 0 }), refused('design/x', 'within 5 s'));
});
