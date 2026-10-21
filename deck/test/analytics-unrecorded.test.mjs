/** S5 of run-analytics: usage Claude Code counted and no transcript holds gets its own row (spec 10, L7). */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { unrecorded } from '../analytics.mjs';
import { analytics as run, tables } from './analytics-run.mjs';

const UNRECORDED = 'not in transcripts';
const analytics = (t, slug) => run(t, [slug]);

/** In the agent table the role names the row; in the slice table, the slice. */
const unrecordedRows = (rows) => rows.filter((cells) => cells.slice(0, 3).includes(UNRECORDED));
const dollars = (text) => Number(text.replace(/[$,]/g, ''));
const tokens = (text) => Number(text.replace(/,/g, ''));

test('usage only cost-state holds gets a row per model', (t) => {
  const { code, stdout } = analytics(t, 'unrecorded');
  const [agents] = tables(stdout);

  assert.equal(code, 0);
  assert.deepEqual(unrecordedRows(agents).find((cells) => cells[4] === 'claude-haiku-4-5-20251001'),
    // A haiku model no transcript holds: all of its count is the difference; cache write at the 5-minute rate.
    ['–', '–', UNRECORDED, '–', 'claude-haiku-4-5-20251001', '0', '1,000,000', '0', '200,000', '–', '–', '$2.25']);
  assert.match(stdout, /not in transcripts.*usage Claude Code counted that no transcript records, belonging to no agent or slice/);
  assert.match(stdout, /5-minute rate/);
});

test('cost-state is summed over the run\'s sessions', (t) => {
  const [agents] = tables(analytics(t, 'unrecorded').stdout);

  // Only one of the run's two sessions counts Sonnet in its cost-state.
  assert.deepEqual(unrecordedRows(agents).find((cells) => cells[4] === 'claude-sonnet-5'),
    ['–', '–', UNRECORDED, '–', 'claude-sonnet-5', '1,000,000', '0', '0', '0', '–', '–', '$2.00']);
});

test('a model that matches gets no row', (t) => {
  const [agents] = tables(analytics(t, 'unrecorded').stdout);

  assert.deepEqual(unrecordedRows(agents).map((cells) => cells[4]).sort(), ['claude-haiku-4-5-20251001', 'claude-opus-5-5', 'claude-sonnet-5']);
});

test('the totals include the rows, in both tables', (t) => {
  const { stdout } = analytics(t, 'unrecorded');
  const [agents, slices] = tables(stdout);
  const total = slices.find((cells) => cells[0] === 'Total');
  const [unrecordedSlice] = unrecordedRows(slices);

  // The slice table's row sits after unattributed and before Total, and sums the agent table's rows.
  assert.deepEqual(slices.slice(-3).map((cells) => cells[0]), ['unattributed', UNRECORDED, 'Total']);
  assert.equal(dollars(unrecordedSlice.at(-1)), 8.23); // 3.98 + 2.25 + 2.00
  const agentSum = agents.reduce((sum, cells) => sum + dollars(cells.at(-1)), 0);
  assert.ok(Math.abs(dollars(total.at(-1)) - agentSum) < 0.015, `${total.at(-1)} against ${agentSum}`);
  for (const column of [2, 3, 4, 5]) {
    assert.equal(tokens(total[column]), agents.reduce((sum, cells) => sum + tokens(cells[column + 3]), 0), `column ${column}`);
  }
  assert.match(stdout, new RegExp(`\\${total.at(-1)} in the table, \\$8\\.50 by Claude Code's cost-state`));
});

test('a session without cost-state means no rows and a footer that says so', (t) => {
  for (const slug of ['buckets', 'demo']) {
    const { stdout } = analytics(t, slug);

    assert.equal(stdout.includes(UNRECORDED), false, slug);
    assert.match(stdout, /Claude Code's own count is unknown for this run/, slug);
  }
});

test('a negative difference is shown signed', (t) => {
  const [agents] = tables(analytics(t, 'unrecorded').stdout);

  // Transcripts hold 100,000 more cache reads than cost-state counts: -$0.02 against the +$4.00 of input.
  assert.deepEqual(unrecordedRows(agents).find((cells) => cells[4] === 'claude-opus-5-5'),
    ['–', '–', UNRECORDED, '–', 'claude-opus-5-5', '1,000,000', '0', '-100,000', '0', '–', '–', '$3.98']);

  // Priced only for cache reads, the same row costs less than nothing.
  const override = { models: { 'claude-opus-5-5': { input: 0, output: 0, cacheWrite5m: 0, cacheWrite1h: 0, cacheRead: 1 } } };
  const [priced] = tables(run(t, ['unrecorded'], { override }).stdout);
  assert.equal(unrecordedRows(priced).find((cells) => cells[4] === 'claude-opus-5-5').at(-1), '-$0.10');
});

test('a model named __proto__ is differenced like any other', () => {
  // Model names are transcript text; JSON.parse makes `__proto__` an own key, as the reader does.
  const models = JSON.parse('{"__proto__": {"input": 5, "output": 0, "cacheRead": 0, "cacheWrite5m": 1, "cacheWrite1h": 2}}');

  assert.deepEqual(unrecorded({}, [{ models }]),
    JSON.parse('{"__proto__": {"input": -5, "output": 0, "cacheRead": 0, "cacheWrite": -3}}'));
});

test('a cost-state model key with a bracketed suffix counts as its model', (t) => {
  // The fixture's cost-state splits opus between `claude-opus-5-5[1m]` and `claude-opus-5-5`.
  const { stdout } = analytics(t, 'unrecorded');
  const [, slices] = tables(stdout);

  assert.equal(stdout.includes('[1m]'), false);
  assert.match(slices.at(-1).at(-1), /^\$[\d,]+\.\d\d$/);
});
