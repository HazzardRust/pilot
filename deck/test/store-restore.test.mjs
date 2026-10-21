/**
 * store-durability S3 (spec 4; L2, A5): `pilot store restore` swaps deck.json and `deck.json.bak`, keeping the
 * replaced store as `deck.json.replaced-<date>[-n]`, so a second restore puts it back. It refuses while a deck
 * daemon serves, and refuses a backup that does not parse as a deck, changing no file either way. S6 (spec 9):
 * a daemon names itself and its port in `deck.pid` in the store dir, and `storePid` asks that port whether
 * the pid still answers there, so restore refuses a deck serving it on any port and never a reused pid.
 */

import { spawn } from 'node:child_process';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';

import './no-open.mjs';
import { main, restoreStore, storePid } from '../store-restore.mjs';
import { postItem, storeFile } from '../store.mjs';
import { tempDeck } from '../testUtils.mjs';

const REPO = 'D:/work/pilot';
const post = (title) => postItem({ kind: 'question', title, body: 'A or B', repo: REPO, author: '' });
const read = (file) => fs.readFileSync(file);
const noDaemon = { daemonPid: () => null };

function today() {
  const now = new Date();
  return [now.getFullYear(), now.getMonth() + 1, now.getDate()].map((n) => String(n).padStart(2, '0')).join('-');
}

/** Two posts, so `.bak` holds the store after the first and deck.json the store after the second. */
function twoPosts() {
  post('First');
  const bak = read(storeFile());
  post('Second');
  return { bak, store: read(storeFile()) };
}

/** Every file in the store's directory with its bytes, to show a refusal changed nothing. */
const snapshot = () => {
  const dir = path.dirname(storeFile());
  return Object.fromEntries(fs.readdirSync(dir).sort().map((name) => [name, read(path.join(dir, name))]));
};

test('restore swaps the backup in', (t) => {
  tempDeck(t);
  const before = twoPosts();
  const { restored, kept } = restoreStore(noDaemon);
  assert.equal(restored, storeFile());
  assert.equal(kept, `${storeFile()}.replaced-${today()}`);
  assert.deepEqual(read(storeFile()), before.bak, 'deck.json holds the old .bak');
  assert.deepEqual(read(`${storeFile()}.bak`), before.store, '.bak holds the old store');
  assert.deepEqual(read(kept), before.store, 'the replaced store is kept');
});

test('a second restore puts it back', (t) => {
  tempDeck(t);
  const before = twoPosts();
  restoreStore(noDaemon);
  const { kept } = restoreStore(noDaemon);
  assert.deepEqual(read(storeFile()), before.store, 'deck.json is byte-identical to before the first restore');
  assert.deepEqual(read(`${storeFile()}.bak`), before.bak);
  assert.equal(kept, `${storeFile()}.replaced-${today()}-2`, 'the first replaced store is never overwritten');
  assert.deepEqual(read(`${storeFile()}.replaced-${today()}`), before.store);
});

test('a serving daemon refuses it', (t) => {
  tempDeck(t);
  twoPosts();
  const was = snapshot();
  assert.throws(() => restoreStore({ daemonPid: () => 4242 }), (err) => {
    assert.equal(err.name, 'DeckRefusal');
    assert.match(err.message, /4242/);
    assert.equal(err.message, 'deck daemon 4242 serves this store; stop it first, then restore');
    return true;
  });
  assert.throws(() => restoreStore({ daemonPid: () => undefined }), { name: 'DeckRefusal' }, 'a deck that may serve refuses too');
  assert.throws(() => restoreStore(), { name: 'DeckRefusal' }, 'no probe is no proof the deck is stopped');
  assert.deepEqual(snapshot(), was, 'no file changed');
});

test('an unparseable backup refuses it', (t) => {
  tempDeck(t);
  twoPosts();
  for (const bad of ['{"items": ', '{"version": 3}']) {
    fs.writeFileSync(`${storeFile()}.bak`, bad);
    const was = snapshot();
    assert.throws(() => restoreStore(noDaemon), { name: 'DeckRefusal', message: /does not parse as a deck/ });
    assert.deepEqual(snapshot(), was, 'no file changed');
  }
});

