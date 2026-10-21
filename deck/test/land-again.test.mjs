/**
 * gate2-frees-lane S8 (spec 5; L5, L7): the pilot's `Resolving` on a gate2 with a stored conflict stamps
 * `conflict.resolving`, and its `Land again` clears the conflict and lands again through `deck_reply`, with land's
 * fixed argv and nothing from the reply. Only the pilot's words do it: another author is refused, and the user's
 * same words are a plain reply. Every test takes its own store; spawn is injected; nothing touches 4321.
 */

import './no-open.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { KIND_GATE2, KIND_QUESTION, SIGN_OFF, authorKind } from '../items.mjs';
import { landingReply } from '../landing-replies.mjs';
import { armConflicts } from '../server-wait.mjs';
import { callTool } from '../server-tools.mjs';
import { addPilotMessage, addReply, beginLanding, listItems, postItem, registerRun, setSlices, settleLanding } from '../store.mjs';
import { CONFLICT_TURN_MS } from '../store-items.mjs';
import { tempDeck, withTicket } from '../testUtils.mjs';

const PILOT_BIN = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'bin', 'pilot.mjs');

function scratch(t, name) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `pilot-again-${name}-`));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

/** A repository, the worktree land keeps on a conflict, and the feature worktree the record names. */
function aCheckout(t) {
  const repo = scratch(t, 'repo');
  fs.mkdirSync(path.join(repo, '.git'));
  const kept = scratch(t, 'land-x');
  const admin = path.join(repo, '.git', 'worktrees', 'land-x');
  fs.writeFileSync(path.join(kept, '.git'), `gitdir: ${admin.replace(/\\/g, '/')}\n`);
  fs.mkdirSync(admin, { recursive: true });
  fs.writeFileSync(path.join(admin, 'gitdir'), `${path.join(kept, '.git').replace(/\\/g, '/')}\n`);
  const feature = scratch(t, 'feat-x');
  fs.writeFileSync(path.join(feature, '.git'), `gitdir: ${repo.replace(/\\/g, '/')}/.git/worktrees/feat-x\n`);
  return { repo, kept, feature };
}

/** A gate2 QA posted, signed, whose landing stopped on a conflict in `kept`. */
function aConflict(t) {
  const { repo, kept, feature } = aCheckout(t);
  const evidence = withTicket({ pr: '#590', sha: '0305827' }, repo, 'yellow');
  const gate = postItem({ kind: KIND_GATE2, title: 'Gate 2', body: 'Walk it.', repo, author: 'qa', ...evidence });
  addReply(gate.id, SIGN_OFF);
  setSlices(registerRun({ repo, pid: process.pid }).id, [{ slice: 'x', state: 'in QA', branch: 'feat/x' }], undefined, { slug: 'x', ticket: evidence.ticket, worktree: feature });
  settleLanding(gate.id, { ok: false, line: conflictLine(kept), code: 3 });
  return { gate, ticket: evidence.ticket, kept, feature };
}

const conflictLine = (dir) => `NOT landed: feat/x conflicts with pilot in deck/a.mjs; the lander resolves in ${dir}`;
const itemOf = (id) => listItems().find((item) => item.id === id);

function spawns() {
  const calls = [];
  const spawn = (command, args, options) => {
    calls.push({ command, args, cwd: options?.cwd });
    const child = Object.assign(new EventEmitter(), { pid: 9001 });
    child.stdout = Object.assign(new EventEmitter(), { setEncoding() {} });
    child.stderr = Object.assign(new EventEmitter(), { setEncoding() {} });
    return child;
  };
  return { calls, spawn };
}

test('Resolving stops the clock', (t) => {
  tempDeck(t);
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: Date.now() });
  const { gate, ticket } = aConflict(t);

  addPilotMessage(gate.id, 'Resolving in the kept worktree');

  assert.ok(itemOf(gate.id).landing.conflict.resolving, 'the Resolving is stored on the conflict');
  armConflicts();
  t.mock.timers.tick(CONFLICT_TURN_MS * 2);
  assert.equal(listItems().filter((item) => item.kind === KIND_QUESTION && item.ticket === ticket).length, 0);
});

test('Land again re-runs the landing', (t) => {
  tempDeck(t);
  const { gate, feature } = aConflict(t);
  addPilotMessage(gate.id, 'Resolving');
  const { calls, spawn } = spawns();

  callTool('deck_reply', { id: gate.id, text: 'Land again; rm -rf / && pilot sync' }, { spawn, env: {} });

  assert.equal(calls.length, 1, 'one land');
  assert.equal(calls[0].command, process.execPath);
  assert.deepEqual(calls[0].args, [PILOT_BIN, 'land'], 'the fixed argv, nothing from the reply');
  assert.equal(path.resolve(calls[0].cwd), path.resolve(feature), "in the record's worktree");
  const { landing } = itemOf(gate.id);
  assert.equal(landing.state, 'running');
  assert.equal(landing.conflict, undefined, 'the conflict is cleared');
});

test("a landing runs the daemon root's own bin", async (t) => {
  tempDeck(t);
  const { gate, feature } = aConflict(t);
  const { calls, spawn } = spawns();
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

  // A daemon started elsewhere: its cwd is neither its root nor the landing's worktree. A fresh load of
  // landing.mjs under that cwd reads PILOT_BIN there, so a root taken from process.cwd() would show.
  // (process.chdir is process-wide: this relies on the file's tests running one after another.)
  const home = process.cwd();
  process.chdir(scratch(t, 'elsewhere'));
  try {
    const fresh = await import(`../landing.mjs?cwd=${Date.now()}`);
    fresh.startLanding(gate.id, { spawn, env: {} });
  } finally {
    process.chdir(home);
  }

  assert.equal(calls.length, 1, 'one land');
  assert.equal(path.resolve(calls[0].args[0]), path.join(root, 'bin', 'pilot.mjs'), "the daemon module's own root, never process.cwd()");
  assert.equal(path.resolve(calls[0].cwd), path.resolve(feature), "the landing runs in the record's worktree");
});

