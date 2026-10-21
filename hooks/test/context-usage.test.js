#!/usr/bin/env node
/**
 * Tests for the usage pair (statusline writer + alert reader).
 *
 * Run with: node --test claude/hooks/test/context-usage.test.js
 *
 * The alert hook resolves its paths from os.homedir() at require time, so the
 * tests spawn real child processes with HOME/USERPROFILE pointed at a scratch
 * directory. That is also the only honest way to test the duplicate-warning
 * race: it is a race between processes.
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const ALERT = path.join(__dirname, '..', 'context-usage-alert.js');
const STATUSLINE = path.join(__dirname, '..', 'context-usage-statusline.js');
const statusline = require('../context-usage-statusline.js');
const alert = require('../context-usage-alert.js');

/**
 * The deck store, which is ESM and which the statusline deliberately does not
 * import: the hook has to keep working as a bare `node <path>`, so it re-derives
 * where the deck lives and how a directory is keyed. A test is the one place the
 * two may meet — seeding the file by hand would only prove the hook agrees with
 * itself, and the number is read for a directory keyed by the store.
 */
const STORE_URL = require('node:url').pathToFileURL(
  path.join(__dirname, '..', '..', 'deck', 'store.mjs')
).href;

function makeHome() {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'ctxusage-'));
  fs.mkdirSync(path.join(home, '.claude'), { recursive: true });
  return home;
}

/** The store pointed at a scratch deck for the length of one call, and put back. */
async function withDeckDir(dir, run) {
  const previous = process.env.PILOT_DECK_DIR;
  process.env.PILOT_DECK_DIR = dir;
  try {
    return await run();
  } finally {
    if (previous === undefined) delete process.env.PILOT_DECK_DIR;
    else process.env.PILOT_DECK_DIR = previous;
  }
}

/** The scratch home's deck store: where `alerts.json` is looked for, never `~/.claude/pilot`. */
function deckDirOf(home) {
  return path.join(home, '.claude', 'pilot');
}

function seedAlerts(home, text) {
  fs.mkdirSync(deckDirOf(home), { recursive: true });
  fs.writeFileSync(path.join(deckDirOf(home), 'alerts.json'), text, 'utf8');
}

function seedState(home, state) {
  fs.writeFileSync(
    path.join(home, '.claude', 'context-usage-state.json'),
    JSON.stringify(state),
    'utf8'
  );
}

