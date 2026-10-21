/**
 * A second press queues instead of refusing (gate2-frees-lane S6, spec 7): while one landing runs in
 * a repository, a Sign off on another gate2 there reads `queued`, and each settle starts the oldest
 * queued one, so two `land` children never run at once in one repository (gate2-lands A4). Every
 * spawn here is injected.
 */

import './no-open.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { KIND_GATE2, SIGN_OFF } from '../items.mjs';
import { closeLandedAtStart, startLanding, startQueued } from '../landing.mjs';
import { DeckRefusal, addReply, dismissItem, interruptLandings, listItems, postItem, registerRun, setSlices } from '../store.mjs';
import { tempDeck, withTicket } from '../testUtils.mjs';
import { renderThreadPage } from '../ui/render.mjs';

const reread = (id) => listItems().find((item) => item.id === id);
const deckLines = (id) => reread(id).replies.filter((message) => message.author === 'deck').map((message) => message.text);

/** A repository and a linked worktree of it, removed when the test ends. */
function aCheckout(t) {
  const made = (name) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), `pilot-queue-${name}-`));
    t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
    return dir;
  };
  const repo = made('repo');
  fs.mkdirSync(path.join(repo, '.git'));
  const worktree = made('wt');
  fs.writeFileSync(path.join(worktree, '.git'), `gitdir: ${repo.replace(/\\/g, '/')}/.git/worktrees/feat-x\n`);
  return { repo, worktree };
}

/** A signed gate2 in `repo`; its run record is written by `recorded`, just before it starts, as a newer record replaces an older. */
function aGate2({ repo }) {
  const gate = postItem({ kind: KIND_GATE2, title: 'Gate 2', body: 'Walk it.', repo, ...withTicket({ pr: '#250', sha: '0305827' }, repo, 'yellow') });
  addReply(gate.id, SIGN_OFF);
  return gate;
}

/** The run record that names `worktree` for `gate`'s ticket. */
function recorded(gate, { worktree }) {
  const run = registerRun({ repo: gate.repo, pid: 4242 });
  setSlices(run.id, [], undefined, { slug: 'x', ticket: gate.ticket, worktree });
}

/** `spawn` as the tests drive it: every child kept, each exited by the test. */
function aSpawn() {
  const children = [];
  const spawn = () => {
    const child = new EventEmitter();
    child.pid = 9000 + children.length;
    child.stdout = Object.assign(new EventEmitter(), { setEncoding() {} });
    child.stderr = Object.assign(new EventEmitter(), { setEncoding() {} });
    children.push(child);
    return child;
  };
  const exit = (child, code, stdout = '') => {
    if (stdout) child.stdout.emit('data', stdout);
    child.emit('close', code, null);
  };
  return { spawn, children, exit };
}

test('a second press is queued', (t) => {
  tempDeck(t);
  const fake = aSpawn();
  const checkout = aCheckout(t);
  const first = aGate2(checkout);
  const second = aGate2(checkout);
  recorded(first, checkout);
  startLanding(first.id, { spawn: fake.spawn, env: {} });

  assert.doesNotThrow(() => addReply(second.id, SIGN_OFF), 'another gate2 landing in the repository refuses no press');
  startLanding(second.id, { spawn: fake.spawn, env: {} });

  assert.equal(fake.children.length, 1, 'nothing spawned');
  assert.equal(reread(second.id).landing.state, 'queued');
  assert.ok(reread(second.id).landing.pressedAt);
  assert.deepEqual(deckLines(second.id), [`landing queued behind ${first.id}`]);
});

