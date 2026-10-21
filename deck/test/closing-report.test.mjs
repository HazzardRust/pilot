/**
 * The closing report on landed (gate2-frees-lane S3; lander S15, spec 8b, L12). A landing that lands
 * resolves its gate2 and posts nothing; the lander posts a bodiless report, which the deck fills with the
 * minimal report built from the run record and land's line, and that report closes the ticket. Never
 * chains, and a deck that restarts writes no report: there is no orphan fallback.
 */

import './no-open.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { REPORT_DUE, closeLanded, closingReportOf } from '../closing-report.mjs';
import { KIND_GATE2, KIND_HANDOFF, KIND_QUESTION, KIND_REPORT, SIGN_OFF } from '../items.mjs';
import { closeLandedAtStart, startLanding } from '../landing.mjs';
import { reportAskGaps } from '../report-shape.mjs';
import { callTool } from '../server-tools.mjs';
import { addReply, listItems, noteLanding, postItem, recordForTicket, registerRun, setSlices, settleLanding } from '../store.mjs';
import { tempDeck, withTicket } from '../testUtils.mjs';

const SLUG = 'x';
const LAND_LINE = [
  'removed C:/w/pilot-x-s1',
  'kept dirty C:/w/pilot-x-s2',
  'kept: slice/x-s2 (unmerged)',
  'landed feat/x on pilot at 1a2b3c4',
  'main gets pilot: #600',
].join('\n');

/** A directory of the test's own, removed when it ends. */
function scratch(t, name) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `pilot-closing-${name}-`));
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

/** A green ticket with a run record (two slices, their PRs, friction) and a signed gate2. */
function aSignedGate2(repo, worktree) {
  const evidence = withTicket({ pr: '#590', sha: '0305827' }, repo, 'yellow');
  const run = registerRun({ repo, pid: process.pid });
  const rows = [
    { slice: SLUG, state: 'in QA', branch: 'feat/x' },
    { slice: 'S1 the first slice', state: 'integrated', pr: 581 },
    { slice: 'S2 the second slice', state: 'integrated', pr: 582 },
  ];
  const friction = [
    { agent: 'implementer', what: 'the suite takes 5 min', evidence: 'npm test 4m40s', size: 3 },
    { kind: 'drain', what: 'a stale worktree', size: 9 },
  ];
  setSlices(run.id, rows, undefined, { slug: SLUG, ticket: evidence.ticket, friction, ...(worktree ? { worktree } : {}) });
  const gate = postItem({ kind: KIND_GATE2, title: 'Gate 2', body: 'Walk it.', repo, ...evidence });
  addReply(gate.id, SIGN_OFF);
  return { ticket: evidence.ticket, gate: listItems().find((item) => item.id === gate.id) };
}

const itemOf = (id) => listItems().find((item) => item.id === id);
const reportsOn = (ticket) => listItems().filter((item) => item.kind === KIND_REPORT && item.ticket === ticket);

test('the report names what landed', (t) => {
  tempDeck(t);
  const repo = scratch(t, 'repo');
  const { ticket, gate } = aSignedGate2(repo);
  const { record } = recordForTicket(repo, ticket);

  const { title, body } = closingReportOf(record, { ...gate, landing: { state: 'landed', sha: '1a2b3c4', line: LAND_LINE } }, []);

  assert.ok(title.trim() !== '');
  assert.ok(body.includes('1a2b3c4'), 'the landing SHA');
  assert.ok(body.includes('main gets pilot: #600'), 'the main line');
  for (const named of ['S1 the first slice', '#581', 'S2 the second slice', '#582']) assert.ok(body.includes(named), `${named} is named`);
  assert.ok(body.includes('Worktrees left:\n- none\n') && !body.includes('kept'), "no worktree left, and land's kept lines unread");
  assert.ok(!body.includes('removed C:/w/pilot-x-s1'), 'a cleared worktree is not listed');
  assert.ok(body.indexOf('a stale worktree') > -1 && body.includes('the suite takes 5 min'), 'the friction');
  assert.deepEqual(reportAskGaps(title, [], 'title'), []);
  assert.deepEqual(reportAskGaps(body), []);
});

