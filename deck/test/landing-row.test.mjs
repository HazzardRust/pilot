/**
 * A refused landing shows on the ticket's row (clean-landing S8, spec 12). `noteLanding` writes land's
 * line on the feature row of the ticket's run record, the row named by the record's slug, so a red
 * ticket's table says why it waits; the settle in `startLanding` calls it beside the gate2's thread.
 */

import './no-open.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { KIND_GATE2 } from '../items.mjs';
import { startLanding } from '../landing.mjs';
import { listItems, listStoredRuns, noteLanding, postItem, recordForTicket, registerRun, setSlices, storeFile } from '../store.mjs';
import { tempDeck, withTicket } from '../testUtils.mjs';

const SLUG = 'x';
const RED = 'feat/x merged red: 3255 passed, 2 failed; failing: a refused landing names it, the row reads it; log C:/tmp/pilot-land-x.log';
const LANDED = 'landed feat/x on pilot at 1a2b3c4';

/** A directory of the test's own, removed when it ends. */
function scratch(t, name) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `pilot-landing-row-${name}-`));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

/** A repository and a linked worktree of it, as `worktreeFor` checks one. */
function aCheckout(t) {
  const repo = scratch(t, 'repo');
  fs.mkdirSync(path.join(repo, '.git'));
  const worktree = scratch(t, 'wt');
  fs.writeFileSync(path.join(worktree, '.git'), `gitdir: ${repo.replace(/\\/g, '/')}/.git/worktrees/feat-x\n`);
  return { repo, worktree };
}

/** A yellow ticket with a run record whose table has the feature row and one slice row. */
function aRecordedTicket(repo, worktree, pid = 4242) {
  const evidence = withTicket({ pr: '#250', sha: '0305827' }, repo, 'yellow');
  const run = registerRun({ repo, pid });
  const rows = [
    { slice: SLUG, state: 'in QA', branch: 'feat/x' },
    { slice: 'S1 the first slice', state: 'integrated' },
  ];
  setSlices(run.id, rows, undefined, { slug: SLUG, ticket: evidence.ticket, ...(worktree ? { worktree } : {}) });
  return { evidence, run };
}

/** A run as the store holds it, alive or not. */
const storedRun = (id) => JSON.parse(fs.readFileSync(storeFile(), 'utf8')).runs.find((candidate) => candidate.id === id);

const featureRow = (repo, ticket) => recordForTicket(repo, ticket).record.slices.find((row) => row.slice === SLUG);

test('a refused landing writes its line on the feature row', (t) => {
  tempDeck(t);
  const repo = scratch(t, 'repo');
  const { evidence, run } = aRecordedTicket(repo);

  noteLanding(repo, evidence.ticket, { ok: false, line: RED });

  const row = featureRow(repo, evidence.ticket);
  assert.match(row.state, /^refused: /);
  assert.ok(row.state.includes('failing: a refused landing names it, the row reads it'), 'the failing names reach the row');
  assert.equal(row.branch, 'feat/x', 'the row keeps the cells it had');
  assert.equal(recordForTicket(repo, evidence.ticket).record.slices.length, 2, 'no row added or lost');
  const live = listStoredRuns().find((candidate) => candidate.id === run.id).slices.find((r) => r.slice === SLUG);
  assert.equal(live.state, row.state, "the run's table, which the page draws, reads it too");
});

test('a landed landing writes landed', (t) => {
  tempDeck(t);
  const repo = scratch(t, 'repo');
  const { evidence } = aRecordedTicket(repo);

  noteLanding(repo, evidence.ticket, { ok: true, line: `${LANDED}\nmain gets pilot: unknown (gh failed)` });

  const row = featureRow(repo, evidence.ticket);
  assert.match(row.state, /^landed: /);
  assert.ok(row.state.includes('1a2b3c4'), 'the SHA reaches the row');
});

test('the note is land\'s last 300 characters and never a credential', (t) => {
  tempDeck(t);
  const repo = scratch(t, 'repo');
  const { evidence } = aRecordedTicket(repo);

  noteLanding(repo, evidence.ticket, { ok: false, line: `${'x'.repeat(1000)}\n${RED}` });
  assert.ok(featureRow(repo, evidence.ticket).state.endsWith(RED));
  assert.ok(featureRow(repo, evidence.ticket).state.length <= 'refused: '.length + 300);

  noteLanding(repo, evidence.ticket, { ok: false, line: 'NOT landed: token ghp_abcdefghijklmnopqrstuvwxyz0123456789' });
  const { state } = featureRow(repo, evidence.ticket);
  assert.ok(!state.includes('ghp_'), 'the credential is withheld');
  assert.match(state, /^refused: .*withheld/);
});

