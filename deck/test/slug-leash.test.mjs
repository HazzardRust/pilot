/**
 * The slug read's leash (two-devices §8, F5): with origin a listener that accepts and never answers, the default git
 * of `pilot doctor slug` and of `pilot start` gives up within its bound, reads `cannot tell`, and start still opens.
 * The Host is a stub (null, `none`) and `openPilot` a recorder; only git runs, against a loopback port.
 */

// The fixture seam imports fake-home.mjs first and gives every git below its identity.
import { gitFixture } from '../../scripts/test/lib/git-fixture.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import net from 'node:net';

import { run } from '../../bin/pilot.mjs';
import { main as doctor } from '../doctor.mjs';

const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

/** A repository whose origin is a loopback listener that never answers; the listener closes after the test. */
async function silentOrigin(t) {
  const sockets = [];
  const server = net.createServer((socket) => sockets.push(socket));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => {
    for (const socket of sockets) socket.destroy();
    server.close();
  });
  // A key per test: a timed-out git's helper may still hold the last test's directory open on Windows.
  const work = gitFixture(t, `slug-leash:${t.name}`, (dir) => (git(dir, 'init', '-q'), dir));
  git(work, 'remote', 'add', 'origin', `http://127.0.0.1:${server.address().port}/r.git`);
  return work;
}

test('pilot doctor slug against a silent origin cannot tell, within the bound', { timeout: 30000 }, async (t) => {
  const work = await silentOrigin(t);
  const lines = [];
  const started = Date.now();

  const code = await doctor({ cwd: work, args: ['slug', 'x'], deps: { hostFor: () => null }, log: (line) => lines.push(line) });

  assert.equal(code, 1);
  assert.match(lines.join('\n'), /^cannot tell x: /m);
  assert.ok(Date.now() - started < 15000, `answered in ${Date.now() - started} ms`);
});

test('pilot start against a silent origin warns cannot tell and still opens', { timeout: 30000 }, async (t) => {
  const work = await silentOrigin(t);
  let stderr = '';
  t.mock.method(process, 'cwd', () => work);
  t.mock.method(process.stderr, 'write', (chunk) => {
    stderr += chunk;
    return true;
  });
  t.mock.method(console, 'log', () => {});
  const opened = [];
  const openPilot = (cwd) => {
    opened.push(cwd);
    return { on() {} };
  };
  const view = { open: [{ id: 'itm_1', title: 't', state: 'red', body: 'docs/design/x/brief.md' }], records: [] };
  const before = process.exitCode;
  try {
    await run(['start'], { platform: 'win32', reach: { level: 'nothing', chosen: true }, readView: async () => view, hostFor: () => null, openPilot });
  } finally {
    process.exitCode = before;
    t.mock.restoreAll();
  }

  assert.match(stderr, /^cannot tell {2}slugs: /m);
  assert.deepEqual(opened, [work], 'the window still opens, once');
});
