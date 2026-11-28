/**
 * A landing notes the plans it drifted (never-stuck S3, spec 14; recut-decision spec 2): once a gate2 has landed, every
 * open, signed, never-granted yellow ticket of its repository is checked with `planDrift`; each drifted one stays
 * yellow with one drift line on its own thread, and one deck line on the gate2 names them. The drift check runs in a real clone of a local
 * bare origin; the land child is a stub. Nothing reaches GitHub.
 */

import './no-open.mjs';
import { gitFixture } from '../../scripts/test/lib/git-fixture.mjs';
import { seed } from '../../scripts/test/lib/seed.mjs';

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
import { storeFile } from '../store-core.mjs';
import { shapedTicketBody, takeLive, tempDeck, withTicket } from '../testUtils.mjs';

const { callTool } = await import('../server.mjs');

const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
// A copy of a slice file the architect wrote, so the owned paths come from the real producer's format.
const SLICE = path.resolve(import.meta.dirname, 'fixtures/slice-owned.md');
const ARTEFACT = 'docs/design/x/architecture.md';
const LANDED = 'landed feat/y on pilot at 1a2b3c4\n';

const reread = (id) => listItems().find((item) => item.id === id);
const deckLines = (id) => reread(id).replies.filter((message) => message.author === 'deck').map((message) => message.text);

/**
 * A bare origin and `work`, the deck's clone on `pilot`, holding a plan one commit past `pilot`, its slice owning
 * `deck/store-items.mjs`, and then the first landing over that file on `pilot`, as `landOn` makes it. The plan's
 * commit is `feat/x`; `replanned`'s `feat/x` has merged that landing on top of it, as a replan merges pilot, and
 * returns the merge as `merged`. One seed and one clone each.
 */
function landed(t, { replanned = false } = {}) {
  return gitFixture(t, `landing-recut:${replanned ? 'replanned' : 'landed'}`, (root) => {
    const plan = replanned ? 'plan' : 'feat/x';
    const { origin, sha } = seed(root, [
      { branch: 'pilot', files: { 'deck/store-items.mjs': 'one\n' }, message: 'deck/store-items.mjs' },
      { branch: 'pilot', files: { 'docs/design/x/slices/S1.md': fs.readFileSync(SLICE, 'utf8') }, message: 'docs/design/x/slices/S1.md' },
      { branch: plan, from: 'pilot', files: { [ARTEFACT]: '# X\n\n## 2. Spec\n\n| 1 |\n\n## 5. Locked decisions\n\n- L1\n\n## 8. Slices\n\n| S1 |\n' }, message: ARTEFACT },
      { branch: 'pilot', files: { 'deck/store-items.mjs': 'changed deck/store-items.mjs\n' }, message: 'land deck/store-items.mjs' },
      ...(replanned ? [{ branch: 'feat/x', from: plan, merge: ['pilot'], files: {}, message: "Merge remote-tracking branch 'origin/pilot' into feat/x" }] : []),
    ]);
    const work = path.join(root, 'work');
    git(root, 'clone', '-q', '-b', 'pilot', origin, work);
    return { work, plan: { artefact: ARTEFACT, branch: 'feat/x', sha: sha[plan] }, merged: sha['feat/x'] };
  });
}

/** The landing: `file`, tracked, changed on origin's `pilot`, from `work` on `pilot`. */
function landOn(work, file, text = `changed ${file}\n`) {
  fs.writeFileSync(path.join(work, file), text);
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
  const gate = postItem({ kind: KIND_GATE1, title: 'Gate 1', body: 'The design.\nBase: pilot', repo, ...plan, locked: 3, slices: '| S1 |', sliceCount: 1, surface: false, ticket: ticket.id });
  addReply(gate.id, SIGN_OFF);
  resolveItem(gate.id, 'Signed off.');
  return reread(ticket.id);
}

/** A co-pilot granted on the ticket and released, as the pilot grants one: its plan is stamped granted. */
function grant(id) {
  setCoPilot(id, true);
  setCoPilot(id, false);
}

