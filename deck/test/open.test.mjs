/**
 * Slice S2: the deck opens itself.
 *
 * Two claims, and they want different shapes of test. "A parked `deck_wait` is not a
 * browser" is a claim about the daemon's own bookkeeping, so it runs against a real
 * HTTP server on an ephemeral port with a real long poll parked on it — the thing that
 * used to be counted as a watcher alongside the pages. "The deck shells out to the
 * platform's opener" is a claim about a command line, and the one thing it must never
 * do while the suite is running is run, so the two halves are separated: what the
 * command line is, which is pure and provable for platforms this machine is not, and
 * when it is started, which is handed a recorder instead of `spawn`.
 *
 * Every test takes its own store directory and its own port. Nothing here may touch
 * the real store or port 4321: this machine runs a real deck.
 */

import './no-open.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';

import { deckOnAPort, freePort } from '../testUtils.mjs';

// A port of this file's own, never one a scratch deck might hold.
const PORT = await freePort();

const { browserCount, deckUrl, waiterCount } = await import('../server.mjs');
const { openerFor } = await import('../open.mjs');
const { openFile } = await import('../launch.mjs');
const { ensureSecret } = await import('../../hooks/lib/deck-secret.js');

// --- harness ---------------------------------------------------------------

async function until(predicate, what) {
  for (let attempt = 0; attempt < 400 && !predicate(); attempt += 1) await sleep(5);
  assert.ok(predicate(), what);
}

const withEnv = (t, name, value) => {
  const previous = process.env[name];
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
  t.after(() => {
    if (previous === undefined) delete process.env[name];
    else process.env[name] = previous;
  });
};

/**
 * A stand-in for `spawn` that writes down the command line and starts nothing. Also
 * records the child's event listeners and `unref` calls, so a test can drive the
 * `error` event the way a real child process would — asynchronously, after `spawn`
 * has already returned — rather than asserting only that a listener was attached.
 */
const recorder = () => {
  const calls = [];
  return {
    calls,
    spawn: (command, args, options) => {
      const listeners = {};
      const unrefCalls = [];
      calls.push({ command, args, options, listeners, unrefCalls });
      return {
        on: (event, handler) => {
          listeners[event] = handler;
        },
        unref: () => unrefCalls.push(true),
      };
    },
  };
};

/**
 * The environment of the deck the user actually watches: no store or port of its own and
 * nothing saying not to open. The suite itself runs under a scratch directory, so a test
 * of the opener has to say so explicitly.
 */
const asTheRealDeck = (t) => {
  withEnv(t, 'PILOT_DECK_NO_OPEN', undefined);
  withEnv(t, 'PILOT_DECK_DIR', undefined);
  withEnv(t, 'PILOT_DECK_PORT', undefined);
};

let copies = 0;
/**
 * A private copy of `deck/open.mjs`. The guard against opening twice is a timestamp the
 * module keeps, so two tests sharing one copy would make the second depend on whether
 * the first one opened — and a test that only passes second is not a test.
 */
const freshOpener = () => import(`../open.mjs?copy=${(copies += 1)}`);

// --- the suite itself ------------------------------------------------------

test('every test file that stands a deck up imports the guard against opening one', () => {
  // The daemon opens a browser when a run registers and no page is watching, so a test
  // file that stands a server up and forgets `./no-open.mjs` puts a tab on the screen of
  // whoever runs it. That is the sort of thing nobody notices in CI and everybody
  // notices at 2am, so the list is checked rather than remembered. The shared harness
  // is in the list too: standing a deck up is now mostly done by calling it, and a file
  // that only calls it would otherwise be exempt from the very check that matters here.
  const STANDS_A_DECK_UP =
    /deckOnAPort|postsTheChoice|createDeckHttpServer|registerSession|daemon\.mjs|\/api\/runs/;
  const here = path.dirname(fileURLToPath(import.meta.url));
  const forgot = fs
    .readdirSync(here)
    .filter((name) => name.endsWith('.test.mjs'))
    .filter((name) => {
      const source = fs.readFileSync(path.join(here, name), 'utf8');
      return STANDS_A_DECK_UP.test(source) && !source.includes("import './no-open.mjs'");
    });

  assert.deepEqual(forgot, [], 'these stand a deck up without turning its opener off');
  assert.ok(process.env.PILOT_DECK_NO_OPEN, 'and the guard is in force in this process');
});

