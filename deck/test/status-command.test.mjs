/**
 * Slice S1 of daemon-lifecycle: the deck reports its version and `pilot status`
 * shows it (spec 3, 8, 9, 15; L6, L9, A3).
 *
 * Every deck here is this test's own, on a port the operating system has just
 * handed out; nothing may touch port 4321, where the user's deck runs.
 */

import './no-open.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { deckOnAPort, freePort, tempDeck } from '../testUtils.mjs';
import { forgetAgents, noteAgent } from '../agents.mjs';
import { PLUGIN_VERSION, isOlder } from '../version.mjs';
import { probeDeck } from '../probe.mjs';
import { statusLines } from '../status-command.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const STATUS = path.join(ROOT, 'deck', 'status-command.mjs');
const versionOf = (file) => JSON.parse(fs.readFileSync(path.join(ROOT, file), 'utf8')).version;

/** A plain http listener that answers every request, and is not a deck. */
async function aStranger(t) {
  const server = http.createServer((request, response) => {
    response.writeHead(200, { 'content-type': 'text/html' });
    response.end('<h1>hello</h1>');
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  return `http://127.0.0.1:${server.address().port}`;
}

/** A deck.log of `count` numbered lines, and its path. */
function aLog(t, count) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pilot-log-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'deck.log');
  fs.writeFileSync(file, `${Array.from({ length: count }, (_, i) => `log line ${i + 1}`).join('\n')}\n`);
  return file;
}

/**
 * What `main` printed, and its exit code, from a child process: under `node --test` this
 * process's stdout carries the runner's own reports, so it cannot be borrowed.
 */
async function printed(options) {
  const script = `import { main } from ${JSON.stringify(pathToFileURL(STATUS).href)};
process.exitCode = await main(JSON.parse(process.argv[1]));`;
  const child = spawn(process.execPath, ['--input-type=module', '-e', script, JSON.stringify(options)], {
    stdio: ['ignore', 'pipe', 'inherit'],
    env: { ...process.env, PILOT_DECK_NO_OPEN: '1' },
  });
  let out = '';
  child.stdout.on('data', (chunk) => {
    out += chunk;
  });
  const [code] = await once(child, 'exit');
  return { code, lines: out.split(/\r?\n/).filter((line) => line !== '') };
}

test('health names the plugin version and start', async (t) => {
  const base = await deckOnAPort(t);
  const health = await (await fetch(`${base}/api/health`)).json();

  assert.equal(health.version, '0.9.6');
  assert.equal(health.version, versionOf('package.json'));
  assert.equal(versionOf('.claude-plugin/plugin.json'), health.version);
  const lock = JSON.parse(fs.readFileSync(path.join(ROOT, 'package-lock.json'), 'utf8'));
  assert.equal(lock.version, health.version);
  assert.equal(lock.packages[''].version, health.version);
  assert.equal(PLUGIN_VERSION, health.version);
  assert.equal(typeof health.startedAt, 'string');
  assert.equal(new Date(health.startedAt).toISOString(), health.startedAt, 'startedAt is an ISO time');
});

test('the probe tells a deck, nothing and a stranger apart', async (t) => {
  const deck = await deckOnAPort(t);
  const found = await probeDeck(deck);
  assert.equal(found.state, 'deck');
  assert.equal(found.pid, process.pid);
  assert.equal(found.version, PLUGIN_VERSION);
  assert.equal(typeof found.startedAt, 'string');

  const closed = await freePort();
  assert.deepEqual(await probeDeck(`http://127.0.0.1:${closed}`), { state: 'none' });

  const stranger = await probeDeck(await aStranger(t));
  assert.equal(stranger.state, 'foreign');
  assert.equal(typeof stranger.why, 'string');
  assert.ok(stranger.why.length > 0);
});