test('the report lists the worktrees left, not the concluding lines', (t) => {
  tempDeck(t);
  const repo = scratch(t, 'repo');
  const { ticket, gate } = aSignedGate2(repo);
  const { record } = recordForTicket(repo, ticket);
  const line = ['kept concluding C:/w/pilot-x-qa', 'kept concluding C:/w/pilot-x', 'landed feat/x on pilot at 1a2b3c4'].join('\n');

  const { body } = closingReportOf(record, { ...gate, landing: { state: 'landed', sha: '1a2b3c4', line } }, ['C:/w/pilot-x']);

  const left = body.slice(body.indexOf('Worktrees left:'));
  assert.match(left, /^Worktrees left:\n- C:\/w\/pilot-x\n\n/);
});

test('a slice or friction row that asks is quoted, so the report still asks nothing', (t) => {
  tempDeck(t);
  const repo = scratch(t, 'repo');
  const { ticket, gate } = aSignedGate2(repo);
  const { record } = recordForTicket(repo, ticket);
  const asking = { ...record, slices: [...record.slices, { slice: 'S3 does it fit?', state: 'integrated' }], friction: [{ agent: 'qa', what: 'tell me why', evidence: 'x' }] };

  const { body } = closingReportOf(asking, { ...gate, landing: { state: 'landed', sha: '1a2b3c4', line: LAND_LINE } }, []);

  assert.deepEqual(reportAskGaps(body), []);
  assert.ok(body.includes('S3 does it fit?'));
});

test('the human step names the main PR', (t) => {
  tempDeck(t);
  const repo = scratch(t, 'repo');
  const { ticket, gate } = aSignedGate2(repo);
  const { record } = recordForTicket(repo, ticket);
  const landedWith = (line) => closingReportOf(record, { ...gate, landing: { state: 'landed', sha: '1a2b3c4', line } }, []).body;

  assert.ok(landedWith(LAND_LINE).includes('Human step: Merge #600 into main with a merge commit, when you want main to have it.'));
  assert.ok(landedWith(LAND_LINE).includes("Human step: Prune other runs' branches: pilot branches prune --dry-run first."), 'the prune step');
  assert.deepEqual(reportAskGaps(landedWith(LAND_LINE)), []);
  const byHand = landedWith(LAND_LINE.replace('main gets pilot: #600', 'main gets pilot: open a PR from fork/pilot to main by hand'));
  assert.ok(byHand.includes('Human step: Open a PR from fork/pilot to main by hand, and merge it with a merge commit.'));
  // With no run remote, pilot is on no remote to open a PR from.
  const local = landedWith(LAND_LINE.replace('main gets pilot: #600', 'main gets pilot: open a PR from pilot to main by hand'));
  assert.ok(local.includes('Human step: Push pilot, then open a PR from pilot to main by hand, and merge it with a merge commit.'), local);
  assert.deepEqual(reportAskGaps(local), []);
  const unknown = landedWith(LAND_LINE.replace('main gets pilot: #600', 'main gets pilot: unknown (gh failed)'));
  assert.ok(unknown.includes('Human step: land named no main PR, so check which PR brings pilot to main.'));
  assert.deepEqual(reportAskGaps(byHand), []);
  assert.deepEqual(reportAskGaps(unknown), []);
});

/** Land `gate` through a fake child that prints `line` and exits 0. */
function landThrough(gate, line) {
  let child;
  const spawn = () => {
    child = new EventEmitter();
    child.pid = 9001;
    child.stdout = Object.assign(new EventEmitter(), { setEncoding() {} });
    child.stderr = Object.assign(new EventEmitter(), { setEncoding() {} });
    return child;
  };
  startLanding(gate.id, { spawn, env: {} });
  child.stdout.emit('data', `${line}\n`);
  child.emit('close', 0, null);
}

/** The lander's report: kind and ticket, no title and no body (lander S15). */
const landerReport = (repo, ticket) => callTool('deck_post', { kind: KIND_REPORT, ticket, repo, author: 'pilot:pilot-lander' });

