/**
 * An imported store waits on nothing from the old machine (portable-store S6; spec 8, 11; A3): a landing the source
 * left running or queued reads interrupted, naming the source host, and a landed one is left as it is; each open
 * run's worktree missing here gets one printed rebuild line. Every fixture is written by the deck's own writers.
 */

import './no-open.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { KIND_GATE2 } from '../items.mjs';
import { markGone, rebuildLines } from '../store-gone.mjs';
import { queueLanding } from '../store-items.mjs';
import { beginLanding, postItem, registerRun, setSlices, settleLanding } from '../store.mjs';
import { storedDeck, tempDeck, withTicket } from '../testUtils.mjs';

const AT = '2026-11-28T10:00:00.000Z';

function aDir(t, name) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `pilot-gone-${name}-`));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

const aGate2 = (repo) => postItem({ kind: KIND_GATE2, title: 'Gate 2', body: 'Walk it.', repo, ...withTicket({ pr: '#250', sha: '0305827' }, repo, 'yellow') });

test('a running landing reads interrupted', (t) => {
  tempDeck(t);
  const repo = aDir(t, 'repo');
  const running = aGate2(repo);
  const queued = aGate2(repo);
  const landed = aGate2(repo);
  beginLanding(running.id, { worktree: repo });
  queueLanding(queued.id, running.id);
  beginLanding(landed.id, { worktree: repo });
  settleLanding(landed.id, { ok: true, sha: '1a2b3c4d', line: 'landed feat/x on pilot at 1a2b3c4' });
  const before = storedDeck();
  const landedBefore = structuredClone(before.items.find((item) => item.id === landed.id));

  const after = markGone(before, 'old-laptop', AT);
  const of = (id) => after.items.find((item) => item.id === id);

  for (const id of [running.id, queued.id]) {
    assert.equal(of(id).landing.state, 'interrupted', id);
    assert.match(of(id).landing.line, /interrupted on old-laptop/);
    assert.equal(of(id).landing.pid, undefined);
  }
  assert.deepEqual(of(landed.id), landedBefore, 'a landed landing is unchanged');
});

test('a missing worktree gets one rebuild line', (t) => {
  tempDeck(t);
  const here = aDir(t, 'here');
  const gone = path.join(os.tmpdir(), `pilot-gone-missing-${process.pid}`);
  const present = registerRun({ repo: aDir(t, 'alpha'), pid: process.pid });
  setSlices(present.id, [], undefined, { slug: 'alpha', branch: 'feat/alpha', worktree: here });
  const missingRepo = aDir(t, 'beta');
  const missing = registerRun({ repo: missingRepo, pid: process.pid });
  setSlices(missing.id, [], undefined, { slug: 'beta', branch: 'feat/beta', worktree: gone });

  const lines = rebuildLines(storedDeck(), (file) => fs.existsSync(file));

  assert.equal(lines.length, 1, lines.join('\n'));
  assert.match(lines[0], /^git -C .+ worktree add .+ feat\/beta$/);
  assert.ok(lines[0].includes(gone), lines[0]);
});

test('no open run, or a finished one, gets no rebuild line', (t) => {
  tempDeck(t);
  const run = registerRun({ repo: aDir(t, 'gamma'), pid: process.pid });
  setSlices(run.id, [], undefined, { slug: 'gamma', branch: 'feat/gamma', worktree: path.join(os.tmpdir(), `pilot-gone-none-${process.pid}`), finished: 'landed' });
  assert.deepEqual(rebuildLines(storedDeck(), () => false), []);
  assert.deepEqual(rebuildLines({ items: [] }, () => false), []);
});