test("a refusal's row drops land's own NOT landed prefix", (t) => {
  tempDeck(t);
  const repo = scratch(t, 'repo');
  const { evidence } = aRecordedTicket(repo);

  noteLanding(repo, evidence.ticket, { ok: false, line: 'NOT landed: feat/x conflicts with pilot in a.mjs' });

  assert.equal(featureRow(repo, evidence.ticket).state, 'refused: feat/x conflicts with pilot in a.mjs');
  noteLanding(repo, evidence.ticket, { ok: false, line: 'caught up 1 commits from origin/feat/x\nNOT landed: feat/x conflicts with pilot in a.mjs' });
  assert.equal(featureRow(repo, evidence.ticket).state, 'refused: caught up 1 commits from origin/feat/x; feat/x conflicts with pilot in a.mjs', 'after a catch-up line too');
});

test('another repository and another ticket never get the note', (t) => {
  tempDeck(t);
  const repo = scratch(t, 'repo');
  const elsewhere = scratch(t, 'elsewhere');
  // Live pids: a dead one's run is dropped by the next registration.
  const { evidence } = aRecordedTicket(repo, undefined, process.pid);
  const other = aRecordedTicket(elsewhere, undefined, process.pid);
  const second = withTicket({ pr: '#251', sha: '0305828' }, repo, 'yellow');
  const secondRun = registerRun({ repo, pid: process.ppid });
  setSlices(secondRun.id, [{ slice: 'y', state: 'in QA' }], undefined, { slug: 'y', ticket: second.ticket });

  noteLanding(repo, evidence.ticket, { ok: true, line: LANDED });

  assert.match(featureRow(repo, evidence.ticket).state, /^landed: /);
  assert.equal(featureRow(elsewhere, other.evidence.ticket).state, 'in QA', "another repository's record keeps its row");
  const otherRun = storedRun(other.run.id).slices.find((r) => r.slice === SLUG);
  assert.equal(otherRun.state, 'in QA', "and so does its run's table");
  assert.equal(recordForTicket(repo, second.ticket).record.slices.find((r) => r.slice === 'y').state, 'in QA', "another ticket's record keeps its row");
  assert.deepEqual(storedRun(secondRun.id).slices.map((r) => r.slice), ['y'], "and its run's table gains none");
});

test('a run table the merge refuses is passed over, and the record is still written', (t) => {
  tempDeck(t);
  const repo = scratch(t, 'repo');
  const { evidence, run } = aRecordedTicket(repo);
  const deck = JSON.parse(fs.readFileSync(storeFile(), 'utf8'));
  deck.runs.find((candidate) => candidate.id === run.id).slices.push(null);
  fs.writeFileSync(storeFile(), JSON.stringify(deck));

  assert.doesNotThrow(() => noteLanding(repo, evidence.ticket, { ok: false, line: RED }));
  assert.match(featureRow(repo, evidence.ticket).state, /^refused: /);
});

test('a ticket with no record is a no-op', (t) => {
  tempDeck(t);
  const repo = scratch(t, 'repo');
  const { ticket } = withTicket({ pr: '#250', sha: '0305827' }, repo, 'yellow');
  const before = fs.readFileSync(storeFile(), 'utf8');

  assert.doesNotThrow(() => noteLanding(repo, ticket, { ok: false, line: RED }));
  assert.doesNotThrow(() => noteLanding(repo, 'itm_nosuchticket', { ok: false, line: RED }));
  assert.equal(fs.readFileSync(storeFile(), 'utf8'), before, 'nothing written');
});

test('the settle reaches the row', (t) => {
  tempDeck(t);
  const { repo, worktree } = aCheckout(t);
  const { evidence } = aRecordedTicket(repo, worktree);
  const gate = postItem({ kind: KIND_GATE2, title: 'Gate 2', body: 'Walk it.', repo, ...evidence });
  let child;
  const spawn = () => {
    child = new EventEmitter();
    child.pid = 9001;
    child.stdout = Object.assign(new EventEmitter(), { setEncoding() {} });
    child.stderr = Object.assign(new EventEmitter(), { setEncoding() {} });
    return child;
  };

  startLanding(gate.id, { spawn, env: {} });
  child.stdout.emit('data', `NOT landed: ${RED}\n`);
  child.emit('close', 1, null);

  const thread = listItems().find((item) => item.id === gate.id).replies.map((message) => message.text);
  assert.ok(thread.at(-1).includes(RED), 'the gate2 carries the line');
  const row = featureRow(repo, evidence.ticket);
  assert.match(row.state, /^refused: /);
  assert.ok(row.state.includes(RED), 'the row carries the line');
});
