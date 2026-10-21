/** S6 of usage-telemetry: each audit row's saving as a share of a measured run (spec 10). */

import './no-open.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { renderReport, validateReport } from '../audit.mjs';

const SPEND = { input: 1200, cacheWrite5m: 300, cacheWrite1h: 0, cacheRead: 50000, output: 800 };
const RUNS = [
  { slug: 'run-analytics', updatedAt: '2026-09-27T12:32:33.867Z', tokens: 300000, toolCalls: 1026, costUSD: 57.19 },
  { slug: 'thread-ownership', updatedAt: '2026-09-27T09:42:25.916Z', tokens: 100000, toolCalls: 400, costUSD: null },
];
const MEASURED = { log: 'D:/deck/usage.jsonl', from: '2026-09-21T09:00:00.000Z', to: '2026-09-28T10:30:00.000Z', spend: SPEND, runs: RUNS };

const aRow = (finding, tokens) => ({
  area: 'loops', finding, command: 'npm test', output: 'ok', exit: 0, fix: 'cache it',
  saving: { minutes: 1, tokens }, effort: 'S', spec: 'Problem.\n1. Behaviour.',
});

const aReport = (over = {}) => ({
  repo: 'D:/work/alpha',
  scratch: 'D:/tmp/audit-20260928',
  startedAt: '2026-09-28T11:00:00.000Z',
  minutes: 30,
  tokens: null,
  unmeasured: [],
  rows: [aRow('a slow suite', 20000), aRow('a cold cache', 50)],
  measured: MEASURED,
  ...over,
});

test('each row shows its share of a measured run', () => {
  assert.deepEqual(validateReport(aReport()), []);
  const { table, deckBody } = renderReport(aReport());
  // The mean run is 200000 tokens: 20000 is 10% of it, 50 is 0.025%.
  assert.match(table, /\| Share of a run \|/);
  assert.match(table, /\| 10% \|/);
  assert.match(table, /\| 0\.025% \|/);
  assert.match(deckBody, /20000 tokens\/run \(10% of a run\)/);
  assert.match(deckBody, /50 tokens\/run \(0\.025% of a run\)/);
  for (const text of [table, deckBody]) {
    assert.match(text, /run-analytics \(updated 2026-09-27T12:32:33\.867Z\): 300000 tokens, 1026 tool calls, \$57\.19/);
    assert.match(text, /thread-ownership \(updated 2026-09-27T09:42:25\.916Z\): 100000 tokens, 400 tool calls, no price/);
    assert.doesNotMatch(text, /finish/i, 'a run\'s date is when its record was last updated, not when it finished');
  }
});

test('no runs, no share', () => {
  for (const measured of [{ ...MEASURED, runs: [] }, { ...MEASURED, runs: undefined }, undefined]) {
    const report = aReport(measured === undefined ? { measured, unmeasured: ['measured spend: no usage log'] } : { measured });
    assert.deepEqual(validateReport(report), []);
    const { table, deckBody } = renderReport(report);
    assert.doesNotMatch(table, /Share of a run/);
    assert.doesNotMatch(`${table}${deckBody}`, /of a run\)|Latest runs/);
  }
});

test('validateReport refuses a malformed run', () => {
  const [run] = RUNS;
  const cases = [
    ['not a list', 'nope'],
    ['no slug', [{ ...run, slug: '' }]],
    ['updatedAt not a date', [{ ...run, updatedAt: 'soon' }]],
    ['tokens negative', [{ ...run, tokens: -1 }]],
    ['toolCalls fractional', [{ ...run, toolCalls: 1.5 }]],
    ['costUSD zero-filled as a string', [{ ...run, costUSD: '0' }]],
    ['costUSD missing', [{ ...run, costUSD: undefined }]],
  ];
  for (const [label, runs] of cases) {
    const problems = validateReport(aReport({ measured: { ...MEASURED, runs } }));
    assert.ok(problems.some((problem) => /measured\.runs/.test(problem)), `${label}: ${problems.join('; ') || '(no problems)'}`);
  }
});
