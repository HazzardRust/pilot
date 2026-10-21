#!/usr/bin/env node
/**
 * Slice 5: a reply reaches the pilot without it asking, and it cannot go idle
 * unread.
 *
 * Three things are proved here, each with a shape of test to match. The wiring
 * — one PostToolUse process naming three modules, a lane that is absent or
 * throws being a no-op — is a unit test against `post-tool.js` with fake
 * modules, because that is the only way to have a module that throws without
 * shipping one. The delivery and the gate run real hook processes against a
 * real deck daemon on an ephemeral port, because "delivered exactly once" is a
 * race between processes and "the deck is down" is a socket that is not there.
 * The registration is read out of `hooks/hooks.json`.
 *
 * Every test takes its own store directory, its own port and its own home.
 * Nothing here may touch the real deck at 4321 or the real ~/.claude/pilot:
 * this machine runs a live deck with a walkthrough in it.
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');

const HOOKS = path.join(__dirname, '..');
const REPO_ROOT = path.join(HOOKS, '..');
const POST_TOOL = path.join(HOOKS, 'post-tool.js');
const STOP_GATE = path.join(HOOKS, 'stop-gate.js');
const DAEMON = path.join(REPO_ROOT, 'deck', 'daemon.mjs');

const postTool = require('../post-tool.js');
const inbox = require('../inbox-alert.js');
const stopGate = require('../stop-gate.js');
const { bearer } = require('../lib/deck-secret.js');

// --- harness ---------------------------------------------------------------

const sleep = (ms) => new Promise(function (resolve) { setTimeout(resolve, ms); });

/** Retries a probe until it answers or the deadline passes. Start-up, not polling. */
async function until(probe, options) {
  const opts = options || {};
  const timeoutMs = opts.timeoutMs || 15000;
  const deadline = Date.now() + timeoutMs;
  let last;
  while (Date.now() < deadline) {
    try {
      const value = await probe();
      if (value) return value;
    } catch (err) {
      last = err;
    }
    await sleep(50);
  }
  throw new Error(
    (opts.what || 'the thing') + ' never happened within ' + timeoutMs + 'ms' +
      (last ? ': ' + last.message : '')
  );
}

/** A port the operating system has just confirmed is free. Never 4321. */
function freePort() {
  return new Promise(function (resolve) {
    const probe = net.createServer();
    probe.listen(0, '127.0.0.1', function () {
      const port = probe.address().port;
      probe.close(function () { resolve(port); });
    });
  });
}

/** A scratch home, so a hook's state lands nowhere near the user's own. */
function makeHome(t) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'pilot-s5-home-'));
  t.after(function () { fs.rmSync(home, { recursive: true, force: true }); });
  fs.mkdirSync(path.join(home, '.claude'), { recursive: true });
  return home;
}

const healthAt = async function (port) {
  const response = await fetch('http://127.0.0.1:' + port + '/api/health');
  return response.ok ? response.json() : null;
};

/**
 * A deck of this test's own: its own store directory, its own port, and a
 * daemon process killed when the test ends however it ends.
 */
async function deckFor(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pilot-s5-deck-'));
  const stops = [];
  // The hooks under test, and the requests below, read this deck's secret from its dir (deck-token S1).
  const previousDir = process.env.PILOT_DECK_DIR;
  process.env.PILOT_DECK_DIR = dir;
  t.after(async function () {
    if (previousDir === undefined) delete process.env.PILOT_DECK_DIR;
    else process.env.PILOT_DECK_DIR = previousDir;
    await Promise.all(stops.map(function (stop) { return stop(); }));
    fs.rmSync(dir, { recursive: true, force: true });
  });
  // A port is only this test's once its health names the daemon spawned here (S11):
  // something else can hold the probed port by the time the daemon binds it.
  for (let attempt = 1; ; attempt += 1) {
    const port = await freePort();
    const child = spawn(process.execPath, [DAEMON], {
      env: Object.assign({}, process.env, { PILOT_DECK_DIR: dir, PILOT_DECK_PORT: String(port) }),
      stdio: ['ignore', 'ignore', 'pipe'],
    });
    let stderr = '';
    child.stderr.on('data', function (chunk) { stderr += chunk; });
    // 'close', not 'exit': the failure below quotes stderr, which drains after the exit.
    const exited = new Promise(function (resolve) { child.on('close', resolve); });
    const stop = async function () {
      if (child.exitCode === null && child.signalCode === null) child.kill();
      await exited;
    };
    stops.push(stop);
    const health = await until(async function () {
      if (child.exitCode !== null || child.signalCode !== null) return { pid: null };
      return healthAt(port);
    }, { what: 'the deck coming up' });
    if (health.pid === child.pid) {
      return { port: port, dir: dir, repo: dir, stop: function () { return stopDeck(port, child); } };
    }
    await stop();
    if (attempt === 3) {
      const answer = health.pid === null ? 'the daemon spawned here exited' : 'pid ' + health.pid + ' answers';
      throw new Error('the deck on :' + port + ' is not the one spawned here (pid ' + child.pid + '): ' +
        answer + ', three ports running; its stderr: ' + stderr.trim());
    }
  }
}

async function stopDeck(port, child) {
  child.kill();
  await new Promise(function (resolve) { child.on('exit', resolve); });
  // The port has to be actually free before a test can prove "the deck is down":
  // a socket in TIME_WAIT still refuses, but a half-dead daemon still answers.
  await until(
    async function () {
      try { await healthAt(port); return false; } catch (err) { return true; }
    },
    { what: 'the deck going away' }
  );
}

const api = async function (port, name, args) {
  const response = await fetch('http://127.0.0.1:' + port + '/api/tool', {
    method: 'POST',
    headers: Object.assign({ 'content-type': 'application/json' }, bearer()),
    body: JSON.stringify({ name: name, arguments: args || {} }),
  });
  const payload = await response.json();
  assert.ok(response.ok, 'the deck refused ' + name + ': ' + JSON.stringify(payload));
  return payload.content[0].text;
};

/** Put this test's "session" on the deck, the way the stdio client does. */
const registerRun = async function (port, repo) {
  const response = await fetch('http://127.0.0.1:' + port + '/api/runs', {
    method: 'POST',
    headers: Object.assign({ 'content-type': 'application/json' }, bearer()),
    body: JSON.stringify({ repo: repo, pid: process.pid }),
  });
  assert.ok(response.ok, 'the deck refused the run');
  return response.json();
};

const postItem = async function (port, overrides) {
  const said = await api(port, 'deck_post', Object.assign(
    { kind: 'question', title: 'Which port for the deck?', body: 'I recommend 4321.' },
    overrides
  ));
  return /Posted (itm_[0-9a-f]+)/.exec(said)[1];
};

/**
 * The repository's chat item, read straight from the store. The registration
 * is what makes it (S2, L5): a run registering under `establish` leaves its
 * repository with exactly one chat, and `postItem` refuses the kind (L4), so a
 * test calls `establish` first and this finds what the registration made.
 */
async function seedChat(deck, repo) {
  const previous = process.env.PILOT_DECK_DIR;
  process.env.PILOT_DECK_DIR = deck.dir;
  try {
    const store = await import('../../deck/store.mjs');
    return store.listItems().find(function (item) {
      return item.kind === 'chat' && item.repo === repo;
    }).id;
  } finally {
    if (previous === undefined) delete process.env.PILOT_DECK_DIR;
    else process.env.PILOT_DECK_DIR = previous;
  }
}

/** A thread the user opened with Create, made through the store the way `seedChat` reads it. */
async function seedUserThread(deck, repo) {
  const previous = process.env.PILOT_DECK_DIR;
  process.env.PILOT_DECK_DIR = deck.dir;
  try {
    const store = await import('../../deck/store.mjs');
    return store.createThread({ name: 'Side question', repo: repo });
  } finally {
    if (previous === undefined) delete process.env.PILOT_DECK_DIR;
    else process.env.PILOT_DECK_DIR = previous;
  }
}

/** The user typing in their browser, which is the only thing that makes a reply. */
const replyInBrowser = async function (port, id, text) {
  const response = await fetch('http://127.0.0.1:' + port + '/reply', {
    method: 'POST',
    headers: Object.assign({ 'content-type': 'application/x-www-form-urlencoded' }, bearer()),
    body: new URLSearchParams({ id: id, text: text }),
    redirect: 'manual',
  });
  assert.equal(response.status, 303, 'the browser is sent back to the thread');
};

/**
 * Whether the deck has written down that a session was handed the reply on this
 * thread — the fact the card's bar is rendered from, read off the store itself
 * because asking the deck for it over a tool call would be another hand-off.
 */