// Spawns the alert hook the way the harness does. sessionId defaults to a
// fixed value so the existing tests all speak as one session, which is what
// they were written to assert. agentId defaults to undefined, i.e. a
// main-thread call rather than a subagent's.
function runAlert(home, sessionId, agentId) {
  return new Promise(function (resolve, reject) {
    const child = spawn(process.execPath, [ALERT], {
      env: Object.assign({}, process.env, { HOME: home, USERPROFILE: home, PILOT_DECK_DIR: deckDirOf(home) }),
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let out = '';
    let err = '';
    child.stdout.on('data', function (c) { out += c; });
    child.stderr.on('data', function (c) { err += c; });
    child.on('error', reject);
    child.on('close', function (code) {
      resolve({ out: out.trim(), err: err.trim(), code: code });
    });
    const payload = {
      hook_event_name: 'PostToolUse',
      session_id: sessionId === undefined ? 'session-a' : sessionId,
      tool_name: 'Read',
      tool_input: {},
      tool_response: {},
    };
    if (agentId !== undefined) payload.agent_id = agentId;
    child.stdin.end(JSON.stringify(payload));
  });
}

// Same spawn, but for the SessionStart event: a fresh session's very first
// hook call, before it has made any tool call at all. source defaults to
// 'startup'; the hook does not read it, but real payloads always carry one.
function runSessionStart(home, sessionId, source) {
  return new Promise(function (resolve, reject) {
    const child = spawn(process.execPath, [ALERT], {
      env: Object.assign({}, process.env, { HOME: home, USERPROFILE: home, PILOT_DECK_DIR: deckDirOf(home) }),
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let out = '';
    let err = '';
    child.stdout.on('data', function (c) { out += c; });
    child.stderr.on('data', function (c) { err += c; });
    child.on('error', reject);
    child.on('close', function (code) {
      resolve({ out: out.trim(), err: err.trim(), code: code });
    });
    child.stdin.end(JSON.stringify({
      hook_event_name: 'SessionStart',
      session_id: sessionId === undefined ? 'session-a' : sessionId,
      source: source === undefined ? 'startup' : source,
    }));
  });
}

test('a high session limit warns, and says so in both channels', async function () {
  const home = makeHome();
  seedState(home, { ctx: 20, session: { pct: 91.4, resetsAt: null }, weekly: null });

  const r = await runAlert(home);
  assert.strictEqual(r.code, 0);
  assert.strictEqual(r.err, '');

  const payload = JSON.parse(r.out);
  assert.match(payload.systemMessage, /Session/);
  assert.match(payload.systemMessage, /91%/);
  // additionalContext is what actually reaches the agent mid-ticket, which is the
  // whole point: it needs to wrap up rather than be cut off.
  assert.match(payload.hookSpecificOutput.additionalContext, /wrap|Wrap/);
  assert.strictEqual(payload.hookSpecificOutput.hookEventName, 'PostToolUse');
});

test('context usage alone never warns, however high it climbs', async function () {
  const home = makeHome();
  // Filling the context window means "compact", which the harness does itself.
  seedState(home, { ctx: 99, session: { pct: 12, resetsAt: null }, weekly: { pct: 30, resetsAt: null } });
  assert.strictEqual((await runAlert(home)).out, '');
});

test('a crossing is announced once, not once per parallel tool call', async function () {
  // The hook has no matcher, so a turn issuing eight tool calls spawns eight of
  // these at the same instant. Repeated because a race passes by luck once.
  const counts = [];
  for (let trial = 0; trial < 10; trial++) {
    const home = makeHome();
    seedState(home, { ctx: 20, session: { pct: 92, resetsAt: 1757000000 + trial }, weekly: null });

    const results = await Promise.all([
      runAlert(home), runAlert(home), runAlert(home), runAlert(home),
      runAlert(home), runAlert(home), runAlert(home), runAlert(home),
    ]);
    counts.push(results.filter(function (r) { return r.out.length > 0; }).length);
  }
  assert.deepStrictEqual(
    counts.filter(function (n) { return n !== 1; }), [],
    'each trial must announce exactly once; got ' + counts.join(',')
  );
});

test('a crossing already announced stays quiet afterwards', async function () {
  const home = makeHome();
  seedState(home, { ctx: 20, session: { pct: 92, resetsAt: 1757000000 }, weekly: null });

  assert.notStrictEqual((await runAlert(home)).out, '');
  assert.strictEqual((await runAlert(home)).out, '', 'repeating it is just noise');
  assert.strictEqual((await runAlert(home)).out, '');
});

test('the window resetting lets the next crossing warn again', async function () {
  const home = makeHome();
  seedState(home, { ctx: 20, session: { pct: 92, resetsAt: 1757000000 }, weekly: null });
  assert.notStrictEqual((await runAlert(home)).out, '');

  // A new window is a new resets_at, which is the whole re-arm mechanism.
  seedState(home, { ctx: 20, session: { pct: 91, resetsAt: 1757018000 }, weekly: null });
  assert.notStrictEqual((await runAlert(home)).out, '', 'a new window must be able to warn');
});

test('passing 95 warns once, without a 90 trailer behind it', async function () {
  const home = makeHome();
  seedState(home, { ctx: 20, session: { pct: 96.2, resetsAt: 1757000000 }, weekly: null });

  const first = await runAlert(home);
  assert.match(JSON.parse(first.out).systemMessage, /96%/);
  assert.match(JSON.parse(first.out).hookSpecificOutput.additionalContext, /Wrap up now/);
  assert.strictEqual((await runAlert(home)).out, '', '90 must not follow 95 for one crossing');
});

test('climbing from 90 to 95 in one window warns again, exactly once', async function () {
  // The only path that takes two claims: the 90 claim is already held from the
  // earlier warning, so winning 95 has to depend on the 95 claim alone.
  for (let trial = 0; trial < 5; trial++) {
    const home = makeHome();
    const resetsAt = 1757000000 + trial;
    seedState(home, { ctx: 20, session: { pct: 91, resetsAt: resetsAt }, weekly: null });
    assert.match(JSON.parse((await runAlert(home)).out).systemMessage, /91%/);

    seedState(home, { ctx: 20, session: { pct: 96, resetsAt: resetsAt }, weekly: null });
    const results = await Promise.all([
      runAlert(home), runAlert(home), runAlert(home), runAlert(home),
      runAlert(home), runAlert(home), runAlert(home), runAlert(home),
    ]);
    const announced = results.filter(function (r) { return r.out.length > 0; });
    assert.strictEqual(announced.length, 1, 'trial ' + trial + ' announced ' + announced.length);
    assert.match(JSON.parse(announced[0].out).systemMessage, /96%/);
  }
});

test('both limits crossing at once produce one message naming both', async function () {
  const home = makeHome();
  seedState(home, {
    ctx: 20,
    session: { pct: 91, resetsAt: 1757000000 },
    weekly: { pct: 96, resetsAt: 1757400000 },
  });

  const msg = JSON.parse((await runAlert(home)).out).systemMessage;
  assert.match(msg, /Session/);
  assert.match(msg, /Weekly/);
  assert.strictEqual((await runAlert(home)).out, '');
});

test('the tracks are independent of one another', async function () {
  const home = makeHome();
  seedState(home, {
    ctx: 20,
    session: { pct: 91, resetsAt: 1757000000 },
    weekly: { pct: 96, resetsAt: 1757400000 },
  });
  assert.notStrictEqual((await runAlert(home)).out, '');

  // The session window rolled over; the weekly one did not, and its warning has
  // already been given.
  seedState(home, {
    ctx: 20,
    session: { pct: 91, resetsAt: 1757018000 },
    weekly: { pct: 96, resetsAt: 1757400000 },
  });
  const msg = JSON.parse((await runAlert(home)).out).systemMessage;
  assert.match(msg, /Session/);
  assert.doesNotMatch(msg, /Weekly/);
});

test('weekly 92 alerts nothing, 95 alerts', async function () {
  const quiet = makeHome();
  seedState(quiet, { ctx: 20, session: null, weekly: { pct: 92, resetsAt: 1757400000 } });
  assert.strictEqual((await runAlert(quiet)).out, '', 'the weekly track has no 90 band');

  const loud = makeHome();
  seedState(loud, { ctx: 20, session: null, weekly: { pct: 95, resetsAt: 1757400000 } });
  assert.match(JSON.parse((await runAlert(loud)).out).systemMessage, /Weekly usage is at 95%/);
  assert.strictEqual(alert.band(92, 'weekly'), 0);
  assert.strictEqual(alert.band(95, 'weekly'), 95);
});

test('session 90 still alerts', async function () {
  const home = makeHome();
  seedState(home, { ctx: 20, session: { pct: 90, resetsAt: 1757000000 }, weekly: null });
  assert.match(JSON.parse((await runAlert(home)).out).systemMessage, /Session usage \(5h\) is at 90%/);
  assert.strictEqual(alert.band(90, 'session'), 90);
  assert.strictEqual(alert.band(95, 'session'), 95);
});

test('weekly off in alerts.json: 96 alerts nothing; the session track is unaffected', async function () {
  const home = makeHome();
  seedAlerts(home, JSON.stringify({ weekly: false }));
  seedState(home, { ctx: 20, session: null, weekly: { pct: 96, resetsAt: 1757400000 } });
  assert.strictEqual((await runAlert(home)).out, '', 'switched off, the weekly track is silent');

  seedState(home, {
    ctx: 20,
    session: { pct: 91, resetsAt: 1757000000 },
    weekly: { pct: 96, resetsAt: 1757400000 },
  });
  const msg = JSON.parse((await runAlert(home)).out).systemMessage;
  assert.match(msg, /Session/);
  assert.doesNotMatch(msg, /Weekly/);
});

test('the switch written by the deck is the one the hook reads: weekly off, 96 is silent', async function () {
  const home = makeHome();
  const { setAlertSwitch } = await import(
    require('node:url').pathToFileURL(path.join(__dirname, '..', '..', 'deck', 'alert-switch.mjs')).href
  );
  await withDeckDir(deckDirOf(home), function () {
    setAlertSwitch({ weekly: false });
  });
  seedState(home, { ctx: 20, session: null, weekly: { pct: 96, resetsAt: 1757400000 } });
  assert.strictEqual((await runAlert(home)).out, '');
});

test('an absent or corrupt alerts.json means on', async function () {
  const absent = makeHome();
  seedState(absent, { ctx: 20, session: null, weekly: { pct: 96, resetsAt: 1757400000 } });
  assert.match(JSON.parse((await runAlert(absent)).out).systemMessage, /Weekly/);

  for (const text of ['{ not json', JSON.stringify({ weekly: 'off' }), 'null']) {
    const corrupt = makeHome();
    seedAlerts(corrupt, text);
    seedState(corrupt, { ctx: 20, session: null, weekly: { pct: 96, resetsAt: 1757400000 } });
    const r = await runAlert(corrupt);
    assert.strictEqual(r.code, 0);
    assert.match(JSON.parse(r.out).systemMessage, /Weekly/, 'unreadable ' + text + ' reads as on');
  }
});

test('a missing, unreadable, or limitless state file is silent, not fatal', async function () {
  const empty = makeHome();
  assert.strictEqual((await runAlert(empty)).out, '');
  assert.strictEqual((await runAlert(empty)).code, 0);

  const corrupt = makeHome();
  fs.writeFileSync(path.join(corrupt, '.claude', 'context-usage-state.json'), '{ not json', 'utf8');
  const r = await runAlert(corrupt);
  assert.strictEqual(r.out, '');
  assert.strictEqual(r.code, 0, 'a corrupt state file must never break a tool call');

  // What an older statusline, or a session with no rate_limits block, leaves.
  const ctxOnly = makeHome();
  seedState(ctxOnly, { ctx: 97, session: null, weekly: null });
  assert.strictEqual((await runAlert(ctxOnly)).out, '');
});

test('a warning the harness never received is not marked as delivered', async function () {
  const home = makeHome();
  seedState(home, { ctx: 20, session: { pct: 91, resetsAt: 1757000000 }, weekly: null });

  // The reader goes away mid-write. Losing the warning entirely is the one
  // failure that matters here, so the claim has to come back.
  const exit = await new Promise(function (resolve, reject) {
    const child = spawn(process.execPath, [ALERT], {
      env: Object.assign({}, process.env, { HOME: home, USERPROFILE: home, PILOT_DECK_DIR: deckDirOf(home) }),
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let err = '';
    child.stderr.on('data', function (c) { err += c; });
    child.on('error', reject);
    child.on('close', function (code) { resolve({ code: code, err: err.trim() }); });
    child.stdout.destroy();
    child.stdin.end('{"hook_event_name":"PostToolUse","tool_name":"Read"}');
  });
  assert.strictEqual(exit.code, 0, 'a dropped reader must not make the hook fail');
  assert.strictEqual(exit.err, '');

  assert.notStrictEqual((await runAlert(home)).out, '', 'the next tool call must still warn');
});

test('each concurrent subagent under one session gets its own warning', async function () {
  // Orchestration routinely runs several subagents at once under one
  // top-level session_id. Each subagent's tool call carries a distinct
  // agent_id; the main thread's calls carry none. Every one of them is
  // spending the same account-wide budget and needs to be told once, not
  // just whichever agent's tool call happens to land first.
  const home = makeHome();
  seedState(home, { ctx: 20, session: { pct: 92, resetsAt: 1757000000 }, weekly: null });

  const results = await Promise.all([
    runAlert(home, 'session-a', 'agent-1'),
    runAlert(home, 'session-a', 'agent-2'),
    runAlert(home, 'session-a', 'agent-3'),
    runAlert(home, 'session-a'), // the main thread, no agent_id
  ]);
  assert.strictEqual(
    results.filter(function (r) { return r.out.length > 0; }).length,
    4,
    'every concurrent agent under the session must be warned once'
  );

  // Once warned, that same agent stays quiet on the next call for the same
  // crossing, exactly like the single-agent case.
  const repeat = await runAlert(home, 'session-a', 'agent-1');
  assert.strictEqual(repeat.out, '');
});

test('a brand-new session is warned at SessionStart, before any tool call', async function () {
  // The whole point: a resumed session still carries an earlier warning in
  // its own transcript, but a genuinely fresh session has no memory of one.
  // Without a SessionStart check it would run blind until its first tool
  // call landed on PostToolUse.
  const home = makeHome();
  seedState(home, { ctx: 20, session: { pct: 93, resetsAt: 1757000000 }, weekly: null });

  const r = await runSessionStart(home);
  assert.strictEqual(r.code, 0);
  const payload = JSON.parse(r.out);
  assert.match(payload.systemMessage, /93%/);
  assert.strictEqual(payload.hookSpecificOutput.hookEventName, 'SessionStart');
});

test('SessionStart and PostToolUse share one claim, so the crossing is announced only once per session', async function () {
  const home = makeHome();
  seedState(home, { ctx: 20, session: { pct: 93, resetsAt: 1757000000 }, weekly: null });

  assert.notStrictEqual((await runSessionStart(home, 'session-a')).out, '');
  // The same session's first tool call finds the crossing already claimed at
  // startup and says nothing further about it.
  assert.strictEqual((await runAlert(home, 'session-a')).out, '');

  // The reverse also holds: a crossing already announced via a tool call
  // does not get repeated when SessionStart is checked again (e.g. after a
  // compaction, which also fires SessionStart on the same session).
  const other = makeHome();
  seedState(other, { ctx: 20, session: { pct: 93, resetsAt: 1757000001 }, weekly: null });
  assert.notStrictEqual((await runAlert(other, 'session-b')).out, '');
  assert.strictEqual((await runSessionStart(other, 'session-b')).out, '');
});

test('a resumed session with a crossing it has not seen yet still gets warned', async function () {
  // SessionStart fires with source 'resume' too. The hook does not special
  // case it: whether this exact session has already claimed this exact
  // crossing is what decides, not how the session began.
  const home = makeHome();
  seedState(home, { ctx: 20, session: { pct: 96, resetsAt: 1757000000 }, weekly: null });
  const r = await runSessionStart(home, 'session-a', 'resume');
  assert.match(JSON.parse(r.out).systemMessage, /96%/);
});

// ---------------------------------------------------------------------------
// The statusline
// ---------------------------------------------------------------------------

test('plan limits are read from the rate_limits block', function () {
  // Shape per the Claude Code binary; resets_at is unix epoch SECONDS.
  const limits = statusline.readLimits({
    rate_limits: {
      five_hour: { used_percentage: 42.5, resets_at: 1757000000 },
      seven_day: { used_percentage: 91.2, resets_at: 1757400000 },
    },
  });
  assert.deepStrictEqual(limits.session, { pct: 42.5, resetsAt: 1757000000 });
  assert.deepStrictEqual(limits.weekly, { pct: 91.2, resetsAt: 1757400000 });

  // The block is absent on some auth modes and before the first API response.
  const none = statusline.readLimits({ context_window: { used_percentage: 50 } });
  assert.strictEqual(none.session, null);
  assert.strictEqual(none.weekly, null);
});

// Spawns the status line the way settings.json does: a bare node process with
// the payload on stdin. `raw` is written as bytes, so a test can put in front
// of it exactly what a shell would.
function runStatusline(home, raw) {
  return new Promise(function (resolve, reject) {
    const child = spawn(process.execPath, [STATUSLINE], {
      env: Object.assign({}, process.env, {
        HOME: home,
        USERPROFILE: home,
        PILOT_DECK_DIR: path.join(home, '.claude', 'pilot'),
      }),
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let out = '';
    let err = '';
    child.stdout.on('data', function (c) { out += c; });
    child.stderr.on('data', function (c) { err += c; });
    child.on('error', reject);
    child.on('close', function (code) {
      resolve({ out: out.trim(), err: err.trim(), code: code });
    });
    child.stdin.end(raw);
  });
}

const SAMPLE_PAYLOAD = {
  model: { display_name: 'Opus 5' },
  workspace: { current_dir: 'C:/somewhere/repo' },
  context_window: { total_input_tokens: 40_000, context_window_size: 200_000 },
  rate_limits: {
    five_hour: { used_percentage: 51, resets_at: 1789299600 },
    seven_day: { used_percentage: 40, resets_at: 1789779600 },
  },
};

test('a payload piped in by hand, byte-order mark and all, still renders every reading', async function () {
  // Windows PowerShell puts a UTF-8 BOM in front of anything it pipes to a
  // native process, and PowerShell is the shell this package is developed and
  // installed on. The harness itself never sends one — but the slice is
  // verified by rendering the line by hand, and a render by hand goes through a
  // shell. JSON.parse throws on a leading BOM, and the catch around it turned
  // that into the bare fallback line: no ctx, no ses, no wk, and no complaint.
  // A reading silently gone is worse than a line that never appeared.
  const home = makeHome();

  const withBom = await runStatusline(home, '\uFEFF' + JSON.stringify(SAMPLE_PAYLOAD));
  assert.strictEqual(withBom.code, 0);
  assert.strictEqual(withBom.err, '');
  assert.match(withBom.out, /Opus 5 repo/, 'the model and directory survive');
  assert.match(withBom.out, /ctx 20%/);
  assert.match(withBom.out, /ses 51%/);
  assert.match(withBom.out, /wk 40%/);

  // And the same payload without one renders identically, so the strip is a
  // strip and not a reformat.
  const without = await runStatusline(home, JSON.stringify(SAMPLE_PAYLOAD));
  assert.strictEqual(without.out, withBom.out);
});

test('a payload that is not JSON at all still leaves a usable line', async function () {
  // The fallback is right when there is genuinely nothing to read; it was only
  // wrong when a readable payload was being thrown away.
  const home = makeHome();

  const r = await runStatusline(home, 'not json at all');
  assert.strictEqual(r.code, 0);
  assert.strictEqual(r.err, '');
  assert.match(r.out, /claude/, 'the line still renders rather than the status line vanishing');
});

test('the context reading is taken from the payload, or derived, or left unknown', function () {
  // The percentage the harness sends when it has one. Nothing is derived while
  // a figure is on the payload, so a harness that changes its own arithmetic
  // still wins over ours.
  assert.strictEqual(
    statusline.computePercentage({
      context_window: { used_percentage: 63.5, total_input_tokens: 1, context_window_size: 100 },
    }),
    63.5
  );

  // Older builds send the two token figures and no percentage.
  assert.strictEqual(
    statusline.computePercentage({
      context_window: { total_input_tokens: 40_000, context_window_size: 200_000 },
    }),
    20
  );

  // Unknown is null, never zero: a zero would render "ctx 0%" and read as an
  // empty context rather than as no reading at all.
  assert.strictEqual(statusline.computePercentage({}), null, 'no context_window block');
  assert.strictEqual(statusline.computePercentage(undefined), null, 'no payload at all');
  assert.strictEqual(
    statusline.computePercentage({ context_window: {} }),
    null,
    'a block with neither a percentage nor both token figures'
  );
  assert.strictEqual(
    statusline.computePercentage({ context_window: { total_input_tokens: 40_000 } }),
    null,
    'tokens used with no window size to divide by'
  );
  assert.strictEqual(
    statusline.computePercentage({
      context_window: { total_input_tokens: 40_000, context_window_size: 0 },
    }),
    null,
    'a zero window size is a missing reading, not a division by zero'
  );
  assert.strictEqual(
    statusline.computePercentage({ context_window: { used_percentage: '63.5' } }),
    null,
    'a percentage sent as a string is not a number we will render'
  );
});

test('an unknown reading keeps the last one rather than erasing it', function () {
  const prev = { ctx: 40, session: { pct: 93, resetsAt: 100 }, weekly: null };
  const next = statusline.buildState(prev, null, { session: null, weekly: null });
  assert.deepStrictEqual(next.session, { pct: 93, resetsAt: 100 });
  assert.strictEqual(next.ctx, 40);
});

/**
 * This machine regularly runs several Claude sessions at once and they all
 * write this one file, so a `ctx` figure in it is only some session's if that
 * session is named beside it. The context-size guard reads that figure as the
 * main session's own reading, and without the name it can be another
 * instance's — which is how a session gets told to compact on the strength of
 * somebody else's window.
 */
test('the snapshot records which session wrote it', function () {
  const limits = { session: null, weekly: null };

  assert.strictEqual(statusline.buildState({}, 40, limits, 'sess-a').session_id, 'sess-a');

  const previous = { ctx: 12, session: null, weekly: null, session_id: 'sess-a' };
  assert.strictEqual(
    statusline.buildState(previous, 41, limits, 'sess-b').session_id,
    'sess-b',
    'the writer is whoever wrote it last, never inherited'
  );
  assert.strictEqual(
    statusline.buildState(previous, 41, limits, undefined).session_id,
    null,
    'and a refresh that carried no id records none, rather than the last one'
  );
});

test("the session id the harness sends is the one that reaches the file", async function () {
  const home = makeHome();
  const payload = Object.assign({ session_id: 'sess-from-the-harness' }, SAMPLE_PAYLOAD);

  const rendered = await runStatusline(home, JSON.stringify(payload));
  assert.strictEqual(rendered.err, '');

  const written = JSON.parse(
    fs.readFileSync(path.join(home, '.claude', 'context-usage-state.json'), 'utf8')
  );
  assert.strictEqual(written.session_id, 'sess-from-the-harness');
  assert.strictEqual(written.ctx, 20, 'and the reading it identifies is still written');
});

// ---------------------------------------------------------------------------
// One file, one entry per directory (spec 31, L31)
//
// The top level of this file is one session's — whichever status line refreshed
// last — and that is what put another deck's percentage on every tab. The map
// below is the fix, and it is strictly additive: the top-level keys stay exactly
// as they are, because `context-size-guard.js` reads them and belongs to two
// other slices.
// ---------------------------------------------------------------------------

/**
 * The deck's own reader, which is ESM and which the status line deliberately
 * does not import. The same rule as `STORE_URL` above: a test is the one place
 * the writer's spelling of a directory and the reader's may meet, and seeding
 * the file by hand would only prove the hook agrees with itself.
 */
const USAGE_URL = require('node:url').pathToFileURL(
  path.join(__dirname, '..', '..', 'deck', 'usage.mjs')
).href;

/** That reader, pointed at one scratch home's state file for the length of a call. */
async function readUsageIn(home, deckDir) {
  const previous = process.env.PILOT_USAGE_FILE;
  process.env.PILOT_USAGE_FILE = path.join(home, '.claude', 'context-usage-state.json');
  try {
    const { readUsage } = await import(USAGE_URL);
    return readUsage(deckDir);
  } finally {
    if (previous === undefined) delete process.env.PILOT_USAGE_FILE;
    else process.env.PILOT_USAGE_FILE = previous;
  }
}

const HOUR_MS = 60 * 60 * 1000;
const NO_LIMITS = { session: null, weekly: null };

test('the reading is written under this session’s own directory as well as at the top', function () {
  const dir = path.join(os.tmpdir(), 'ctxusage-one');
  const next = statusline.buildState({}, 41, NO_LIMITS, 'sess-a', dir);

  const entries = Object.entries(next.decks);
  assert.strictEqual(entries.length, 1, 'one directory reported, one entry');
  const entry = entries[0][1];
  assert.strictEqual(entry.ctx, 41, 'the entry is this session’s own reading');
  assert.ok(
    Date.now() - Date.parse(entry.at) < 5000,
    'and the time it was written, which is what bounds the file (L33)'
  );
});

test('the entry records the session that wrote it, not just the figure', function () {
  // The context-size guard tells two sessions in the same directory apart by
  // this field: a fresh session after a hand-off must not read a figure the
  // session before it left behind as its own.
  const dir = path.join(os.tmpdir(), 'ctxusage-writer');
  const next = statusline.buildState({}, 41, NO_LIMITS, 'sess-a', dir);
  const entry = Object.values(next.decks)[0];
  assert.strictEqual(entry.session_id, 'sess-a');
});

test('an entry written with no session id records null, not a missing field', function () {
  const dir = path.join(os.tmpdir(), 'ctxusage-no-writer');
  const next = statusline.buildState({}, 41, NO_LIMITS, undefined, dir);
  const entry = Object.values(next.decks)[0];
  assert.strictEqual(entry.session_id, null);
});

test('the top-level keys are exactly what they were before the map arrived', function () {
  // L31 in one assertion: the guard, which is another slice's file, reads
  // `ctx`, `session`, `weekly` and `session_id`, and this slice may add beside
  // them and must not touch them.
  const limits = { session: { pct: 47, resetsAt: 100 }, weekly: { pct: 7, resetsAt: 200 } };
  const next = statusline.buildState({ ctx: 12 }, 41, limits, 'sess-a', path.join(os.tmpdir(), 'x'));
  const top = Object.assign({}, next);
  delete top.decks;

  assert.deepStrictEqual(top, {
    ctx: 41,
    session: { pct: 47, resetsAt: 100 },
    weekly: { pct: 7, resetsAt: 200 },
    session_id: 'sess-a',
  });
  assert.ok(next.decks, 'and the map is beside them, not instead of them');
});

test('a second directory is added beside the first, and a refresh replaces only its own', function () {
  const one = path.join(os.tmpdir(), 'ctxusage-a');
  const two = path.join(os.tmpdir(), 'ctxusage-b');

  const first = statusline.buildState({}, 41, NO_LIMITS, 'sess-a', one);
  const both = statusline.buildState(first, 12, NO_LIMITS, 'sess-b', two);
  assert.strictEqual(Object.keys(both.decks).length, 2, 'two directories, two entries');

  const again = statusline.buildState(both, 44, NO_LIMITS, 'sess-a', one);
  const figures = Object.keys(again.decks).map(function (key) { return again.decks[key].ctx; });
  assert.deepStrictEqual(figures.sort(), [12, 44], 'one entry moved; the other is where it was');
});

test('an entry past the staleness window is gone after the next write, and one inside it stays', function () {
  // A11 and L33. The file is rewritten on every turn of every session on this
  // machine, so something has to bound it, and what it holds is liveness: a
  // session that finished yesterday has no figure worth showing.
  const stale = path.join(os.tmpdir(), 'ctxusage-yesterday');
  const recent = path.join(os.tmpdir(), 'ctxusage-lunch');
  const previous = { decks: {} };
  previous.decks[stale] = { ctx: 88, at: new Date(Date.now() - 13 * HOUR_MS).toISOString() };
  previous.decks[recent] = { ctx: 33, at: new Date(Date.now() - 11 * HOUR_MS).toISOString() };

  const kept = Object.keys(
    statusline.buildState(previous, 41, NO_LIMITS, 'sess-a', path.join(os.tmpdir(), 'ctxusage-mine')).decks
  );
  assert.strictEqual(
    kept.some(function (key) { return key.endsWith('ctxusage-yesterday'); }),
    false,
    'thirteen hours old is dropped'
  );
  assert.strictEqual(
    kept.some(function (key) { return key.endsWith('ctxusage-lunch'); }),
    true,
    'eleven hours old is a session parked over a meeting, and keeps its figure'
  );
});

test('a refresh with no reading of its own leaves the directory’s last one alone', function () {
  const dir = path.join(os.tmpdir(), 'ctxusage-quiet');
  const first = statusline.buildState({}, 41, NO_LIMITS, 'sess-a', dir);
  const next = statusline.buildState(first, null, NO_LIMITS, 'sess-a', dir);

  assert.strictEqual(Object.keys(first.decks).length, 1, 'the reading was there to keep');
  assert.deepStrictEqual(next.decks, first.decks, 'the same rule the top-level `ctx` follows');
});

test('a previous snapshot with no map, or a broken one, still writes this directory’s entry', function () {
  const dir = path.join(os.tmpdir(), 'ctxusage-first');
  const shapes = [{}, { decks: null }, { decks: 'nonsense' }, { decks: { bad: 7 } }];
  for (const before of shapes) {
    const decks = statusline.buildState(before, 41, NO_LIMITS, 'sess-a', dir).decks;
    const mine = Object.keys(decks).filter(function (key) { return decks[key].ctx === 41; });
    assert.strictEqual(
      mine.length,
      1,
      `a previous ${JSON.stringify(before)} is not evidence, and is not a throw either`
    );
  }
});

/**
 * A11's twelve hours are declared on both sides of a boundary there is nothing
 * to import across — `DECK_WINDOW_MS` in the status line, and again in
 * `deck/usage.mjs` — so nothing but this stops one moving without the other.
 * The two are asked about the same two ages rather than compared as numbers,
 * because it is the behaviour that has to agree: what the writer still keeps,
 * the reader still shows, and what the writer drops, the reader was already
 * refusing.
 */
test('the window the writer prunes on is the window the reader hides on', async function () {
  const home = makeHome();
  const inside = path.join(home, 'work', 'parked-over-lunch');
  const outside = path.join(home, 'work', 'finished-yesterday');
  // Both entries written by the writer, so they are keyed its way, then aged by
  // hand — which is the only part of a twelve-hour claim a test cannot wait for.
  const snapshot = statusline.buildState(
    statusline.buildState({}, 33, NO_LIMITS, 'sess-a', inside),
    88, NO_LIMITS, 'sess-b', outside
  );
  Object.keys(snapshot.decks).forEach(function (key) {
    const hours = key.endsWith('parked-over-lunch') ? 11 : 13;
    snapshot.decks[key].at = new Date(Date.now() - hours * HOUR_MS).toISOString();
  });
  seedState(home, snapshot);

  assert.deepStrictEqual(
    (await readUsageIn(home, inside)).ctx,
    { pct: 33 },
    'eleven hours old is still a reading to the deck'
  );
  assert.strictEqual(
    (await readUsageIn(home, outside)).ctx,
    null,
    'and thirteen hours old is not'
  );

  // One refresh from a third directory, so the prune runs without either of the
  // two being the entry being written.
  await runStatusline(home, JSON.stringify(Object.assign({}, SAMPLE_PAYLOAD, {
    session_id: 'sess-third',
    workspace: { current_dir: path.join(home, 'work', 'somewhere-else') },
  })));
  const kept = Object.keys(JSON.parse(
    fs.readFileSync(path.join(home, '.claude', 'context-usage-state.json'), 'utf8')
  ).decks);

  assert.strictEqual(
    kept.some(function (key) { return key.endsWith('parked-over-lunch'); }),
    true,
    'the writer keeps what the reader will show'
  );
  assert.strictEqual(
    kept.some(function (key) { return key.endsWith('finished-yesterday'); }),
    false,
    'and drops what the reader was already refusing'
  );
});

/**
 * The join, run the way the two halves really run: the hook writes the file in
 * the process the harness launches, and the deck reads it as ESM.
 */
test('two sessions in two directories each leave their own figure, and the deck reads each its own', async function () {
  const home = makeHome();
  const one = path.join(home, 'work', 'alpha');
  const two = path.join(home, 'work', 'beta');
  const aRun = (id, dir, tokens) => JSON.stringify(Object.assign({}, SAMPLE_PAYLOAD, {
    session_id: id,
    workspace: { current_dir: dir },
    context_window: { total_input_tokens: tokens, context_window_size: 200_000 },
  }));

  assert.strictEqual((await runStatusline(home, aRun('sess-alpha', one, 60_000))).err, '');
  assert.strictEqual((await runStatusline(home, aRun('sess-beta', two, 20_000))).err, '');

  const written = JSON.parse(
    fs.readFileSync(path.join(home, '.claude', 'context-usage-state.json'), 'utf8')
  );
  assert.strictEqual(written.ctx, 10, 'the top level is still the last writer’s, untouched');
  assert.strictEqual(written.session_id, 'sess-beta');

  assert.deepStrictEqual((await readUsageIn(home, one)).ctx, { pct: 30 }, 'alpha’s own figure');
  assert.deepStrictEqual((await readUsageIn(home, two)).ctx, { pct: 10 }, 'beta’s own figure');
  assert.strictEqual(
    (await readUsageIn(home, path.join(home, 'work', 'never-run'))).ctx,
    null,
    'and a deck whose session never reported gets nothing, never a neighbour’s number'
  );
});

test('the status line keeps the context reading and adds the plan limits', function () {
  const data = { model: { display_name: 'Opus' }, workspace: { current_dir: 'C:/x/repo' } };
  const line = statusline.buildLine(data, 8, {
    session: { pct: 42, resetsAt: null },
    weekly: { pct: 61, resetsAt: null },
  });
  assert.strictEqual(line.replace(/\u001b\[[0-9;]*m/g, ''), 'Opus repo | ctx 8% | ses 42% | wk 61%');
});

test('status line colours are real escape sequences, not literal text', function () {
  // The ESC byte was missing once already, and the line rendered as
  // "claude repo | [1;31mctx 92%[0m", so these assert the \x1b explicitly.
  const data = { model: { display_name: 'Opus' }, workspace: { current_dir: 'C:/x/repo' } };

  assert.ok(statusline.buildLine(data, 96).includes('\u001b[1;41m'), 'red background above 95');
  assert.ok(statusline.buildLine(data, 92).includes('\u001b[1;31m'), 'bold red above 90');
  assert.ok(statusline.buildLine(data, 84).includes('\u001b[33m'), 'yellow above 80');
  assert.ok(statusline.buildLine(data, 20).includes('\u001b[32m'), 'green below 80');
  assert.ok(statusline.buildLine(data, 92).endsWith('\u001b[0m'), 'colour must be reset');

  const hot = statusline.buildLine(data, 10, { session: { pct: 96, resetsAt: null }, weekly: null });
  assert.ok(hot.includes('\u001b[1;41m'), 'a session limit above 95 must stand out too');

  assert.ok(
    !/(^|[^\u001b])\[[0-9;]+m/.test(statusline.buildLine(data, 92, { session: { pct: 50 }, weekly: null })),
    'found an escape sequence missing its ESC byte'
  );
});

test('the status line omits segments whose reading is unknown', function () {
  const data = { model: { display_name: 'Opus' }, workspace: { current_dir: 'C:/x/repo' } };
  assert.strictEqual(statusline.buildLine(data, null, null), 'Opus repo');

  const partial = statusline.buildLine(data, null, { session: { pct: 42 }, weekly: null });
  assert.strictEqual(partial.replace(/\u001b\[[0-9;]*m/g, ''), 'Opus repo | ses 42%');
});

test('every concurrent instance is warned, not just the first to notice', async function () {
  // A plan limit is account-wide, but the warning has to reach each agent that
  // is spending it. Before the claim was keyed per session, whichever instance
  // ran a tool first took the only claim and the rest carried on unaware.
  const home = makeHome();
  seedState(home, { ctx: 20, session: { pct: 96, resetsAt: 1757000000 }, weekly: null });

  const first = await runAlert(home, 'session-a');
  const second = await runAlert(home, 'session-b');
  const third = await runAlert(home, 'session-c');

  for (const r of [first, second, third]) {
    assert.notStrictEqual(r.out, '', 'each session should get its own warning');
    assert.match(JSON.parse(r.out).systemMessage, /96%/);
  }

  // ...and still exactly once each, which is the property the claim exists for.
  assert.strictEqual((await runAlert(home, 'session-a')).out, '');
  assert.strictEqual((await runAlert(home, 'session-b')).out, '');
});

test('a payload with no session id still warns, on the shared key', async function () {
  const home = makeHome();
  seedState(home, { ctx: 20, session: { pct: 96, resetsAt: 1757000000 }, weekly: null });

  const first = await runAlert(home, null);
  assert.notStrictEqual(first.out, '', 'a missing id must not mean silence');
  // Falling back to one shared key, so it does not repeat on every tool call.
  assert.strictEqual((await runAlert(home, null)).out, '');
});

test('a session id that is only punctuation cannot escape the claim directory', function () {
  assert.strictEqual(alert.sessionKey('../../etc/passwd'), 'etcpasswd');
  assert.strictEqual(alert.sessionKey('///'), 'x');
  assert.strictEqual(alert.sessionKey(undefined), 'x');
});

test('an agent id that is only punctuation cannot escape the claim directory either', function () {
  // agentId goes through the same sanitizer as sessionId, joined with `~`;
  // nothing from either input can put a `/`, a `.`, or the join character
  // itself into the file name that ends up under CLAIM_DIR.
  assert.strictEqual(alert.sessionKey('sess-a', '../../etc/passwd'), 'sess-a~etcpasswd');
  assert.strictEqual(alert.sessionKey('sess-a', '///'), 'sess-a');
  assert.strictEqual(alert.sessionKey('sess-a', undefined), 'sess-a');
});

// ---------------------------------------------------------------------------
// The deck file
//
// The line carries no count of waiting items (L10): the deck's number is the
// only deck segment, and it is read from the snapshot the deck keeps on disk.
// ---------------------------------------------------------------------------

function makeDeck(items, decks) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pilot-deck-'));
  const deck = { version: 1, items: items };
  if (decks) deck.decks = decks;
  fs.writeFileSync(path.join(dir, 'deck.json'), JSON.stringify(deck), 'utf8');
  return path.join(dir, 'deck.json');
}

/** The deck as the status line reads it: one snapshot, every question asked of that. */
function snapshot(file) {
  return statusline.readDeck(file);
}

test('the deck file is found the same way the deck store finds it', function () {
  // Same two rules as deck/store.mjs (L5, plus PILOT_DECK_DIR for tests), which
  // this cannot import: the statusline is CommonJS, launched bare by the harness.
  const previous = process.env.PILOT_DECK_DIR;
  try {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pilot-deck-'));
    process.env.PILOT_DECK_DIR = dir;
    assert.strictEqual(statusline.deckFile(), path.join(dir, 'deck.json'));

    delete process.env.PILOT_DECK_DIR;
    assert.strictEqual(statusline.deckFile(), path.join(os.homedir(), '.claude', 'pilot', 'deck.json'));
  } finally {
    if (previous === undefined) delete process.env.PILOT_DECK_DIR;
    else process.env.PILOT_DECK_DIR = previous;
  }
});

test('buildLine draws no deck segment at all', function () {
  const data = { model: { display_name: 'Opus' }, workspace: { current_dir: 'C:/x/repo' } };
  const line = statusline.buildLine(data, 8, {
    session: { pct: 42, resetsAt: null },
    weekly: { pct: 61, resetsAt: null },
  }, 4);
  assert.strictEqual(
    line.replace(/\u001b\[[0-9;]*m/g, ''),
    'Opus repo | ctx 8% | ses 42% | wk 61% | D4'
  );
  assert.ok(!/deck/.test(line), 'no "deck <n>" segment');
});

// ---------------------------------------------------------------------------
// The deck's number
//
// Spec 10: a deck is D1, D2… for the working directory it is, and the terminal
// status line is one of the three places that number is read. `deck N` beside
// it is the count of items waiting on the user and has never been a number for
// anything, so this is an addition beside it and never a rename of it.
//
// The number is read out of the deck's own snapshot, like the count and in the
// same read: two reads could straddle a write and put one deck's number beside
// another's count.
// ---------------------------------------------------------------------------

/** The key deck/store.mjs writes a directory under, spelled a different way. */
const SPELLINGS = [
  ['itself', function (dir) { return dir; }],
  ['with a trailing separator', function (dir) { return dir + path.sep; }],
  ['through a step it goes back out of', function (dir) { return path.join(dir, 'x', '..'); }],
  // The case of the drive letter, which is the spelling only Windows has and
  // only Windows folds — and this file's `repoKey` is re-derived rather than
  // imported, so it is the half of that agreement most able to drift. Off
  // Windows the path is itself and the entry asks nothing the platform has.
  ['with the drive letter in the other case', function (dir) {
    if (process.platform !== 'win32') return dir;
    return dir.replace(/^[A-Za-z]:/, function (drive) {
      return drive === drive.toLowerCase() ? drive.toUpperCase() : drive.toLowerCase();
    });
  }],
];

test('the number on the line is the one the deck minted for this directory', async function () {
  // Seeded by the store that owns the numbering, not by hand: the hook re-derives
  // the store's key rather than importing it (it must run as a bare `node <path>`),
  // and a key rule that drifted would leave every numbered deck silently unnamed.
  const home = makeHome();
  const repo = path.join(home, 'work', 'pilot');
  const store = await withDeckDir(path.join(home, '.claude', 'pilot'), async function () {
    const { registerRun } = await import(STORE_URL);
    registerRun({ repo: repo, pid: process.pid });
    return statusline.readDeck(path.join(home, '.claude', 'pilot', 'deck.json'));
  });

  for (const spelling of SPELLINGS) {
    assert.strictEqual(
      statusline.deckNumberFor(store, spelling[1](repo)),
      1,
      'the directory ' + spelling[0] + ' is the same deck'
    );
  }
  assert.strictEqual(
    statusline.deckNumberFor(store, path.join(home, 'work', 'kettle')),
    null,
    'and a directory the deck has never seen has no number of its own'
  );
});

test('a deck that is absent, corrupt or older than the numbering shows no number', function () {
  const dir = path.join('D:', 'work', 'pilot');
  const gone = path.join(os.tmpdir(), 'pilot-deck-does-not-exist', 'deck.json');
  assert.strictEqual(statusline.deckNumberFor(snapshot(gone), dir), null, 'a friend who never opened the deck');

  const older = makeDeck([{ id: 'itm_a', kind: 'question', title: 'Port?', body: '4321?', replies: [] }]);
  assert.strictEqual(
    statusline.deckNumberFor(snapshot(older), dir),
    null,
    'a deck that has not registered since the numbering arrived has no number yet (A5)'
  );

  const nonsense = makeDeck([], { 'd:\\work\\pilot': 'banana' });
  assert.strictEqual(
    statusline.deckNumberFor(snapshot(nonsense), dir),
    null,
    'and a hand-edited map says nothing rather than putting its contents on the line'
  );

  // Integers the mint never hands out. Numbering starts at D1, so both of these
  // are a hand-edited map too, and `D0` on the line would name a deck that is
  // not there as surely as `banana` would.
  const zero = makeDeck([], { 'd:\\work\\pilot': 0 });
  assert.strictEqual(statusline.deckNumberFor(snapshot(zero), dir), null, 'a stored 0 is no number');
  const negative = makeDeck([], { 'd:\\work\\pilot': -1 });
  assert.strictEqual(statusline.deckNumberFor(snapshot(negative), dir), null, 'nor is a stored -1');
});

test('a deck with a number still says which deck it is', function () {
  const data = { model: { display_name: 'Opus' }, workspace: { current_dir: 'C:/x/repo' } };
  assert.strictEqual(
    statusline.buildLine(data, null, null, 4).replace(/\u001b\[[0-9;]*m/g, ''),
    'Opus repo | D4',
    'the number names the directory'
  );
  assert.strictEqual(
    statusline.buildLine(data, null, null, null),
    'Opus repo',
    'and a deck with no number adds nothing, the way an unknown reading adds nothing (A5)'
  );
});

test('the line carries D<n> and no deck count when items are waiting', async function () {
  // The whole path, in the process the harness launches: the store mints, the
  // hook reads the file it wrote, and the payload names the directory.
  const home = makeHome();
  const repo = path.join(home, 'work', 'pilot');
  await withDeckDir(path.join(home, '.claude', 'pilot'), async function () {
    const store = await import(STORE_URL);
    store.registerRun({ repo: repo, pid: process.pid });
    store.postItem({ kind: 'question', title: 'Which port?', body: '4321?', repo: repo });
  });

  const payload = Object.assign({}, SAMPLE_PAYLOAD, { workspace: { current_dir: repo } });
  const rendered = await runStatusline(home, JSON.stringify(payload));

  assert.strictEqual(rendered.err, '');
  assert.match(rendered.out, /D1/, 'the deck the session is in');
  assert.doesNotMatch(rendered.out, /deck/, 'and no count of what is waiting in it');
});

// ---------------------------------------------------------------------------
// The launch directory, not wherever the session has since cd'd (L13)
//
// deck/client.mjs registers process.cwd() at startup — the directory `claude`
// was launched in — as workspace.project_dir. A session that cd's around
// afterwards keeps sending that same project_dir beside a current_dir that has
// moved on. Before this fix the line read current_dir instead, so a session
// that launched in one repository and cd'd into another showed the wrong
// deck's number and count the moment it moved.
// ---------------------------------------------------------------------------

test('the label names the launch directory when the payload carries one, not wherever the session has since cd\'d', function () {
  const data = {
    model: { display_name: 'Opus' },
    workspace: { project_dir: 'C:/x/repo', current_dir: 'C:/x/repo/nested/deep' },
  };
  assert.strictEqual(statusline.buildLine(data, null, null), 'Opus repo');
});

test('the label falls back to current_dir for a payload with no project_dir', function () {
  const data = { model: { display_name: 'Opus' }, workspace: { current_dir: 'C:/x/repo' } };
  assert.strictEqual(statusline.buildLine(data, null, null), 'Opus repo');
});

test('a live session that cd\'s still names, numbers and counts its launch directory', async function () {
  const home = makeHome();
  const launched = path.join(home, 'work', 'pilot');
  const cwd = path.join(launched, 'packages', 'deep');
  await withDeckDir(path.join(home, '.claude', 'pilot'), async function () {
    const store = await import(STORE_URL);
    store.registerRun({ repo: launched, pid: process.pid });
    store.postItem({ kind: 'question', title: 'Which port?', body: '4321?', repo: launched });
    // A second repository's own open item — proof the count is not just the
    // whole deck's, but this directory's alone (L13).
    store.registerRun({ repo: path.join(home, 'work', 'other'), pid: process.pid + 1 });
    store.postItem({
      kind: 'question', title: 'Theirs', body: '?', repo: path.join(home, 'work', 'other'),
    });
  });

  const payload = Object.assign({}, SAMPLE_PAYLOAD, {
    workspace: { project_dir: launched, current_dir: cwd },
  });
  const rendered = await runStatusline(home, JSON.stringify(payload));

  assert.strictEqual(rendered.err, '');
  assert.match(rendered.out, /Opus 5 pilot \|/, 'the label names the launch directory, not "deep"');
  assert.match(rendered.out, /D1/, 'the deck the session launched in');
  assert.doesNotMatch(rendered.out, /deck/, 'and no count beside it');
});

// ---------------------------------------------------------------------------
// How the alert reaches a friend's machine
//
// The statusline is settings-only and has to be merged into ~/.claude/settings.json
// by scripts/install-settings.mjs. The alert is not: a plugin can register its own
// PostToolUse hook, so it does, and nothing absolute is written into a user's
// settings for it.
// ---------------------------------------------------------------------------

const REPO_ROOT = path.join(__dirname, '..', '..');

function hooksJson() {
  return JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'hooks', 'hooks.json'), 'utf8'));
}

function everyHookCommand(config) {
  const commands = [];
  for (const entries of Object.values(config.hooks || {})) {
    for (const entry of entries) {
      for (const hook of entry.hooks || []) commands.push(hook.command);
    }
  }
  return commands;
}

test('the plugin registers the alert itself, on PostToolUse', function () {
  const config = hooksJson();
  const post = config.hooks.PostToolUse;
  assert.ok(Array.isArray(post) && post.length >= 1, 'PostToolUse must be registered');

  // Slice 5 put a single process in front of the registration: this hook runs
  // after every tool call, so the lanes share one spawn rather than one each.
  // The alert is still registered — as a module of `hooks/post-tool.js`, which
  // names it and calls it, and which that slice's tests hold to.
  const alerts = post
    .flatMap(function (entry) { return entry.hooks || []; })
    .filter(function (hook) { return /post-tool\.js/.test(hook.command); });

  assert.strictEqual(alerts.length, 1, 'exactly one alert registration');
  assert.strictEqual(alerts[0].type, 'command');
  assert.strictEqual(typeof alerts[0].timeout, 'number', 'a hook on every tool call needs a timeout');
  assert.ok(alerts[0].timeout <= 10, 'and a short one');
  assert.ok(
    require('../post-tool.js').MODULES.some(function (module) {
      return /context-usage-alert/.test(module.file);
    }),
    'and the process that is registered still runs this alert'
  );
});

test('the plugin also registers the alert on SessionStart, so a fresh session is warned before its first tool call', function () {
  const config = hooksJson();
  const starts = (config.hooks.SessionStart || [])
    .flatMap(function (entry) { return entry.hooks || []; })
    .filter(function (hook) { return /context-usage-alert\.js/.test(hook.command); });

  assert.strictEqual(starts.length, 1, 'exactly one SessionStart registration reaching the alert');
  assert.strictEqual(starts[0].type, 'command');
  assert.strictEqual(typeof starts[0].timeout, 'number', 'a hook on every session start needs a timeout');
  assert.ok(starts[0].timeout <= 10, 'and a short one');
});

test('the alert is addressed through the plugin root, never an absolute path', function () {
  for (const command of everyHookCommand(hooksJson())) {
    assert.match(command, /\$\{CLAUDE_PLUGIN_ROOT\}/, 'every hook command resolves from the plugin root');
    assert.ok(!/[A-Za-z]:[\/]/.test(command), 'no drive-letter path in ' + command);
    assert.ok(!/(^|[\s"'])\/(home|Users)\//.test(command), 'no posix home path in ' + command);
  }
});

test('every script a hook names is actually shipped', function () {
  for (const command of everyHookCommand(hooksJson())) {
    const match = /\$\{CLAUDE_PLUGIN_ROOT\}\/([^"']+)/.exec(command);
    assert.ok(match, 'a hook command must name a file under the plugin root: ' + command);
    assert.ok(
      fs.existsSync(path.join(REPO_ROOT, match[1])),
      match[1] + ' is registered as a hook but not shipped'
    );
  }
});
