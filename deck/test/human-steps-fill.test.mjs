/**
 * S2 of human-steps (spec 1, 2, 8; L2, A5): the lander's bodiless report posts the ticket's steps thread
 * first, then the report, which carries no human step. A retry after a lost report posts only the report,
 * and a second report on the ticket is refused. Every test takes its own store (`tempDeck`).
 */

import './no-open.mjs';

import { gitFixture } from '../../scripts/test/lib/git-fixture.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

import { closeLanded, postFilled, stepsOf } from '../closing-report.mjs';
import { KIND_GATE2, KIND_REPORT, KIND_STEPS, SIGN_OFF, stateOf } from '../items.mjs';
import { DeckRefusal, addReply, listItems, postItem, postSteps, registerRun, setSlices, settleLanding } from '../store.mjs';
import { tempDeck, withTicket } from '../testUtils.mjs';

const SLUG = 'x';
const MAIN = 'Merge #901 with a merge commit, when you want main to have it.';
const PRUNE = "Prune other runs' branches: pilot branches prune --dry-run first.";
const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

/** A repository with one run worktree (`qa/x`) on disk. */
function aRepo(t) {
  return gitFixture(t, 'human-steps-fill', (root) => {
    const repo = path.join(root, 'work');
    git(root, 'init', '-q', '-b', 'main', repo);
    git(repo, 'commit', '-q', '--allow-empty', '-m', 'root');
    const qa = path.join(root, 'work-qa');
    git(repo, 'worktree', 'add', '-q', '-b', `qa/${SLUG}`, qa);
    return { repo, qa };
  });
}

/** A ticket whose signed gate2 has landed, its record holding one recorded human step. */
function aLanded(t) {
  tempDeck(t);
  const { repo, qa } = aRepo(t);
  const evidence = withTicket({ pr: '#590', sha: '0305827' }, repo, 'yellow');
  const run = registerRun({ repo, pid: process.pid });
  setSlices(run.id, [{ slice: 'S1', state: 'merged', pr: 12 }], undefined, { slug: SLUG, ticket: evidence.ticket, step: 'Set STRIPE_KEY in Vercel' });
  const gate = postItem({ kind: KIND_GATE2, title: 'Gate 2', body: 'Walk it.', repo, ...evidence });
  addReply(gate.id, SIGN_OFF);
  settleLanding(gate.id, { ok: true, sha: '1a2b3c4', line: 'landed feat/x on pilot at 1a2b3c4\nmain gets pilot: #901' });
  closeLanded(gate.id);
  return { repo, qa, ticket: evidence.ticket };
}

const lander = (repo, ticket) => postFilled({ kind: KIND_REPORT, ticket, repo, author: 'pilot:pilot-lander' });
const ofKind = (kind, ticket) => listItems().filter((item) => item.kind === kind && item.ticket === ticket);

test('a landing posts one steps thread in order', (t) => {
  const { repo, qa, ticket } = aLanded(t);

  lander(repo, ticket);

  const threads = ofKind(KIND_STEPS, ticket);
  assert.equal(threads.length, 1, 'one steps thread');
  const texts = threads[0].steps.map((step) => step.text);
  assert.equal(texts.length, 4);
  assert.deepEqual([texts[0], texts[1], texts[3]], [MAIN, 'Set STRIPE_KEY in Vercel', PRUNE]);
  const removed = texts[2].match(/^Remove (.+) when you are done with it\.$/);
  assert.ok(removed, texts[2]);
  assert.equal(path.resolve(removed[1]), path.resolve(qa), 'the worktree left');
  assert.equal(stateOf(listItems().find((item) => item.id === ticket)), 'green', 'the thread holds the ticket open');
});

test('the report carries no human step', (t) => {
  const { repo, qa, ticket } = aLanded(t);

  lander(repo, ticket);

  const [report] = ofKind(KIND_REPORT, ticket);
  assert.doesNotMatch(report.body, /Human step/);
  const left = report.body.slice(report.body.indexOf('Worktrees left:')).split('\n\n')[0].split('\n');
  assert.equal(left[0], 'Worktrees left:');
  assert.deepEqual(left.slice(1).map((line) => path.resolve(line.replace(/^- /, ''))), [path.resolve(qa)], 'still listed as a record line');
});

test('a retry after a lost report posts only the report', (t) => {
  const { repo, ticket } = aLanded(t);
  // The first post's thread went in; its report did not.
  postSteps({ ticket, repo, title: 'Human steps', steps: [{ text: MAIN }] });

  lander(repo, ticket);

  assert.equal(ofKind(KIND_REPORT, ticket).length, 1, 'one report');
  assert.equal(ofKind(KIND_STEPS, ticket).length, 1, 'still one steps thread');
});

test('a second report is refused', (t) => {
  const { repo, ticket } = aLanded(t);
  const first = lander(repo, ticket);

  assert.throws(() => lander(repo, ticket), (err) => err instanceof DeckRefusal && err.message.includes(first.id));
  assert.equal(ofKind(KIND_REPORT, ticket).length, 1, 'one report');
  assert.equal(ofKind(KIND_STEPS, ticket).length, 1, 'one steps thread');
});

test('a full record still fits one thread', () => {
  const record = { feature: SLUG, slug: SLUG, slices: [], humanSteps: Array.from({ length: 20 }, (_, i) => ({ text: `step ${i + 1}` })) };
  const steps = stepsOf(record, { landing: { line: 'main gets pilot: #901' } }, ['C:/w/a', 'C:/w/b']).map((step) => step.text);

  assert.equal(steps.length, 20, "postSteps' bound");
  assert.deepEqual([steps[0], steps.at(-1)], [MAIN, PRUNE]);
  assert.equal(steps[16], 'step 16');
  assert.equal(steps[17], "4 more steps are in the run record's humanSteps.");
  assert.equal(steps[18], 'Remove the 2 worktrees the closing report lists when you are done with them.');
});

test('every main-line shape still yields its step', () => {
  const record = { feature: SLUG, slug: SLUG, slices: [] };
  const firstStep = (main) => stepsOf(record, { pr: '#590', landing: { state: 'landed', sha: '1a2b3c4', line: `landed feat/x on pilot at 1a2b3c4\n${main}` } }, [])[0].text;

  assert.equal(firstStep('main gets pilot: #901 (opened)'), MAIN);
  assert.equal(firstStep('main gets pilot: merge fork-pilot into main by hand'), 'Merge fork-pilot into main by hand, with a merge commit.');
  assert.equal(firstStep('main gets pilot: open a PR from pilot to main by hand'), 'Push pilot, then open a PR from pilot to main by hand, and merge it with a merge commit.');
  assert.equal(firstStep('main gets pilot: open a PR from fork/pilot to main by hand'), 'Open a PR from fork/pilot to main by hand, and merge it with a merge commit.');
  assert.equal(firstStep('main gets pilot: unknown (gh failed)'), 'land named no main PR, so check which PR brings pilot to main.');
});
