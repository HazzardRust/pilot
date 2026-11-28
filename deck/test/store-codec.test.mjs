/**
 * The store codec's pins (portable-store S1, L2, L3): a path round-trips through its root, spellings of one
 * directory collapse to one stored path, and a stored path that climbs out of its root is refused.
 */

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { hostPlatform, isWindows, pathKey } from '../../hooks/lib/platform.js';
import { decodePath, defaultRoots, encodePath, fromStored, toStored } from '../store-codec.mjs';

test('a path round-trips through its root', () => {
  const win = defaultRoots('C:\\Users\\a', 'win32');
  assert.equal(encodePath('C:\\Users\\a\\Projects\\pilot', win), '@home/Projects/pilot');
  assert.equal(decodePath('@home/Projects/pilot', win), 'C:\\Users\\a\\Projects\\pilot');
  assert.equal(decodePath(encodePath('D:\\work\\repo', win), win), 'D:\\work\\repo', 'another drive is its own root');
  assert.equal(encodePath('C:\\Users\\a', win), '@home/');
  assert.equal(decodePath('@home/', win), 'C:\\Users\\a');

  const posix = defaultRoots('/home/a', 'linux');
  assert.equal(encodePath('/home/a/Projects/pilot', posix), '@home/Projects/pilot');
  assert.equal(decodePath('@home/Projects/pilot', posix), '/home/a/Projects/pilot');
  assert.equal(decodePath(encodePath('/srv/repo', posix), posix), '/srv/repo');

  assert.throws(() => decodePath('@home/../x', win), /climbs out/);
  assert.throws(() => decodePath('@home/a\\..\\..\\x', win), /climbs out/, 'a backslash is a separator too');
  assert.throws(() => decodePath('@home/C:/Windows', win), /reads outside its root/, 'a drive segment is not a name under the root');
  assert.equal(decodePath('@home/C:/x', posix), '/home/a/C:/x', 'off win32 a colon is a character of the name');
  assert.throws(() => decodePath('@elsewhere/x', posix), /does not have/);
  assert.throws(() => decodePath('C:\\Users\\a\\x', win), /not a stored path/);
  assert.equal(encodePath('relative/dir', win), 'relative/dir', 'what is not absolute is not a path to store');
});

test('a path that is not absolute under these roots is stored and read back as it is', () => {
  const posix = defaultRoots('/home/a', 'linux');
  const win = defaultRoots('C:\\Users\\a', 'win32');
  for (const [roots, given] of [
    [posix, ['D:\\work\\pilot', 'C:/work/alpha']],
    [win, ['/srv/repo', '/home/a/x']],
  ]) {
    const deck = { version: 4, items: given.map((repo) => ({ repo })) };
    const { stored, machine } = toStored(deck, roots);
    assert.deepEqual(stored, deck, 'another flavour is not a path to store');
    assert.deepEqual(fromStored(stored, machine, roots), deck);
  }
});

test('a posix name holding a backslash keeps it, so two such keys do not meet', () => {
  const posix = defaultRoots('/home/runner', 'linux');
  // The keys pathKey made on ubuntu-latest from the fixture D:\work\pilot and its '/' twin (CI at fae3569).
  const keys = ['/home/runner/work/pilot/pilot/D:\\work\\pilot', '/home/runner/work/pilot/pilot/D:/work/pilot'];
  const deck = { version: 4, decks: Object.fromEntries(keys.map((key, n) => [key, n])) };
  const { stored, machine } = toStored(deck, posix);
  assert.deepEqual(Object.keys(stored.decks), ['@home/work/pilot/pilot/D:\\work\\pilot', '@home/work/pilot/pilot/D:/work/pilot']);
  assert.deepEqual(Object.keys(fromStored(stored, machine, posix).decks), keys);
  assert.equal(decodePath('@home/a\\..\\x', posix), '/home/runner/a\\..\\x', 'a backslash is a name character on posix');
});

test('a missing path under a root spelled through a link is stored under that root', (t) => {
  const base = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'pilot-codec-link-')));
  t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  const target = path.join(base, 'target');
  fs.mkdirSync(target);
  const home = path.join(base, 'link'); // stands in for an 8.3 spelling (C:\Users\RUNNER~1) or macOS /var
  fs.symlinkSync(target, home, 'junction');
  const roots = defaultRoots(home, hostPlatform());
  assert.equal(encodePath(path.join(home, 'work', 'pilot'), roots), '@home/work/pilot');
});

