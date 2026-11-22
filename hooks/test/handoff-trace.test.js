#!/usr/bin/env node
/**
 * Slice S4 of crew-handoff-trace: the pilot's own hand-off leaves one trace row per step (spec 1).
 *
 * The whole chain runs against a real deck on a port the system hands out, with a store of the test's
 * own (`deckOnAPort`, so the trace file is that store's) and a scratch home for the claims and
 * `wrapper.log`: `pilot handoff` posts, the SessionStart lane hands it over, and the look clears and
 * submits. Only the trace file and `wrapper.log` are read back, so moving a writer keeps these green.
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const lane = require('../session-handoff.js');
const { traceFile } = require('../lib/wrapper-log.js');

/** A home and a working directory of this test's own, a real deck answering on PILOT_DECK_PORT. */
async function scratch(t) {
  await import('../../deck/test/no-open.mjs');
  const { deckOnAPort } = await import('../../deck/testUtils.mjs');
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'pilot-handoff-trace-'));
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'pilot-handoff-trace-repo-'));
  const before = { HOME: process.env.HOME, USERPROFILE: process.env.USERPROFILE, PILOT_DECK_PORT: process.env.PILOT_DECK_PORT };
  process.env.HOME = home;
  process.env.USERPROFILE = home;
  t.after(function () {
    for (const name of Object.keys(before)) {
      if (before[name] === undefined) delete process.env[name];
      else process.env[name] = before[name];
    }
    fs.rmSync(home, { recursive: true, force: true });
    fs.rmSync(repo, { recursive: true, force: true });
  });
  const origin = await deckOnAPort(t);
  process.env.PILOT_DECK_PORT = new URL(origin).port;
  // A run with a record and no worktree, so `pilot handoff` commits nothing and posts.
  const { registerRun } = await import('../../deck/store.mjs');
  const { callTool } = await import('../../deck/server.mjs');
  const run = registerRun({ repo: repo, pid: process.pid });
  callTool('deck_status', { run: run.id, slug: 'trace', next: 'resume the trace run', slices: [{ slice: 'S1 one', state: 'doing' }] });
  return { home: home, repo: repo };
}

/** `pilot handoff` from `repo`, answering the posted id. */
async function postHandoff(repo) {
  const { handoff } = await import('../../scripts/handoff.mjs');
  const result = await handoff({ cwd: repo, env: {}, version: '2.1.0' });
  assert.strictEqual(result.ok, true, result.line);
  return /\bitm_[0-9a-f]+\b/.exec(result.line)[0];
}

function rows() {
  try {
    return fs.readFileSync(traceFile(), 'utf8').split('\n').filter(Boolean).map(function (line) { return JSON.parse(line); });
  } catch (err) {
    return [];
  }
}

function logLines(home) {
  try {
    return fs.readFileSync(path.join(home, '.claude', 'pilot', 'wrapper.log'), 'utf8').split('\n').filter(Boolean);
  } catch (err) {
    return [];
  }
}

/** The fresh session's start, then the look's `cleared` in the session that cleared. */
async function clearAndPickUp(repo, id) {
  await lane.run({ cwd: repo, session_id: 'sess-new', source: 'clear' });
  const { look } = await import('../../deck/run-look.mjs');
  return look('cleared', { repo: repo, id: id }, { ppid: 4242, settleMs: 0 });
}

test('a pilot hand-off is posted, handed, cleared and submitted', async function (t) {
  const { repo } = await scratch(t);
  const id = await postHandoff(repo);
  const outcome = await clearAndPickUp(repo, id);
  assert.strictEqual(outcome.act, 'submit');
  const mine = rows().filter(function (row) { return row.item === id; });
  assert.deepStrictEqual(mine.map(function (row) { return row.step; }), ['posted', 'handed', 'cleared', 'submitted']);
  for (const row of mine) assert.strictEqual(row.kind, 'handoff');
  assert.strictEqual(mine[1].session, 'sess-new', 'handed names the session it was handed to');
});

test('a claimed hand-off writes no second handed', async function (t) {
  const { repo } = await scratch(t);
  const id = await postHandoff(repo);
  await lane.run({ cwd: repo, session_id: 'sess-new', source: 'clear' });
  await lane.run({ cwd: repo, session_id: 'sess-again', source: 'clear' });
  const handed = rows().filter(function (row) { return row.item === id && row.step === 'handed'; });
  assert.strictEqual(handed.length, 1);
  assert.strictEqual(handed[0].session, 'sess-new');
});

test('the wrapper log is unchanged', async function (t) {
  const { home, repo } = await scratch(t);
  const id = await postHandoff(repo);
  await clearAndPickUp(repo, id);
  const lines = logLines(home).map(function (line) { return line.slice(line.indexOf(' ') + 1); });
  for (const expected of ['lane: handed ' + id, 'mod: cleared ' + id, 'mod: submitted ' + id]) {
    assert.strictEqual(lines.filter(function (line) { return line === expected; }).length, 1, expected);
  }
});