test('landed posts no report', (t) => {
  tempDeck(t);
  const { repo, worktree } = aCheckout(t);
  const { ticket, gate } = aSignedGate2(repo, worktree);

  landThrough(gate, LAND_LINE);

  assert.ok(itemOf(gate.id).resolution, 'the gate2 is resolved');
  assert.deepEqual(reportsOn(ticket), [], 'the deck posts no report');
  assert.equal(itemOf(ticket).state, 'green', 'the ticket stays open and green');
  assert.equal(recordForTicket(repo, ticket).record.finished, undefined, 'the record is left unfinished');
  assert.deepEqual(listItems().filter((item) => item.kind === KIND_HANDOFF), [], 'no hand-off: the deck never chains');
  assert.equal(closeLanded(gate.id), null, 'a second close has nothing to resolve');
});

test("the lander's bodiless report is filled from the record", (t) => {
  tempDeck(t);
  const { repo, worktree } = aCheckout(t);
  const { ticket, gate } = aSignedGate2(repo, worktree);
  landThrough(gate, LAND_LINE);

  landerReport(repo, ticket);

  const [report] = reportsOn(ticket);
  assert.ok(report, 'the report is stored');
  assert.equal(report.author, 'lander');
  assert.ok(report.title.startsWith('Closing report'));
  assert.ok(report.body.includes('1a2b3c4'), 'the landing SHA');
  assert.ok(report.body.includes('main gets pilot: #600'), 'the main line');
  // The fixture repository is no git repository: git cannot list, and the post goes on.
  assert.match(report.body, /Worktrees left:\n- none recorded: \S/, 'a git that cannot list, and why');
  assert.equal(itemOf(ticket).state, 'closed', 'it closes the ticket');
  assert.equal(report.replies.filter((reply) => reply.text === REPORT_DUE).length, 1, 'one report due line');
  assert.equal(reportsOn(ticket).length, 1, 'the only closing report');
});

test('a report with a body is stored as it came', (t) => {
  tempDeck(t);
  const { repo, worktree } = aCheckout(t);
  const { ticket, gate } = aSignedGate2(repo, worktree);
  landThrough(gate, LAND_LINE);

  callTool('deck_post', { kind: KIND_REPORT, ticket, repo, title: 'Closing report: x', body: 'Landed.', author: 'pilot:pilot-lander' });
  const [report] = reportsOn(ticket);
  assert.equal(report.body, 'Landed.', 'a body given is kept');
  assert.equal(report.replies.length, 0, 'and noted nothing');
});

test("a lander's bodiless report with no run record is refused", async (t) => {
  tempDeck(t);
  const repo = scratch(t, 'repo');
  const { ticket, gate } = aSignedGate2(repo);
  settleLanding(gate.id, { ok: true, sha: '1a2b3c4', line: LAND_LINE });
  closeLanded(gate.id);
  const { storeFile } = await import('../store.mjs');
  const deck = JSON.parse(fs.readFileSync(storeFile(), 'utf8'));
  deck.records = [];
  fs.writeFileSync(storeFile(), JSON.stringify(deck));

  assert.throws(() => landerReport(repo, ticket), /no run record/);
  assert.deepEqual(reportsOn(ticket), [], 'no report built from nothing');
  assert.notEqual(itemOf(ticket).state, 'closed');
});

test("only the lander's or the pilot's bodiless report is filled", (t) => {
  tempDeck(t);
  const { repo, worktree } = aCheckout(t);
  const { ticket, gate } = aSignedGate2(repo, worktree);
  landThrough(gate, LAND_LINE);

  const post = (author) => callTool('deck_post', { kind: KIND_REPORT, ticket, repo, author });
  assert.throws(() => post('pilot:pilot-implementer'), /must be a non-empty string/, 'the plain empty-body refusal');
  assert.throws(() => post('Explore'), /must be a non-empty string/);
  assert.deepEqual(reportsOn(ticket), [], 'nothing filled for another writer');
  post(undefined);
  assert.equal(reportsOn(ticket).length, 1, "the pilot's, unstamped, is filled");
});