test('a landing over an owned file leaves the ticket yellow', async (t) => {
  tempDeck(t);
  const { work, plan } = landed(t);
  const gate = aLandedGate2(work);
  const ticket = signed(work, plan);
  const items = listItems().length;

  assert.deepEqual(await driftAfterLanding(gate.id), [ticket.id]);

  const stored = reread(ticket.id);
  assert.equal(stored.state, 'yellow');
  assert.equal(stored.recut, undefined, 'no re-cut mark');
  assert.equal(listItems().length, items, 'no item posted');
  assert.deepEqual(deckLines(ticket.id), ['Drift (landing 1a2b3c4): deck/store-items.mjs owned by S1; plan kept, ticket yellow']);
  const line = reread(gate.id).replies.at(-1);
  assert.equal(line.text, `Drift after this landing: ${ticket.id} (1 file)`);
  assert.equal(line.from, 'deck');
  assert.ok(Number.isInteger(line.seq), 'the line wakes the pilot');
});

test('a drift is noted once: a later landing repeats nothing, one over a new owned file notes again (spec 2)', async (t) => {
  tempDeck(t);
  const { work, plan } = landed(t);
  const first = aLandedGate2(work);
  const ticket = signed(work, plan);
  await driftAfterLanding(first.id);
  const second = aGate2(work);
  settleLanding(second.id, { ok: true, sha: '5e6f7a8', line: 'landed feat/z on pilot at 5e6f7a8' });
  fs.writeFileSync(path.join(work, 'README.md'), 'not owned\n');
  git(work, 'add', 'README.md');
  landOn(work, 'README.md');

  assert.deepEqual(await driftAfterLanding(second.id), [], 'the same drift is not noted again');
  assert.equal(deckLines(ticket.id).length, 1);
  assert.ok(!deckLines(second.id).some((text) => text.startsWith('Drift after this landing')));

  const third = aGate2(work);
  settleLanding(third.id, { ok: true, sha: '9b0c1d2', line: 'landed feat/w on pilot at 9b0c1d2' });
  fs.writeFileSync(path.join(work, 'deck/server-wait.mjs'), 'new\n');
  git(work, 'add', 'deck/server-wait.mjs');
  landOn(work, 'deck/server-wait.mjs');

  assert.deepEqual(await driftAfterLanding(third.id), [ticket.id], 'a drift that grew is noted');
  assert.equal(deckLines(ticket.id).at(-1), 'Drift (landing 9b0c1d2): deck/server-wait.mjs, deck/store-items.mjs owned by S1; plan kept, ticket yellow');
});

test('after a replan the same drift is a new one, and is noted', async (t) => {
  tempDeck(t);
  const { work, plan, merged } = landed(t, { replanned: true });
  const first = aLandedGate2(work);
  const ticket = signed(work, plan);
  await driftAfterLanding(first.id);
  await callTool('deck_ticket', { id: ticket.id, action: 'replan', sha: merged });
  const second = aGate2(work);
  settleLanding(second.id, { ok: true, sha: '5e6f7a8', line: 'landed feat/z on pilot at 5e6f7a8' });
  landOn(work, 'deck/store-items.mjs', 'changed again\n');

  assert.deepEqual(await driftAfterLanding(second.id), [ticket.id]);
  assert.equal(deckLines(ticket.id).at(-1), 'Drift (landing 5e6f7a8): deck/store-items.mjs owned by S1; plan kept, ticket yellow');
});

test('after a re-cut and a gate1 re-sign the same drift is a new one, and is noted', async (t) => {
  tempDeck(t);
  const { work, plan, merged } = landed(t, { replanned: true });
  const first = aLandedGate2(work);
  const ticket = signed(work, plan);
  await driftAfterLanding(first.id);
  await callTool('deck_ticket', { id: ticket.id, action: 'recut' });
  takeLive(ticket.id);
  const gate1 = postItem({ kind: KIND_GATE1, title: 'Gate 1', body: `Changed since ${plan.sha.slice(0, 7)}: pilot merged\nBase: pilot`, repo: work, ...plan, sha: merged, locked: 3, slices: '| S1 |', sliceCount: 1, surface: false, ticket: ticket.id });
  addReply(gate1.id, SIGN_OFF);
  resolveItem(gate1.id, 'Signed off.');
  assert.equal(reread(ticket.id).state, 'yellow');
  const second = aGate2(work);
  settleLanding(second.id, { ok: true, sha: '5e6f7a8', line: 'landed feat/z on pilot at 5e6f7a8' });
  landOn(work, 'deck/store-items.mjs', 'changed again\n');

  assert.deepEqual(await driftAfterLanding(second.id), [ticket.id]);
  assert.equal(deckLines(ticket.id).at(-1), 'Drift (landing 5e6f7a8): deck/store-items.mjs owned by S1; plan kept, ticket yellow');
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
  assert.ok(!deckLines(gate.id).some((text) => text.startsWith('Drift after this landing')));
});

