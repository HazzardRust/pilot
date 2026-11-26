/**
 * prebuilt-rune S2: every failure opens HTML with one line.
 *
 * Each test builds a package root of its own in a temp directory and hands `ensureRune` a stub `get`
 * (and, for Smart App Control, a stub `run`): no test reaches the network or the registry. Every
 * failure must leave `fetched/` empty and say why in exactly one line.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { ensureRune, findRune, RUNE_LIMITS, smartAppControl } from '../rune-bin.mjs';

const HOST = { platform: 'win32', arch: 'x64', version: '1.2.3' };
const ASSET = 'pilot-deck-win32-x64.exe';
const URL0 = `https://github.com/HazzardRust/pilot/releases/download/v1.2.3/${ASSET}`;
const BINARY = Buffer.from('MZ a Rune deck built by CI');
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

/** A package root of its own; `pin: false` writes no `release.json`. */
function packageRoot(t, { pin = { version: HOST.version, tag: `v${HOST.version}`, assets: { 'win32-x64': { file: ASSET, sha256: sha256(BINARY) } } } } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pilot-rune-fail-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const rune = path.join(root, 'deck', 'rune');
  fs.mkdirSync(rune, { recursive: true });
  if (pin) fs.writeFileSync(path.join(rune, 'release.json'), JSON.stringify(pin));
  return root;
}

const fetchedDir = (root) => path.join(root, 'deck', 'rune', 'target', 'fetched');
const fetchedFiles = (root) => (fs.existsSync(fetchedDir(root)) ? fs.readdirSync(fetchedDir(root)) : []);

/** A `get` that writes each URL down and answers with `respond(url, n)`. */
function stubGet(respond) {
  const calls = [];
  return {
    calls,
    get: async (url, options) => {
      calls.push(url);
      return respond(url, calls.length, options);
    },
  };
}

const reply = (status, { location, body } = {}) => ({
  status,
  headers: new Headers(location ? { location } : {}),
  body: body ?? (async function* empty() {})(),
});

/** One line, saying the page opens instead. */
function assertOneLine(state) {
  assert.equal(state.source, null);
  assert.equal(typeof state.line, 'string');
  assert.equal(state.line.split('\n').length, 1, `one line: ${state.line}`);
}

test('offline opens HTML with one line', async (t) => {
  const root = packageRoot(t);
  const net = stubGet(() => {
    throw new TypeError('fetch failed');
  });

  const state = await ensureRune(root, HOST, net.get);
  assertOneLine(state);
  assert.match(state.line, /fetch failed/);
  assert.equal(net.calls.length, 1, 'no retry');
  assert.deepEqual(fetchedFiles(root), []);
});

test('a non-200 opens HTML', async (t) => {
  const root = packageRoot(t);
  const net = stubGet(() => reply(404));

  const state = await ensureRune(root, HOST, net.get);
  assertOneLine(state);
  assert.match(state.line, /\b404\b/);
  assert.deepEqual(fetchedFiles(root), []);
});

test('a slow download stops at the limit', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const root = packageRoot(t);
  let reading = false;
  // A body that never ends and ignores the signal: the limit must hold without the body's help.
  const net = stubGet(() =>
    reply(200, {
      body: (async function* never() {
        reading = true;
        yield new Uint8Array(1);
        await new Promise(() => {});
      })(),
    }),
  );

  let settled = false;
  const pending = ensureRune(root, HOST, net.get).then((state) => {
    settled = true;
    return state;
  });
  for (let i = 0; i < 10 && !reading; i += 1) await new Promise((r) => setImmediate(r));
  assert.ok(reading, 'the body is being read');

  t.mock.timers.tick(RUNE_LIMITS.timeoutMs - 1);
  await new Promise((r) => setImmediate(r));
  assert.equal(settled, false, 'still reading just under the limit');

  t.mock.timers.tick(1);
  const state = await pending;
  assertOneLine(state);
  assert.match(state.line, /30 s/);
  assert.deepEqual(fetchedFiles(root), []);
});

test('an oversized body is cut off', async (t) => {
  const root = packageRoot(t);
  const mb = new Uint8Array(1024 * 1024);
  let sent = 0;
  const net = stubGet(() =>
    reply(200, {
      body: (async function* huge() {
        for (;;) {
          sent += 1;
          yield mb;
        }
      })(),
    }),
  );

  const state = await ensureRune(root, HOST, net.get);
  assertOneLine(state);
  assert.match(state.line, /over 100 MB/);
  assert.equal(sent, RUNE_LIMITS.maxBytes / mb.byteLength + 1, 'reading stops at the first chunk past the cap');
  assert.deepEqual(fetchedFiles(root), [], 'no .part or binary left');
});