test('a corrupt store takes the backup in and the backup stays', (t) => {
  tempDeck(t);
  const before = twoPosts();
  fs.writeFileSync(storeFile(), 'truncated');
  const { kept } = restoreStore(noDaemon);
  assert.deepEqual(read(storeFile()), before.bak);
  assert.deepEqual(read(`${storeFile()}.bak`), before.bak, 'a corrupt store never becomes the backup');
  assert.equal(read(kept).toString(), 'truncated');
});

test('a missing store refuses it', (t) => {
  tempDeck(t);
  twoPosts();
  fs.rmSync(storeFile());
  const was = snapshot();
  assert.throws(() => restoreStore(noDaemon), { name: 'DeckRefusal', message: /is missing/ });
  assert.deepEqual(snapshot(), was, 'no file changed');
});

/** A port nothing listens on, so the command's daemon probe is refused and finds no deck. */
async function freePort() {
  const server = net.createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  await new Promise((resolve) => server.close(resolve));
  return port;
}

test('the command prints one line', async (t) => {
  tempDeck(t);
  twoPosts();
  const port = process.env.PILOT_DECK_PORT;
  process.env.PILOT_DECK_PORT = String(await freePort());
  t.after(() => (port === undefined ? delete process.env.PILOT_DECK_PORT : (process.env.PILOT_DECK_PORT = port)));
  const out = t.mock.method(console, 'log', () => {});
  assert.equal(await main([]), 0);
  assert.equal(out.mock.calls.length, 1, 'one line out');
  const line = out.mock.calls[0].arguments.join(' ');
  assert.ok(line.includes(storeFile()) && line.includes(`${storeFile()}.replaced-${today()}`), line);
  const err = t.mock.method(console, 'error', () => {});
  assert.equal(await main(['C:/elsewhere/deck.json']), 1, 'no path argument');
  assert.equal(err.mock.calls.length, 1);
});

const pidFile = () => path.join(path.dirname(storeFile()), 'deck.pid');
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** A probe that answers `pid` on `port` and nothing on any other, recording each port it is asked. */
function probeAnswering(port, pid) {
  const asked = [];
  const probe = async (at) => {
    asked.push(at);
    return at === port ? pid : null;
  };
  return { probe, asked };
}

test('storePid: a deck.pid whose port answers its pid refuses restoreStore', async (t) => {
  tempDeck(t);
  twoPosts();
  fs.writeFileSync(pidFile(), `${process.pid} 5555`);
  const was = snapshot();
  const pid = await storePid(probeAnswering(5555, process.pid));
  assert.equal(pid, process.pid);
  assert.throws(() => restoreStore({ daemonPid: () => pid }), (err) => {
    assert.equal(err.name, 'DeckRefusal');
    assert.equal(err.message, `deck daemon ${process.pid} serves this store; stop it first, then restore`);
    return true;
  });
  assert.deepEqual(snapshot(), was, 'no file changed');
});

test('storePid: a deck.pid whose port cannot tell refuses restoreStore', async (t) => {
  tempDeck(t);
  twoPosts();
  fs.writeFileSync(pidFile(), `${process.pid} 5555`);
  const pid = await storePid(probeAnswering(5555, undefined));
  assert.equal(pid, undefined);
  assert.throws(() => restoreStore({ daemonPid: () => pid }), { name: 'DeckRefusal', message: /cannot tell/ });
});

test('storePid and restoreStore: a stale deck.pid is ignored', async (t) => {
  tempDeck(t);
  const before = twoPosts();
  // A live pid (this one) whose port answers nothing, or another pid: the deck it named is gone and the pid reused.
  for (const answer of [null, process.pid + 1]) {
    fs.writeFileSync(pidFile(), `${process.pid} 5555`);
    assert.equal(await storePid(probeAnswering(5555, answer)), null, `a port answering ${answer} names no deck`);
  }
  for (const stale of [String(process.pid), 'not a pid', '0 5555', '-4 5555', '12.5 5555', `${process.pid} 0`, `${process.pid} 70000`, '']) {
    fs.writeFileSync(pidFile(), stale);
    assert.equal(await storePid(probeAnswering(5555, process.pid)), null, `deck.pid holding ${JSON.stringify(stale)} names no deck`);
  }
  const pid = await storePid(probeAnswering(5555, null));
  restoreStore({ daemonPid: () => pid });
  assert.deepEqual(read(storeFile()), before.bak, 'restore went ahead');
});

