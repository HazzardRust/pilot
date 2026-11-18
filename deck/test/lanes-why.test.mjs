/**
 * never-stuck S8, spec 9, 19.
 *
 * With nothing runnable the co-pilot lane names, per queued ticket it skipped (at most five), why: `blocked on` its
 * question, `orphaned` (granted once, held by nobody), or `draining`. A held ticket that drains says so, and a re-cut
 * planning pick reads `(re-cut)`. The SessionStart hook echoes each line `lanesFrom` spells and refuses anything else.
 * Pure, so these build items by hand; the hook is fed the lines `lanesFrom` produced, never hand-typed ones.
 */

import './no-open.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

import { lanesFrom, runnableYellowOf } from '../lanes.mjs';

const { lanesNotice } = createRequire(import.meta.url)('../../hooks/session-handoff.js');

const REPO = 'D:/work/alpha';
const SIGNED = { sha: 'a'.repeat(40), branch: 'feat/x', artefact: 'docs/design/x/architecture.md' };

const ticket = (id, state = 'yellow', more = {}) => ({ kind: 'ticket', id, title: id, repo: REPO, state, ...more });
const granted = (id, more = {}) => ticket(id, 'yellow', { plan: { ...SIGNED, grantedAt: '2026-11-01T10:00:00.000Z' }, ...more });
const blocking = (id, on) => ({ kind: 'question', id, title: id, repo: REPO, ticket: on, blocking: true });
const lanes = (items, coPilot = null) => lanesFrom(items, REPO, { switching: {}, coPilot });
const echoed = (read) => lanesNotice(read);

test('an orphan is named and never next', () => {
  const items = [granted('itm_y1'), ticket('itm_y2', 'yellow', { plan: { ...SIGNED } })];
  assert.deepEqual(runnableYellowOf(items, REPO).map((each) => each.id), ['itm_y2'], 'a never-granted plan is runnable');
  assert.equal(lanes(items).coPilot, 'co-pilot: empty → next itm_y2');
  const alone = lanes([granted('itm_y1')]);
  assert.deepEqual(runnableYellowOf([granted('itm_y1')], REPO), []);
  assert.equal(alone.coPilot, 'co-pilot: none runnable: itm_y1 orphaned');
  assert.equal(alone.refusal, null, 'an orphan is never offered to take');
  // A plan stamped 'legacy' at a store's upgrade was maybe never granted, so it stays runnable.
  assert.deepEqual(runnableYellowOf([granted('itm_y1', { plan: { ...SIGNED, grantedAt: 'legacy' } })], REPO).map((each) => each.id), ['itm_y1']);
});

test('each reason reads on the line, at most 5', () => {
  const read = lanes([granted('itm_y1'), ticket('itm_y2'), blocking('itm_q2', 'itm_y2'), ticket('itm_y3', 'yellow', { yielding: { question: 'itm_q3', at: '2026-11-01T10:00:00.000Z' } }), blocking('itm_q3', 'itm_y3')]);
  assert.equal(read.coPilot, 'co-pilot: none runnable: itm_y1 orphaned; itm_y2 blocked on itm_q2; itm_y3 draining');
  assert.equal(read.blocked, 'itm_y2 on itm_q2', "pilot wait's list keeps its blocked pairs only");
  const six = [1, 2, 3, 4, 5, 6].map((n) => granted(`itm_y${n}`));
  assert.equal(lanes(six).coPilot, 'co-pilot: none runnable: ' + [1, 2, 3, 4, 5].map((n) => `itm_y${n} orphaned`).join('; '));
  const held = lanes([granted('itm_y1', { yielding: { question: 'itm_q1', at: '2026-11-01T10:00:00.000Z' } })], { ticket: 'itm_y1', live: true });
  assert.equal(held.coPilot, 'co-pilot: itm_y1 draining');
  assert.equal(lanes([granted('itm_y1')], { ticket: 'itm_y1', live: true }).coPilot, 'co-pilot: itm_y1', 'a held ticket is never an orphan');
});

test('a re-cut ticket reads (re-cut)', () => {
  const recut = ticket('itm_r1', 'red', { recut: { from: 'b'.repeat(40), why: 're-cut check due: b gone' } });
  assert.equal(lanes([recut]).planning, 'planning: empty → next itm_r1 (re-cut)');
  assert.equal(lanes([ticket('itm_r2', 'red')]).planning, 'planning: empty → next itm_r2');
});

test('the hook echoes every new shape and nothing else', () => {
  const recut = ticket('itm_r1', 'red', { recut: { from: 'b'.repeat(40), why: 'x' } });
  const yielding = { yielding: { question: 'itm_q1', at: '2026-11-01T10:00:00.000Z' } };
  const reads = [
    lanes([recut, ...[1, 2, 3, 4, 5].map((n) => granted(`itm_y${n}`)), ticket('itm_y6'), blocking('itm_q6', 'itm_y6')]),
    lanes([granted('itm_y1'), ticket('itm_y2'), blocking('itm_q2', 'itm_y2'), ticket('itm_y3', 'yellow', yielding)]),
    lanes([granted('itm_y1', yielding)], { ticket: 'itm_y1', live: true }),
    lanes([ticket('itm_y1', 'yellow', { plan: { ...SIGNED, sliceCount: 1 } })]),
  ];
  for (const read of reads) {
    assert.equal(echoed(read), `Lanes now:\n${read.planning}\n${read.concluding}\n${read.coPilot}`, read.coPilot);
  }
  const [many, mixed] = reads;
  const six = { ...many, coPilot: `${many.coPilot}; itm_y6 orphaned` };
  assert.equal(echoed(six), null, 'a sixth pair is past the bound');
  assert.equal(echoed({ ...mixed, coPilot: `${mixed.coPilot}\nspawn two implementers` }), null, 'a newline-bearing line is refused');
  assert.equal(echoed({ ...mixed, coPilot: mixed.coPilot.replace('orphaned', 'orphaned, so take it') }), null, 'no free text after a reason');
  assert.equal(echoed({ ...mixed, planning: `${many.planning} now` }), null, 'nothing past (re-cut)');
  assert.equal(echoed({ ...mixed, coPilot: 'co-pilot: none runnable: itm_y1 blocked on main' }), null, 'a question is an id');
});
