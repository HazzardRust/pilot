/**
 * gate2-frees-lane S7 (spec 5; L7, A1): land's exit 3 is stored as `landing.conflict { dir }` when the dir it names
 * is a linked worktree of the gate2's repository, and `armConflicts` hands a conflict the pilot has not answered
 * `Resolving` within `CONFLICT_TURN_MS` to the user as one blocked question. Every test takes its own store; the clock
 * is mocked, never waited on; nothing touches 4321.
 */

import './no-open.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { KIND_GATE2, KIND_QUESTION, SIGN_OFF } from '../items.mjs';
import { startLanding } from '../landing.mjs';
import { armConflicts } from '../server-wait.mjs';
import { addPilotMessage, addReply, listItems, postItem, registerRun, setSlices, settleLanding } from '../store.mjs';
import { CONFLICT_TURN_MS } from '../store-items.mjs';
import { tempDeck, withTicket } from '../testUtils.mjs';

const MINUTE = 60_000;
const START = Date.parse('2026-10-17T10:00:00Z');

/** A directory of the test's own, removed when it ends. */
function scratch(t, name) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `pilot-conflict-${name}-`));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

/** A repository and the `<checkout>-land-<slug>` worktree land keeps on a conflict. */
function aCheckout(t) {
  const repo = scratch(t, 'repo');
  fs.mkdirSync(path.join(repo, '.git'));
  const kept = scratch(t, 'land-x');
  const admin = path.join(repo, '.git', 'worktrees', 'land-x');
  fs.writeFileSync(path.join(kept, '.git'), `gitdir: ${admin.replace(/\\/g, '/')}\n`);
  fs.mkdirSync(admin, { recursive: true });
  fs.writeFileSync(path.join(admin, 'gitdir'), `${path.join(kept, '.git').replace(/\\/g, '/')}\n`);
  return { repo, kept };
}

/** A signed gate2 on a yellow ticket in `repo`. */
function aSignedGate2(repo) {
  const evidence = withTicket({ pr: '#590', sha: '0305827' }, repo, 'yellow');
  const gate = postItem({ kind: KIND_GATE2, title: 'Gate 2', body: 'Walk it.', repo, ...evidence });
  addReply(gate.id, SIGN_OFF);
  return { ticket: evidence.ticket, gate };
}

const conflictLine = (dir) => `NOT landed: feat/x conflicts with pilot in deck/a.mjs; the lander resolves in ${dir}`;
const itemOf = (id) => listItems().find((item) => item.id === id);
const questionsOn = (ticket) => listItems().filter((item) => item.kind === KIND_QUESTION && item.ticket === ticket);

test('exit 3 stores the kept worktree', (t) => {
  tempDeck(t);
  const { repo, kept } = aCheckout(t);
  const { gate } = aSignedGate2(repo);

  settleLanding(gate.id, { ok: false, line: conflictLine(kept), code: 3 });

  const { landing } = itemOf(gate.id);
  assert.equal(landing.state, 'refused');
  assert.equal(landing.conflict?.dir, kept, 'the dir land named is stored');
  assert.equal(landing.conflict.at, landing.at, 'stamped with the settle');
  assert.match(landing.line, /conflicts with pilot/);
});

test('the deck stores the dir the lander line names', (t) => {
  tempDeck(t);
  const { repo, kept } = aCheckout(t);
  const { gate } = aSignedGate2(repo);
  const elsewhere = aCheckout(t).kept;

  settleLanding(gate.id, { ok: false, line: conflictLine(kept).replace('deck/a.mjs', `x; the lander resolves in ${elsewhere}`), code: 3 });

  assert.equal(itemOf(gate.id).landing.conflict?.dir, kept, 'a path named like the tail does not move the dir');
});

test('the deck passes the exit 3 of land to the settle', (t) => {
  tempDeck(t);
  const { repo, kept } = aCheckout(t);
  const feature = scratch(t, 'feat-x');
  fs.writeFileSync(path.join(feature, '.git'), `gitdir: ${repo.replace(/\\/g, '/')}/.git/worktrees/feat-x\n`);
  const { ticket, gate } = aSignedGate2(repo);
  setSlices(registerRun({ repo, pid: process.pid }).id, [{ slice: 'x', state: 'in QA', branch: 'feat/x' }], undefined, { slug: 'x', ticket, worktree: feature });
  let child;
  const spawn = () => {
    child = Object.assign(new EventEmitter(), { pid: 9001 });
    child.stdout = Object.assign(new EventEmitter(), { setEncoding() {} });
    child.stderr = Object.assign(new EventEmitter(), { setEncoding() {} });
    return child;
  };

  startLanding(gate.id, { spawn, env: {} });
  child.stdout.emit('data', `${conflictLine(kept)}\n`);
  child.emit('close', 3, null);

  assert.equal(itemOf(gate.id).landing.conflict?.dir, kept);
});

