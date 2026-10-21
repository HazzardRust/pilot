/**
 * S3 of main-never-red: the gate's ledger seam rebuilds both ledgers and names the stale ones
 * (spec 1; L1, L2). Every test builds its own temp git repo; none writes this checkout's ledgers.
 */

import { rebuildLedgers } from '../ledgers.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const sha256 = (text) => createHash('sha256').update(text).digest('hex');

const git = (cwd, ...args) =>
  execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'commit.gpgsign=false', ...args], {
    cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();

const header = '<!-- provenance\nupstream: Up 1.0 - x\ncopyright: Copyright (c) Up\nlicence: MIT - see NOTICE\n-->\n';
const fragment = (files) =>
  `# Up\n\n## Vendored files\n\n| File | Upstream | Adapted | What changed and why |\n| --- | --- | --- | --- |\n${files
    .map((file) => `| \`${file}\` | Up 1.0 | yes | trimmed |\n`)
    .join('')}`;

/** A temp checkout with one committed rule, one vendor fragment, and both ledgers built once. */
function checkout(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ledgers-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  git(dir, 'init', '-q', '-b', 'main');
  for (const sub of ['rules', 'scripts', 'vendor']) fs.mkdirSync(path.join(dir, sub));
  fs.writeFileSync(path.join(dir, 'rules', 'a.md'), 'one\n');
  fs.writeFileSync(path.join(dir, 'x.md'), header);
  fs.writeFileSync(path.join(dir, 'y.md'), header);
  fs.writeFileSync(path.join(dir, 'vendor', 'up.md'), fragment(['x.md']));
  git(dir, 'add', '.');
  git(dir, 'commit', '-q', '-m', 'one');
  assert.deepEqual(rebuildLedgers(dir), ['scripts/shipped-rules.json', 'VENDOR.md'], 'the first build writes both');
  return dir;
}

test('an edited rule makes the rules ledger stale and rebuilds it', (t) => {
  const dir = checkout(t);
  fs.writeFileSync(path.join(dir, 'rules', 'a.md'), 'two\n');
  assert.deepEqual(rebuildLedgers(dir), ['scripts/shipped-rules.json']);
  assert.ok(fs.readFileSync(path.join(dir, 'scripts', 'shipped-rules.json'), 'utf8').includes(sha256('two\n')));
});

test('a current tree rebuilds nothing', (t) => {
  const dir = checkout(t);
  const before = ['scripts/shipped-rules.json', 'VENDOR.md'].map((rel) => fs.readFileSync(path.join(dir, rel)));
  assert.deepEqual(rebuildLedgers(dir), []);
  const after = ['scripts/shipped-rules.json', 'VENDOR.md'].map((rel) => fs.readFileSync(path.join(dir, rel)));
  assert.deepEqual(after, before);
});

test('a stale fragment makes VENDOR.md stale', (t) => {
  const dir = checkout(t);
  fs.writeFileSync(path.join(dir, 'vendor', 'up.md'), fragment(['x.md', 'y.md']));
  assert.deepEqual(rebuildLedgers(dir), ['VENDOR.md']);
  assert.ok(fs.readFileSync(path.join(dir, 'VENDOR.md'), 'utf8').includes('`y.md`'));
});
