/**
 * audit-f14 S2 (spec 13; A7): the gate1 lineage check reads the run's base, not pilot, so a
 * design branch cut from main is accepted and a copy of one of main's commits is still refused;
 * and a run base is never shaped like an option. A local bare origin and a scratch deck only.
 */

import './no-open.mjs';
import { gitFixture } from '../../scripts/test/lib/git-fixture.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import { KIND_GATE1 } from '../items.mjs';
import { assertOnPilotTip } from '../lineage.mjs';
import { RUN_BASE } from '../runs.mjs';
import { DeckRefusal, listItems, postItem, registerRun, resolveItem, setSlices } from '../store.mjs';
import { tempDeck, withTicket } from '../testUtils.mjs';

const { callTool } = await import('../server.mjs');

const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const ARTEFACT = 'docs/design/x/architecture.md';

/** A bare origin whose `main` is three commits long and whose `pilot` is one ahead of it, and a clone. */
function scratch(t) {
  return gitFixture(t, 'lineage-base:scratch', (root) => {
    const origin = path.join(root, 'origin.git');
    const work = path.join(root, 'work');
    git(root, 'init', '-q', '--bare', '-b', 'main', origin);
    git(root, 'clone', '-q', origin, work);
    const commit = (file, text, message = `${file}: ${text}`) => {
      fs.mkdirSync(path.dirname(path.join(work, file)), { recursive: true });
      fs.writeFileSync(path.join(work, file), text);
      git(work, 'add', file);
      git(work, 'commit', '-q', '-m', message);
    };
    commit('a.txt', 'base\n');
    commit(ARTEFACT, '# X\n');
    commit('b.txt', 'main\n');
    git(work, 'push', '-q', 'origin', 'HEAD:main');
    commit('c.txt', 'landed on pilot\n');
    git(work, 'push', '-q', 'origin', 'HEAD:pilot');
    git(work, 'checkout', '-q', '--detach', 'origin/main');
    return { work, commit };
  });
}

const refused = (...parts) => (error) => error instanceof DeckRefusal && parts.every((part) => error.message.includes(part));

test('a gate1 cut from main is accepted', (t) => {
  const { work, commit } = scratch(t);
  git(work, 'checkout', '-q', '-b', 'design/x', 'origin/main');
  commit('docs.md', 'design\n');
  assert.doesNotThrow(() => assertOnPilotTip(work, 'design/x', { base: 'main' }));
  assert.throws(() => assertOnPilotTip(work, 'design/x'), refused("is not on pilot's tip"), 'pilot stays the default base');
});

test("a branch carrying a copy of one of main's commits is refused, naming origin/main", (t) => {
  const { work, commit } = scratch(t);
  git(work, 'checkout', '-q', '-b', 'design/x', 'origin/main~1');
  // A replay: main's patch under another message, so never main's own sha.
  commit('b.txt', 'main\n', 'replayed from main');
  commit('docs.md', 'design\n');
  assert.throws(() => assertOnPilotTip(work, 'design/x', { base: 'main' }), refused('design/x', "1 copy of main's commits", 'git rebase origin/main'));
});

test('a base the repository does not hold is refused, naming it', (t) => {
  const { work } = scratch(t);
  assert.throws(() => assertOnPilotTip(work, 'origin/main', { base: 'trunk' }), refused('has no origin/trunk', 'git fetch origin trunk'));
});

test('an option-shaped base is refused', (t) => {
  for (const bad of ['--upload-pack=x', '-x', 'a..b', 'HEAD', '']) assert.equal(RUN_BASE.test(bad), false, bad);
  for (const good of ['pilot', 'feat/x', 'main', 'trunk', 'release/1.2']) assert.equal(RUN_BASE.test(good), true, good);
  const { work } = scratch(t);
  assert.throws(() => assertOnPilotTip(work, 'origin/main', { base: '--upload-pack=x' }), refused('--upload-pack=x'));
});

test("the deck accepts a gate1 cut from main when the ticket's record names base main", (t) => {
  tempDeck(t);
  const { work, commit } = scratch(t);
  git(work, 'checkout', '-q', '-b', 'design/x', 'origin/main');
  commit('docs.md', 'design\n');
  const sha = git(work, 'rev-parse', 'design/x');
  const evidence = withTicket({ artefact: ARTEFACT, sha, locked: 3, slices: '| S1 |' }, work);
  resolveItem(postItem({ kind: 'question', title: 'Merge?', body: 'None.', repo: work, ticket: evidence.ticket, author: 'pilot:pilot-architect' }).id, 'merged nothing', 'pilot:pilot-architect');
  setSlices(registerRun({ repo: work, pid: process.pid }).id, [{ slice: 'S1', state: 'planned' }], undefined, { slug: 'x', ticket: evidence.ticket, base: 'main' });
  callTool('deck_post', { kind: KIND_GATE1, title: 'Gate 1', body: 'The design.', repo: work, ...evidence, branch: 'design/x' }, { prWrite: () => {} });
  assert.equal(listItems().filter((item) => item.kind === KIND_GATE1).length, 1);
});