// --- the split: a waiter is not a browser ----------------------------------

test('a parked deck_wait is a waiter and is not counted as a browser', async (t) => {
  // The whole of D14 rests on this. One counter used to answer both questions, so a
  // session sitting in `deck_wait` — an agent, with nobody looking at anything — read
  // as "a browser is already watching the deck" and the tab would never open.
  const base = await deckOnAPort(t);
  assert.equal(browserCount(), 0, 'no browser is left over from an earlier test');
  assert.equal(waiterCount(), 0, 'and no waiter either');

  const controller = new AbortController();
  const parked = fetch(`${base}/api/tool`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'deck_wait', arguments: { since: 0, timeout: 30_000 } }),
    signal: controller.signal,
  }).catch(() => null);

  await until(() => waiterCount() === 1, 'the parked wait is subscribed as a waiter');
  assert.equal(browserCount(), 0, 'a session waiting on a reply is not a page watching the deck');

  controller.abort();
  await parked;
  await until(() => waiterCount() === 0, 'the abandoned wait unsubscribed');
});

test('a browser on /events is counted as a browser, and takes the count with it', async (t) => {
  const base = await deckOnAPort(t);
  await until(() => browserCount() === 0, 'no browser is left over from an earlier test');

  const controller = new AbortController();
  const stream = await fetch(`${base}/events`, {
    headers: { accept: 'text/event-stream' },
    signal: controller.signal,
  });
  assert.equal(stream.status, 200);

  await until(() => browserCount() === 1, 'the open stream counts as a browser');
  assert.equal(waiterCount(), 0, 'and not as a session parked in deck_wait');

  controller.abort();
  await until(() => browserCount() === 0, 'the closed stream unsubscribed');
});

// --- registration is the one thing that opens a deck -----------------------

/** Register a run the way `deck/client.mjs` does when a session starts. */
const registerRunOverHttp = (base, repo) =>
  fetch(`${base}/api/runs`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ repo, pid: process.pid }),
  });

test('registering a run with nobody watching opens the deck', async (t) => {
  const opens = [];
  const base = await deckOnAPort(t, { open: () => opens.push('opened') });

  const response = await registerRunOverHttp(base, 'D:\\work\\alpha');

  assert.equal(response.status, 200);
  assert.equal(opens.length, 1, 'the session that started with no deck on screen gets one');
});

test('registering a run while a browser is watching opens nothing', async (t) => {
  // "If it isn't already open" — the second session of the day is the one this is for.
  const opens = [];
  const base = await deckOnAPort(t, { open: () => opens.push('opened') });

  const controller = new AbortController();
  t.after(() => controller.abort());
  await fetch(`${base}/events`, { headers: { accept: 'text/event-stream' }, signal: controller.signal });
  await until(() => browserCount() === 1, 'the browser is connected before the run registers');

  const response = await registerRunOverHttp(base, 'D:\\work\\beta');

  assert.equal(response.status, 200);
  assert.deepEqual(opens, [], 'a page is already watching, so no second tab');
});

test('a session parked in deck_wait does not stand in for a browser at registration', async (t) => {
  // The behavioural half of the split: an agent waiting on a reply is not a human
  // looking at a page, and the session starting beside it still needs its tab.
  const opens = [];
  const base = await deckOnAPort(t, { open: () => opens.push('opened') });

  const controller = new AbortController();
  const parked = fetch(`${base}/api/tool`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'deck_wait', arguments: { since: 0, timeout: 30_000 } }),
    signal: controller.signal,
  }).catch(() => null);
  await until(() => waiterCount() === 1, 'the wait is parked before the run registers');

  const response = await registerRunOverHttp(base, 'D:\\work\\gamma');

  assert.equal(response.status, 200);
  assert.equal(opens.length, 1, 'the waiter did not count as a page, so the deck opened');

  controller.abort();
  await parked;
});

