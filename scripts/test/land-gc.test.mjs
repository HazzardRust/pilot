/**
 * A landing runs `pilot gc` once it has landed (process-gc spec 4; L11, L14): gc's lines join
 * the clear lines above `landed …`, and a gc that throws is a line, never a failed landing. The
 * gc is injected over a fake process table; nothing here reads or stops a real process.
 */

// A red run's log goes under a home of this process's own, never the real one.
import { gitFixture } from './lib/git-fixture.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

import { gc } from '../../deck/gc.mjs';
import { pilotProcesses } from '../../deck/procs.mjs';

const { main } = await import('../land.mjs');

const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const green = 'node -e "0"';
const gh = (args) => (args[0] === 'pr' && args[1] === 'list' ? '[]' : '');

/** origin.git with main, pilot and feat/x one commit ahead of pilot; `work` is on feat/x. */
function scratchRun(t) {
  return gitFixture(t, 'land-gc:scratchRun', buildScratchRun);
}

function buildScratchRun(root) {
  const origin = path.join(root, 'origin.git');
  const work = path.join(root, 'work');
  git(root, 'init', '-q', '--bare', '-b', 'main', origin);
  git(root, 'clone', '-q', origin, work);
  git(work, 'commit', '-q', '--allow-empty', '-m', 'main');
  git(work, 'push', '-q', 'origin', 'main', 'main:pilot');
  git(work, 'remote', 'set-head', 'origin', 'main');
  git(work, 'checkout', '-q', '-b', 'feat/x', 'origin/pilot');
  git(work, 'commit', '-q', '--allow-empty', '-m', 'x');
  git(work, 'push', '-q', '-u', 'origin', 'feat/x');
  return { work, inWork: (args) => git(work, ...args) };
}

function landed(t, inject) {
  let out = '';
  t.mock.method(process.stdout, 'write', (text) => {
    out += text;
    return true;
  });
  const before = process.cwd();
  try {
    return { code: main([], inject), out };
  } finally {
    t.mock.restoreAll();
    process.chdir(before);
  }
}

test("land prints gc's lines and still lands", (t) => {
  const { work, inWork } = scratchRun(t);
  const table = [
    { pid: 10, ppid: 1, name: 'node.exe', command: 'node /plugin/deck/daemon.mjs', ageS: 60 },
    { pid: 40, ppid: 1, name: 'node.exe', command: 'node /w/gone/deck/daemon.mjs --leash 41', ageS: 60 },
  ];
  const stopped = [];
  const sweep = () => gc(pilotProcesses(table, { userDeckPid: 10, exists: () => true }), { kill: (pid) => stopped.push(pid) });

  const { code, out } = landed(t, { cwd: work, git: inWork, gh, test: green, gc: sweep });

  assert.equal(code, 0, out);
  assert.deepEqual(stopped, [40]);
  assert.match(out, /^stopped 40 daemon \/w\/gone \(leash 41 gone\)\nlanded feat\/x on pilot at [0-9a-f]{7}$/m, "gc's line sits just above landed");
});

test('a gc that throws is a line and the landing still lands', (t) => {
  const { work, inWork } = scratchRun(t);
  const sweep = () => {
    throw new Error('table unreadable\nstack');
  };

  const { code, out } = landed(t, { cwd: work, git: inWork, gh, test: green, gc: sweep });

  assert.equal(code, 0, out);
  assert.match(out, /^gc failed: table unreadable\nlanded feat\/x on pilot at /m);
});
