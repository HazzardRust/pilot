// cheap-suite S1: the cost table, through `costTable`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { costTable } from '../test-cost.mjs';

const line = (file, ms, pass = true) => JSON.stringify({ file, ms, pass });
const kinds = (git, node, other) => ({ total: git + node + other, node, git, other });

/** The table's rows, each split on its whitespace. */
const rows = (table) => table.trimEnd().split('\n').map((row) => row.trim().split(/\s+/));

test('the table ranks files by time and names their spawns', () => {
  const lines = [line('a.test.mjs', 1000), line('a.test.mjs', 500, false), line('b.test.mjs', 3000), line('c.test.mjs', 200)];
  const owners = new Map([
    ['a.test.mjs', kinds(3, 1, 1)],
    ['b.test.mjs', kinds(2, 0, 0)],
    ['c.test.mjs', kinds(0, 0, 0)],
    ['-', kinds(7, 7, 7)],
  ]);
  assert.deepEqual(rows(costTable(lines, owners)), [
    ['file', 's', 'tests', 'spawns', 'git', 'node', 'other'],
    ['b.test.mjs', '3.0', '1', '2', '2', '0', '0'],
    ['a.test.mjs', '1.5', '2', '5', '3', '1', '1'],
    ['c.test.mjs', '0.2', '1', '0', '0', '0', '0'],
    ['-', '0.0', '0', '21', '7', '7', '7'],
    ['total', '4', 'files', '4.7', 's', '28', 'spawns', '(git', '12)'],
  ]);
});

test('a file with spawns and no passing test still shows', () => {
  const owners = new Map([['d.test.mjs', kinds(4, 0, 0)]]);
  assert.deepEqual(rows(costTable([line('a.test.mjs', 100)], owners)), [
    ['file', 's', 'tests', 'spawns', 'git', 'node', 'other'],
    ['a.test.mjs', '0.1', '1', '0', '0', '0', '0'],
    ['d.test.mjs', '0.0', '0', '4', '4', '0', '0'],
    ['total', '2', 'files', '0.1', 's', '4', 'spawns', '(git', '4)'],
  ]);
});

test('past the top rows the rest is one line', () => {
  const lines = [line('a.test.mjs', 3000), line('b.test.mjs', 2000), line('c.test.mjs', 1000), line('d.test.mjs', 500)];
  const owners = new Map([['c.test.mjs', kinds(1, 1, 0)], ['d.test.mjs', kinds(0, 0, 3)]]);
  const table = rows(costTable(lines, owners, { top: 2 }));
  assert.deepEqual(table.slice(3), [
    ['rest', '2', 'files', '1.5', 's', '5', 'spawns'],
    ['total', '4', 'files', '6.5', 's', '5', 'spawns', '(git', '1)'],
  ]);
});

test("the runner's own spawns, owner `-`, are a row and in the total, so the total matches the spawn line", () => {
  const owners = new Map([['a.test.mjs', kinds(2, 0, 0)], ['-', kinds(1, 3, 0)]]);
  assert.deepEqual(rows(costTable([line('a.test.mjs', 100)], owners)), [
    ['file', 's', 'tests', 'spawns', 'git', 'node', 'other'],
    ['a.test.mjs', '0.1', '1', '2', '2', '0', '0'],
    ['-', '0.0', '0', '4', '1', '3', '0'],
    ['total', '2', 'files', '0.1', 's', '6', 'spawns', '(git', '3)'],
  ]);
});

test('no lines and no owners is a total of nothing', () => {
  assert.deepEqual(rows(costTable([], new Map())).at(-1), ['total', '0', 'files', '0.0', 's', '0', 'spawns', '(git', '0)']);
});
