/**
 * S1 of start-end-session: Start opens a `pilot run` window on an ended tab (spec 1,
 * 2, 6; L2–L4, L6–L8). Nothing here ever starts a process: `startSession` is handed a
 * recorder for `spawn`, the route is handed a recorder for `startSession`, and
 * `PILOT_DECK_NO_START` (set by `./no-open.mjs`) refuses before any spawn otherwise.
 */

import './no-open.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { deckOnAPort, respelt, tempDeck } from '../testUtils.mjs';
import { PARENT_MARKERS, STARTING_MS, sessionEnv, startSession } from '../session.mjs';
import { renderHomePage } from '../ui/render.mjs';

const { DeckRefusal, addDeck, listDeckNumbers, listItems, postItem, registerRun, storedTabFor } = await import('../store.mjs');

const ALPHA = path.resolve('D:/work/alpha & co %PATH%');

/** A real directory of the test's own, added to the deck by path: an ended tab. */
const anAddedTab = (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pilot-start-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return addDeck(dir).repo;
};

/** A real directory of the test's own, named `name`, removed after it. */
const aDir = (t, name = 'repo') => {
  const dir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'pilot-start-')), name);
  fs.mkdirSync(dir);
  t.after(() => fs.rmSync(path.dirname(dir), { recursive: true, force: true }));
  return dir;
};

/** A `spawn` that records what it was asked and starts nothing; `fail` fires a child's `error`. */
const aRecorder = () => {
  const calls = [];
  const errorHandlers = [];
  const spawn = (command, args, options) => {
    calls.push({ command, args, options });
    return {
      on(event, handler) {
        if (event === 'error') errorHandlers.push(handler);
      },
      unref() {},
    };
  };
  return { calls, spawn, fail: (err) => errorHandlers.forEach((handler) => handler(err)) };
};

/** An environment the suite's own guard is not in, so the recorder is reached. */
const anEnv = (extra = {}) => ({ PATH: 'C:/Windows', ...extra });

/** Starts `repo` on a recorder, returning what was thrown, or nothing. */
const refusalOf = (repo, deps) => {
  try {
    startSession(repo, { platform: 'win32', env: anEnv(), ...deps });
    return null;
  } catch (err) {
    if (!(err instanceof DeckRefusal)) throw err;
    return err;
  }
};

/** Where a refused POST landed, and the reason it carries there. */
const landing = (response) => {
  const url = new URL(response.headers.get('location'), 'http://deck');
  return { run: url.searchParams.get('run'), reason: url.searchParams.get('sessionRefused') };
};

const post = (base, fields, origin = base) =>
  fetch(`${base}/start-session`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', ...(origin === null ? {} : { origin }) },
    body: new URLSearchParams(fields),
    redirect: 'manual',
  });

/** A deck on a port whose `startSession` is a recorder. */
const aDeck = async (t) => {
  const started = [];
  const base = await deckOnAPort(t, { start: (repo) => started.push(repo) });
  return { base, started };
};

const rightStrip = (page) =>
  page.slice(page.indexOf('<aside class="strip right">'), page.indexOf('</aside>', page.indexOf('strip right')));

/** The host's own `process.platform`, read once: a test that stubs twice restores to this, not to its own first stub. */
const HOST_PLATFORM = Object.getOwnPropertyDescriptor(process, 'platform');
const onPlatform = (t, platform) => {
  Object.defineProperty(process, 'platform', { ...HOST_PLATFORM, value: platform });
  t.after(() => Object.defineProperty(process, 'platform', HOST_PLATFORM));
};

