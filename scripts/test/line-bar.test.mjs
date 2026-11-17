/**
 * S11 of blocked-steps: no script or hook grows past 800 lines unseen (spec 10). The bar is
 * checked over the top level of `scripts/*.mjs` and `hooks/*.js`, so a slice that pushes a file
 * past it fails the gate naming the file.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

const BAR = 800;

/** `<file> has <n> lines` for each top-level `*<ext>` file in `dir` longer than `bar` lines. */
function overBar(dir, ext, bar) {
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isFile() && e.name.endsWith(ext))
    .map((e) => {
      const text = fs.readFileSync(path.join(dir, e.name), 'utf8');
      return { name: e.name, lines: text.split('\n').length - (text.endsWith('\n') ? 1 : 0) };
    })
    .filter((f) => f.lines > bar)
    .map((f) => `${f.name} has ${f.lines} lines`);
}

test('a planted file over the bar is named', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'line-bar-'));
  try {
    fs.writeFileSync(path.join(dir, 'big.mjs'), 'x\n'.repeat(801));
    fs.writeFileSync(path.join(dir, 'small.mjs'), 'x\n'.repeat(10));
    fs.writeFileSync(path.join(dir, 'exact.mjs'), 'x\n'.repeat(800));
    fs.writeFileSync(path.join(dir, 'a b.mjs'), 'x\n'.repeat(900));
    fs.writeFileSync(path.join(dir, 'nonl.mjs'), 'x\n'.repeat(800) + 'x');
    assert.deepEqual(overBar(dir, '.mjs', BAR).sort(), [
      'a b.mjs has 900 lines',
      'big.mjs has 801 lines',
      'nonl.mjs has 801 lines',
    ]);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('the tree is under the bar', () => {
  assert.ok(fs.readdirSync(path.join(root, 'scripts')).some((n) => n.endsWith('.mjs')));
  assert.ok(fs.readdirSync(path.join(root, 'hooks')).some((n) => n.endsWith('.js')));
  assert.deepEqual(overBar(path.join(root, 'scripts'), '.mjs', BAR), []);
  assert.deepEqual(overBar(path.join(root, 'hooks'), '.js', BAR), []);
});