test('a missing path takes the case of its existing ancestors', (t) => {
  if (!isWindows()) return t.skip('case folds on win32');
  const home = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'pilot-codec-case-')));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  fs.mkdirSync(path.join(home, 'Projects'));
  assert.equal(encodePath(path.join(home, 'projects', 'newrepo'), defaultRoots(home, 'win32')), '@home/Projects/newrepo');
});

test('a case respelling under a home spelled through a link takes the case on disk below the link', (t) => {
  if (!isWindows()) return t.skip('case folds on win32');
  const base = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'pilot-codec-case-link-')));
  t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  fs.mkdirSync(path.join(base, 'target', 'Projects', 'pilot'), { recursive: true });
  const home = path.join(base, 'link'); // as a runner's home under C:\Users\RUNNER~1, whose realpath differs above the case
  fs.symlinkSync(path.join(base, 'target'), home, 'junction');
  assert.equal(encodePath(path.join(home, 'PROJECTS', 'PILOT'), defaultRoots(home, 'win32')), '@home/Projects/pilot');
});

/** A home holding `Projects/pilot`, and a junction (a symlink off win32) `alias` beside it to that repo. */
function linkedRepo(t) {
  const home = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'pilot-codec-alias-')));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  const repo = path.join(home, 'Projects', 'pilot');
  fs.mkdirSync(repo, { recursive: true });
  const alias = path.join(home, 'alias');
  fs.symlinkSync(repo, alias, 'junction');
  return { home, repo, alias, roots: defaultRoots(home, hostPlatform()) };
}

test('a link spelling of an existing dir is stored and read back as given (L2 narrowed to case, assumed)', (t) => {
  const { alias, roots } = linkedRepo(t);
  assert.equal(encodePath(alias, roots), '@home/alias');
  assert.equal(decodePath(encodePath(alias, roots), roots), alias);
});

test('an 8.3 short spelling of an existing dir is stored and read back as given', (t) => {
  const { repo, roots } = linkedRepo(t);
  if (!isWindows()) return t.skip('8.3 names are win32 only');
  const out = execFileSync('cmd.exe', ['/d', '/c', `for %I in ("${repo}") do @echo %~sI`], { windowsHide: true, windowsVerbatimArguments: true });
  const short = String(out).trim(); // as os.tmpdir() reads on a runner: C:\Users\RUNNER~1\...
  if (short.toLowerCase() === repo.toLowerCase()) return t.skip('this volume makes no 8.3 names');
  assert.equal(decodePath(encodePath(short, roots), roots), short);
});

test('one repo in two link spellings is two stored strings but one deck key, and no collision', (t) => {
  const { repo, alias, roots } = linkedRepo(t);
  const deck = { version: 4, items: [{ repo }, { repo: alias }], decks: { [pathKey(repo)]: 1 } };
  deck.decks[pathKey(alias)] = 2; // the deck folds both spellings to one key before anything is stored
  const { stored, machine } = toStored(deck, roots);
  assert.deepEqual(stored.items.map((item) => item.repo), ['@home/Projects/pilot', '@home/alias']);
  const read = fromStored(stored, machine, roots);
  assert.deepEqual(Object.keys(read.decks), [pathKey(repo)]);
  assert.deepEqual(read.items.map((item) => item.repo), [repo, alias]);
});

test('spellings of one repo collapse', (t) => {
  const home = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'pilot-codec-')));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  const repo = path.join(home, 'Projects', 'pilot');
  fs.mkdirSync(repo, { recursive: true });
  const roots = defaultRoots(home, process.platform);
  // Win32 folds case and both separators; POSIX keeps case, so its second spelling is a trailing separator.
  const spellings = isWindows()
    ? [path.join(home, 'projects', 'pilot').replaceAll('\\', '/'), path.join(home.toLowerCase(), 'Projects', 'pilot')]
    : [path.join(home, 'Projects', 'pilot'), `${path.join(home, 'Projects', '.', 'pilot')}/`];

  const { stored } = toStored({ version: 3, items: spellings.map((repo) => ({ repo })) }, roots);

  assert.deepEqual([...new Set(stored.items.map((item) => item.repo))], ['@home/Projects/pilot']);
});
