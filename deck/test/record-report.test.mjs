/**
 * S4 of usage-telemetry: a closing report is data in the run record (spec 11;
 * L10, L11, ADR 0044). The pilot sends `report` in the `deck_status` call that
 * sets `finished`; the record keeps it in the deck's store, validated, in
 * `RECORD_ORDER`. Nothing here depends on it reaching the repository.
 *
 * Every test takes its own store (`tempDeck`); nothing here touches 4321 or
 * `~/.claude/pilot/`.
 */

import './no-open.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { storedDeck, tempDeck } from '../testUtils.mjs';

const { recordFor, registerRun, storeFile } = await import('../store.mjs');
const { callTool } = await import('../server.mjs');
const { MAX_FINDINGS } = await import('../tools.mjs');

const MINE = path.join('D:', 'work', 'pilot');

/** A whole closing report, written by hand; its friction the deck derives (yellow-lane S11). */
const fullReport = () => ({
  featurePr: { number: 180, state: 'merged', mergeSha: 'a1b2c3d4e5f6' },
  slices: [
    { slice: 'S1', pr: 181, mergeSha: '733afa1' },
    { slice: 'S2', pr: 182, mergeSha: '0123456789abcdef0123456789abcdef01234567' },
  ],
  assumed: [{ id: 'A2', decision: 'past reports are not converted', taken: 'pilot, asked' }],
  worktreesLeft: [path.resolve('C:/work/pilot-s1')], // the native spelling the store reads back (portable-store L2)
});

/** The report as the finished record holds it: what was sent, plus the derived friction of a record with no rows. */
const stored = () => ({ ...fullReport(), friction: { agents: [], drains: [] } });

const finish = (run, report) => ({
  run: run.id,
  slug: 'usage-telemetry',
  slices: [],
  findings: ['kept: F1 drop the helper'],
  finished: 'closing report posted',
  report,
});

test('a deck_status with report writes it into the store\'s record in RECORD_ORDER', (t) => {
  tempDeck(t);
  const run = registerRun({ repo: MINE, pid: process.pid });

  callTool('deck_status', { ...finish(run, fullReport()), next: 'nothing; the run is over' });

  const record = recordFor(MINE);
  assert.deepEqual(record.report, stored());
  assert.deepEqual(
    Object.keys(record),
    ['slug', 'slices', 'findings', 'report', 'next', 'finished', 'finishedAt', 'updatedAt'],
    'report sits between findings and next',
  );
  // The store's own bytes, read: the report is in the deck's store (L11).
  const store = storedDeck();
  assert.deepEqual(store.records.at(-1).record.report, stored());
});

test('a report missing featurePr, or with a non-hex mergeSha, or an unknown key, is refused naming the field', (t) => {
  tempDeck(t);
  const run = registerRun({ repo: MINE, pid: process.pid });
  const { featurePr, ...noFeaturePr } = fullReport();
  const badSha = fullReport();
  badSha.slices[1].mergeSha = 'not-a-sha';
  const unknown = { ...fullReport(), verdict: 'fine' };
  const cases = [
    [noFeaturePr, /featurePr/],
    [badSha, /slices\[1\]\.mergeSha/],
    [unknown, /verdict/],
    [{ ...fullReport(), assumed: [{ id: 'X1', decision: 'd', taken: 't' }] }, /assumed\[0\]\.id/],
    [{ ...fullReport(), worktreesLeft: ['  '] }, /worktreesLeft\[0\]/],
    [{ ...fullReport(), featurePr: { ...featurePr, number: '180' } }, /featurePr\.number/],
    [{ ...fullReport(), featurePr: { ...featurePr, number: 0 } }, /featurePr\.number/],
    [{ ...fullReport(), featurePr: { ...featurePr, mergeSha: 'a1b2c3' } }, /featurePr\.mergeSha/],
    [{ ...fullReport(), worktreesLeft: Array.from({ length: MAX_FINDINGS + 1 }, () => 'C:/work/a') }, /worktreesLeft/],
    ['a paragraph of Markdown', /report/],
  ];
  for (const [report, field] of cases) {
    assert.throws(() => callTool('deck_status', finish(run, report)), (err) => {
      assert.match(err.message, field);
      assert.doesNotMatch(err.message, /\n/, 'one line');
      return true;
    });
  }
  assert.equal(recordFor(MINE), null, 'nothing refused was stored');

  const open = { ...fullReport(), featurePr: { number: 180, state: 'open' } };
  callTool('deck_status', finish(run, open));
  assert.deepEqual(recordFor(MINE).report.featurePr, open.featurePr, 'featurePr.mergeSha is optional');
});

test('a report sent without a slug is refused, like every record field', (t) => {
  tempDeck(t);
  const run = registerRun({ repo: MINE, pid: process.pid });
  assert.throws(() => callTool('deck_status', { run: run.id, report: fullReport() }), /slug/);
});

test('a later call without report keeps it', (t) => {
  tempDeck(t);
  const run = registerRun({ repo: MINE, pid: process.pid });

  callTool('deck_status', finish(run, fullReport()));
  callTool('deck_status', { run: run.id, slug: 'usage-telemetry', slices: [], next: 'one more look at S2' });

  assert.deepEqual(recordFor(MINE).report, stored());
});