test('a plan signed before grants were stamped reads granted, and is never re-cut (QA-F1)', async (t) => {
  tempDeck(t);
  const gate = aLandedGate2(os.tmpdir());
  const ticket = signed(os.tmpdir(), { artefact: ARTEFACT, branch: 'feat/x', sha: '0123456789abcdef' });
  // The store as the deck before this one left it: no stamp marker, so no plan on it can say whether it was granted.
  const stored = JSON.parse(fs.readFileSync(storeFile(), 'utf8'));
  delete stored.grantsStamped;
  fs.writeFileSync(storeFile(), JSON.stringify(stored));
  const planDrift = async () => ({ state: 'moved', files: ['deck/store-items.mjs'] });

  assert.deepEqual(await driftAfterLanding(gate.id, { planDrift }), []);

  assert.equal(reread(ticket.id).plan.grantedAt, 'legacy');
  assert.equal(reread(ticket.id).state, 'yellow');
});

test('a plan signed on a stamped store stays never granted', (t) => {
  tempDeck(t);
  const ticket = signed(os.tmpdir(), { artefact: ARTEFACT, branch: 'feat/x', sha: '0123456789abcdef' });

  assert.equal(reread(ticket.id).plan.grantedAt, undefined);
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

test('a plan gone from its branch is noted gone, the ticket yellow', async (t) => {
  tempDeck(t);
  const gate = aLandedGate2(os.tmpdir());
  const ticket = signed(os.tmpdir(), { artefact: ARTEFACT, branch: 'feat/x', sha: '0123456789abcdef' });
  const planDrift = async () => ({ state: 'gone', sha: '0123456789abcdef' });

  assert.deepEqual(await driftAfterLanding(gate.id, { planDrift }), [ticket.id]);

  assert.equal(reread(ticket.id).state, 'yellow');
  assert.deepEqual(deckLines(ticket.id), ['Drift (landing 1a2b3c4): plan 01234567 gone; plan kept, ticket yellow']);
  assert.equal(deckLines(gate.id).at(-1), `Drift after this landing: ${ticket.id} (plan 01234567 gone)`);
});

test('the 2026-11-19 case: two drifted tickets both stay yellow and both are named', async (t) => {
  tempDeck(t);
  const gate = aLandedGate2(os.tmpdir());
  const first = signed(os.tmpdir(), { artefact: ARTEFACT, branch: 'feat/x', sha: '0123456789abcdef' });
  const second = signed(os.tmpdir(), { artefact: ARTEFACT, branch: 'feat/x', sha: '0123456789abcdef' });
  const planDrift = async () => ({ state: 'moved', files: ['deck/store-items.mjs'], slices: ['S1'] });

  assert.deepEqual((await driftAfterLanding(gate.id, { planDrift })).sort(), [first.id, second.id].sort());

  assert.deepEqual([reread(first.id).state, reread(second.id).state], ['yellow', 'yellow']);
  const said = deckLines(gate.id).at(-1);
  assert.ok(said.startsWith('Drift after this landing: ') && said.includes(first.id) && said.includes(second.id), said);
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

test('the landing writes its landed line before the sweep notes', async (t) => {
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
  const planDrift = async () => (await held, { state: 'moved', files: ['deck/store-items.mjs'], slices: ['S1'] });
  const child = Object.assign(new EventEmitter(), { pid: 9001, kill: () => true });
  child.stdout = Object.assign(new EventEmitter(), { setEncoding() {} });
  child.stderr = Object.assign(new EventEmitter(), { setEncoding() {} });

  startLanding(gate.id, { spawn: () => child, env: {}, planDrift });
  child.stdout.emit('data', LANDED);
  child.emit('close', 0);

  assert.equal(reread(gate.id).landing.state, 'landed', 'the landed line is written before the sweep settles');
  release();
  for (let tick = 0; tick < 50 && deckLines(ticket.id).length === 0; tick += 1) await new Promise((resolve) => setImmediate(resolve));
  assert.equal(reread(ticket.id).state, 'yellow');
  assert.deepEqual(deckLines(gate.id).slice(-2), [LANDED.trimEnd(), `Drift after this landing: ${ticket.id} (1 file)`]);
});
