// An audit folder is named from the stored path of its repository (portable-store spec 3, L1): the same
// name on two machines, and a folder an older deck named by the absolute path is found again.

import './no-open.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { countHandoff, directoryFor } from '../audit.mjs';
import { repoKey } from '../items.mjs';
import { storeDir } from '../store-dir.mjs';
import { tempDeck } from '../testUtils.mjs';

test('an audit folder has one name on two machines', () => {
  const onWindows = directoryFor('C:\\Users\\a\\Projects\\pilot', { home: 'C:\\Users\\a' });
  const onLinux = directoryFor('/home/b/Projects/pilot', { home: '/home/b' });
  assert.equal(onWindows, onLinux);
  assert.match(onWindows, /^[A-Za-z0-9_]+-[0-9a-f]{10}$/);
  assert.notEqual(onWindows, directoryFor('/home/b/Projects/other', { home: '/home/b' }), 'another repository, another folder');
});

test('a repository reached through a link and through its real path has one audit folder', (t) => {
  // macOS: a session's cwd is /var/folders/... while `pilot audit due` reads process.cwd(), /private/var/...
  tempDeck(t);
  const base = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'audit-dir-link-')));
  t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  const real = path.join(base, 'repo');
  fs.mkdirSync(real);
  const link = path.join(base, 'link');
  fs.symlinkSync(real, link, 'junction');

  countHandoff(link, 'itm_through_link');
  assert.equal(countHandoff(real, 'itm_through_real'), 2, 'the hand-off counted through the link is read through the real path');
  assert.equal(directoryFor(link), directoryFor(real));
});

test('a repository under a home behind a link keeps its folder name once it is made', (t) => {
  // A runner's home spelled C:\Users\RUNNER~1, or a home through a symlink: the name must not move at mkdir.
  const base = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'audit-dir-home-')));
  t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  fs.mkdirSync(path.join(base, 'target'));
  const home = path.join(base, 'home');
  fs.symlinkSync(path.join(base, 'target'), home, 'junction');
  const repo = path.join(home, 'proj');
  const before = directoryFor(repo, { home });
  fs.mkdirSync(repo);
  assert.equal(directoryFor(repo, { home }), before);
  assert.equal(before, directoryFor('/home/b/proj', { home: '/home/b' }), 'still under the home');
});

/** The name an older deck gave the folder: a hash of the folded absolute path, which that deck wrote and a bundle carried. */
const oldName = (repo) => {
  const key = repoKey(repo);
  const readable = key.replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(-60);
  return `${readable}-${crypto.createHash('sha256').update(key).digest('hex').slice(0, 10)}`;
};

test('an old audit folder is found again', (t) => {
  tempDeck(t);
  const repo = path.resolve('D:/work/alpha');
  const old = path.join(storeDir(), 'audits', oldName(repo));
  fs.mkdirSync(old, { recursive: true });
  fs.writeFileSync(path.join(old, 'record.json'), JSON.stringify({ offers: [], handoffs: ['itm_a', 'itm_b'] }), 'utf8');

  assert.equal(countHandoff(repo, 'itm_c'), 3, 'the two hand-offs of the old folder are read through the new name');
  assert.ok(fs.existsSync(path.join(storeDir(), 'audits', directoryFor(repo), 'record.json')));
  assert.equal(fs.existsSync(old), false, 'renamed, so the folder is not held twice');
});

test('an old folder beside a new one is kept, and nothing is deleted', (t) => {
  tempDeck(t);
  const repo = path.resolve('D:/work/alpha');
  const old = path.join(storeDir(), 'audits', oldName(repo));
  const fresh = path.join(storeDir(), 'audits', directoryFor(repo));
  for (const [dir, handoffs] of [[old, ['itm_old']], [fresh, ['itm_new']]]) {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'record.json'), JSON.stringify({ offers: [], handoffs }), 'utf8');
  }
  const stderr = [];
  t.mock.method(console, 'error', (line) => stderr.push(line));

  assert.equal(countHandoff(repo, 'itm_c'), 2, 'the new folder is the one read');
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(old, 'record.json'), 'utf8')).handoffs, ['itm_old'], 'the old folder is untouched');
  assert.equal(stderr.length, 1);
});
