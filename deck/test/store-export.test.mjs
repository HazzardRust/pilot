/**
 * `pilot store export` (portable-store S4; spec 9, A2): the export lists work that is on no remote, an open run's
 * worktree with a commit its upstream lacks, and still writes the bundle and exits 0. The run and its record are
 * written by the deck's own writers; the repository is a real one with a real bare remote.
 */

import './no-open.mjs';

import { gitFixture } from '../../scripts/test/lib/git-fixture.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

import { registerRun, setSlices } from '../store.mjs';
import { exportStore } from '../store-move.mjs';
import { tempDeck } from '../testUtils.mjs';

const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] }).trim();

/** A repository pushed to a bare remote, and a run worktree on a pushed branch with one commit more. */
function aRepo(t) {
  return gitFixture(t, 'store-export', (root) => {
    const remote = path.join(root, 'remote.git');
    git(root, 'init', '-q', '--bare', '-b', 'main', remote);
    const repo = path.join(root, 'work');
    git(root, 'clone', '-q', remote, repo);
    git(repo, 'commit', '-q', '--allow-empty', '-m', 'root');
    git(repo, 'push', '-q', '-u', 'origin', 'HEAD:main');
    const worktree = path.join(root, 'work-s1');
    git(repo, 'worktree', 'add', '-q', '-b', 'slice/x-s1', worktree);
    git(worktree, 'push', '-q', '-u', 'origin', 'slice/x-s1');
    git(worktree, 'commit', '-q', '--allow-empty', '-m', 'not pushed');
    return { repo, worktree };
  });
}

test('unpushed work is listed and the bundle still written', (t) => {
  const dir = tempDeck(t);
  const { repo, worktree } = aRepo(t);
  setSlices(registerRun({ repo, pid: process.pid, session: 'a-session' }).id, [], undefined, { slug: 'x', worktree });
  const file = path.join(path.dirname(repo), 'moved.pilotstore');
  const said = [];

  const code = exportStore([file], { now: () => new Date('2026-11-28T10:00:00.000Z'), host: 'source-host', out: (line) => said.push(line), err: (line) => said.push(line) });

  assert.equal(code, 0, said.join('\n'));
  const listed = said.filter((line) => line.startsWith('not on a remote: '));
  assert.equal(listed.length, 1, said.join('\n'));
  assert.ok(listed[0].includes(worktree) && /\b1 commit\(s\) on no remote/.test(listed[0]), listed[0]);
  assert.ok(said.includes('work not on a remote: 1'), said.join('\n'));
  assert.equal(JSON.parse(zlib.gunzipSync(fs.readFileSync(file))).manifest.host, 'source-host', 'the bundle is written');
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dir, 'exported.json'), 'utf8')), { at: '2026-11-28T10:00:00.000Z', file });
});

test('a bad argument writes nothing and exits 1', (t) => {
  const dir = tempDeck(t);
  const said = [];
  assert.equal(exportStore(['--zip'], { out: (line) => said.push(line), err: (line) => said.push(line) }), 1);
  assert.equal(said.length, 1, said.join('\n'));
  assert.equal(fs.existsSync(path.join(dir, 'exported.json')), false);
});

test('a bundle aimed into the store directory is refused, the store unchanged', (t) => {
  const dir = tempDeck(t);
  registerRun({ repo: path.join(dir, 'repo'), pid: process.pid, session: 'a-session' });
  const before = fs.readFileSync(path.join(dir, 'machine.json'));
  const said = [];
  assert.equal(exportStore([path.join(dir, 'machine.json')], { out: (line) => said.push(line), err: (line) => said.push(line) }), 1);
  assert.deepEqual(fs.readFileSync(path.join(dir, 'machine.json')), before);
  assert.equal(fs.existsSync(path.join(dir, 'exported.json')), false);
});

test('a bundle that cannot be written exits 1 and marks nothing', (t) => {
  const dir = tempDeck(t);
  registerRun({ repo: path.join(dir, 'repo'), pid: process.pid, session: 'a-session' });
  const said = [];
  const missing = path.join(path.dirname(dir), `${path.basename(dir)}-absent`, 'moved.pilotstore');
  assert.equal(exportStore([missing], { out: (line) => said.push(line), err: (line) => said.push(line) }), 1);
  assert.equal(fs.existsSync(missing), false);
  assert.equal(fs.existsSync(path.join(dir, 'exported.json')), false);
});
