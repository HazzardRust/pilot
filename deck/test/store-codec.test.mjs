/**
 * The store codec's pins (portable-store S1, L2, L3): a path round-trips through its root, spellings of one
 * directory collapse to one stored path, and a stored path that climbs out of its root is refused.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { isWindows } from '../../hooks/lib/platform.js';
import { decodePath, defaultRoots, encodePath, toStored } from '../store-codec.mjs';

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
  assert.throws(() => decodePath('@elsewhere/x', posix), /does not have/);
  assert.throws(() => decodePath('C:\\Users\\a\\x', win), /not a stored path/);
  assert.equal(encodePath('relative/dir', win), 'relative/dir', 'what is not absolute is not a path to store');
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

  const stored = toStored({ version: 3, items: spellings.map((repo) => ({ repo })) }, roots);

  assert.deepEqual([...new Set(stored.items.map((item) => item.repo))], ['@home/Projects/pilot']);
});
