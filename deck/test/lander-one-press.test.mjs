/**
 * lander S7 (spec 4; L7): the user's one Sign off stands whatever stops the landing. A refused gate2 refuses a
 * second press naming the lander, offers no second Sign off, and only the lander lands it again, in the kept
 * worktree when there is a conflict and fresh otherwise. Spawn is injected; every test takes its own store.
 */

import './no-open.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { KIND_GATE2, SIGN_OFF } from '../items.mjs';
import { landingReply } from '../landing-replies.mjs';
import { callTool } from '../server-tools.mjs';
import { addReply, listItems, postItem, registerRun, setSlices, settleLanding } from '../store.mjs';
import { renderThreadPage } from '../ui/render.mjs';
import { tempDeck, withTicket } from '../testUtils.mjs';

const itemOf = (id) => listItems().find((item) => item.id === id);

function scratch(t, name) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `pilot-one-${name}-`));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

/** A signed gate2 whose record names a feature worktree, and a worktree land could keep. */
function aSigned(t) {
  const repo = scratch(t, 'repo');
  fs.mkdirSync(path.join(repo, '.git'));
  const kept = scratch(t, 'kept');
  const admin = path.join(repo, '.git', 'worktrees', 'land-x');
  fs.writeFileSync(path.join(kept, '.git'), `gitdir: ${admin.replace(/\\/g, '/')}\n`);
  fs.mkdirSync(admin, { recursive: true });
  fs.writeFileSync(path.join(admin, 'gitdir'), `${path.join(kept, '.git').replace(/\\/g, '/')}\n`);
  const feature = scratch(t, 'feat-x');
  fs.writeFileSync(path.join(feature, '.git'), `gitdir: ${repo.replace(/\\/g, '/')}/.git/worktrees/feat-x\n`);
  const evidence = withTicket({ pr: '#590', sha: '0305827' }, repo, 'yellow');
  const gate = postItem({ kind: KIND_GATE2, title: 'Gate 2', body: 'Walk it.', repo, author: 'qa', ...evidence });
  addReply(gate.id, SIGN_OFF);
  setSlices(registerRun({ repo, pid: process.pid }).id, [{ slice: 'x', state: 'in QA', branch: 'feat/x' }], undefined, { slug: 'x', ticket: evidence.ticket, worktree: feature });
  return { gate, kept, feature };
}

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

const redGate = { ok: false, line: 'NOT landed: npm test failed', code: 1 };
const userReplies = (id) => itemOf(id).replies.filter((message) => message.from === 'user').length;

test('a second press on a refused gate2 is refused naming the lander', (t) => {
  tempDeck(t);
  const { gate } = aSigned(t);
  settleLanding(gate.id, redGate);
  const { calls } = spawns();
  const before = itemOf(gate.id).replies.length;

  assert.throws(() => addReply(gate.id, SIGN_OFF), { name: 'DeckRefusal', message: /did not land; the lander lands it again, not a second press/ });

  assert.equal(itemOf(gate.id).replies.length, before, 'nothing stored');
  assert.equal(itemOf(gate.id).landing.state, 'refused');
  assert.equal(calls.length, 0, 'nothing spawned');
});

test('the lander lands a red-gate refusal again', (t) => {
  tempDeck(t);
  const { gate, feature } = aSigned(t);
  settleLanding(gate.id, redGate);
  const item = itemOf(gate.id);

  assert.equal(landingReply(item, 'Land again', 'lander', new Date().toISOString()), true);
  assert.equal(item.landing.state, 'running');
  assert.equal(item.landing.conflict, undefined);

  const { calls, spawn } = spawns();
  settleLanding(gate.id, redGate);
  callTool('deck_reply', { id: gate.id, text: 'Land again', author: 'pilot:pilot-lander' }, { spawn, env: {} });
  assert.equal(calls.length, 1, 'one land');
  assert.equal(path.resolve(calls[0].cwd), path.resolve(feature), "in the record's worktree");
  assert.equal(itemOf(gate.id).landing.state, 'running');
});

test("the pilot's Land again on a refusal with no conflict is still refused", (t) => {
  tempDeck(t);
  const { gate } = aSigned(t);
  settleLanding(gate.id, redGate);

  assert.throws(() => landingReply(itemOf(gate.id), 'Land again', 'pilot', new Date().toISOString()), { name: 'DeckRefusal' });
  assert.equal(itemOf(gate.id).landing.state, 'refused');
});

test('pilot moves between press and merge and the feature lands on one press', (t) => {
  tempDeck(t);
  const { gate, kept } = aSigned(t);
  const { calls, spawn } = spawns();

  // land exits 3: pilot moved, the feature conflicts, and the worktree is kept for the lander.
  settleLanding(gate.id, { ok: false, line: `NOT landed: feat/x conflicts with pilot in deck/a.mjs; the lander resolves in ${kept}`, code: 3 });
  assert.equal(itemOf(gate.id).landing.state, 'refused');
  assert.throws(() => addReply(gate.id, SIGN_OFF), { name: 'DeckRefusal', message: /lander/ });

  callTool('deck_reply', { id: gate.id, text: 'Resolving', author: 'pilot:pilot-lander' }, { spawn, env: {} });
  callTool('deck_reply', { id: gate.id, text: 'Land again', author: 'pilot:pilot-lander' }, { spawn, env: {} });
  assert.equal(calls.length, 1, 'one land');
  assert.equal(itemOf(gate.id).landing.state, 'running');

  settleLanding(gate.id, { ok: true, sha: 'abcdef1234567', line: 'landed feat/x on pilot at abcdef1' });
  assert.equal(itemOf(gate.id).landing.state, 'landed');
  assert.equal(userReplies(gate.id), 1, 'the thread holds one Sign off');
});

test('a refused gate2 offers no second Sign off', (t) => {
  tempDeck(t);
  const { gate } = aSigned(t);
  const offered = () => /<button type="submit" name="choice" value="Sign off"(?![^>]*disabled)/.test(renderThreadPage(itemOf(gate.id), listItems()));
  assert.equal(offered(), false, 'signed');
  settleLanding(gate.id, redGate);
  assert.equal(offered(), false, 'refused');
});