test('a dir outside the repository is not stored', (t) => {
  tempDeck(t);
  const { repo, kept } = aCheckout(t);
  const { gate } = aSignedGate2(repo);
  const elsewhere = aCheckout(t).kept;
  // A `.git` file naming this repository that the repository does not name back.
  const forged = scratch(t, 'forged');
  fs.writeFileSync(path.join(forged, '.git'), `gitdir: ${repo.replace(/\\/g, '/')}/.git/worktrees/land-x\n`);
  const lines = [
    ['another repository', conflictLine(elsewhere)],
    ['the checkout itself', conflictLine(repo)],
    // Relative to its own parent, never the cwd: a runner's checkout and TEMP sit on two drives, where that is absolute.
    ['a relative dir', conflictLine(path.relative(path.dirname(kept), kept))],
    ['a dir that is not there', conflictLine(path.join(repo, 'gone'))],
    ['a forged worktree', conflictLine(forged)],
    ['a share', conflictLine('\\\\host\\share\\land-x')],
    ['a file name that steers the parse', conflictLine(kept).replace('deck/a.mjs', `a; the lander resolves in ${forged}`).replace(kept, 'b')],
  ];
  for (const [what, line] of lines) {
    settleLanding(gate.id, { ok: false, line, code: 3 });
    const { landing } = itemOf(gate.id);
    assert.equal(landing.conflict, undefined, `${what} is not stored`);
    assert.equal(landing.line, line, `${what}: the line kept`);
  }
  settleLanding(gate.id, { ok: false, line: conflictLine(kept), code: 1 });
  assert.equal(itemOf(gate.id).landing.conflict, undefined, 'only exit 3 is a conflict');
});

test('no Resolving within the limit asks once', (t) => {
  tempDeck(t);
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: START });
  const { repo, kept } = aCheckout(t);
  const { ticket, gate } = aSignedGate2(repo);
  const answered = aSignedGate2(repo);
  settleLanding(gate.id, { ok: false, line: conflictLine(kept), code: 3 });
  settleLanding(answered.gate.id, { ok: false, line: conflictLine(kept), code: 3 });
  addPilotMessage(answered.gate.id, 'Resolving');

  armConflicts();
  t.mock.timers.tick(CONFLICT_TURN_MS - 1);
  assert.equal(questionsOn(ticket).length, 0, 'not before the limit');
  t.mock.timers.tick(1);

  const asked = questionsOn(ticket);
  assert.equal(asked.length, 1, 'one question past the limit');
  assert.equal(asked[0].blocking, true);
  assert.equal(asked[0].title, `Resolve the landing conflict in ${kept}`);
  assert.equal(questionsOn(answered.ticket).length, 0, 'a Resolving stops the timer (L7)');

  armConflicts();
  t.mock.timers.tick(CONFLICT_TURN_MS);
  assert.equal(questionsOn(ticket).length, 1, 'armed again, none');
});

test('a restart fires an overdue conflict', (t) => {
  tempDeck(t);
  const { repo, kept } = aCheckout(t);
  const { ticket, gate } = aSignedGate2(repo);
  settleLanding(gate.id, { ok: false, line: conflictLine(kept), code: 3 });
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: Date.now() + CONFLICT_TURN_MS + MINUTE });

  armConflicts();
  t.mock.timers.tick(0);
  assert.equal(questionsOn(ticket).length, 1, 'the question at once');
});

test('only the last line of land names the kept worktree', (t) => {
  tempDeck(t);
  const { repo, kept } = aCheckout(t);
  const { gate } = aSignedGate2(repo);
  const other = aCheckout(t);

  settleLanding(gate.id, { ok: false, line: `${conflictLine(other.kept)}\n${conflictLine(kept)}`, code: 3 });
  assert.equal(itemOf(gate.id).landing.conflict?.dir, kept, 'an earlier line does not steer the dir');

  settleLanding(gate.id, { ok: false, line: `${conflictLine(kept)}\n${conflictLine(other.kept)}`, code: 3 });
  assert.equal(itemOf(gate.id).landing.conflict, undefined, 'nor stand in for the last');
});