// --- the opener ------------------------------------------------------------

test('the opener is the platform’s own command with the URL as one whole argument', () => {
  // A URL spliced into a command line is a command line, and the deck runs as the user.
  // Pinning the array here is what says the spawn has no shell to be parsed by.
  const url = 'http://127.0.0.1:4321';

  assert.deepEqual(openerFor('win32', url), { command: 'cmd', args: ['/c', 'start', '', url] });
  assert.deepEqual(openerFor('darwin', url), { command: 'open', args: [url] });
  assert.deepEqual(openerFor('linux', url), { command: 'xdg-open', args: [url] });

  for (const platform of ['win32', 'darwin', 'freebsd']) {
    const { command, args } = openerFor(platform, url);
    assert.ok(!command.includes(url), `${platform} puts the URL in the command, not an argument`);
    assert.ok(args.includes(url), `${platform} splices the URL rather than passing it whole`);
  }
});

test('the URL the deck opens carries nothing cmd.exe would read as a second command', (t) => {
  // `cmd /c` parses what follows a second time, after Win32 has already split the argv,
  // so `&`, `|`, `^`, `%`, `<`, `>` and a double quote in a URL would be a command line
  // rather than an address. Nothing can put one there today — `deckUrl()` is
  // `http://127.0.0.1:` and an integer `deckPort()` has already validated — and this is
  // what says so, so a later URL with a query string or a hostname in it fails here
  // rather than on somebody's machine.
  for (const port of ['', '4321', '4323', '65535']) {
    withEnv(t, 'PILOT_DECK_PORT', port === '' ? undefined : port);
    assert.doesNotMatch(deckUrl(), /[&|^%<>"]/, `deckUrl() on port ${port || 'the default'}`);
  }
});

test('PILOT_DECK_NO_OPEN stops the deck opening itself', async (t) => {
  const { openDeck } = await freshOpener();
  const spawns = recorder();
  withEnv(t, 'PILOT_DECK_NO_OPEN', '1');

  assert.equal(openDeck(spawns.spawn), false, 'the deck says it did not open anything');
  assert.deepEqual(spawns.calls, [], 'and started nothing');
});

test('PILOT_DECK_NO_OPEN=0 is still nobody’s way of asking for a browser', async (t) => {
  const { openDeck } = await freshOpener();
  const spawns = recorder();
  withEnv(t, 'PILOT_DECK_NO_OPEN', '0');

  assert.equal(openDeck(spawns.spawn), false);
  assert.deepEqual(spawns.calls, []);
});

test('a deck on a directory or port of its own is a scratch copy and opens nothing', async (t) => {
  // A test, an agent's preview, a second worktree: none of them is the deck the user
  // watches (one deck per machine), and on 2026-09-19 a hundred of them each opened a
  // tab because nobody had set PILOT_DECK_NO_OPEN. The override is the tell.
  for (const [name, value] of [
    ['PILOT_DECK_DIR', path.join(os.tmpdir(), 'pilot-scratch')],
    ['PILOT_DECK_PORT', String(PORT)],
  ]) {
    const { openDeck } = await freshOpener();
    const spawns = recorder();
    asTheRealDeck(t);
    withEnv(t, name, value);

    assert.equal(openDeck(spawns.spawn), false, `${name} set: the deck says it opened nothing`);
    assert.deepEqual(spawns.calls, [], `${name} set: and started nothing`);
  }
});

test('two registrations in a row open one browser, not two', async (t) => {
  // A second session started seconds after the first registers long before a cold
  // browser has finished starting, so "is a browser connected" is still no on its own.
  const { openDeck } = await freshOpener();
  const spawns = recorder();
  asTheRealDeck(t);

  assert.equal(openDeck(spawns.spawn), true, 'the first session gets a tab');
  assert.equal(openDeck(spawns.spawn), false, 'the second finds the guard still up');

  assert.equal(spawns.calls.length, 1);
  assert.ok(
    spawns.calls[0].args.includes(openFile()),
    `the deck opened its own open file, not ${JSON.stringify(spawns.calls[0].args)}`,
  );
  assert.equal(spawns.calls[0].options.stdio, 'ignore', 'the browser does not hold the daemon’s pipes');
  assert.equal(spawns.calls[0].options.detached, true, 'the browser outlives the daemon that started it');
  assert.equal(spawns.calls[0].options.windowsHide, true, 'no console flashes up behind the browser');
});

test('the deck opener follows an injected platform', async (t) => {
  // The platform arrives as an argument (mac-linux S9), so the two this machine is not are driven here.
  asTheRealDeck(t);
  for (const [platform, command] of [['darwin', 'open'], ['linux', 'xdg-open']]) {
    const { openDeck } = await freshOpener();
    const spawns = recorder();
    assert.equal(openDeck(spawns.spawn, platform), true, `${platform}: the opener started`);
    assert.equal(spawns.calls[0].command, command, `${platform} opens with ${command}`);
    assert.deepEqual(spawns.calls[0].args, [openFile()], `${platform}: the open file is the one argument`);
  }
});

test('an opener that reports failure through its `error` event, not a throw, is heard', async (t) => {
  // `spawn` fails asynchronously: the process it could not start is reported on the
  // child's own `error` event, never by throwing out of `spawn` itself. This is the path
  // "no xdg-open on this machine" actually takes, so it is driven directly rather than
  // through a `spawnOpener` that throws.
  const { openDeck } = await freshOpener();
  const spawns = recorder();
  asTheRealDeck(t);
  const said = [];
  t.mock.method(console, 'error', (...args) => said.push(args.join(' ')));

  assert.equal(openDeck(spawns.spawn), true, 'the daemon started the opener');
  const { listeners } = spawns.calls[0];
  assert.equal(typeof listeners.error, 'function', 'an error listener is attached to the child');

  assert.doesNotThrow(() => listeners.error(new Error('no such opener on this machine')));
  assert.match(said.join('\n'), /could not open/, 'and says so once on stderr');
  assert.ok(said.join('\n').includes(openFile()), 'naming the open file a human could still open');
});

test('openDeck never puts the key in argv', async (t) => {
  // A2: other users read argv (macOS `ps`), so the opener is handed the 0600 open file and the
  // key stays inside it, as Jupyter's redirect file keeps its token out of the command line.
  const { openDeck } = await freshOpener();
  const spawns = recorder();
  asTheRealDeck(t);
  const secret = ensureSecret();

  assert.equal(openDeck(spawns.spawn), true);
  const { command, args } = spawns.calls[0];
  assert.deepEqual(args, openerFor(process.platform, openFile()).args, 'the opener names the open file');
  assert.equal(args.at(-1), openFile(), 'whole, as the last argument');
  for (const part of [command, ...args]) {
    assert.ok(!part.includes(secret) && !part.includes('key=') && !part.startsWith('http'), 'and no argument holds the key or a URL');
  }
});

test('an opener that will not start leaves the daemon serving', async (t) => {
  // The deck is up whether or not a browser appeared, and a throw out of a route
  // handler on a machine with no `xdg-open` would take every parked session with it.
  const { openDeck } = await freshOpener();
  asTheRealDeck(t);
  const said = [];
  t.mock.method(console, 'error', (...args) => said.push(args.join(' ')));

  const refuse = () => {
    throw new Error('no such opener on this machine');
  };

  assert.equal(openDeck(refuse), false, 'the daemon hears no rather than dying in a route');
  assert.match(said.join('\n'), /could not open/, 'and says so once on stderr');
});