function handedOver(deck, id) {
  const stored = JSON.parse(fs.readFileSync(path.join(deck.dir, 'deck.json'), 'utf8'));
  const item = stored.items.find(function (one) { return one.id === id; });
  assert.ok(item, 'the deck is still holding ' + id);
  return (item.replies || []).some(function (reply) {
    return typeof reply.deliveredAt === 'string';
  });
}

/** Spawn a hook the way the harness does: JSON on stdin, JSON on stdout. */
function runHook(script, home, port, input, env) {
  return new Promise(function (resolve, reject) {
    const child = spawn(process.execPath, [script], {
      env: Object.assign({}, process.env, {
        HOME: home,
        USERPROFILE: home,
        PILOT_DECK_PORT: String(port),
      }, env || {}),
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let out = '';
    let err = '';
    child.stdout.on('data', function (c) { out += c; });
    child.stderr.on('data', function (c) { err += c; });
    child.on('error', reject);
    child.on('close', function (code) {
      resolve({
        out: out.trim(),
        err: err.trim(),
        code: code,
        json: out.trim() === '' ? null : JSON.parse(out.trim()),
      });
    });
    child.stdin.end(JSON.stringify(input));
  });
}

const toolCall = function (home, port, input) {
  return runHook(POST_TOOL, home, port, Object.assign({
    session_id: 'session-a',
    transcript_path: path.join(home, 'transcript.jsonl'),
    cwd: home,
    hook_event_name: 'PostToolUse',
    tool_name: 'Read',
    tool_input: {},
    tool_response: {},
  }, input));
};

const stopping = function (home, port, input, env) {
  return runHook(STOP_GATE, home, port, Object.assign({
    session_id: 'session-a',
    transcript_path: path.join(home, 'transcript.jsonl'),
    cwd: home,
    hook_event_name: 'Stop',
    stop_hook_active: false,
    // Every stop in this file that is not about the hold wants the gate to answer
    // and go, not to sit out its default nine and a half minutes.
  }, input), Object.assign({ PILOT_STOP_HOLD_MS: '1' }, env || {}));
};

const contextOf = function (result) {
  return (result.json && result.json.hookSpecificOutput &&
    result.json.hookSpecificOutput.additionalContext) || '';
};

/**
 * A session that has taken its place on the deck: a run registered for `cwd`,
 * and one tool call spent establishing where the session's reading starts.
 */
async function establish(home, deck, input) {
  await registerRun(deck.port, home);
  const first = await toolCall(home, deck.port, input);
  assert.equal(first.code, 0);
  assert.equal(contextOf(first), '', 'arriving on the deck is not news to deliver');
  return first;
}

// --- one process, its lanes ------------------------------------------------

test('the PostToolUse process names its modules up front, in order', function () {
  assert.deepStrictEqual(
    postTool.MODULES.map(function (module) { return module.file; }),
    [
      './inbox-alert.js',
      './context-usage-alert.js',
      './context-size-guard.js',
      './agent-roster.js',
      'plain-pickup', // audit-fixes S5: inline in post-tool.js
    ]
  );
});

test('a third lane beside the inbox does not cost the inbox its delivery', async function (t) {
  // This asserted context-size-guard.js was absent, which was the repository's
  // real state until slice 12 landed it. The absent case is now covered by the
  // throwing loader in the test below — an absent module is a `require` that
  // throws — and the half worth asserting against the real tree is this one:
  // the inbox still delivers with all three lanes actually installed.
  assert.ok(fs.existsSync(path.join(HOOKS, 'context-size-guard.js')));

  const home = makeHome(t);
  const deck = await deckFor(t);
  const id = await postItem(deck.port);
  await establish(home, deck);
  await replyInBrowser(deck.port, id, '4321 is fine.');

  const delivered = await toolCall(home, deck.port);
  assert.equal(delivered.code, 0);
  assert.match(contextOf(delivered), /4321 is fine/, 'the lanes that are here still run');
});

test('a module that throws leaves the other lanes untouched', async function () {
  const merged = await postTool.runModules({ session_id: 's' }, [
    { file: './broken.js', load: function () { throw new Error('no such module'); } },
    {
      file: './angry.js',
      load: function () { return { run: function () { throw new Error('it went wrong'); } }; },
    },
    {
      file: './fine.js',
      load: function () {
        return { run: function () { return { additionalContext: 'the deck says hello' }; } };
      },
    },
  ]);

  assert.equal(merged.payload.hookSpecificOutput.additionalContext, 'the deck says hello');
  assert.equal(merged.payload.hookSpecificOutput.hookEventName, 'PostToolUse');
});

test('two lanes speaking at once are merged into one payload, not two', async function () {
  const merged = await postTool.runModules({ session_id: 's' }, [
    {
      file: './first.js',
      load: function () {
        return {
          run: function () {
            return { systemMessage: 'a reply arrived', additionalContext: 'the user said yes' };
          },
        };
      },
    },
    {
      file: './second.js',
      load: function () {
        return {
          run: function () {
            return { systemMessage: 'usage is at 91%', additionalContext: 'wrap up' };
          },
        };
      },
    },
  ]);

  assert.match(merged.payload.systemMessage, /a reply arrived/);
  assert.match(merged.payload.systemMessage, /usage is at 91%/);
  const context = merged.payload.hookSpecificOutput.additionalContext;
  assert.match(context, /the user said yes/);
  assert.match(context, /wrap up/);
});

test('a payload the harness never received is not marked as delivered', async function () {
  let rolledBack = 0;
  let committed = 0;
  const merged = await postTool.runModules({ session_id: 's' }, [
    {
      file: './first.js',
      load: function () {
        return {
          run: function () {
            return {
              additionalContext: 'the user said yes',
              commit: function () { committed += 1; },
              rollback: function () { rolledBack += 1; },
            };
          },
        };
      },
    },
  ]);

  merged.rollback();
  assert.equal(rolledBack, 1, 'a write that never landed gives the delivery back');
  assert.equal(committed, 0);
  merged.commit();
  assert.equal(committed, 1, 'and a write that landed is what moves the cursor on');
});

test('nothing to say is said with no output at all', async function (t) {
  const home = makeHome(t);
  const deck = await deckFor(t);
  await establish(home, deck);

  const quiet = await toolCall(home, deck.port);
  assert.equal(quiet.out, '', 'an empty payload is not written as {}');
  assert.equal(quiet.code, 0);
});

// --- the usage lane, as post-tool.js actually calls it ----------------------
//
// The shim in `post-tool.js` adapts slice 9's `{ claimed, payload }` to the
// `{ systemMessage, additionalContext, rollback }` the merge wants, and nothing
// else drives it: `runModule` swallows whatever a lane throws, so the day slice
// 9 moves a field this becomes a permanent silent no-op with every test green.
// So this one runs the real module over a real state file in a home of its own.

const USAGE_ALERT = path.join(HOOKS, 'context-usage-alert.js');

/**
 * Slice 9's lane, loaded against a home of this test's own. Its state file and
 * its claim directory are read from `os.homedir()` when the module loads, so the
 * environment is set and the module cache dropped before `runModules` requires it.
 */
function usageLaneIn(t, home, state) {
  fs.writeFileSync(path.join(home, '.claude', 'context-usage-state.json'), JSON.stringify(state));

  const before = { HOME: process.env.HOME, USERPROFILE: process.env.USERPROFILE };
  process.env.HOME = home;
  process.env.USERPROFILE = home;
  delete require.cache[require.resolve(USAGE_ALERT)];
  t.after(function () {
    delete require.cache[require.resolve(USAGE_ALERT)];
    for (const name of Object.keys(before)) {
      if (before[name] === undefined) delete process.env[name];
      else process.env[name] = before[name];
    }
  });

  return { file: USAGE_ALERT, call: postTool.adaptUsageAlert };
}

test('the usage lane reaches the merge as a payload, and gives its claims back', async function (t) {
  const home = makeHome(t);
  const resetsAt = Math.floor(Date.now() / 1000) + 3600;
  const lane = usageLaneIn(t, home, {
    session: { pct: 96, resetsAt: resetsAt },
    weekly: { pct: 12, resetsAt: resetsAt },
  });

  const merged = await postTool.runModules({ session_id: 'session-u' }, [lane]);

  assert.ok(merged, 'a plan limit at 96% is something the pilot has to be told');
  assert.match(merged.payload.systemMessage, /Session usage \(5h\) is at 96%/, 'result.payload.systemMessage');
  assert.match(
    merged.payload.hookSpecificOutput.additionalContext,
    /SYSTEM NOTICE.*96%.*Wrap up now/s,
    'result.payload.hookSpecificOutput.additionalContext'
  );
  assert.equal(merged.payload.hookSpecificOutput.hookEventName, 'PostToolUse');
  assert.doesNotMatch(merged.payload.systemMessage, /Weekly/, 'and a track below the band is not news');

  const claims = path.join(home, '.claude', 'context-usage-claims');
  assert.equal(
    fs.readdirSync(claims).length, 2,
    'the lane claims 90 alongside 95, so the lower warning cannot arrive afterwards'
  );

  merged.rollback();
  assert.deepEqual(
    fs.readdirSync(claims), [],
    'a payload the harness never received is warned about again, not swallowed'
  );
});

// --- a reply that arrives without being asked for ---------------------------

test('a session takes its place on the deck without being told anything', async function (t) {
  const home = makeHome(t);
  const deck = await deckFor(t);
  const id = await postItem(deck.port);
  await replyInBrowser(deck.port, id, 'answered before this session ever started');

  await establish(home, deck);

  const next = await toolCall(home, deck.port);
  assert.equal(contextOf(next), '', 'a reply older than the session is not news either');
});

test('a reply typed mid-work reaches the pilot at the next tool call', async function (t) {
  const home = makeHome(t);
  const deck = await deckFor(t);
  const id = await postItem(deck.port, { title: 'Which port for the deck?' });
  await establish(home, deck);

  await replyInBrowser(deck.port, id, '4321 is fine, keep it.');

  const delivered = await toolCall(home, deck.port);
  assert.equal(delivered.code, 0);
  assert.equal(delivered.err, '');
  const context = contextOf(delivered);
  assert.match(context, /4321 is fine, keep it\./, 'the words the user typed');
  assert.match(context, new RegExp(id), 'the item to resolve');
  assert.match(context, /Which port for the deck\?/, 'and what it was about');
  assert.match(delivered.json.systemMessage, /deck/i, 'the user is told too');
  assert.equal(delivered.json.hookSpecificOutput.hookEventName, 'PostToolUse');
});

test("a reply's words are delivered once, and never quoted again", async function (t) {
  const home = makeHome(t);
  const deck = await deckFor(t);
  const id = await postItem(deck.port);
  await establish(home, deck);
  await replyInBrowser(deck.port, id, 'once is enough');

  assert.match(contextOf(await toolCall(home, deck.port)), /once is enough/);
  assert.doesNotMatch(contextOf(await toolCall(home, deck.port)), /once is enough/, 'a repeat names the thread, not the words (A1)');
  assert.doesNotMatch(contextOf(await toolCall(home, deck.port)), /once is enough/);
});

// --- an unanswered thread is said until it is answered (S3) ------------------

const STILL = 'still unanswered on the deck: ';

test('two tool uses after an unanswered reply both carry still unanswered: <id>', async function (t) {
  const home = makeHome(t);
  const deck = await deckFor(t);
  const id = await postItem(deck.port, { title: 'Which port for the deck?' });
  await establish(home, deck);
  await replyInBrowser(deck.port, id, 'use 4322');

  const first = contextOf(await toolCall(home, deck.port));
  assert.match(first, /use 4322/, 'the first gives the full notice');
  assert.ok(first.includes(id));
  assert.ok(!first.includes(STILL), 'and not the short line for a thread it has just quoted');

  const second = contextOf(await toolCall(home, deck.port));
  assert.ok(second.includes(STILL + id + ' "Which port for the deck?"'), 'the second names the thread: ' + second);
  assert.match(second, /deck_resolve/);
  assert.doesNotMatch(second, /use 4322/, 'the short line only');
});

test('a tool use after deck_reply on that thread says nothing', async function (t) {
  const home = makeHome(t);
  const deck = await deckFor(t);
  const id = await postItem(deck.port);
  await establish(home, deck);
  await replyInBrowser(deck.port, id, 'use 4322');
  await toolCall(home, deck.port);
  assert.ok(contextOf(await toolCall(home, deck.port)).includes(STILL + id));

  await api(deck.port, 'deck_reply', { id: id, text: '4322 collides with the debugger. Still 4321?' });
  assert.equal((await toolCall(home, deck.port)).out, '');
});

test('a tool use after deck_resolve on that thread says nothing', async function (t) {
  const home = makeHome(t);
  const deck = await deckFor(t);
  const id = await postItem(deck.port);
  await establish(home, deck);
  await replyInBrowser(deck.port, id, 'use 4322');
  await toolCall(home, deck.port);
  assert.ok(contextOf(await toolCall(home, deck.port)).includes(STILL + id));

  await api(deck.port, 'deck_resolve', { id: id, resolution: 'moved the deck to 4322' });
  assert.equal((await toolCall(home, deck.port)).out, '');
});

test('a reply on a QA-owned thread is never repeated to the pilot', async function (t) {
  const home = makeHome(t);
  const deck = await deckFor(t);
  const id = await postItem(deck.port, { kind: 'walkthrough', author: 'pilot:pilot-qa' });
  await establish(home, deck);
  await replyInBrowser(deck.port, id, 'Step two fails.');

  assert.equal((await toolCall(home, deck.port)).out, '');
  assert.equal((await toolCall(home, deck.port)).out, '');
});

test('the Stop gate holds on exactly the threads the repeat names', async function (t) {
  const home = makeHome(t);
  const deck = await deckFor(t);
  const one = await postItem(deck.port, { title: 'Port?' });
  const two = await postItem(deck.port, { title: 'Name?' });
  const pushed = await postItem(deck.port, { title: 'Colour?' });
  const qa = await postItem(deck.port, { kind: 'walkthrough', title: 'Try it', author: 'pilot:pilot-qa' });
  await establish(home, deck);
  for (const id of [one, two, pushed, qa]) await replyInBrowser(deck.port, id, 'an answer');
  await api(deck.port, 'deck_reply', { id: pushed, text: 'Blue or green?' });
  await toolCall(home, deck.port);

  const ids = function (text) { return (text.match(/itm_[0-9a-f]+/g) || []).filter(function (id, at, all) { return all.indexOf(id) === at; }).sort(); };
  const repeated = ids(contextOf(await toolCall(home, deck.port)));
  const held = await stopping(home, deck.port);
  assert.equal(held.json.decision, 'block');
  assert.deepEqual(repeated, [one, two].sort());
  assert.deepEqual(ids(held.json.reason), repeated, 'one rule, both callers');
});

test('a deck that fails the read says nothing more than it does today', async function (t) {
  const lib = require('../lib/deck.js');
  const saved = Object.assign({}, lib);
  t.after(function () { Object.assign(lib, saved); });
  const reply = { itemId: 'itm_r', title: 'Port?', text: 'use 4322', seq: 5, owner: 'pilot', kind: 'question' };
  lib.readState = function () { return { baseline: 1, cursor: 1 }; };
  lib.readPosted = function () { return []; };
  lib.advanceCursor = function () {};
  lib.claim = function () { return true; };
  lib.unclaim = function () {};
  let replies = [];
  lib.tool = async function (name) {
    if (name === 'deck_read') throw new Error('the deck fell over');
    return { replies: replies, seq: 5 };
  };

  assert.equal(await inbox.run({ session_id: 's', cwd: process.cwd() }), null, 'no notice, no throw');
  replies = [reply];
  const said = await inbox.run({ session_id: 's', cwd: process.cwd() });
  assert.equal(said.additionalContext, inbox.notice([reply]).additionalContext, 'the full notice, as today, and nothing more');
});

test('a fresh reply is quoted in full beside a short line for the thread still unanswered', async function (t) {
  const lib = require('../lib/deck.js');
  const saved = Object.assign({}, lib);
  t.after(function () { Object.assign(lib, saved); });
  const answered = function (id, kind, text, seq) {
    return { id: id, title: id.toUpperCase(), kind: kind, replies: [{ from: 'user', text: text, seq: seq }] };
  };
  const fresh = { itemId: 'itm_a', title: 'ITM_A', text: 'fresh words on a', seq: 6, owner: 'pilot', kind: 'question' };
  let open = [answered('itm_a', 'question', 'fresh words on a', 6), answered('itm_b', 'question', 'older words on b', 3)];
  const reads = [];
  lib.readState = function () { return { baseline: 1, cursor: 1 }; };
  lib.readPosted = function () { return []; };
  lib.advanceCursor = function () {};
  lib.claim = function () { return true; };
  lib.unclaim = function () {};
  lib.tool = async function (name, args) {
    if (name === 'deck_read') { reads.push(args); return { items: open }; }
    return { replies: [fresh], seq: 6 };
  };

  const said = await inbox.run({ session_id: 's', cwd: process.cwd() });

  // session-row L6: a code reader reads whole threads, so the read names `messages: 'all'`.
  assert.deepEqual(reads, [{ open: true, limit: lib.OPEN_READ_LIMIT, messages: 'all' }], 'the repeat reads the open items, with no repo (L5)');
  assert.match(said.additionalContext, /fresh words on a/, 'the fresh reply is quoted in full');
  assert.ok(said.additionalContext.includes(STILL + 'itm_b "ITM_B"'), 'the thread still unanswered is named');
  assert.ok(!said.additionalContext.includes(STILL + 'itm_a'), 'the thread just quoted is not repeated');
  assert.ok(!said.additionalContext.endsWith(GATE_SENTENCE), 'no gate, no gate sentence');

  open = [answered('itm_a', 'question', 'fresh words on a', 6), answered('itm_b', 'gate1', 'i sign off', 3)];
  const gated = await inbox.run({ session_id: 's', cwd: process.cwd() });
  assert.ok(gated.additionalContext.includes(STILL + 'itm_b "ITM_B"'));
  assert.ok(gated.additionalContext.endsWith(GATE_SENTENCE), 'an unsigned gate ends the repeat with the gate sentence');
});

test('parallel tool calls deliver one reply exactly once', async function (t) {
  const home = makeHome(t);
  const deck = await deckFor(t);
  const id = await postItem(deck.port);
  await establish(home, deck);
  await replyInBrowser(deck.port, id, 'said once');

  const results = await Promise.all([
    toolCall(home, deck.port),
    toolCall(home, deck.port),
    toolCall(home, deck.port),
    toolCall(home, deck.port),
  ]);

  const spoke = results.filter(function (r) { return /said once/.test(contextOf(r)); });
  assert.equal(spoke.length, 1, 'a turn with parallel tool calls spawns several copies of the hook');
});

test('a crew agent is not the pilot, and does not eat its reply', async function (t) {
  const home = makeHome(t);
  const deck = await deckFor(t);
  const id = await postItem(deck.port);
  await establish(home, deck);
  await replyInBrowser(deck.port, id, 'meant for the pilot');

  // A subagent's tool call carries the session's own id and an agent_id beside it.
  const subagent = await toolCall(home, deck.port, { agent_id: 'agt_1234' });
  assert.equal(contextOf(subagent), '', 'the reply is not delivered into a subagent');

  assert.match(contextOf(await toolCall(home, deck.port)), /meant for the pilot/, 'it is still there for the pilot');
});

test('a session in a repository with no run on the deck is left alone', async function (t) {
  const home = makeHome(t);
  const deck = await deckFor(t);
  const id = await postItem(deck.port);
  await registerRun(deck.port, path.join(os.tmpdir(), 'some-other-repository'));

  // The reply comes after the first tool call, deliberately. That call is where a
  // session takes its place on the deck, so a session wrongly given one would be
  // reading from before the reply: the cursor cannot be what hides it here, and
  // the join on the repository is the only thing left keeping it out.
  const first = await toolCall(home, deck.port);
  assert.equal(first.out, '');

  await replyInBrowser(deck.port, id, 'somebody else is being asked');

  const second = await toolCall(home, deck.port);
  assert.equal(second.out, '', 'a Claude session that is not a run on this deck hears nothing');
});

test('a reply on another repository\'s thread is not this session\'s to receive', async function (t) {
  const home = makeHome(t);
  const deck = await deckFor(t);
  const elsewhere = path.join(os.tmpdir(), 'some-other-repository');
  const theirs = await postItem(deck.port, { repo: elsewhere, title: 'Their deck port' });
  const mine = await postItem(deck.port, { repo: home, title: 'My deck port' });
  await establish(home, deck);

  await replyInBrowser(deck.port, theirs, 'not for you');
  await replyInBrowser(deck.port, mine, 'this one is yours');

  const context = contextOf(await toolCall(home, deck.port));
  assert.match(context, /this one is yours/, 'the item posted from this repository');
  assert.doesNotMatch(context, /not for you/, 'and not the one posted from another');
});

test('a reply this session never received is not recorded as having reached it', async function (t) {
  // The other half of the same join, and the half the user reads: the bar on a
  // card says "the pilot has it" off the deck's own record of the hand-off, so a
  // hook that waits for the whole machine tells the run next door that a session
  // has words nothing of theirs ever saw.
  const home = makeHome(t);
  const deck = await deckFor(t);
  const elsewhere = path.join(os.tmpdir(), 'some-other-repository');
  const theirs = await postItem(deck.port, { repo: elsewhere, title: 'Their thread' });
  const mine = await postItem(deck.port, { repo: home, title: 'My thread' });
  await establish(home, deck);
  await replyInBrowser(deck.port, theirs, 'not for you');
  await replyInBrowser(deck.port, mine, 'this one is yours');

  await toolCall(home, deck.port);

  assert.equal(handedOver(deck, mine), true, 'what this session was handed is recorded');
  assert.equal(handedOver(deck, theirs), false, 'and the other run\'s reply is not');
});

test('another repository\'s chatter does not starve this one\'s reply', async function (t) {
  const home = makeHome(t);
  const deck = await deckFor(t);
  const elsewhere = path.join(os.tmpdir(), 'some-other-repository');
  const theirs = await postItem(deck.port, { repo: elsewhere, title: 'Their thread' });
  await establish(home, deck);

  // More than one wait hands back (the deck's own limit is twenty), so a hook
  // that never read past what is not its own would sit behind these for good.
  for (let i = 0; i < 25; i += 1) await replyInBrowser(deck.port, theirs, 'theirs ' + i);

  const mine = await postItem(deck.port, { repo: home, title: 'My thread' });
  await replyInBrowser(deck.port, mine, 'mine, at last');

  let seen = '';
  for (let i = 0; i < 3 && !/mine, at last/.test(seen); i += 1) {
    seen = contextOf(await toolCall(home, deck.port));
  }
  assert.match(seen, /mine, at last/, 'the reply is behind twenty-five of theirs and still arrives');
});

test('a deck that is not answering lets the session carry on, and says so once', async function (t) {
  const home = makeHome(t);
  const deck = await deckFor(t);
  await establish(home, deck);
  await deck.stop();

  const first = await toolCall(home, deck.port);
  assert.equal(first.code, 0, 'a deck that is down never fails a tool call');
  assert.match(contextOf(first), /deck/i);
  assert.match(contextOf(first), /deck_wait|not answering|unreachable/i);

  const second = await toolCall(home, deck.port);
  assert.equal(second.out, '', 'said once, not after every tool call for the rest of the session');
});

test('a session that never reached the deck says nothing when it is down', async function (t) {
  const home = makeHome(t);
  const port = await freePort();

  const first = await toolCall(home, port);
  assert.equal(first.out, '', 'every Claude session on this machine runs this hook');
  assert.equal(first.code, 0);
  assert.equal(first.err, '');
});

// --- the pilot cannot go idle unread ---------------------------------------

test('a stop with an answer the pilot has not resolved is blocked, and the reason names it', async function (t) {
  const home = makeHome(t);
  const deck = await deckFor(t);
  const id = await postItem(deck.port, { title: 'Which port for the deck?' });
  await establish(home, deck);
  await replyInBrowser(deck.port, id, 'not 4321, use 4322');

  const blocked = await stopping(home, deck.port);
  assert.equal(blocked.code, 0, 'the block is a decision, not a crash');
  assert.equal(blocked.json.decision, 'block');
  assert.match(blocked.json.reason, new RegExp(id), 'the item is named');
  assert.match(blocked.json.reason, /Which port for the deck\?/);
  assert.match(blocked.json.reason, /not 4321, use 4322/, 'and what the user actually said');
  assert.match(blocked.json.reason, /deck_resolve/, 'and the way out');
  // One deck serves every run on the machine and an item carries no run of its
  // own, so a pilot can be shown a thread another session posted. It must be
  // told to say so rather than to close somebody else's argument.
  assert.match(blocked.json.reason, /another session|never posted/, 'and what to do when it is not yours');
});

test('a stop is released once the pilot resolves the thread', async function (t) {
  const home = makeHome(t);
  const deck = await deckFor(t);
  const id = await postItem(deck.port);
  await establish(home, deck);
  await replyInBrowser(deck.port, id, 'use 4322');
  assert.equal((await stopping(home, deck.port)).json.decision, 'block');

  await api(deck.port, 'deck_resolve', { id: id, resolution: 'moved the deck to 4322' });

  const released = await stopping(home, deck.port);
  assert.equal(released.out, '', 'a thread the pilot has closed never blocks a stop again');
});

test('a thread the pilot has pushed back on is the user\'s turn, not the pilot\'s', async function (t) {
  const home = makeHome(t);
  const deck = await deckFor(t);
  const id = await postItem(deck.port);
  await establish(home, deck);
  await replyInBrowser(deck.port, id, 'use 4322');
  await api(deck.port, 'deck_reply', { id: id, text: '4322 collides with the debugger. Still 4321?' });

  const released = await stopping(home, deck.port);
  assert.equal(released.out, '', 'the pilot is waiting on the user, which is what deck_wait is for');
});

test('a stop already blocked once is never blocked again', async function (t) {
  const home = makeHome(t);
  const deck = await deckFor(t);
  const id = await postItem(deck.port);
  await establish(home, deck);
  await replyInBrowser(deck.port, id, 'use 4322');

  const again = await stopping(home, deck.port, { stop_hook_active: true });
  assert.equal(again.out, '', 'a gate that fires twice in a row is a trap');
});

test('a turn of a `pilot run` session that ends is stamped for its wrapper, and a held one is not', async function (t) {
  // What `deck/run.mjs` waits on before it types a /clear (2026-09-29).
  const home = makeHome(t);
  const deck = await deckFor(t);
  const id = await postItem(deck.port);
  await establish(home, deck);
  await replyInBrowser(deck.port, id, 'use 4322');
  const run = { PILOT_RUN_PID: '4242', PILOT_RUN_REPO: home, CLAUDE_PROJECT_DIR: '' };
  const stamp = path.join(home, '.claude', 'pilot-inbox', 'claims', 'turn-ended-4242.stamp');

  assert.equal((await stopping(home, deck.port, {}, run)).json.decision, 'block');
  assert.equal(fs.existsSync(stamp), false, 'a held turn has not ended');

  const before = Date.now();
  await stopping(home, deck.port, { stop_hook_active: true }, run);
  assert.ok(Number(fs.readFileSync(stamp, 'utf8')) >= before, 'the turn that ends is stamped with when');

  // The shell drifts into a worktree while the pilot integrates; the project does not.
  fs.rmSync(stamp);
  const drifted = { stop_hook_active: true, cwd: path.join(home, 'elsewhere') };
  await stopping(home, deck.port, drifted, Object.assign({}, run, { CLAUDE_PROJECT_DIR: home }));
  assert.ok(fs.existsSync(stamp), 'the session is known by its project, not its shell\'s directory');

  fs.rmSync(stamp);
  await stopping(home, deck.port, drifted, run);
  await stopping(home, deck.port, { stop_hook_active: true }, {});
  assert.equal(fs.existsSync(stamp), false, 'a session elsewhere, or not under `pilot run`, is not the wrapper\'s');
});

test('an answer that predates the session does not block its stop', async function (t) {
  const home = makeHome(t);
  const deck = await deckFor(t);
  const id = await postItem(deck.port);
  await replyInBrowser(deck.port, id, 'answered last week, never resolved');
  await establish(home, deck);

  const released = await stopping(home, deck.port);
  assert.equal(released.out, '', 'a stale thread must not hold every later session hostage');
});

test('a deck that is not answering never traps the pilot', async function (t) {
  const home = makeHome(t);
  const deck = await deckFor(t);
  const id = await postItem(deck.port);
  await establish(home, deck);
  await replyInBrowser(deck.port, id, 'use 4322');
  await deck.stop();

  const stop = await stopping(home, deck.port);
  assert.equal(stop.code, 0);
  assert.ok(
    stop.json === null || stop.json.decision !== 'block',
    'a deck that is down must never be able to stop the pilot stopping'
  );
});

test('a session that is not on the deck is never blocked from stopping', async function (t) {
  const home = makeHome(t);
  const deck = await deckFor(t);
  const id = await postItem(deck.port);
  await registerRun(deck.port, path.join(os.tmpdir(), 'some-other-repository'));

  // The tool call comes first for the same reason it does above: a session that
  // had wrongly taken its place on the deck would hold a baseline older than the
  // reply, and would then be held by it.
  assert.equal((await toolCall(home, deck.port)).out, '');
  await replyInBrowser(deck.port, id, 'somebody else is being asked');

  const stop = await stopping(home, deck.port);
  assert.equal(stop.out, '');
});

test('an item another repository posted does not block this session\'s stop', async function (t) {
  const home = makeHome(t);
  const deck = await deckFor(t);
  const elsewhere = path.join(os.tmpdir(), 'some-other-repository');
  const theirs = await postItem(deck.port, { repo: elsewhere, title: 'Their thread' });
  await establish(home, deck);
  await replyInBrowser(deck.port, theirs, 'answered, in another repository');

  const released = await stopping(home, deck.port);
  assert.equal(released.out, '', 'a pilot in one repository is not held by another repository\'s thread');
  assert.equal(
    handedOver(deck, theirs),
    false,
    'and the gate, which reads the whole deck, hands another run\'s reply to nobody',
  );

  const mine = await postItem(deck.port, { repo: home, title: 'My thread' });
  await replyInBrowser(deck.port, mine, 'answered here');

  const blocked = await stopping(home, deck.port);
  assert.equal(blocked.json.decision, 'block', 'its own repository\'s thread still holds it');
  assert.match(blocked.json.reason, new RegExp(mine));
  assert.doesNotMatch(blocked.json.reason, new RegExp(theirs), 'and names only its own');
});

// --- a chat message holds the gate exactly like any other reply (S3, L21) --

test('a chat message the pilot has not answered still holds its turn end (spec 8)', async function (t) {
  const home = makeHome(t);
  const deck = await deckFor(t);
  await establish(home, deck);
  const id = await seedChat(deck, home);
  await replyInBrowser(deck.port, id, 'are you there?');

  const blocked = await stopping(home, deck.port);
  assert.equal(blocked.json.decision, 'block', 'a user-last chat holds the gate like any user-last thread');
  assert.match(blocked.json.reason, new RegExp(id), 'the chat is named the way any other item is');
  assert.match(blocked.json.reason, /are you there\?/);
});

test('a chat the pilot has answered does not hold its turn end', async function (t) {
  const home = makeHome(t);
  const deck = await deckFor(t);
  await establish(home, deck);
  const id = await seedChat(deck, home);
  await replyInBrowser(deck.port, id, 'are you there?');
  await api(deck.port, 'deck_reply', { id: id, text: 'yes, here.' });

  const released = await stopping(home, deck.port);
  assert.equal(released.out, '', 'a pilot-last chat is the ordinary released state, same as any other thread');
});

// --- a user thread, a created chat until 2026-09-28, is the pilot's as it was ---

test('a user thread\'s message reaches the pilot at the next tool call, as a created chat\'s did', async function (t) {
  const home = makeHome(t);
  const deck = await deckFor(t);
  await establish(home, deck);
  const thread = await seedUserThread(deck, home);
  assert.equal(thread.kind, 'user', 'Create makes a user thread now');

  await replyInBrowser(deck.port, thread.id, 'look at the cache');

  const context = contextOf(await toolCall(home, deck.port));
  assert.match(context, /look at the cache/);
  assert.match(context, new RegExp(thread.id));
});

test('a user thread holds the stop until the pilot answers it with deck_reply', async function (t) {
  const home = makeHome(t);
  const deck = await deckFor(t);
  await establish(home, deck);
  const thread = await seedUserThread(deck, home);
  await replyInBrowser(deck.port, thread.id, 'are you there?');
  const blocked = await stopping(home, deck.port);
  assert.equal(blocked.json.decision, 'block', 'held exactly as a created chat was');
  assert.match(blocked.json.reason, new RegExp(thread.id));

  // Only the user closes a user thread (ADR 0109); the pilot's answer is what releases the stop.
  await api(deck.port, 'deck_reply', { id: thread.id, text: 'here' });

  const released = await stopping(home, deck.port);
  assert.equal(released.out, '', 'a pilot-last user thread never holds a stop');
});

// --- a gate passes only on its Sign off press (merge-first spec 6, L7, L12) --

const GATE_SENTENCE = 'A gate passes only on its Sign off press: reply with deck_reply asking for it; never deck_resolve it unsigned.';

/** A live ticket and the gate1 naming it, made through the store the way `seedUserThread` is. */
async function seedGate1(deck, repo) {
  const previous = process.env.PILOT_DECK_DIR;
  process.env.PILOT_DECK_DIR = deck.dir;
  try {
    const store = await import('../../deck/store.mjs');
    const { shapedTicketBody, takeLive } = await import('../../deck/testUtils.mjs');
    const ticket = store.postItem({ kind: 'ticket', title: 'The ticket', body: shapedTicketBody(), repo: repo, sliceCount: 60 });
    takeLive(ticket.id);
    return store.postItem({
      kind: 'gate1', title: 'Gate 1', body: 'The design.', repo: repo, ticket: ticket.id,
      artefact: 'docs/design/x/architecture.md', sha: '0305827', locked: 3, slices: '| S1 |', sliceCount: 3, branch: 'feat/x',
    });
  } finally {
    if (previous === undefined) delete process.env.PILOT_DECK_DIR;
    else process.env.PILOT_DECK_DIR = previous;
  }
}

test('the inbox notice on a gate reply asks for the press and does not say close it with deck_resolve', function () {
  for (const kind of ['gate1', 'gate2']) {
    const said = inbox.notice([{ itemId: 'itm_g', title: 'Gate', text: 'i sign off', owner: 'pilot', kind: kind, seq: 3 }]).additionalContext;
    assert.ok(said.includes(GATE_SENTENCE), kind + ': the gate sentence');
    assert.doesNotMatch(said, /close it with deck_resolve|cannot end/, kind + ': no resolve, no held turn');
  }
  const mixed = inbox.notice([
    { itemId: 'itm_g', title: 'Gate', text: 'i sign off', owner: 'pilot', kind: 'gate1', seq: 3 },
    { itemId: 'itm_q', title: 'Port?', text: '4322', owner: 'pilot', kind: 'question', seq: 4 },
  ]).additionalContext;
  assert.ok(mixed.includes(GATE_SENTENCE), 'the gate keeps its sentence beside a question');
  assert.match(mixed, /That thread is still open: close it with deck_resolve/, 'and only the question is counted to close');
});

test('the stop gate\'s reason on a gate item asks for the press', function () {
  const reason = stopGate.reasonFor([{ id: 'itm_g', title: 'Gate 1', kind: 'gate1', replies: [{ from: 'user', text: 'i sign off', seq: 3 }] }]);
  assert.ok(reason.includes(GATE_SENTENCE), 'the gate sentence');
  assert.doesNotMatch(reason, /close the thread with deck_resolve/, 'not the close');
  const plain = stopGate.reasonFor([{ id: 'itm_q', title: 'Port?', kind: 'question', replies: [{ from: 'user', text: '4322', seq: 3 }] }]);
  assert.ok(!plain.includes(GATE_SENTENCE), 'a question keeps its close');
  assert.match(plain, /deck_resolve/);
});

test('a pressed Sign off on a gate is closed with deck_resolve, in both hooks', function () {
  const said = inbox.notice([{ itemId: 'itm_g', title: 'Gate', text: 'Sign off', owner: 'pilot', kind: 'gate1', seq: 3 }]).additionalContext;
  assert.ok(!said.includes(GATE_SENTENCE), 'pressed: nothing to ask for');
  assert.doesNotMatch(said, /QA's walkthrough/, 'a pilot-owned gate1 is not the walkthrough of QA');
  assert.match(said, /close it with deck_resolve/);
  const reason = stopGate.reasonFor([{ id: 'itm_g', title: 'Gate 1', kind: 'gate1', replies: [{ from: 'user', text: 'Sign off\n\nship it', seq: 3 }] }]);
  assert.ok(!reason.includes(GATE_SENTENCE), 'a press with a note is a press');
  assert.match(reason, /close the thread with deck_resolve/);
  const mixed = stopGate.reasonFor([
    { id: 'itm_g', title: 'Gate 1', kind: 'gate1', replies: [{ from: 'user', text: 'i sign off', seq: 3 }] },
    { id: 'itm_q', title: 'Port?', kind: 'question', replies: [{ from: 'user', text: '4322', seq: 4 }] },
  ]);
  assert.ok(mixed.includes(GATE_SENTENCE), 'the typed gate asks for the press');
  assert.match(mixed, /close the thread with deck_resolve/, 'and the question keeps its close');
});

// The closing text counts only the threads to close (principles review, fix 6).
test('the stop gate closing text with two unsigned gates leaves the turn to the press', function () {
  const reason = stopGate.reasonFor([
    { id: 'itm_g1', title: 'Gate 1', kind: 'gate1', replies: [{ from: 'user', text: 'i sign off', seq: 3 }] },
    { id: 'itm_g2', title: 'Gate 2', kind: 'gate2', replies: [{ from: 'user', text: 'looks good', seq: 4 }] },
  ]);
  assert.match(reason, /Once you have replied, the turn may end — the press is the user's move to make next\./);
  assert.doesNotMatch(reason, /deck_resolve saying what was decided/, 'nothing to close');
});

test('the stop gate closing text with a gate among other threads closes each of the others', function () {
  const reason = stopGate.reasonFor([
    { id: 'itm_g', title: 'Gate 1', kind: 'gate1', replies: [{ from: 'user', text: 'i sign off', seq: 3 }] },
    { id: 'itm_q', title: 'Port?', kind: 'question', replies: [{ from: 'user', text: '4322', seq: 4 }] },
    { id: 'itm_r', title: 'Name?', kind: 'question', replies: [{ from: 'user', text: 'deck', seq: 5 }] },
  ]);
  assert.match(reason, /Act on them now, then close each thread with deck_resolve saying what was decided\./);
  assert.doesNotMatch(reason, /the turn may end — the press/);
});

test('a typed approval on a gate1 holds the stop with the gate sentence, and a deck_reply asking for the press ends the turn', async function (t) {
  const home = makeHome(t);
  const deck = await deckFor(t);
  await establish(home, deck);
  const gate = await seedGate1(deck, home);
  await replyInBrowser(deck.port, gate.id, 'i sign off');

  const blocked = await stopping(home, deck.port);
  assert.equal(blocked.json.decision, 'block');
  assert.ok(blocked.json.reason.includes(GATE_SENTENCE), 'the stop asks for the press');

  await api(deck.port, 'deck_reply', { id: gate.id, text: 'Press Sign off on it, please; typed words do not pass a gate.' });
  const released = await stopping(home, deck.port);
  assert.equal(released.out, '', 'the reply asking for the press ends the turn; the gate stays open');
});

// --- the pilot cannot go idle on its own unanswered question ----------------
//
// The defect of 2026-09-16. The pilot posted a question, parked three times on
// a wait capped at two minutes, then ended its turn with a status line; the
// user answered fourteen minutes later into a session that had stopped
// listening, and nothing said a word until they came to the terminal to ask
// why. Every rule above this line is about a reply that has already arrived,
// so none of them fires on the case where the deck is quiet because the human
// has not typed yet — which is the whole of the time a pilot spends waiting.

const after = function (ms) {
  return new Promise(function (resolve) { setTimeout(resolve, ms); });
};

/**
 * An item posted by *this* session, joined to it the way the hooks join it: the
 * PostToolUse lane reads the id out of the `deck_post` it watched the session
 * make. The repository is deliberately somewhere else, because the path join is
 * the fragile one. A run registers the directory `claude` was launched in, and
 * on 2026-09-16 that was a parent of the repository the session was working in,
 * so it matched nothing. Nothing here may lean on those two paths agreeing.
 */
async function postedHere(home, deck, overrides) {
  const id = await postItem(deck.port, Object.assign(
    { repo: path.join(os.tmpdir(), 'not-the-path-this-session-runs-in') },
    overrides
  ));
  const noted = await toolCall(home, deck.port, {
    tool_name: 'mcp__plugin_pilot_deck__deck_post',
    tool_response: { content: [{ type: 'text', text: 'Posted ' + id + ' to the deck.' }] },
  });
  assert.equal(noted.code, 0);
  return id;
}

test('a stop on a question nobody has answered waits, and the answer ends the wait', async function (t) {
  const home = makeHome(t);
  const deck = await deckFor(t);
  await establish(home, deck);
  const id = await postedHere(home, deck, { title: 'Which port for the deck?' });

  const held = stopping(home, deck.port, {}, { PILOT_STOP_HOLD_MS: '30000' });
  await after(1200);
  await replyInBrowser(deck.port, id, 'not 4321, use 4322');

  const blocked = await held;
  assert.equal(blocked.code, 0, 'the block is a decision, not a crash');
  assert.equal(blocked.json.decision, 'block');
  assert.match(blocked.json.reason, /not 4321, use 4322/, 'the answer itself is the wake-up');
  assert.match(blocked.json.reason, new RegExp(id), 'and the thread it was typed on is named');
});

test('a question still unanswered when the wait runs out sends the pilot to a background pilot wait', async function (t) {
  const home = makeHome(t);
  const deck = await deckFor(t);
  await establish(home, deck);
  const id = await postedHere(home, deck, { title: 'Which port for the deck?' });

  const started = Date.now();
  const blocked = await stopping(home, deck.port, {}, { PILOT_STOP_HOLD_MS: '1500' });

  assert.ok(Date.now() - started >= 1400, 'it waited on the user rather than refusing at once');
  assert.equal(blocked.json.decision, 'block');
  assert.match(blocked.json.reason, new RegExp(id), 'the item is named');
  assert.match(blocked.json.reason, /Which port for the deck\?/);
  assert.match(blocked.json.reason, /pilot wait/, 'and the pilot is sent to a background wait');
});

test('a question the pilot has closed never holds its stop', async function (t) {
  const home = makeHome(t);
  const deck = await deckFor(t);
  await establish(home, deck);
  const id = await postedHere(home, deck);
  await api(deck.port, 'deck_resolve', { id: id, resolution: 'settled on 4321' });

  const started = Date.now();
  const released = await stopping(home, deck.port, {}, { PILOT_STOP_HOLD_MS: '30000' });

  assert.equal(released.out, '', 'nothing is open, so there is nothing to wait for');
  assert.ok(Date.now() - started < 20000, 'and it did not sit out the wait to say so');
});

test('a stop already held once is let through rather than held again', async function (t) {
  const home = makeHome(t);
  const deck = await deckFor(t);
  await establish(home, deck);
  await postedHere(home, deck);

  const started = Date.now();
  const again = await stopping(
    home, deck.port, { stop_hook_active: true }, { PILOT_STOP_HOLD_MS: '30000' }
  );

  assert.equal(again.out, '', 'a gate that fires twice in a row is a trap');
  assert.ok(Date.now() - started < 20000, 'and it does not hold the turn open to say nothing');
});

test('a deck that is not answering never holds the pilot on its own question', async function (t) {
  const home = makeHome(t);
  const deck = await deckFor(t);
  await establish(home, deck);
  await postedHere(home, deck);
  await deck.stop();

  const started = Date.now();
  const stop = await stopping(home, deck.port, {}, { PILOT_STOP_HOLD_MS: '30000' });

  assert.equal(stop.code, 0);
  assert.ok(
    stop.json === null || stop.json.decision !== 'block',
    'a deck that is down must never be able to stop the pilot stopping'
  );
  assert.ok(Date.now() - started < 20000, 'nor to hold its turn open waiting for it');
});

test('the same unanswered question is waited on once, not at the end of every turn', async function (t) {
  const home = makeHome(t);
  const deck = await deckFor(t);
  await establish(home, deck);
  const id = await postedHere(home, deck, { title: 'Which port for the deck?' });

  const told = await stopping(home, deck.port, {}, { PILOT_STOP_HOLD_MS: '1200' });
  assert.equal(told.json.decision, 'block', 'the first time, it is said');

  // `stop_hook_active` is false again on the next stop after a new user prompt,
  // so it is not what stops this repeating. Nothing has been answered and the
  // thread is still open — and the pilot has already been told about it.
  const started = Date.now();
  const again = await stopping(home, deck.port, {}, { PILOT_STOP_HOLD_MS: '30000' });

  assert.equal(again.out, '', 'the second time, it stands aside as the refusal promised it would');
  assert.ok(
    Date.now() - started < 20000,
    'and it stands aside without holding the turn open for the whole wait first'
  );
  assert.match(told.json.reason, new RegExp(id));
});

test('a question already waited on once still wakes the pilot when it is answered', async function (t) {
  const home = makeHome(t);
  const deck = await deckFor(t);
  await establish(home, deck);
  const id = await postedHere(home, deck);
  assert.equal((await stopping(home, deck.port, {}, { PILOT_STOP_HOLD_MS: '1200' })).json.decision, 'block');

  // Standing aside on the waiting is not standing aside on the answer: the
  // unread-reply gate is a different question and must still fire.
  await replyInBrowser(deck.port, id, 'use 4322');

  const blocked = await stopping(home, deck.port);
  assert.equal(blocked.json.decision, 'block');
  assert.match(blocked.json.reason, /use 4322/);
});

test('an absurd item id in a tool result is never written to a session\'s record', async function (t) {
  const home = makeHome(t);
  const deck = await deckFor(t);
  await establish(home, deck);
  await toolCall(home, deck.port, {
    tool_name: 'mcp__plugin_pilot_deck__deck_post',
    tool_response: {
      content: [{ type: 'text', text: 'Posted itm_' + 'a'.repeat(5000) + ' to the deck.' }],
    },
  });

  assert.ok(
    !fs.existsSync(path.join(home, '.claude', 'pilot-inbox', 'session-a.posted.json')),
    'nothing that long is an id the deck ever made, so nothing is kept'
  );
});

test('the item id is read from the result text, never from the whole result object', function () {
  const shaped = { content: [{ type: 'text', text: 'Posted itm_abc123 to the deck.' }] };

  assert.equal(inbox.resultText(shaped), 'Posted itm_abc123 to the deck.');
  assert.equal(inbox.resultText('Posted itm_abc123'), 'Posted itm_abc123', 'a bare string is text too');
  assert.equal(inbox.resultText(undefined), '');
  assert.equal(inbox.resultText({ content: [] }), '');
  assert.equal(inbox.resultText({ content: [{ text: 42 }] }), '', 'and text has to be text');

  // The proof that the rest of the object is never serialised: this one cannot be.
  const circular = { content: [{ type: 'text', text: 'Posted itm_abc123 to the deck.' }] };
  circular.self = circular;
  assert.equal(inbox.resultText(circular), 'Posted itm_abc123 to the deck.');
});

test('a question closed while the gate is waiting lets the turn end', async function (t) {
  const home = makeHome(t);
  const deck = await deckFor(t);
  await establish(home, deck);
  const id = await postedHere(home, deck);

  const held = stopping(home, deck.port, {}, { PILOT_STOP_HOLD_MS: '30000' });
  await after(1200);
  // Another session, or the pilot's own next move: the thread stops being open
  // while this gate is still sitting on it. Waiting the rest of the hold out
  // would be holding the turn for an argument that is over.
  await api(deck.port, 'deck_resolve', { id: id, resolution: 'settled elsewhere' });

  const released = await held;
  assert.equal(released.out, '', 'the gate noticed the thread close and let go');
});

test('a deck that dies while the gate is waiting lets the turn end', async function (t) {
  const home = makeHome(t);
  const deck = await deckFor(t);
  await establish(home, deck);
  await postedHere(home, deck);

  const held = stopping(home, deck.port, {}, { PILOT_STOP_HOLD_MS: '30000' });
  await after(1200);
  await deck.stop();

  const stop = await held;
  assert.equal(stop.code, 0, 'the gate does not crash when the deck goes out from under it');
  assert.ok(
    stop.json === null || stop.json.decision !== 'block',
    'a deck that died mid-wait must not be able to trap the turn it was holding'
  );
});

test('an unanswered question this session never posted is not its to wait on', async function (t) {
  const home = makeHome(t);
  const deck = await deckFor(t);
  await establish(home, deck);
  // Its repository matches this session's cwd, which is the only join the older
  // gate had. That is not enough to make the pilot wait on somebody else's
  // argument: a second session in the same repository posted this one.
  await postItem(deck.port, { repo: home, title: 'Posted by another session here' });

  const started = Date.now();
  const released = await stopping(home, deck.port, {}, { PILOT_STOP_HOLD_MS: '30000' });

  assert.equal(released.out, '', 'this session never watched that item go out');
  assert.ok(Date.now() - started < 20000);
});

test('a question a crew agent posted is not the pilot\'s to wait on', async function (t) {
  const home = makeHome(t);
  const deck = await deckFor(t);
  await establish(home, deck);
  const id = await postItem(deck.port, { repo: home, title: 'The QA agent\'s walkthrough' });
  await toolCall(home, deck.port, {
    agent_id: 'agent-qa',
    tool_name: 'mcp__plugin_pilot_deck__deck_post',
    tool_response: { content: [{ type: 'text', text: 'Posted ' + id + ' to the deck.' }] },
  });

  const started = Date.now();
  const released = await stopping(home, deck.port, {}, { PILOT_STOP_HOLD_MS: '30000' });

  assert.equal(released.out, '', 'the agent that posted it is the one waiting on it');
  assert.ok(Date.now() - started < 20000);
});

// --- how much of the pilot's context either of them may take ----------------
//
// Everything in both messages arrives over HTTP from a port anything on this
// machine may write to (A6) and the store accepts 64KB a field, so a title, an
// id and a timestamp are as much the deck's word as the reply text is. The
// delivery is said once; the refusal is recomputed at every attempt to end the
// turn, which is what makes its overall bound the one that matters.

const huge = function (n) { return 'x'.repeat(n); };

test('a delivered reply cannot spend more of the context than its budget', function () {
  const said = inbox.notice([
    {
      itemId: 'itm_' + huge(5000),
      title: huge(70000),
      text: huge(70000),
      repliedAt: huge(5000),
      seq: 1,
    },
  ]);

  assert.ok(
    said.additionalContext.length <= inbox.MAX_NOTICE_CHARS + 64,
    'the notice is bounded whatever the deck answers with: ' + said.additionalContext.length
  );
  assert.ok(
    said.systemMessage.length <= inbox.MAX_TITLE_CHARS + 64,
    'and so is the line the user reads: ' + said.systemMessage.length
  );
});

test('a refused stop cannot spend more of the context than its budget', function () {
  const items = [];
  for (let i = 0; i < 20; i += 1) {
    items.push({
      id: 'itm_' + huge(5000),
      title: huge(70000),
      replies: [{ from: 'user', text: huge(70000), seq: i + 1 }],
    });
  }

  const reason = stopGate.reasonFor(items);
  assert.ok(
    reason.length <= stopGate.MAX_REASON_CHARS + 1024,
    'twenty threads at the deck\'s field limit still fit in the refusal: ' + reason.length
  );
});

// --- what the plugin registers ---------------------------------------------

const hooksJson = function () {
  return JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'hooks', 'hooks.json'), 'utf8'));
};

test('the plugin registers one PostToolUse process, and it is the shared one', function () {
  const post = hooksJson().hooks.PostToolUse;
  const hooks = post.flatMap(function (entry) { return entry.hooks || []; });

  assert.equal(hooks.length, 1, 'this runs after every tool call: one process, not one per lane');
  assert.match(hooks[0].command, /post-tool\.js/);
  assert.equal(hooks[0].type, 'command');
  assert.ok(hooks[0].timeout <= 10, 'and a short timeout');
});

test('the plugin registers the stop gate on Stop, with room to wait in', function () {
  const stop = hooksJson().hooks.Stop;
  const hooks = stop.flatMap(function (entry) { return entry.hooks || []; });

  assert.equal(hooks.length, 1);
  assert.match(hooks[0].command, /stop-gate\.js/);
  assert.equal(hooks[0].type, 'command');

  // This gate hangs on purpose, which is the reversal of 2026-09-16: waiting on
  // the user *is* the work, and a gate that answered in ten seconds was a pilot
  // that went silent. The harness's own default for a command hook is 600s
  // (https://code.claude.com/docs/en/hooks.md), and the hold has to finish
  // inside whatever is registered here or the decision never lands at all.
  assert.ok(
    hooks[0].timeout * 1000 > stopGate.HOLD_MS,
    'the gate would be killed at ' + hooks[0].timeout + 's, before its ' +
      stopGate.HOLD_MS + 'ms wait was over'
  );
  assert.ok(hooks[0].timeout <= 600, 'and no longer than the harness documents it will allow');
});

/** The inbox lane in-process, over a stubbed deck; nothing touches a home or a port. */
function stubbedLane(t, waited, read) {
  const lib = require('../lib/deck.js');
  const saved = Object.assign({}, lib);
  t.after(function () { Object.assign(lib, saved); });
  lib.readState = function () { return { baseline: 1, cursor: 1 }; };
  lib.readPosted = function () { return []; };
  lib.advanceCursor = function () {};
  lib.claim = function () { return true; };
  lib.unclaim = function () {};
  lib.tool = async function (name) { return name === 'deck_read' ? read() : waited; };
  return lib;
}

test('the repeat on an unsigned gate asks for the press, as the first notice did', async function (t) {
  const lib = stubbedLane(t, { replies: [], seq: 6 }, function () {
    return { items: [{ id: 'itm_g', kind: 'gate1', title: 'Gate 1', replies: [{ from: 'user', seq: 6, text: 'i approve' }] }] };
  });
  const said = await inbox.run({ session_id: 's', cwd: process.cwd() });
  assert.ok(said.additionalContext.includes(STILL + 'itm_g'));
  assert.ok(said.additionalContext.includes(lib.GATE_SENTENCE), 'never told to deck_resolve an unsigned gate');
});

test('an item the repeat cannot read never costs the pilot its full notice', async function (t) {
  const reply = { itemId: 'itm_r', title: 'Port?', text: 'use 4322', seq: 5, owner: 'pilot', kind: 'question' };
  stubbedLane(t, { replies: [reply], seq: 5 }, function () {
    return { items: [{ id: 'itm_bad', kind: 'question', replies: [null] }] };
  });
  const said = await inbox.run({ session_id: 's', cwd: process.cwd() });
  assert.equal(said.additionalContext, inbox.notice([reply]).additionalContext);
});

// --- a typed reply leaves a signed gate signed (gate-stays-signed spec 1, S2) --

test('a signed gate with a later typed reply gets no unsigned-gate sentence from the hooks', function () {
  const signed = { id: 'itm_g', title: 'Gate 2', kind: 'gate2', replies: [
    { from: 'user', text: 'Sign off', seq: 3 },
    { from: 'pilot', text: 'Landing it.' },
    { from: 'user', text: 'and tidy the branch after', seq: 4 },
  ] };
  const reason = stopGate.reasonFor([signed]);
  assert.ok(!reason.includes(GATE_SENTENCE), 'stop gate: the press stands');
  assert.match(reason, /close the thread with deck_resolve/);
  const typed = { itemId: 'itm_g', title: 'Gate 2', text: 'and tidy the branch after', owner: 'pilot', kind: 'gate2', seq: 4 };
  const said = inbox.notice([typed], [{ id: 'itm_decoy', title: 'Gate 1', kind: 'gate1', replies: [{ from: 'user', text: 'i approve', seq: 2 }] }, signed]).additionalContext;
  assert.ok(!said.includes(GATE_SENTENCE), 'inbox notice: the press stands');
  assert.match(said, /close it with deck_resolve/);

  const withdrawn = { ...signed, replies: signed.replies.concat([{ from: 'user', text: 'Not yet\n\nwait', seq: 5 }, { from: 'user', text: 'one more thing', seq: 6 }]) };
  assert.ok(stopGate.reasonFor([withdrawn]).includes(GATE_SENTENCE), 'stop gate: Sign off then Not yet is unsigned');
  const later = { ...typed, text: 'one more thing', seq: 6 };
  assert.ok(inbox.notice([later], [withdrawn]).additionalContext.includes(GATE_SENTENCE), 'inbox notice: Sign off then Not yet is unsigned');
});

test('a typed reply on a gate the read lacks gets no gate sentence; a fallback Not yet still does', function () {
  const typed = { itemId: 'itm_g', title: 'Gate 2', text: 'and tidy the branch after', owner: 'pilot', kind: 'gate2', seq: 4 };
  assert.ok(!inbox.notice([typed], []).additionalContext.includes(GATE_SENTENCE), 'read without the thread');
  assert.ok(!inbox.notice([typed], null).additionalContext.includes(GATE_SENTENCE), 'read failed');
  assert.ok(inbox.notice([{ ...typed, text: 'Not yet' }], []).additionalContext.includes(GATE_SENTENCE), 'a fallback Not yet is a press');
  const batch = [{ ...typed, text: 'Sign off', seq: 4 }, { ...typed, text: 'Not yet', seq: 5 }];
  assert.ok(inbox.notice(batch, []).additionalContext.includes(GATE_SENTENCE), 'a Sign off withdrawn in the same batch reads unsigned');
});

// --- a deck that is not this test's own (clean-landing S11) -----------------
//
// The one saved failure of the test at :471 took 48.9 ms and died on
// `fetch failed` / ECONNRESET in this process; a deck of this file's own takes
// 400 ms or more to answer its health. So something else on the probed port
// answered, and went away. This plants that something: a server on the port
// the probe hands out that answers /api/health as a deck with another pid and
// resets every other request.

test('a deck answering on the probed port that is not the one this test spawned is not taken for its own', async function (t) {
  const http = require('node:http');
  const stranger = http.createServer(function (request, response) {
    if (request.url === '/api/health') {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ ok: true, pid: process.pid }));
      return;
    }
    request.socket.resetAndDestroy();
  });
  await new Promise(function (resolve) { stranger.listen(0, '127.0.0.1', resolve); });
  t.after(function () {
    stranger.closeAllConnections();
    return new Promise(function (resolve) { stranger.close(resolve); });
  });
  const taken = stranger.address().port;

  // The next probe is told the stranger's port, as if it had been taken between the probe and the bind.
  const createServer = net.createServer;
  t.after(function () { net.createServer = createServer; });
  net.createServer = function () {
    net.createServer = createServer;
    const probe = createServer.apply(net, arguments);
    probe.address = function () { return { port: taken }; };
    return probe;
  };

  const deck = await deckFor(t);
  assert.match(await postItem(deck.port), /^itm_/);
  assert.notEqual(deck.port, taken, 'the stranger is not this test\'s deck');
});
