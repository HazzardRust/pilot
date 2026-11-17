/**
 * A landing re-cuts the plans it drifted (never-stuck S3, spec 14; L2, L4, L7): once a gate2 has landed, every open,
 * signed, never-granted yellow ticket of its repository is checked with S2's `planDrift`, each drifted one goes red
 * through `recutTicket`, and one deck line on the gate2 names them. The drift check runs in a real clone of a local
 * bare origin; the land child is a stub. Nothing reaches GitHub.
 */

import './no-open.mjs';
import { gitFixture } from '../../scripts/test/lib/git-fixture.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { KIND_GATE1, KIND_GATE2, KIND_TICKET, SIGN_OFF } from '../items.mjs';
import { driftAfterLanding, startLanding } from '../landing.mjs';
import { addReply, listItems, postItem, registerRun, requestSwitch, resolveItem, setCoPilot, setSlices, settleLanding } from '../store.mjs';
import { shapedTicketBody, takeLive, tempDeck, withTicket } from '../testUtils.mjs';

const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
// A copy of a slice file the architect wrote, so the owned paths come from the real producer's format.
const SLICE = path.resolve(import.meta.dirname, 'fixtures/slice-owned.md');
const ARTEFACT = 'docs/design/x/architecture.md';
const LANDED = 'landed feat/y on pilot at 1a2b3c4\n';

const reread = (id) => listItems().find((item) => item.id === id);
const deckLines = (id) => reread(id).replies.filter((message) => message.author === 'deck').map((message) => message.text);

/** A bare origin and `work`, the deck's clone, holding a plan on `feat/x` one commit past `pilot`, its slice owning `deck/store-items.mjs`. */
function repos(t) {
  return gitFixture(t, 'landing-recut:repos', (root) => {
    const origin = path.join(root, 'origin.git');
    const work = path.join(root, 'work');
    git(root, 'init', '-q', '--bare', '-b', 'main', origin);
    git(root, 'clone', '-q', origin, work);
    const write = (file, text) => {
      fs.mkdirSync(path.join(work, path.dirname(file)), { recursive: true });
      fs.writeFileSync(path.join(work, file), text);
      git(work, 'add', file);
      git(work, 'commit', '-q', '-m', file);
    };
    write('deck/store-items.mjs', 'one\n');
    write('docs/design/x/slices/S1.md', fs.readFileSync(SLICE, 'utf8'));
    git(work, 'push', '-q', 'origin', 'HEAD:pilot');
    git(work, 'checkout', '-q', '-b', 'feat/x');
    write(ARTEFACT, '# X\n');
    git(work, 'push', '-q', 'origin', 'feat/x');
    return { work, plan: { artefact: ARTEFACT, branch: 'feat/x', sha: git(work, 'rev-parse', 'HEAD') } };
  });
}

/** The landing: `file` changed on origin's `pilot`, from `work`. */
function landOn(work, file) {
  git(work, 'checkout', '-q', '-B', 'pilot', 'origin/pilot');
  fs.writeFileSync(path.join(work, file), `changed ${file}\n`);
  git(work, 'commit', '-q', '-am', `land ${file}`);
  git(work, 'push', '-q', 'origin', 'pilot');
}

/** A gate2 in `repo` on a ticket of its own, with a run record whose worktree is `worktree` when one is given. */
function aGate2(repo, worktree) {
  const evidence = withTicket({ pr: '#250', sha: '1a2b3c4' }, repo, 'yellow');
  if (worktree) setSlices(registerRun({ repo, pid: 4242 }).id, [], undefined, { slug: 'y', ticket: evidence.ticket, worktree });
  return postItem({ kind: KIND_GATE2, title: 'Gate 2', body: 'Walk it.', repo, ...evidence });
}

/** A gate2 that has landed at 1a2b3c4. */
function aLandedGate2(repo) {
  const gate = aGate2(repo);
  settleLanding(gate.id, { ok: true, sha: '1a2b3c4', line: LANDED.trimEnd() });
  return gate;
}

/** A ticket in `repo` signed through its own gate1 at `plan`, as the user signs one: yellow, never granted. */
function signed(repo, plan) {
  const ticket = postItem({ kind: KIND_TICKET, sliceCount: 60, title: 'queued plan', body: shapedTicketBody('queued plan'), repo });
  takeLive(ticket.id);
  const gate = postItem({ kind: KIND_GATE1, title: 'Gate 1', body: 'The design.', repo, ...plan, locked: 3, slices: '| S1 |', sliceCount: 1, surface: false, ticket: ticket.id });
  addReply(gate.id, SIGN_OFF);
  resolveItem(gate.id, 'Signed off.');
  return reread(ticket.id);
}

/** A co-pilot granted on the ticket and released, as the pilot grants one: its plan is stamped granted. */
function grant(id) {
  setCoPilot(id, true);
  setCoPilot(id, false);
}

test('a queued plan owning a landed file is re-cut and named', async (t) => {
  tempDeck(t);
  const { work, plan } = repos(t);
  const gate = aLandedGate2(work);
  const ticket = signed(work, plan);
  landOn(work, 'deck/store-items.mjs');

  assert.deepEqual(await driftAfterLanding(gate.id), [ticket.id]);

  const stored = reread(ticket.id);
  assert.equal(stored.state, 'red');
  assert.equal(stored.recut.why, 'landing 1a2b3c4');
  assert.deepEqual(stored.recut.files, ['deck/store-items.mjs']);
  const line = reread(gate.id).replies.at(-1);
  assert.equal(line.text, `Re-cut by this landing: ${ticket.id} (1 file)`);
  assert.equal(line.from, 'deck');
  assert.ok(Number.isInteger(line.seq), 'the line wakes the pilot');
});