test('a redirect off https is refused', async (t) => {
  const root = packageRoot(t);
  const http = stubGet(() => reply(302, { location: 'http://objects.example/asset?sig=secret' }));
  const state = await ensureRune(root, HOST, http.get);
  assertOneLine(state);
  assert.deepEqual(http.calls, [URL0], 'the http hop is never requested');
  assert.doesNotMatch(state.line, /objects\.example|sig=/, 'the Location is never printed');
  assert.deepEqual(fetchedFiles(root), []);

  // Five https hops are followed; a sixth is refused.
  const hops = (limit) => stubGet((url, n) => (n <= limit ? reply(302, { location: `https://objects.example/hop${n}` }) : reply(200, { body: (async function* one() { yield new Uint8Array(BINARY); })() })));
  const five = hops(RUNE_LIMITS.hops);
  assert.equal((await ensureRune(packageRoot(t), HOST, five.get)).source, 'fetched');
  assert.equal(five.calls.length, RUNE_LIMITS.hops + 1);

  const sixRoot = packageRoot(t);
  const six = hops(RUNE_LIMITS.hops + 1);
  const refused = await ensureRune(sixRoot, HOST, six.get);
  assertOneLine(refused);
  assert.equal(six.calls.length, RUNE_LIMITS.hops + 1, 'the sixth hop is never requested');
  assert.doesNotMatch(refused.line, /objects\.example/);
  assert.deepEqual(fetchedFiles(sixRoot), []);
});

test('no pin or no target asks nothing', async (t) => {
  const cases = [
    ['no release.json', packageRoot(t, { pin: false }), HOST],
    ['another version', packageRoot(t), { ...HOST, version: '9.9.9' }],
    ['no asset for darwin-x64', packageRoot(t), { platform: 'darwin', arch: 'x64', version: HOST.version }],
  ];
  for (const [name, root, host] of cases) {
    assert.equal(findRune(root, host).fetchable, false, name);
    const net = stubGet(() => assert.fail(`${name}: get was called`));
    const state = await ensureRune(root, host, net.get);
    assertOneLine(state);
    assert.equal(net.calls.length, 0, name);
    assert.deepEqual(fetchedFiles(root), [], name);
  }
});

/** What `reg.exe query` prints, captured on this machine (value 0x2) with the value set per case. */
const regOutput = (value) =>
  `\r\nHKEY_LOCAL_MACHINE\\SYSTEM\\CurrentControlSet\\Control\\CI\\Policy\r\n    VerifiedAndReputablePolicyState    REG_DWORD    ${value}\r\n\r\n`;

test('Smart App Control enforced downloads nothing', async (t) => {
  const asked = [];
  const run = (value) => (cmd, args) => {
    asked.push([cmd, ...args]);
    return regOutput(value);
  };
  assert.equal(smartAppControl(run('0x1')), 'on');
  assert.deepEqual(asked[0], ['reg.exe', 'query', 'HKLM\\SYSTEM\\CurrentControlSet\\Control\\CI\\Policy', '/v', 'VerifiedAndReputablePolicyState']);
  assert.equal(smartAppControl(run('0x2')), 'evaluation');
  assert.equal(smartAppControl(run('0x0')), 'off');
  assert.equal(smartAppControl(run('0x7')), 'unknown');
  assert.equal(
    smartAppControl(() => {
      throw new Error('ERROR: The system was unable to find the specified registry key or value.');
    }),
    'unknown',
  );

  const root = packageRoot(t);
  const net = stubGet(() => assert.fail('get was called'));
  const state = await ensureRune(root, { ...HOST, run: run('0x1') }, net.get);
  assertOneLine(state);
  assert.match(state.line, /Smart App Control/);
  assert.equal(net.calls.length, 0);
  assert.deepEqual(fetchedFiles(root), []);

  // Evaluation mode does not block, so the download goes ahead.
  const ok = stubGet(() => reply(200, { body: (async function* one() { yield new Uint8Array(BINARY); })() }));
  assert.equal((await ensureRune(packageRoot(t), { ...HOST, run: run('0x2') }, ok.get)).source, 'fetched');
});
