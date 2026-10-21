import { crlfFiles } from './lib/line-endings.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

function git(dir, ...args) {
  execFileSync('git', ['-c', 'core.autocrlf=false', '-c', 'user.name=t', '-c', 'user.email=t@example.com',
    '-c', 'commit.gpgsign=false', ...args], { cwd: dir, stdio: 'pipe' });
}

/** A scratch repository with LF `a.md` and `b.md` committed, the working copies then rewritten by `edit`. */
function scratch(t, edit) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pilot-eol-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  git(dir, 'init', '-q');
  fs.writeFileSync(path.join(dir, 'a.md'), 'one\ntwo\n');
  fs.writeFileSync(path.join(dir, 'b.md'), 'one\ntwo\nthree\n');
  git(dir, 'add', 'a.md', 'b.md');
  git(dir, 'commit', '-q', '-m', 'init');
  edit(dir);
  return dir;
}

test('a CRLF working copy is named', (t) => {
  const dir = scratch(t, (d) => fs.writeFileSync(path.join(d, 'b.md'), 'one\r\ntwo\r\nthree\r\n'));
  assert.deepEqual(crlfFiles(dir), ['b.md']);
});

test('a mixed file is named too', (t) => {
  const dir = scratch(t, (d) => fs.writeFileSync(path.join(d, 'b.md'), 'one\ntwo\r\nthree\n'));
  assert.deepEqual(crlfFiles(dir), ['b.md']);
});

test('a tracked file deleted from the working copy is not named', (t) => {
  const dir = scratch(t, (d) => fs.rmSync(path.join(d, 'a.md')));
  assert.deepEqual(crlfFiles(dir), []);
});

test('this checkout has none', () => {
  const found = crlfFiles(ROOT);
  assert.deepEqual(found, [], `tracked files with CRLF in the working copy:\n${found.join('\n')}`);
});