test('storePid: with no deck.pid, or a stale one, the configured port is asked', async (t) => {
  tempDeck(t);
  const port = process.env.PILOT_DECK_PORT;
  process.env.PILOT_DECK_PORT = '6666';
  t.after(() => (port === undefined ? delete process.env.PILOT_DECK_PORT : (process.env.PILOT_DECK_PORT = port)));
  const none = probeAnswering(6666, 4242);
  assert.equal(await storePid(none), 4242);
  assert.deepEqual(none.asked, [6666]);
  fs.writeFileSync(pidFile(), `${process.pid} 5555`);
  const stale = probeAnswering(6666, 4242);
  assert.equal(await storePid(stale), 4242);
  assert.deepEqual(stale.asked, [5555, 6666]);
});

test('storePid: an unreadable deck.pid refuses restore', async (t) => {
  tempDeck(t);
  twoPosts();
  fs.mkdirSync(pidFile());
  await assert.rejects(storePid(probeAnswering(5555, null)), { name: 'DeckRefusal', message: /deck\.pid cannot be read/ });
});

const within = async (ms, ok) => {
  for (const deadline = Date.now() + ms; Date.now() < deadline; await sleep(100)) if (await ok()) return true;
  return false;
};

/** A real daemon.mjs on a free port over `store`, leashed to a dir `stop()` removes: its own clean shutdown. */
async function scratchDaemon(t, store) {
  const leash = fs.mkdtempSync(path.join(os.tmpdir(), 'pilot-deckpid-leash-'));
  t.after(() => fs.rmSync(leash, { recursive: true, force: true }));
  const port = await freePort();
  const daemon = path.resolve(import.meta.dirname, '..', 'daemon.mjs');
  const child = spawn(process.execPath, [daemon, '--leash', String(process.pid), '--leash-dir', leash], {
    cwd: os.tmpdir(),
    env: { ...process.env, PILOT_DECK_DIR: store, PILOT_DECK_PORT: String(port) },
    stdio: 'ignore',
    windowsHide: true,
  });
  const exited = new Promise((resolve) => child.once('exit', resolve));
  t.after(() => {
    try {
      process.kill(child.pid);
    } catch {
      /* gone */
    }
  });
  const answers = async () => {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/health`, { signal: AbortSignal.timeout(1000) });
      // deck.pid is written a moment after the port first answers, so wait for it too.
      return response.ok && (await response.json()).pid === child.pid && fs.existsSync(path.join(store, 'deck.pid'));
    } catch {
      return false;
    }
  };
  assert.ok(await within(10_000, answers), 'the scratch daemon never answered');
  const stop = async () => {
    fs.rmSync(leash, { recursive: true, force: true });
    await exited;
  };
  return { pid: child.pid, port, stop };
}

function scratchStore(t) {
  const store = fs.mkdtempSync(path.join(os.tmpdir(), 'pilot-deckpid-store-'));
  t.after(() => fs.rmSync(store, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }));
  return store;
}

test('the daemon writes and removes deck.pid', async (t) => {
  const store = scratchStore(t);
  const file = path.join(store, 'deck.pid');
  const deck = await scratchDaemon(t, store);
  assert.equal(fs.readFileSync(file, 'utf8'), `${deck.pid} ${deck.port}`);
  assert.equal(await storePid({ dir: store }), deck.pid, 'its port answers the pid deck.pid names');
  await deck.stop();
  assert.equal(fs.existsSync(file), false, 'deck.pid outlived its daemon');
});

test('the daemon keeps another live deck in deck.pid', async (t) => {
  const store = scratchStore(t);
  const file = path.join(store, 'deck.pid');
  // This process stands in for a live deck: its port answers its pid.
  const live = http.createServer((request, response) => {
    response.setHeader('content-type', 'application/json');
    response.end(JSON.stringify({ pid: process.pid }));
  });
  await new Promise((resolve) => live.listen(0, '127.0.0.1', resolve));
  t.after(() => live.close());
  const line = `${process.pid} ${live.address().port}`;
  fs.writeFileSync(file, line);
  const deck = await scratchDaemon(t, store);
  assert.equal(fs.readFileSync(file, 'utf8'), line, 'a second deck overwrote the first');
  await deck.stop();
  assert.equal(fs.readFileSync(file, 'utf8'), line, 'a second deck removed the first');
});
