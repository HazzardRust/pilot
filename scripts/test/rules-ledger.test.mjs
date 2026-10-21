/**
 * S2 of main-never-red: the rules ledger builds for any checkout (spec 1; L3).
 */

import { rulesLedgerText } from '../build-rules-ledger.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const sha256 = (text) => createHash('sha256').update(text).digest('hex');

const git = (cwd, ...args) =>
  execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'commit.gpgsign=false', ...args], {
    cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();

function tempDir(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rules-ledger-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

test('a rule edited in the working tree adds its hash', (t) => {
  const dir = tempDir(t);
  git(dir, 'init', '-q', '-b', 'main');
  fs.mkdirSync(path.join(dir, 'rules'));
  fs.writeFileSync(path.join(dir, 'rules', 'a.md'), 'one\n');
  git(dir, 'add', 'rules/a.md');
  git(dir, 'commit', '-q', '-m', 'one');
  fs.writeFileSync(path.join(dir, 'rules', 'a.md'), 'two\n');
  const want = [sha256('one\n'), sha256('two\n')].sort();
  assert.equal(rulesLedgerText(dir), `{\n  "a.md": ${JSON.stringify(want)}\n}\n`);
});

test('a rebuild on a history that no longer holds an old version keeps its hash from the committed ledger', (t) => {
  const dir = tempDir(t);
  git(dir, 'init', '-q', '-b', 'main');
  fs.mkdirSync(path.join(dir, 'rules'));
  fs.mkdirSync(path.join(dir, 'scripts'));
  fs.writeFileSync(path.join(dir, 'rules', 'a.md'), 'new\n');
  const committed = { 'a.md': [sha256('old\n')], 'gone.md': [sha256('gone\n')] };
  fs.writeFileSync(path.join(dir, 'scripts', 'shipped-rules.json'), JSON.stringify(committed));
  git(dir, 'add', 'rules', 'scripts');
  git(dir, 'commit', '-q', '-m', 'squashed');
  assert.deepEqual(JSON.parse(rulesLedgerText(dir)), {
    'a.md': [sha256('new\n'), sha256('old\n')].sort(),
    'gone.md': [sha256('gone\n')],
  });
});

test('a shallow clone is refused', (t) => {
  const src = tempDir(t);
  git(src, 'init', '-q', '-b', 'main');
  for (const n of ['one', 'two']) {
    fs.writeFileSync(path.join(src, 'f.txt'), n);
    git(src, 'add', 'f.txt');
    git(src, 'commit', '-q', '-m', n);
  }
  const dest = path.join(tempDir(t), 'clone');
  git(src, 'clone', '-q', '--depth', '1', pathToFileURL(src).href, dest);
  assert.throws(() => rulesLedgerText(dest), /shallow/);
});

/** A one-commit repo, as after the fresh-repo move: `rules/a.md` at "two", and a ledger recording more than history holds. */
function freshRepo(t) {
  const dir = tempDir(t);
  git(dir, 'init', '-q', '-b', 'main');
  fs.mkdirSync(path.join(dir, 'rules'));
  fs.mkdirSync(path.join(dir, 'scripts'));
  fs.writeFileSync(path.join(dir, 'rules', 'a.md'), 'two\n');
  const ledger = {
    'a.md': [sha256('one\n'), sha256('two\n')].sort(),
    'gone.md': [sha256('retired\n')],
  };
  const text = `{\n${Object.entries(ledger).map(([k, v]) => `  ${JSON.stringify(k)}: ${JSON.stringify(v)}`).join(',\n')}\n}\n`;
  fs.writeFileSync(path.join(dir, 'scripts', 'shipped-rules.json'), text);
  git(dir, 'add', 'rules', 'scripts');
  git(dir, 'commit', '-q', '-m', 'fresh');
  return { dir, text };
}

test('a ledger entry the history no longer holds is kept', (t) => {
  const { dir, text } = freshRepo(t);
  // `--check` passes exactly when the rebuilt text equals the committed file.
  assert.equal(rulesLedgerText(dir), text);
});

test('an entry deleted from the ledger by hand comes back', (t) => {
  const { dir, text } = freshRepo(t);
  const file = path.join(dir, 'scripts', 'shipped-rules.json');
  fs.writeFileSync(file, `{\n  "a.md": ${JSON.stringify([sha256('two\n')])}\n}\n`);
  git(dir, 'commit', '-q', '-am', 'drop entries');
  assert.equal(rulesLedgerText(dir), text);
});

test('a rules edit without its ledger entry is still stale', (t) => {
  const { dir, text } = freshRepo(t);
  fs.writeFileSync(path.join(dir, 'rules', 'a.md'), 'three\n');
  const rebuilt = JSON.parse(rulesLedgerText(dir));
  assert.notEqual(rulesLedgerText(dir), text);
  assert.ok(rebuilt['a.md'].includes(sha256('three\n')));
  assert.ok(rebuilt['a.md'].includes(sha256('one\n')));
});

test('a malformed committed ledger is an error, never carried forward', (t) => {
  const { dir } = freshRepo(t);
  fs.writeFileSync(path.join(dir, 'scripts', 'shipped-rules.json'), '{"a.md": "not-a-list"}\n');
  git(dir, 'commit', '-q', '-am', 'bad ledger');
  assert.throws(() => rulesLedgerText(dir), /shipped-rules\.json at blob [0-9a-f]+ is malformed/);
});

test('a merge in progress counts the incoming commits', (t) => {
  const dir = tempDir(t);
  git(dir, 'init', '-q', '-b', 'main');
  fs.mkdirSync(path.join(dir, 'rules'));
  fs.writeFileSync(path.join(dir, 'rules', 'x.md'), 'base\n');
  fs.writeFileSync(path.join(dir, 'rules', 'y.md'), 'base\n');
  git(dir, 'add', 'rules');
  git(dir, 'commit', '-q', '-m', 'base');
  git(dir, 'checkout', '-q', '-b', 'slice');
  for (const n of ['middle', 'final']) {
    fs.writeFileSync(path.join(dir, 'rules', 'x.md'), `${n}\n`);
    git(dir, 'commit', '-q', '-am', n);
  }
  git(dir, 'checkout', '-q', 'main');
  fs.writeFileSync(path.join(dir, 'rules', 'y.md'), 'main edit\n');
  git(dir, 'commit', '-q', '-am', 'main edit');
  git(dir, 'merge', '-q', '--no-ff', '--no-commit', 'slice');
  const ledger = JSON.parse(rulesLedgerText(dir));
  assert.ok(ledger['x.md'].includes(sha256('middle\n')));
});