test('the spawn carries the directory only as cwd', (t) => {
  const { calls, spawn } = aRecorder();
  const alpha = aDir(t, 'alpha & co %PATH%');

  startSession(alpha, { spawn, platform: 'win32', env: anEnv() });

  assert.equal(calls.length, 1);
  const [{ command, args, options }] = calls;
  // Absolute: a bare `cmd.exe` is looked up in `cwd` first, which is the repo's own.
  assert.equal(command, path.win32.join('C:/Windows','System32', 'cmd.exe'));
  assert.deepEqual(args.slice(0, 4), ['/d', '/c', 'start', '"pilot run"']);
  assert.equal(args.at(-1), 'run');
  assert.equal(args[4], `"${process.execPath}"`);
  assert.match(args[5], /bin[\\/]pilot\.mjs"$/);
  for (const arg of [command, ...args]) {
    assert.ok(!arg.includes(alpha), `${arg} carries the repo`);
  }
  assert.equal(options.cwd, alpha);
  assert.equal(options.shell, false);
  assert.equal(options.detached, true);
  assert.equal(options.windowsHide, true);
  assert.equal(options.stdio, 'ignore');
  assert.equal(options.windowsVerbatimArguments, true, 'the quoted words reach cmd as they are');
});

test("sessionEnv drops the parent session's markers", (t) => {
  // L4's list, written out: a test built from the export alone passes whatever it holds.
  assert.deepEqual(PARENT_MARKERS, [
    'CLAUDECODE',
    'CLAUDE_PROJECT_DIR',
    'CLAUDE_CODE_ENTRYPOINT',
    'CLAUDE_CODE_SSE_PORT',
    'CLAUDE_CODE_CHILD_SESSION',
    'CLAUDE_CODE_AGENT',
    'CLAUDE_CODE_SESSION_ID',
    'CLAUDE_CODE_SESSION_ATTENDED',
    'CLAUDE_CODE_MESSAGING_SOCKET',
    'CLAUDE_CODE_MESSAGING_TOKEN',
    'CLAUDE_CODE_EXECPATH',
    'CLAUDE_CODE_DISABLE_BG_SHELL_PRESSURE_REAP',
  ]);
  const kept = {
    PILOT_DECK_PORT: '4397',
    PILOT_DECK_DIR: 'C:/scratch/.deck',
    PATH: 'C:/Windows',
    CLAUDE_CODE_USE_BEDROCK: '1',
  };
  const markers = Object.fromEntries(PARENT_MARKERS.map((name) => [name, 'from the parent']));
  assert.deepEqual(sessionEnv({ ...markers, claude_code_sse_port: '1234', ...kept }), kept, 'every marker, in any case');
  assert.ok(PARENT_MARKERS.includes('CLAUDE_CODE_CHILD_SESSION'), 'the one that turned transcripts off on the live gate');

  const { calls, spawn } = aRecorder();
  startSession(aDir(t), { spawn, platform: 'win32', env: anEnv({ CLAUDECODE: '1', PILOT_DECK_PORT: '4397' }) });
  assert.equal(calls[0].options.env.CLAUDECODE, undefined, 'the spawn is handed the scrubbed environment');
  assert.equal(calls[0].options.env.PILOT_DECK_PORT, '4397');
});

test('a POST with a foreign Origin, or with none, is 403 and spawns nothing', async (t) => {
  const { base, started } = await aDeck(t);
  const repo = anAddedTab(t);

  for (const origin of ['http://evil.example', null]) {
    const response = await post(base, { repo }, origin);
    assert.equal(response.status, 403, `Origin ${origin}`);
  }
  assert.deepEqual(started, []);
});

test('a repo that is no tab is 404 and spawns nothing', async (t) => {
  const { base, started } = await aDeck(t);

  const refused = await post(base, { repo: ALPHA });
  assert.equal(refused.status, 303, 'back to the deck, not a bare error page');
  assert.equal(landing(refused).reason, 'that directory is not a deck tab');
  assert.deepEqual(started, []);

  const repo = anAddedTab(t);
  const posted = respelt(repo).replaceAll('\\', '/');
  const response = await post(base, { repo: posted });

  assert.equal(response.status, 303);
  assert.equal(response.headers.get('location'), `/?run=${encodeURIComponent(repo)}`);
  assert.deepEqual(started, [repo], "the tab's stored spelling, never the posted one");
});

test('a live repo is 409 and spawns nothing', async (t) => {
  const { base, started } = await aDeck(t);
  registerRun({ repo: ALPHA, pid: process.pid }); // this test's own pid: live

  const response = await post(base, { repo: ALPHA });

  assert.equal(response.status, 303);
  assert.deepEqual(landing(response), { run: storedTabFor(ALPHA).repo, reason: 'a session is already live in this deck' });
  assert.deepEqual(started, []);
});

test('a refused Start lands back on its tab with the reason beside the control', async (t) => {
  onPlatform(t, 'win32');
  const { spawn, calls } = aRecorder();
  const base = await deckOnAPort(t, { start: (repo) => startSession(repo, { spawn, platform: 'win32', env: anEnv() }) });
  const repo = anAddedTab(t);
  fs.rmSync(repo, { recursive: true }); // renamed away since the tab was drawn

  const response = await post(base, { repo });

  assert.equal(response.status, 303);
  assert.deepEqual(landing(response), { run: repo, reason: `${repo} no longer exists` });
  const page = rightStrip(await (await fetch(`${base}${response.headers.get('location')}`)).text());
  assert.match(page, /<details class="session" open><summary>Start<\/summary>/, 'the control is open');
  assert.ok(page.includes(`<p class="refused" role="alert">${repo} no longer exists</p>`), 'the reason, beside it');
  assert.deepEqual(calls, []);
});

test('an ended tab draws Start and a live one does not', (t) => {
  tempDeck(t);
  onPlatform(t, 'win32');
  const live = registerRun({ repo: ALPHA, pid: process.pid });
  const ended = { ...live, pid: 999999 };
  postItem({ kind: 'question', title: 'Which?', body: 'Pick.', repo: ALPHA }); // keeps the ended tab on the strip
  const strip = (run) => rightStrip(renderHomePage(listItems(), [run], ALPHA, false, listDeckNumbers(), {}, Date.now()));

  assert.doesNotMatch(strip(live), /action="\/start-session"/);
  const start = strip(ended);
  assert.match(start, /<details class="session"><summary>Start<\/summary>/);
  assert.match(start, /<form class="session" method="post" action="\/start-session" data-confirm-row data-in-place>/);
  assert.ok(start.includes(`name="repo" value="${live.repo.replace('&', '&amp;')}"`), 'the repo, escaped');
  assert.match(start, /<div class="step sure" hidden><p>Start D\d+\? A terminal window opens running pilot run\.<\/p>/, 'the confirm names the tab, not its path, hidden until asked');
  assert.match(start, /<button type="submit" data-confirm>Start<\/button>/, 'Start, the trigger');
  assert.match(start, /<button type="submit">Confirm<\/button>/);
  assert.ok(start.indexOf('class="session"') < start.indexOf('class="remove"'), 'Start sits beside Close, above it');

  onPlatform(t, 'linux');
  assert.doesNotMatch(strip(ended), /start-session/, 'nothing is drawn off win32');
});

test('a refusal landing on a tab with neither control draws nothing in the rail', (t) => {
  tempDeck(t);
  onPlatform(t, 'win32');
  // A live plain-`claude` tab: a stale page's End, or a Start raced by a registration.
  const live = registerRun({ repo: ALPHA, pid: process.pid });
  const strip = rightStrip(
    renderHomePage(listItems(), [live], ALPHA, false, listDeckNumbers(), {}, Date.now(), [], null, {}, 'a session is already live in this deck'),
  );

  assert.doesNotMatch(strip, /refused/, 'a bare reason would widen the vertical rail past the page');
});

test('PILOT_DECK_NO_START refuses before any spawn', (t) => {
  assert.ok(process.env.PILOT_DECK_NO_START, 'the guard is in force in this process');
  const { calls, spawn } = aRecorder();
  const repo = aDir(t);

  assert.equal(refusalOf(repo, { spawn, env: process.env })?.status, 403);
  assert.equal(refusalOf(repo, { spawn, env: anEnv({ PILOT_DECK_NO_START: '1' }) })?.status, 403);
  assert.deepEqual(calls, []);
});

test('Start off Windows is refused before any spawn', (t) => {
  const { calls, spawn } = aRecorder();

  assert.equal(refusalOf(aDir(t), { spawn, platform: 'linux' })?.status, 400);
  assert.deepEqual(calls, []);
});

test('a package path containing " or % is refused', (t) => {
  const { calls, spawn } = aRecorder();
  const repo = aDir(t);

  for (const bad of ['C:/a"b/bin/pilot.mjs', 'C:/%USERPROFILE%/bin/pilot.mjs']) {
    for (const deps of [{ bin: bad }, { execPath: bad }]) {
      const refusal = refusalOf(repo, { spawn, ...deps });
      assert.equal(refusal?.status, 400, bad);
      assert.ok(refusal.message.includes(bad), `the reason names ${bad}`);
    }
  }
  assert.deepEqual(calls, []);
});

// S2: Start refuses a missing directory and a second press (spec 3, 4; L3).

test('a directory that no longer exists is refused with its reason and spawns nothing', (t) => {
  const { calls, spawn } = aRecorder();
  const gone = aDir(t);
  fs.rmSync(gone, { recursive: true });

  const refusal = refusalOf(gone, { spawn });

  assert.equal(refusal?.status, 400);
  assert.match(refusal.message, /no longer exists/);
  assert.ok(refusal.message.includes(gone), 'the reason names the directory');
  assert.deepEqual(calls, []);
});

test('a path that is now a file is refused and spawns nothing', (t) => {
  const { calls, spawn } = aRecorder();
  const file = aDir(t);
  fs.rmSync(file, { recursive: true });
  fs.writeFileSync(file, 'not a directory');

  const refusal = refusalOf(file, { spawn });

  assert.equal(refusal?.status, 400);
  assert.match(refusal.message, /not a directory/);
  assert.deepEqual(calls, []);
});

test('a directory that cannot be checked is refused naming why', (t) => {
  const { calls, spawn } = aRecorder();

  const refusal = refusalOf(`${aDir(t)}\0`, { spawn });

  assert.equal(refusal?.status, 400);
  assert.match(refusal.message, /\(ERR_INVALID_ARG_VALUE\)/);
  assert.deepEqual(calls, []);
});

test('a second Start inside the latch is 409 and spawns once', (t) => {
  const { calls, spawn } = aRecorder();
  const repo = aDir(t);

  assert.equal(refusalOf(repo, { spawn }), null);
  const second = refusalOf(respelt(repo), { spawn });

  assert.equal(second?.status, 409, 'the latch holds across spellings of the one repo');
  assert.equal(calls.length, 1);
});

test('a Start 60 s after the first is allowed again', (t) => {
  const { calls, spawn } = aRecorder();
  const repo = aDir(t);
  const t0 = 1_000_000;

  assert.equal(refusalOf(repo, { spawn, now: () => t0 }), null);
  assert.equal(refusalOf(repo, { spawn, now: () => t0 + STARTING_MS - 1 })?.status, 409);
  assert.equal(refusalOf(repo, { spawn, now: () => t0 + STARTING_MS }), null);

  assert.equal(STARTING_MS, 60_000);
  assert.equal(calls.length, 2);
});

test('a registration in that repo clears the latch', async (t) => {
  const base = await deckOnAPort(t, { open: () => {} });
  const { calls, spawn } = aRecorder();
  const repo = aDir(t);

  assert.equal(refusalOf(repo, { spawn }), null);
  assert.equal(refusalOf(repo, { spawn })?.status, 409, 'latched before the registration');
  const registered = await fetch(`${base}/api/runs`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ repo: respelt(repo).replaceAll(path.sep, '/'), pid: process.pid }),
  });
  assert.equal(registered.status, 200);

  assert.equal(refusalOf(repo, { spawn }), null, 'the session is up, so the latch is gone');
  assert.equal(calls.length, 2);
});

test('a failed spawn clears the latch', (t) => {
  const { calls, spawn, fail } = aRecorder();
  const logged = t.mock.method(console, 'error', () => {});
  const repo = aDir(t);

  assert.equal(refusalOf(repo, { spawn }), null);
  assert.equal(refusalOf(repo, { spawn })?.status, 409, 'latched before the failure');
  fail(new Error('spawn cmd.exe ENOENT'));

  assert.ok(
    logged.mock.calls.some((call) => call.arguments.join(' ').includes('spawn cmd.exe ENOENT')),
    'the error reaches stderr',
  );
  assert.equal(refusalOf(repo, { spawn }), null, 'the user can press Start again');
  assert.equal(calls.length, 2);

  // A spawn that throws where it is called leaves no latch behind either.
  const throwing = () => {
    throw new Error('spawn EINVAL');
  };
  const other = aDir(t);
  assert.throws(() => startSession(other, { spawn: throwing, platform: 'win32', env: anEnv() }), /EINVAL/);
  assert.equal(refusalOf(other, { spawn }), null);
});
