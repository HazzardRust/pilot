/**
 * tree-tests-guard S1 (A1): `treeWalkers` is the census that keeps `TREE_TESTS` whole, and this file
 * is itself in `TREE_TESTS`, so a new tree-reading test missing from the list goes red in the
 * narrow loop, not only when `select-tests.mjs` changes.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const { TREE_TESTS, treeWalkers } = await import('../select-tests.mjs');

test('every tree walker is listed', () => {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
  const walkers = treeWalkers(root);
  assert.ok(walkers.includes('scripts/test/path-length.test.mjs'), 'the census finds a known walker');
  assert.deepEqual(walkers.filter((rel) => !TREE_TESTS.includes(rel)), [], 'a test walking the tree is missing from TREE_TESTS');
});

test('the census rides every selection', () => {
  assert.ok(TREE_TESTS.includes('scripts/test/tree-census.test.mjs'));
});
