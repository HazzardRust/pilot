/**
 * audit-f14 S2 (spec 13; A7): the gate1 lineage check reads the run's base, not pilot, so a
 * design branch cut from main is accepted and a copy of one of main's commits is still refused;
 * and a run base is never shaped like an option. A local bare origin and a scratch deck only.
 */

import './no-open.mjs';
import { GIT_SLOW_MS, gitFixture } from '../../scripts/test/lib/git-fixture.mjs';
import { seed } from '../../scripts/test/lib/seed.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

import { KIND_GATE1 } from '../items.mjs';
import { assertOnPilotTip } from '../lineage.mjs';
import { RUN_BASE } from '../runs.mjs';
import { DeckRefusal, listItems, postItem, registerRun, resolveItem, setSlices } from '../store.mjs';
import { tempDeck, withTicket } from '../testUtils.mjs';

const { callTool } = await import('../server.mjs');

const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const ARTEFACT = 'docs/design/x/architecture.md';

/**
 * A bare origin whose `main` is three commits long and whose `pilot` is one ahead of it, and a clone on
 * `design/x`: one docs commit on main's tip, or under `replay`, cut from `main~1` with a copy of main's
 * last patch under another message and then the docs commit. One seed and one clone each.
 */
function scratch(t, { replay = false } = {}) {
  return gitFixture(t, `lineage-base:${replay ? 'replay' : 'scratch'}`, (root) => {
    const step = (branch, file, text, message = `${file}: ${text}`) => ({ branch, files: { [file]: text }, message });
    const design = [
      ...(replay ? [{ ...step('design/x', 'b.txt', 'main\n', 'replayed from main'), from: 'main' }] : []),
      { ...step('design/x', 'docs.md', 'design\n'), ...(replay ? {} : { from: 'main' }) },
    ];
    const { origin, sha } = seed(root, [
      step('main', 'a.txt', 'base\n'),
      step('main', ARTEFACT, '# X\n'),
      ...(replay ? design : []),
      step('main', 'b.txt', 'main\n'),
      { ...step('pilot', 'c.txt', 'landed on pilot\n'), from: 'main' },
      ...(replay ? [] : design),
    ]);
    const work = path.join(root, 'work');
    git(root, 'clone', '-q', '-b', 'design/x', origin, work);
    return { work, design: sha['design/x'] };
  });
}

const refused = (...parts) => (error) => error instanceof DeckRefusal && parts.every((part) => error.message.includes(part));

test('a gate1 cut from main is accepted', (t) => {
  const { work } = scratch(t);
  assert.doesNotThrow(() => assertOnPilotTip(work, 'design/x', { base: 'main', timeout: GIT_SLOW_MS }));
  assert.throws(() => assertOnPilotTip(work, 'design/x', { timeout: GIT_SLOW_MS }), refused("is not on pilot's tip"), 'pilot stays the default base');
});

test("a branch carrying a copy of one of main's commits is refused, naming origin/main", (t) => {
  // A replay: main's patch under another message, so never main's own sha.
  const { work } = scratch(t, { replay: true });
  assert.throws(() => assertOnPilotTip(work, 'design/x', { base: 'main', timeout: GIT_SLOW_MS }), refused('design/x', "1 copy of main's commits", 'git rebase origin/main'));
});

test('a base the repository does not hold is refused, naming it', (t) => {
  const { work } = scratch(t);
  assert.throws(() => assertOnPilotTip(work, 'origin/main', { base: 'trunk', timeout: GIT_SLOW_MS }), refused('has no origin/trunk', 'git fetch origin trunk'));
});

test('an option-shaped base is refused', (t) => {
  for (const bad of ['--upload-pack=x', '-x', 'a..b', 'HEAD', '', 'main/', 'main.', 'a//b', 'main.lock']) assert.equal(RUN_BASE.test(bad), false, bad);
  for (const good of ['pilot', 'feat/x', 'main', 'trunk', 'release/1.2']) assert.equal(RUN_BASE.test(good), true, good);
  const { work } = scratch(t);
  assert.throws(() => assertOnPilotTip(work, 'origin/main', { base: '--upload-pack=x', timeout: GIT_SLOW_MS }), refused('--upload-pack=x'));
});

test("the deck accepts a gate1 cut from main when the ticket's record names base main", (t) => {
  tempDeck(t);
  const { work, design: sha } = scratch(t);
  const evidence = withTicket({ artefact: ARTEFACT, sha, locked: 3, slices: '| S1 |' }, work);
  resolveItem(postItem({ kind: 'question', title: 'Merge?', body: 'None.', repo: work, ticket: evidence.ticket, author: 'pilot:pilot-architect' }).id, 'merged nothing', 'pilot:pilot-architect');
  setSlices(registerRun({ repo: work, pid: process.pid }).id, [{ slice: 'S1', state: 'planned' }], undefined, { slug: 'x', ticket: evidence.ticket, base: 'main' });
  callTool('deck_post', { kind: KIND_GATE1, title: 'Gate 1', body: 'The design.\nBase: main', repo: work, ...evidence, branch: 'design/x' }, { prWrite: () => {}, lineageTimeout: GIT_SLOW_MS });
  assert.equal(listItems().filter((item) => item.kind === KIND_GATE1).length, 1);
});
