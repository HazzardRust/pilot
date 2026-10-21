/**
 * The scratch registry over a reused pid (cheaper-crew S5): a `pilot-scratch-<pid>.json` left by a
 * dead scratch deck whose pid the new daemon now holds does not stop the start, and a file planted
 * after that is still refused. The stale file is planted at the launcher's first touch of the
 * registry path, because the daemon's pid is not known before then. Each test stops what it starts.
 */
import fs from 'node:fs';
import test, { mock } from 'node:test';
import assert from 'node:assert/strict';

import './no-open.mjs';
import { startScratch, stopScratch } from '../scratch.mjs';

const alive = (pid) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

const STALE = JSON.stringify({ pid: 1, port: 1, dir: 'stale' });
const REGISTRY = /pilot-scratch-\d+\.json$/;

/**
 * Wraps each named fs method so a call on a registry path first plants a stale registry there
 * when `plant(file)` says so; other calls pass through. Returns the entries the launcher tried to
 * write. A planted file still stale at teardown is removed, so no test leaves one in the temp dir.
 */
function plantStale(t, methods, plant) {
  const realWrite = fs.writeFileSync;
  const entries = [];
  for (const name of methods) {
    const real = fs[name];
    mock.method(fs, name, (file, ...rest) => {
      if (typeof file === 'string' && REGISTRY.test(file)) {
        if (name === 'writeFileSync') entries.push(JSON.parse(rest[0]));
        if (plant(file)) {
          realWrite(file, STALE);
          t.after(() => {
            if (fs.existsSync(file) && fs.readFileSync(file, 'utf8') === STALE) fs.rmSync(file);
          });
        }
      }
      return real(file, ...rest);
    });
  }
  t.after(() => mock.restoreAll());
  return entries;
}

test("a stale registry for the new daemon's pid does not stop the start", async (t) => {
  const touched = new Set();
  plantStale(t, ['rmSync', 'writeFileSync'], (file) => !touched.has(file) && Boolean(touched.add(file)));
  const deck = await startScratch();
  t.after(() => stopScratch(deck.pid));
  mock.restoreAll();
  assert.equal(alive(deck.pid), true);
});

test('a registry planted between the remove and the write still ends the deck and throws', async (t) => {
  const entries = plantStale(t, ['writeFileSync'], () => true);
  await assert.rejects(startScratch(), { code: 'EEXIST' });
  mock.restoreAll();
  const [entry] = entries;
  assert.equal(alive(entry.pid), false);
  assert.equal(fs.existsSync(entry.dir), false);
});
