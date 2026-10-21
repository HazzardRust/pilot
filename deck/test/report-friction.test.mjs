/**
 * S11 of yellow-lane: the closing report's friction is derived from the record's rows
 * (spec 23; L8, A7).
 *
 * At `finished`, `report.friction` is `rankFriction` of every session's rows: the top 5
 * agent rows and the top 5 drains, each by size and then by the record's order, drains
 * apart. A caller that sends its own `report.friction` is refused, never ignored.
 *
 * Every test takes its own store; nothing here touches 4321.
 */

import './no-open.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';

import { tempDeck } from '../testUtils.mjs';

const { registerRun, recordFor } = await import('../store.mjs');
const { rankFriction, nextRecord, recordFields } = await import('../runs.mjs');
const { callTool } = await import('../server.mjs');

const MINE = path.join('D:', 'work', 'pilot');

const agent = (n, size) => ({ agent: `pilot-implementer-${n}`, what: `waited on the suite ${n}`, evidence: `npm test: ${n}s`, ...(size === undefined ? {} : { size }) });
const drain = (n, size) => ({ kind: 'drain', what: `re-read the artefact ${n}`, size });

const report = () => ({
  featurePr: { number: 180, state: 'merged', mergeSha: 'a1b2c3d4e5f6' },
  slices: [{ slice: 'S1', pr: 181, mergeSha: '733afa1' }],
  assumed: [],
  humanSteps: ['merge the feature PR'],
  worktreesLeft: [],
});

test('the report is the record\'s rows', (t) => {
  tempDeck(t);
  const run = registerRun({ repo: MINE, pid: process.pid });
  const status = (fields) => callTool('deck_status', { run: run.id, slug: 'yellow-lane', slices: [], ...fields });

  // Two sessions' rows, then the finish: the ranking reaches back to the first session.
  status({ friction: [agent(1, 9), agent(2), drain(1, 4), agent(3, 2), drain(2, 8)] });
  status({ friction: [agent(4, 9), agent(5, 1), drain(3, 1), agent(6, 30), drain(4, 4), agent(7, 3), drain(5, 2), drain(6, 6)] });
  status({ finished: 'closing report posted', report: report() });

  const record = recordFor(MINE);
  const ranked = {
    agents: [agent(6, 30), agent(1, 9), agent(4, 9), agent(7, 3), agent(3, 2)],
    drains: [drain(2, 8), drain(6, 6), drain(1, 4), drain(4, 4), drain(5, 2)],
  };
  assert.deepEqual(rankFriction(record.friction), ranked, 'top 5 each, by size, then the record\'s order');
  assert.deepEqual(record.report.friction, ranked, 'the finished record\'s report carries the ranking');
  for (const row of [...record.report.friction.agents, ...record.report.friction.drains]) {
    assert.ok(record.friction.some((kept) => JSON.stringify(kept) === JSON.stringify(row)), 'only rows the record already had');
  }
  assert.deepEqual(rankFriction(undefined), { agents: [], drains: [] }, 'a record with no rows ranks to empty lists');
});

test('drains stand apart', () => {
  const { agents, drains } = rankFriction([drain(1, 50), agent(1, 1), drain(2, 40)]);
  assert.deepEqual(agents, [agent(1, 1)], 'no drain among agents');
  assert.ok(agents.every((row) => row.kind === undefined));
  assert.deepEqual(drains, [drain(1, 50), drain(2, 40)]);
});

test('a sent list is refused', (t) => {
  tempDeck(t);
  const run = registerRun({ repo: MINE, pid: process.pid });
  const sent = { ...report(), friction: [{ agent: 'pilot-qa', what: 'slow', evidence: 'npm test: 241s' }] };

  assert.throws(
    () => callTool('deck_status', { run: run.id, slug: 'yellow-lane', slices: [], finished: 'closing report posted', report: sent }),
    (err) => {
      assert.match(err.message, /report\.friction is derived from the record's friction rows/);
      return true;
    },
  );
  assert.equal(recordFor(MINE), null, 'nothing refused was stored');
});

test('a finished record without a report gains none', () => {
  const finished = { slug: 'x', friction: [agent(1, 2)], finished: 'closing report posted' };
  assert.equal(nextRecord(finished, recordFields({ slug: 'x', friction: [drain(1, 3)] })).report, undefined);
  assert.equal(nextRecord(finished, recordFields({ slug: 'x', findings: ['kept: F1 drop the helper'] })).report, undefined);
});
