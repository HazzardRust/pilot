/** S1 of audit-fixes: a deep worktree checks out clean (spec 1, 2; L1, L2). */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const MAX_TRACKED_PATH = 90;
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

const longPaths = (paths, max = MAX_TRACKED_PATH) => paths.filter((p) => p.length > max);

test('every tracked path is at most 90 characters', () => {
  const out = execFileSync('git', ['ls-files'], { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const long = longPaths(out.split('\n').filter(Boolean));
  assert.deepEqual(long.map((p) => `${p.length} ${p}`), []);
});

test('the bound names a long path', () => {
  const long = 'x'.repeat(MAX_TRACKED_PATH + 1);
  assert.deepEqual(longPaths(['short.txt', long, 'y'.repeat(MAX_TRACKED_PATH)]), [long]);
});