test('a granted ticket is never re-cut', async (t) => {
  tempDeck(t);
  const gate = aLandedGate2(os.tmpdir());
  const ticket = signed(os.tmpdir(), { artefact: ARTEFACT, branch: 'feat/x', sha: '0123456789abcdef' });
  grant(ticket.id);
  let checked = 0;
  const planDrift = async () => ((checked += 1), { state: 'moved', files: ['deck/store-items.mjs'] });

  assert.deepEqual(await driftAfterLanding(gate.id, { planDrift }), []);

  assert.equal(checked, 0, 'a granted plan is never checked');
  assert.equal(reread(ticket.id).state, 'yellow');
  assert.ok(!deckLines(gate.id).some((text) => text.startsWith('Re-cut by this landing')));
});

test('a ticket granted while its check runs is never re-cut', async (t) => {
  tempDeck(t);
  const gate = aLandedGate2(os.tmpdir());
  const ticket = signed(os.tmpdir(), { artefact: ARTEFACT, branch: 'feat/x', sha: '0123456789abcdef' });
  const planDrift = async () => {
    grant(ticket.id);
    return { state: 'moved', files: ['deck/store-items.mjs'] };
  };

  assert.deepEqual(await driftAfterLanding(gate.id, { planDrift }), []);

  assert.equal(reread(ticket.id).state, 'yellow');
});

test('a plan gone from its branch is re-cut and named gone', async (t) => {
  tempDeck(t);
  const gate = aLandedGate2(os.tmpdir());
  const ticket = signed(os.tmpdir(), { artefact: ARTEFACT, branch: 'feat/x', sha: '0123456789abcdef' });
  const planDrift = async () => ({ state: 'gone', sha: '0123456789abcdef' });

  assert.deepEqual(await driftAfterLanding(gate.id, { planDrift }), [ticket.id]);

  assert.deepEqual([reread(ticket.id).state, reread(ticket.id).recut.files], ['red', undefined]);
  assert.equal(deckLines(gate.id).at(-1), `Re-cut by this landing: ${ticket.id} (plan 01234567 gone)`);
});

test('a drift the store refuses to re-cut is still named', async (t) => {
  tempDeck(t);
  const gate = aLandedGate2(os.tmpdir());
  const ticket = signed(os.tmpdir(), { artefact: ARTEFACT, branch: 'feat/x', sha: '0123456789abcdef' });
  requestSwitch(os.tmpdir(), ticket.id); // a co-pilot switch to it is pending, so the store refuses its re-cut
  const planDrift = async () => ({ state: 'moved', files: ['deck/store-items.mjs'] });

  assert.deepEqual(await driftAfterLanding(gate.id, { planDrift }), []);

  assert.equal(reread(ticket.id).state, 'yellow');
  assert.ok(deckLines(gate.id).at(-1).startsWith(`Re-cut by this landing: ${ticket.id} (1 file; not re-cut: `), deckLines(gate.id).at(-1));
});

test('an unchecked drift moves nothing', async (t) => {
  tempDeck(t);
  const gate = aLandedGate2(os.tmpdir());
  const ticket = signed(os.tmpdir(), { artefact: ARTEFACT, branch: 'feat/x', sha: '0123456789abcdef' });
  const before = reread(gate.id).replies.length;
  const planDrift = async () => ({ state: 'unchecked', reason: 'git fetch: no origin' });

  assert.deepEqual(await driftAfterLanding(gate.id, { planDrift }), []);

  assert.equal(reread(ticket.id).state, 'yellow');
  assert.equal(reread(gate.id).replies.length, before, 'no line');
});

test('the landing writes its landed line before the sweep re-cuts', async (t) => {
  tempDeck(t);
  // A repository (a `.git` directory) and a linked worktree of it (a `.git` file naming it), as landing.test.mjs builds one.
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'pilot-landing-recut-'));
  const worktree = fs.mkdtempSync(path.join(os.tmpdir(), 'pilot-landing-recut-wt-'));
  t.after(() => [repo, worktree].forEach((dir) => fs.rmSync(dir, { recursive: true, force: true })));
  fs.mkdirSync(path.join(repo, '.git'));
  fs.writeFileSync(path.join(worktree, '.git'), `gitdir: ${repo.replace(/\\/g, '/')}/.git/worktrees/feat-y\n`);
  const ticket = signed(repo, { artefact: ARTEFACT, branch: 'feat/x', sha: '0123456789abcdef' });
  const gate = aGate2(repo, worktree);
  let release;
  const held = new Promise((resolve) => (release = resolve));
  const planDrift = async () => (await held, { state: 'moved', files: ['deck/store-items.mjs'] });
  const child = Object.assign(new EventEmitter(), { pid: 9001, kill: () => true });
  child.stdout = Object.assign(new EventEmitter(), { setEncoding() {} });
  child.stderr = Object.assign(new EventEmitter(), { setEncoding() {} });

  startLanding(gate.id, { spawn: () => child, env: {}, planDrift });
  child.stdout.emit('data', LANDED);
  child.emit('close', 0);

  assert.equal(reread(gate.id).landing.state, 'landed', 'the landed line is written before the sweep settles');
  assert.equal(reread(ticket.id).state, 'yellow');
  release();
  for (let tick = 0; tick < 50 && reread(ticket.id).state !== 'red'; tick += 1) await new Promise((resolve) => setImmediate(resolve));
  assert.equal(reread(ticket.id).state, 'red');
  assert.deepEqual(deckLines(gate.id).slice(-2), [LANDED.trimEnd(), `Re-cut by this landing: ${ticket.id} (1 file)`]);
});
