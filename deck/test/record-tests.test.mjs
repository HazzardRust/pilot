/**
 * tested-once S5 (spec 4): the run record lists the feature's test-ledger rows, and the closing report
 * totals them in one line. Each test takes its own store (`tempDeck`) and its own ledger home, written
 * by the ledger's own writer (`recordRun`).
 */

import './no-open.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { recordRun } from '../../scripts/test-ledger.mjs';
import { closingReportOf } from '../closing-report.mjs';
import { registerRun, setSlices } from '../store.mjs';
import { tempDeck } from '../testUtils.mjs';

const REPO = 'D:/work/pilot';
const GATE = { pr: '#600', landing: { state: 'landed', sha: '1a2b3c4' } };

/** A ledger home of the test's own, as `os.homedir()` resolves it, restored when the test ends. */
function scratchHome(t) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'pilot-ledger-'));
  const before = { HOME: process.env.HOME, USERPROFILE: process.env.USERPROFILE };
  process.env.HOME = home;
  process.env.USERPROFILE = home;
  t.after(() => {
    Object.assign(process.env, before);
    fs.rmSync(home, { recursive: true, force: true });
  });
  return home;
}

/** One ledger row as `runTests` writes it. */
const run = (home, where, branch, minutes) => recordRun({
  at: '2026-11-25T10:00:00.000Z', where, branch, slug: null, sha: 'a'.repeat(40), tree: 'b'.repeat(40),
  since: 'c'.repeat(40), scope: 'selected 2 of 9 test files', exit: 0, minutes, platform: 'win32', node: 22,
}, { home });

/** A deck_status for slug `x`: the record it writes. */
const statusFor = (slug) => setSlices(registerRun({ repo: REPO, pid: process.pid }).id, [], undefined, { slug }).record;

test('run.json lists the runs', (t) => {
  tempDeck(t);
  const home = scratchHome(t);
  run(home, 'implementer', 'slice/x-s1', 4);
  run(home, 'implementer', 'slice/x-s2', 3.5);
  run(home, 'other', 'slice/y-s1', 1);
  run(home, 'integrate', 'feat/x', 2);

  const { tests } = statusFor('x');

  assert.equal(tests.length, 3);
  assert.deepEqual(tests.map((row) => row.where), ['implementer', 'implementer', 'integrate']);
  assert.deepEqual(Object.keys(tests[0]).sort(), ['at', 'branch', 'exit', 'minutes', 'scope', 'sha', 'where']);
});

test('the closing report totals them', (t) => {
  tempDeck(t);
  const home = scratchHome(t);
  run(home, 'implementer', 'slice/x-s1', 4);
  run(home, 'integrate', 'feat/x', 2);
  run(home, 'implementer', 'slice/x-s2', 3.5);

  const { body } = closingReportOf(statusFor('x'), GATE, []);

  assert.ok(body.split('\n').includes('test runs: 3 local, 9.5 min (implementer 2, integrate 1)'), body);
});

test('a record with no tests says nothing', (t) => {
  tempDeck(t);
  scratchHome(t);

  const record = statusFor('x');
  const { body } = closingReportOf(record, GATE, []);

  assert.equal(record.tests, undefined);
  assert.ok(!body.includes('test runs:'), body);
});
