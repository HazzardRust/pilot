#!/usr/bin/env node
/**
 * handoff-prompt S2 (spec 4): the session `pilot run` started stamps each of its
 * own tool calls, so the wrapper can tell a session at work from one at rest.
 *
 * The stamp is written by the hooks (`markToolRan`, `post-tool.js`) and read by
 * the wrapper (`lastToolRan` in `deck/run-claim.mjs`); every test here goes
 * through both halves, so the spelling is checked from each side. The wrapper
 * keys on its own pid, so `PILOT_RUN_PID` is this process's. Every home is a
 * scratch directory, and the hook process is pointed at a closed port, so no
 * test reaches the live deck.
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const deck = require('../lib/deck.js');

const HOOK = path.join(__dirname, '..', 'post-tool.js');
const claim = function () { return import('../../deck/run-claim.mjs'); };

function scratchHome(t) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'pilot-tool-ran-'));
  const before = { HOME: process.env.HOME, USERPROFILE: process.env.USERPROFILE };
  process.env.HOME = home;
  process.env.USERPROFILE = home;
  t.after(function () {
    for (const name of Object.keys(before)) {
      if (before[name] === undefined) delete process.env[name];
      else process.env[name] = before[name];
    }
    fs.rmSync(home, { recursive: true, force: true });
  });
  return home;
}

/** The env `pilot run` gives its session, for a run in `repo`. */
const runEnv = function (repo) {
  return { PILOT_RUN_PID: String(process.pid), PILOT_RUN_REPO: repo, CLAUDE_PROJECT_DIR: '' };
};

/** The real hook process, fed one PostToolUse payload. */
function postTool(home, repo, payload) {
  const env = Object.assign({}, process.env, runEnv(repo), {
    HOME: home,
    USERPROFILE: home,
    PILOT_DECK_PORT: '1', // closed: the hook's lanes find no deck
    NODE_TEST_CONTEXT: '',
  });
  const run = spawnSync(process.execPath, [HOOK], { input: JSON.stringify(payload), env: env, encoding: 'utf8', timeout: 20000 });
  assert.equal(run.status, 0, 'the hook exits cleanly: ' + run.stderr);
}

test('a main-session tool call stamps tool-ran', async function (t) {
  const home = scratchHome(t);
  const { lastToolRan } = await claim();
  const before = Date.now();
  deck.markToolRan(runEnv(home), home);
  assert.ok(lastToolRan() >= before, 'the call is stamped with when');
});

test('a subagent\'s tool call stamps nothing', async function (t) {
  const home = scratchHome(t);
  const { lastToolRan } = await claim();
  const call = { hook_event_name: 'PostToolUse', session_id: 's2-session', cwd: home, tool_name: 'Bash' };

  postTool(home, home, Object.assign({ agent_id: 'a-subagent' }, call));
  assert.equal(lastToolRan(), 0, 'a subagent shares the run\'s env but is not the session at work');

  const before = Date.now();
  postTool(home, home, call);
  assert.ok(lastToolRan() >= before, 'the same call from the main session is stamped by the real hook');
});

test('outside the run\'s directory nothing is stamped', async function (t) {
  const home = scratchHome(t);
  const { lastToolRan } = await claim();
  deck.markToolRan(runEnv(home), path.join(home, 'elsewhere'));
  deck.markToolRan({ PILOT_RUN_PID: '', PILOT_RUN_REPO: home }, home);
  assert.equal(lastToolRan(), 0, 'a session elsewhere, or not under `pilot run`, is not the wrapper\'s');
});

test('the turn-ended stamp is unchanged', async function (t) {
  const home = scratchHome(t);
  const { lastTurnEnded, lastToolRan } = await claim();
  const before = Date.now();
  deck.markTurnEnded(runEnv(home), home);
  assert.ok(lastTurnEnded() >= before, 'the wrapper reads the turn-ended stamp as before');
  assert.ok(fs.existsSync(path.join(home, '.claude', 'pilot-inbox', 'claims', 'turn-ended-' + process.pid + '.stamp')));
  assert.equal(lastToolRan(), 0, 'a turn ending is not a tool call');
});
