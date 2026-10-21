/** S3 of run-analytics: a cost column from an editable price table (spec 4, 5; L6, A2). */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { costOf } from '../analytics.mjs';
import { analytics as run, tables } from './analytics-run.mjs';

const analytics = (t, slug, override) => run(t, [slug], { override });

/** Each table's body rows, keyed by their first cell, with the last cell (the cost). */
const costs = (stdout) => tables(stdout).map((rows) => Object.fromEntries(rows.map((cells) => [cells[0], cells.at(-1)])));

const MILLION = { input: 1e6, output: 1e6, cacheWrite5m: 1e6, cacheWrite1h: 1e6, cacheRead: 1e6 };

test('an override price changes only that model\'s cells', (t) => {
  const [agents, slices] = costs(analytics(t, 'buckets').stdout);
  const after = analytics(t, 'buckets', { models: { 'claude-fable-5-1': MILLION } });
  const [agentsAfter, slicesAfter] = costs(after.stdout);

  assert.equal(after.code, 0);
  // Only the pilot ran on Fable, so only its row, its bucket and the totals move.
  assert.notEqual(agentsAfter.pilot, agents.pilot);
  assert.match(agentsAfter.pilot, /^\$[\d,]+\.\d\d$/);
  assert.deepEqual({ ...agentsAfter, pilot: null }, { ...agents, pilot: null });
  assert.notEqual(slicesAfter.pilot, slices.pilot);
  assert.notEqual(slicesAfter.Total, slices.Total);
  assert.deepEqual({ ...slicesAfter, pilot: null, Total: null }, { ...slices, pilot: null, Total: null });
  assert.ok(after.stdout.includes(`claude-fable-5-1 from ${after.file}`));
  assert.match(after.stdout, /claude-opus-5-5 from .*deck[\\/]prices\.json/);
});

test('an unpriced model shows no price and is named in the footer', (t) => {
  const { code, stdout, file } = analytics(t, 'unpriced');
  const [agents] = costs(stdout);

  assert.equal(code, 0);
  assert.equal(agents.pilot, 'no price');
  assert.ok(stdout.includes(`No price for claude-unlisted-0; add its price to ${file}.`), stdout);
  assert.equal(/\$0\.00/.test(stdout), false);
});

test('five-minute and one-hour cache writes are priced separately', () => {
  const prices = { models: { m: { input: 0, output: 0, cacheWrite5m: 1, cacheWrite1h: 3, cacheRead: 0 } } };
  const counts = (cacheWrite5m, cacheWrite1h) => ({ m: { input: 0, cacheWrite5m, cacheWrite1h, cacheRead: 0, output: 0 } });

  assert.equal(costOf(counts(1e6, 0), prices), 1);
  assert.equal(costOf(counts(0, 1e6), prices), 3);
  assert.equal(costOf({ ...counts(0, 0), n: counts(1, 1).m }, prices), null);
});

test('the footer prints the cost-state total beside the table total', (t) => {
  assert.match(analytics(t, 'unrecorded').stdout, /API-equivalent.*\$[\d,]+\.\d\d in the table, \$8\.50 by Claude Code's cost-state\./);
});

test('a run with a session lacking cost-state says once that Claude Code\'s count is unknown, and prints none of it', (t) => {
  // demo's first session has a cost-state of $1.25 and its second has none.
  const { stdout } = analytics(t, 'demo');

  assert.match(stdout, /\$[\d,]+\.\d\d in the table\. /);
  assert.equal(stdout.match(/unknown/g)?.length, 1);
  assert.equal(stdout.includes('1.25'), false);
  assert.equal(stdout.includes('cost-state'), false);
});

test('an override saved with a byte-order mark, as Windows PowerShell 5.1 writes UTF-8, is read', (t) => {
  const { code, stdout, file } = analytics(t, 'buckets', `\uFEFF${JSON.stringify({ models: { 'claude-fable-5-1': MILLION } })}`);

  assert.equal(code, 0);
  assert.ok(stdout.includes(`claude-fable-5-1 from ${file}`), stdout);
});

test('a malformed override is refused by name', (t) => {
  const malformed = [
    '{"models": {',
    { models: { 'claude-opus-5-5': { ...MILLION, output: '25' } } },
    { models: { 'claude-opus-5-5': { input: 5 } } },
    { models: [] },
    { models: { 'claude-opus-5-5': { ...MILLION, input: -1 } } },
  ];
  for (const override of malformed) {
    const { code, stdout, stderr, file } = analytics(t, 'demo', override);
    assert.equal(code, 1, JSON.stringify(override));
    assert.equal(stdout, '');
    assert.ok(stderr.includes(file), stderr);
  }
});