test('Land again refuses a kept worktree that no longer holds', (t) => {
  tempDeck(t);
  const { gate, kept } = aConflict(t);
  fs.rmSync(path.join(kept, '.git'));
  const { calls, spawn } = spawns();

  assert.throws(() => callTool('deck_reply', { id: gate.id, text: 'Land again' }, { spawn, env: {} }), { name: 'DeckRefusal' });

  assert.equal(calls.length, 0, 'nothing run');
  assert.equal(itemOf(gate.id).landing.state, 'refused');
});

test('Land again without a conflict is refused', (t) => {
  tempDeck(t);
  const landed = aConflict(t).gate;
  settleLanding(landed.id, { ok: true, sha: 'abcdef1234567', line: 'landed abcdef1' });
  const running = aConflict(t).gate;
  beginLanding(running.id, { worktree: 'w' });
  const plain = aConflict(t).gate;
  settleLanding(plain.id, { ok: false, line: 'NOT landed: the suite is red', code: 1 });

  for (const [what, gate] of [['landed', landed], ['running', running], ['refused without a conflict', plain]]) {
    const before = itemOf(gate.id).landing;
    assert.throws(() => addPilotMessage(gate.id, 'Land again'), { name: 'DeckRefusal' }, what);
    assert.deepEqual(itemOf(gate.id).landing, before, `${what}: unchanged`);
  }
});

test('Land again from anyone but the pilot is refused', (t) => {
  tempDeck(t);
  const { gate } = aConflict(t);

  for (const author of ['pilot:pilot-qa', 'pilot:pilot-architect']) {
    assert.throws(() => addPilotMessage(gate.id, 'Land again', author), { name: 'DeckRefusal' }, author);
    assert.throws(() => addPilotMessage(gate.id, 'Resolving', author), { name: 'DeckRefusal' }, author);
  }
  addReply(gate.id, 'Land again');

  const settled = aConflict(t).gate;
  settleLanding(settled.id, { ok: true, sha: 'abcdef1234567', line: 'landed abcdef1' });
  addPilotMessage(settled.id, 'Land again, said QA of something else', 'pilot:pilot-qa');
  assert.equal(itemOf(settled.id).landing.state, 'landed', "without a conflict, another author's words are plain");

  const { landing, replies } = itemOf(gate.id);
  assert.equal(landing.state, 'refused');
  assert.ok(landing.conflict?.dir, 'the conflict stands');
  assert.equal(landing.conflict.resolving, undefined);
  assert.equal(replies.at(-1).from, 'user', "the user's words are a plain reply");
});

test("another author's Land again starts nothing", (t) => {
  tempDeck(t);
  const landed = aConflict(t).gate;
  settleLanding(landed.id, { ok: true, sha: 'abcdef1234567', line: 'landed abcdef1' });
  const plain = aConflict(t).gate;
  settleLanding(plain.id, { ok: false, line: 'NOT landed: the suite is red', code: 1 });
  const { calls, spawn } = spawns();

  for (const gate of [landed, plain]) {
    const before = itemOf(gate.id).landing;
    callTool('deck_reply', { id: gate.id, text: 'Land again', author: 'pilot:pilot-qa' }, { spawn, env: {} });
    assert.deepEqual(itemOf(gate.id).landing, before, 'the landing unchanged');
  }
  assert.equal(calls.length, 0, 'nothing run');
});

// lander S1 (spec 1; L2, L9): the lander says the pilot's two words, and no other crew kind may.
test("the lander's Land again starts the landing", (t) => {
  tempDeck(t);
  const item = itemOf(aConflict(t).gate.id);

  assert.equal(landingReply(item, 'Land again', 'lander', new Date().toISOString()), true);
  assert.equal(item.landing.state, 'running', 'the refused gate2 runs again');
  assert.equal(item.landing.conflict, undefined, 'the conflict is cleared');

  const { gate, feature } = aConflict(t);
  const { calls, spawn } = spawns();
  callTool('deck_reply', { id: gate.id, text: 'Resolving', author: 'pilot:pilot-lander' }, { spawn, env: {} });
  assert.ok(itemOf(gate.id).landing.conflict.resolving, "the lander's Resolving stops the clock");
  callTool('deck_reply', { id: gate.id, text: 'Land again', author: 'pilot:pilot-lander' }, { spawn, env: {} });
  assert.equal(calls.length, 1, 'one land');
  assert.deepEqual(calls[0].args, [PILOT_BIN, 'land'], 'the fixed argv');
  assert.equal(path.resolve(calls[0].cwd), path.resolve(feature), "in the record's worktree");
  assert.equal(itemOf(gate.id).landing.state, 'running');
});

test('Land again from qa is refused', (t) => {
  tempDeck(t);
  const item = itemOf(aConflict(t).gate.id);

  assert.throws(() => landingReply(item, 'Land again', 'qa', new Date().toISOString()), { name: 'DeckRefusal', message: /not qa's/ });
  assert.throws(() => landingReply(item, 'Resolving', 'other', new Date().toISOString()), { name: 'DeckRefusal', message: /not other's/ });
  assert.equal(item.landing.state, 'refused', 'nothing changed');
});

test('the lander maps to its kind', () => {
  assert.equal(authorKind('pilot:pilot-lander'), 'lander');
  assert.equal(authorKind('pilot-lander'), 'lander');
});