test('a legacy Mark ready question does not hold a landed gate2 open', (t) => {
  tempDeck(t);
  const { repo, worktree } = aCheckout(t);
  const { ticket, gate } = aSignedGate2(repo, worktree);
  // Asked by the old ready step after the press; the landing no longer marks anything ready.
  postItem({ kind: KIND_QUESTION, title: 'Mark #12 ready', body: 'ready?', repo, options: ['Yes', 'No'], recommended: 'Yes', ticket, blocking: true });

  landThrough(gate, LAND_LINE);

  assert.ok(itemOf(gate.id).resolution, 'the gate2 is resolved');
  landerReport(repo, ticket);
  assert.equal(reportsOn(ticket).length, 1, 'the bodiless report is accepted');
});

test('only the legacy ready title is set aside', (t) => {
  tempDeck(t);
  const { repo, worktree } = aCheckout(t);
  const { gate, ticket } = aSignedGate2(repo, worktree);
  postItem({ kind: KIND_QUESTION, title: 'Mark the new column ready', body: 'ready?', repo, options: ['Yes', 'No'], recommended: 'Yes', ticket, blocking: true });

  landThrough(gate, LAND_LINE);

  assert.equal(itemOf(gate.id).resolution, undefined, 'a look-alike title still holds the gate2');
});

test("a bodiless report from another repository's caller is refused", (t) => {
  tempDeck(t);
  const { repo, worktree } = aCheckout(t);
  const { ticket, gate } = aSignedGate2(repo, worktree);
  landThrough(gate, LAND_LINE);

  assert.throws(() => landerReport(scratch(t, 'other'), ticket), /repository/);
  assert.deepEqual(reportsOn(ticket), []);
  assert.notEqual(itemOf(ticket).state, 'closed');
});

test("a lander's bodiless report before landed is refused", (t) => {
  tempDeck(t);
  const repo = scratch(t, 'repo');
  const { ticket, gate } = aSignedGate2(repo);
  settleLanding(gate.id, { ok: false, line: 'NOT landed: feat/x conflicts with pilot in a.mjs' });

  assert.throws(() => landerReport(repo, ticket), /landed/);
  assert.deepEqual(reportsOn(ticket), []);
});

test('a refused landing writes no report', (t) => {
  tempDeck(t);
  const repo = scratch(t, 'repo');
  const { ticket, gate } = aSignedGate2(repo);
  settleLanding(gate.id, { ok: false, line: 'NOT landed: feat/x conflicts with pilot in a.mjs' });

  assert.equal(closeLanded(gate.id), null);
  assert.deepEqual(reportsOn(ticket), []);
  assert.notEqual(itemOf(ticket).state, 'closed');
});

test('the row reads landing started, then landed', (t) => {
  tempDeck(t);
  const { repo, worktree } = aCheckout(t);
  const { ticket, gate } = aSignedGate2(repo, worktree);
  const featureRow = () => recordForTicket(repo, ticket).record.slices.find((row) => row.slice === SLUG);
  let child;
  const spawn = () => {
    child = new EventEmitter();
    child.pid = 9001;
    child.stdout = Object.assign(new EventEmitter(), { setEncoding() {} });
    child.stderr = Object.assign(new EventEmitter(), { setEncoding() {} });
    return child;
  };

  startLanding(gate.id, { spawn, env: {} });
  assert.equal(featureRow().state, `landing started in ${worktree}`);
  child.stdout.emit('data', `${LAND_LINE}\n`);
  child.emit('close', 0, null);
  assert.match(featureRow().state, /^landed: .*1a2b3c4/);

  noteLanding(repo, ticket, { ok: null, line: 'landing started in C:/w' });
  assert.equal(featureRow().state, 'landing started in C:/w', 'noteLanding writes the begin line as it is');
});

test('a restart writes no owed report', (t) => {
  tempDeck(t);
  const repo = scratch(t, 'repo');
  const { ticket, gate } = aSignedGate2(repo);
  // Landed by a daemon that went before the lander posted its report.
  settleLanding(gate.id, { ok: true, sha: '1a2b3c4', line: LAND_LINE });

  closeLandedAtStart();
  assert.ok(itemOf(gate.id).resolution, 'the gate2 left open is resolved');
  assert.deepEqual(reportsOn(ticket), [], 'no orphan fallback: the report is the lander\'s');
  assert.notEqual(itemOf(ticket).state, 'closed');
});