test('older reads an absent version as older', () => {
  assert.equal(isOlder(undefined, '0.9.1'), true);
  assert.equal(isOlder('0.9.0', '0.9.1'), true);
  assert.equal(isOlder('0.8.10', '0.9.1'), true, 'numeric, not string, comparison');
  assert.equal(isOlder('0.9.1', '0.9.1'), false);
  assert.equal(isOlder('0.9.2', '0.9.1'), false);
  assert.equal(isOlder('0.10.0', '0.9.1'), false, 'numeric, not string, comparison');
  assert.equal(isOlder('1.0.0', '0.9.1'), false);
});

test('status on a live deck prints every line', async (t) => {
  const base = await deckOnAPort(t);
  t.after(forgetAgents);
  noteAgent({ cwd: path.join('D:', 'work', 'kettle'), agentId: 'a1', agentType: 'pilot-implementer' });
  const logFile = aLog(t, 25);

  const { code, lines } = await printed({ url: base, logFile });
  const text = lines.join('\n');

  assert.equal(code, 0);
  assert.ok(text.includes(base), 'the url');
  assert.match(text, new RegExp(`\\bpid\\b.*\\b${process.pid}\\b`), 'the pid');
  assert.match(text, new RegExp(`version.*${PLUGIN_VERSION.replace(/\./g, '\\.')}`), 'the version');
  assert.match(text, /uptime/, 'the uptime');
  assert.match(text, /kettle.*pilot-implementer/, 'the agents by repository and type');
  for (let i = 1; i <= 5; i += 1) assert.ok(!lines.includes(`log line ${i}`), 'only the last 20 log lines');
  assert.ok(lines.includes('log line 6'), 'the 20th line from the end');
  assert.equal(lines.at(-1), 'log line 25');
});

test('status marks an older deck stale', () => {
  const lines = statusLines({
    url: 'http://127.0.0.1:1',
    probe: { state: 'deck', pid: 7, version: '0.9.1', startedAt: new Date(0).toISOString() },
    agents: {},
    logTail: [],
    pluginVersion: '0.9.3',
    now: 60_000,
  });
  const version = lines.find((line) => /version/.test(line));
  assert.ok(version, lines.join('\n'));
  assert.match(version, /stale$/);

  const current = statusLines({
    url: 'http://127.0.0.1:1',
    probe: { state: 'deck', pid: 7, version: '0.9.3', startedAt: new Date(0).toISOString() },
    agents: {},
    logTail: [],
    pluginVersion: '0.9.3',
    now: 60_000,
  });
  assert.doesNotMatch(current.find((line) => /version/.test(line)), /stale/);
});

test('status with no deck is one line and the log tail', async (t) => {
  tempDeck(t);
  const url = `http://127.0.0.1:${await freePort()}`;
  const logFile = aLog(t, 3);

  const { code, lines } = await printed({ url, logFile });

  assert.equal(code, 1);
  assert.equal(lines[0], `no deck is running at ${url}`);
  assert.deepEqual(lines.slice(-3), ['log line 1', 'log line 2', 'log line 3']);

  const bare = await printed({ url, logFile: path.join(path.dirname(logFile), 'absent.log') });
  assert.equal(bare.code, 1);
  assert.deepEqual(bare.lines, [`no deck is running at ${url}`], 'no log, no tail');
});

test('status prints no terminal control characters from the deck or its log', () => {
  const lines = statusLines({
    url: 'http://127.0.0.1:1',
    probe: { state: 'deck', pid: 7, version: '0.9.3\u001b]0;owned\u0007', startedAt: new Date(0).toISOString() },
    agents: { 'D:/work\u001b[2Jkettle': [{ agentType: 'pilot-implementer', since: '' }], broken: 'not a list' },
    logTail: ['[deck] boom \u001b[31mred\u009b'],
    pluginVersion: '0.9.3',
    now: 60_000,
  });
  // eslint-disable-next-line no-control-regex
  assert.ok(lines.every((line) => !/[\u0000-\u001f\u007f-\u009f]/.test(line)), JSON.stringify(lines));
});
