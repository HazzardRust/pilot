/** S5 of usage-telemetry: the report's `measured` block (spec 10, L8). */

import './no-open.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { renderReport, validateReport } from '../audit.mjs';

const SPEND = { input: 1200, cacheWrite5m: 300, cacheWrite1h: 0, cacheRead: 50000, output: 800 };
const MEASURED = { log: 'D:/deck/usage.jsonl', from: '2026-09-21T09:00:00.000Z', to: '2026-09-28T10:30:00.000Z', spend: SPEND };

const aReport = (over = {}) => ({
  repo: 'D:/work/alpha',
  scratch: 'D:/tmp/audit-20260928',
  startedAt: '2026-09-28T11:00:00.000Z',
  minutes: 30,
  tokens: null,
  unmeasured: [],
  rows: [],
  measured: MEASURED,
  ...over,
});

test('validateReport refuses a malformed measured', () => {
  assert.deepEqual(validateReport(aReport()), []);
  const cases = [
    ['not an object', 'nope'],
    ['no log', { ...MEASURED, log: '' }],
    ['from not a date', { ...MEASURED, from: 'soon' }],
    ['to missing', { ...MEASURED, to: undefined }],
    ['no spend', { ...MEASURED, spend: undefined }],
    ['a kind missing', { ...MEASURED, spend: { ...SPEND, output: undefined } }],
    ['a kind negative', { ...MEASURED, spend: { ...SPEND, input: -1 } }],
  ];
  for (const [label, measured] of cases) {
    const problems = validateReport(aReport({ measured }));
    assert.ok(problems.some((problem) => /measured/.test(problem)), `${label}: ${problems.join('; ') || '(no problems)'}`);
  }
});

test('validateReport refuses neither measured nor a measured spend line', () => {
  const neither = validateReport(aReport({ measured: undefined }));
  assert.equal(neither.length, 1, neither.join('; '));
  assert.match(neither[0], /measured spend:/);
  assert.deepEqual(validateReport(aReport({ measured: undefined, unmeasured: ['measured spend: no usage log at D:/deck/usage.jsonl'] })), []);
  assert.equal(validateReport(aReport({ measured: undefined, unmeasured: ['no measured spend: none'] })).length, 1, 'the line starts with it');
});

test('the deck body names the log path and period', () => {
  const { table, deckBody } = renderReport(aReport());
  for (const text of [deckBody, table]) {
    assert.match(text, /D:\/deck\/usage\.jsonl/);
    assert.match(text, /2026-09-21T09:00:00\.000Z/);
    assert.match(text, /2026-09-28T10:30:00\.000Z/);
    assert.match(text, /52300 tokens/, 'the spend summed over its kinds');
  }
  assert.match(deckBody, /^Measured spend:/, 'the audit opens with it');

  const without = renderReport(aReport({ measured: undefined, unmeasured: ['measured spend: no usage log'] }));
  assert.doesNotMatch(without.deckBody, /^Measured spend:/m);
  assert.match(without.deckBody, /measured spend: no usage log/, 'said under Unmeasured');
});