test('the settle starts the queued one', (t) => {
  tempDeck(t);
  const fake = aSpawn();
  const checkout = aCheckout(t);
  const first = aGate2(checkout);
  const second = aGate2(checkout);
  const third = aGate2(checkout);
  const deps = { spawn: fake.spawn, env: {} };
  recorded(first, checkout);
  for (const gate of [first, second, third]) startLanding(gate.id, deps);
  assert.equal(fake.children.length, 1);

  recorded(second, checkout);
  fake.exit(fake.children[0], 1);
  assert.equal(reread(first.id).landing.state, 'refused');
  assert.equal(fake.children.length, 2, 'the settle started one, never two');
  assert.equal(reread(second.id).landing.state, 'running', 'the oldest queued');
  assert.equal(reread(third.id).landing.state, 'queued');
  assert.equal(deckLines(second.id).at(-1), `landing started in ${checkout.worktree}`);

  recorded(third, checkout);
  fake.exit(fake.children[1], 1);
  assert.equal(reread(third.id).landing.state, 'running');
  assert.equal(fake.children.length, 3);
});

test('a press on its own running landing is still refused', (t) => {
  tempDeck(t);
  const fake = aSpawn();
  const checkout = aCheckout(t);
  const first = aGate2(checkout);
  const second = aGate2(checkout);
  recorded(first, checkout);
  startLanding(first.id, { spawn: fake.spawn, env: {} });
  startLanding(second.id, { spawn: fake.spawn, env: {} });

  assert.throws(() => addReply(first.id, SIGN_OFF), (error) => error instanceof DeckRefusal && new RegExp(`^gate2 ${first.id} is landing since \\d\\d:\\d\\d; nothing run$`).test(error.message));
  assert.throws(() => addReply(second.id, SIGN_OFF), (error) => error instanceof DeckRefusal && error.message === `gate2 ${second.id} is queued to land; nothing run`);
  const notYet = renderThreadPage(reread(second.id), listItems(), []).match(/<button[^>]*value="Not yet"[^>]*>/)?.[0];
  assert.match(notYet, /disabled/, 'the page offers no Not yet that a queued landing refuses');
  assert.equal(fake.children.length, 1);
});

test('a restart starts a queued landing', (t) => {
  tempDeck(t);
  const fake = aSpawn();
  const checkout = aCheckout(t);
  const first = aGate2(checkout);
  const second = aGate2(checkout);
  recorded(first, checkout);
  startLanding(first.id, { spawn: aSpawn().spawn, env: {} });
  startLanding(second.id, { spawn: aSpawn().spawn, env: {} });

  // The daemon's start-up sweep, in its order: the dead daemon's landing settles, then the queue is read.
  interruptLandings();
  closeLandedAtStart();
  recorded(second, checkout);
  startQueued({ spawn: fake.spawn, env: {} });
  startQueued({ spawn: fake.spawn, env: {} });

  assert.equal(fake.children.length, 1, 'started once');
  assert.equal(reread(second.id).landing.state, 'running');
});

test('a queued landing the user dismisses never starts', (t) => {
  tempDeck(t);
  const fake = aSpawn();
  const checkout = aCheckout(t);
  const first = aGate2(checkout);
  const second = aGate2(checkout);
  recorded(first, checkout);
  startLanding(first.id, { spawn: fake.spawn, env: {} });
  startLanding(second.id, { spawn: fake.spawn, env: {} });

  dismissItem(second.id);
  assert.equal(reread(second.id).landing.state, 'refused');
  assert.equal(deckLines(second.id).at(-1), 'landing dismissed while queued; nothing run');
  recorded(second, checkout);
  fake.exit(fake.children[0], 1);
  assert.equal(fake.children.length, 1, 'the settle starts nothing the user dismissed');
});

test('a landed gate2 frees the queue at once', (t) => {
  tempDeck(t);
  const fake = aSpawn();
  const checkout = aCheckout(t);
  const first = aGate2(checkout);
  const second = aGate2(checkout);
  const deps = { spawn: fake.spawn, env: {} };
  recorded(first, checkout);
  startLanding(first.id, deps);
  startLanding(second.id, deps);
  assert.equal(reread(second.id).landing.state, 'queued');

  recorded(second, checkout);
  fake.exit(fake.children[0], 0, 'landed feat/x on pilot at 1a2b3c4\nmain gets pilot: #251\n');
  assert.equal(reread(first.id).landing.state, 'landed');
  assert.equal(reread(second.id).landing.state, 'running', 'no ready press holds the repository');
  assert.equal(fake.children.length, 2);
});
