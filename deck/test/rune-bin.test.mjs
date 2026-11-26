/**
 * prebuilt-rune S1: `pilot deck` downloads, verifies and opens a pinned Rune binary.
 *
 * Every test builds a package root of its own in a temp directory, with the pin it needs, and hands
 * `ensureRune` a stub `get` that records each URL: no test reaches the network (brief, Network).
 */

import './no-open.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { deckOnAPort } from '../testUtils.mjs';

const { ensureRune, findRune } = await import('../rune-bin.mjs');
const { PLUGIN_VERSION } = await import('../version.mjs');

const HOST = { platform: 'win32', arch: 'x64', version: '1.2.3' };
const ASSET = 'pilot-deck-win32-x64.exe';
const BINARY = Buffer.from('MZ a Rune deck built by CI');
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

/** A package root of its own: a pin for `host`'s target naming `asset` at `sha`, and a release build when `built`. */
function packageRoot(t, { host = HOST, asset = ASSET, sha = sha256(BINARY), built = false } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pilot-rune-bin-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const rune = path.join(root, 'deck', 'rune');
  fs.mkdirSync(rune, { recursive: true });
  const pin = { version: host.version, tag: `v${host.version}`, assets: { [`${host.platform}-${host.arch}`]: { file: asset, sha256: sha } } };
  fs.writeFileSync(path.join(rune, 'release.json'), JSON.stringify(pin));
  if (built) {
    const release = path.join(rune, 'target', 'release');
    fs.mkdirSync(release, { recursive: true });
    fs.writeFileSync(path.join(release, host.platform === 'win32' ? 'pilot-deck.exe' : 'pilot-deck'), 'built here');
  }
  return root;
}

/** A `get` that answers every URL with `bytes` and writes the URL down. */
function stubGet(bytes) {
  const calls = [];
  return {
    calls,
    get: async (url) => {
      calls.push(url);
      return {
        status: 200,
        headers: new Headers(),
        body: (async function* body() {
          yield new Uint8Array(bytes);
        })(),
      };
    },
  };
}

const fetchedDir = (root) => path.join(root, 'deck', 'rune', 'target', 'fetched');
const fetchedFiles = (root) => (fs.existsSync(fetchedDir(root)) ? fs.readdirSync(fetchedDir(root)) : []);

test('a pinned download is fetched once and then reused', async (t) => {
  const root = packageRoot(t);
  const net = stubGet(BINARY);

  const first = await ensureRune(root, HOST, net.get);
  assert.equal(first.source, 'fetched');
  assert.equal(first.file, path.join(fetchedDir(root), ASSET));
  assert.deepEqual(net.calls, [`https://github.com/HazzardRust/pilot/releases/download/v1.2.3/${ASSET}`], 'one plain GET to the pinned asset');
  assert.deepEqual(fs.readFileSync(first.file), BINARY);
  assert.deepEqual(fetchedFiles(root), [ASSET], 'no .part file left beside it');
  if (process.platform !== 'win32') assert.equal(fs.statSync(first.file).mode & 0o777, 0o755, 'stored executable');

  const second = await ensureRune(root, HOST, net.get);
  assert.deepEqual({ source: second.source, file: second.file }, { source: 'fetched', file: first.file });
  assert.equal(net.calls.length, 1, 'the second open downloads nothing');
});

test('a tampered download is never stored', async (t) => {
  const root = packageRoot(t);
  const tampered = Buffer.from('MZ something else entirely');
  const net = stubGet(tampered);

  const state = await ensureRune(root, HOST, net.get);
  assert.equal(state.source, null);
  assert.deepEqual(fetchedFiles(root), [], 'nothing stored, not even a part file');
  assert.match(state.line, new RegExp(ASSET.replace('.', '\\.')), 'the line names the file');
  assert.ok(state.line.includes(sha256(BINARY).slice(0, 12)), `the line names the pinned prefix: ${state.line}`);
  assert.ok(state.line.includes(sha256(tampered).slice(0, 12)), `the line names the downloaded prefix: ${state.line}`);
  assert.equal(state.line.split('\n').length, 1, 'one line');
});

test('a stored file changed on disk is refused at reuse', async (t) => {
  const root = packageRoot(t);
  const net = stubGet(BINARY);
  const { file } = await ensureRune(root, HOST, net.get);
  const bytes = fs.readFileSync(file);
  bytes[0] ^= 0xff;
  fs.writeFileSync(file, bytes);

  const state = findRune(root, HOST);
  assert.equal(state.source, null);
  assert.equal(fs.existsSync(file), false, 'the changed file is deleted');
  assert.ok(state.reason.includes(ASSET), state.reason);

  // That launch runs nothing and downloads nothing (spec 4); the next one fetches a fresh copy.
  fs.writeFileSync(file, bytes);
  const launch = await ensureRune(root, HOST, net.get);
  assert.equal(launch.source, null);
  assert.equal(net.calls.length, 1, 'no download on the launch that found it changed');
  assert.equal((await ensureRune(root, HOST, net.get)).source, 'fetched');
});

test('a local build wins and lookup never downloads', async (t) => {
  const root = packageRoot(t, { built: true });
  fs.mkdirSync(fetchedDir(root), { recursive: true });
  fs.writeFileSync(path.join(fetchedDir(root), ASSET), BINARY);
  assert.deepEqual(findRune(root, HOST), { source: 'built', file: path.join(root, 'deck', 'rune', 'target', 'release', 'pilot-deck.exe') });

  // The daemon's auto-open looks up with findRune, which holds no `get`: a pin and nothing stored still fetches nothing.
  const fetches = t.mock.method(globalThis, 'fetch', async () => {
    throw new Error('findRune reached the network');
  });
  const unfetched = packageRoot(t);
  const state = findRune(unfetched, HOST);
  assert.deepEqual({ source: state.source, fetchable: state.fetchable }, { source: null, fetchable: true });
  assert.equal(fetches.mock.callCount(), 0);
  assert.deepEqual(fetchedFiles(unfetched), []);
});

const TARGETS = ['win32-x64', 'darwin-arm64', 'linux-x64'];

test('pilot deck names the fetched copy', { skip: !TARGETS.includes(`${process.platform}-${process.arch}`) && 'no target for this host' }, async (t) => {
  const base = await deckOnAPort(t);
  for (const [name, value] of [['PILOT_DECK_PORT', new URL(base).port], ['PILOT_DECK_NO_OPEN', '1']]) {
    const previous = process.env[name];
    process.env[name] = value;
    t.after(() => (previous === undefined ? delete process.env[name] : (process.env[name] = previous)));
  }
  const { writeOpenFile } = await import('../launch.mjs');
  const { ensureSecret } = await import('../../hooks/lib/deck-secret.js');
  writeOpenFile(process.env.PILOT_DECK_DIR, base, ensureSecret());
  const { run: pilot } = await import('../../bin/pilot.mjs');

  const host = { platform: process.platform, arch: process.arch, version: PLUGIN_VERSION };
  const asset = `pilot-deck-${host.platform}-${host.arch}${host.platform === 'win32' ? '.exe' : ''}`;
  const root = packageRoot(t, { host, asset });
  const net = stubGet(BINARY);
  const said = [];
  t.mock.method(console, 'log', (...args) => said.push(args.join(' ')));
  t.mock.method(process.stderr, 'write', () => true);
  t.after(() => {
    process.exitCode = undefined;
  });

  // `run` stands in for the registry read (S2): Smart App Control off.
  await pilot(['deck'], { root, get: net.get, run: () => '    VerifiedAndReputablePolicyState    REG_DWORD    0x0' });
  t.mock.restoreAll();

  const lines = said.join('\n').split(/\r?\n/);
  assert.equal(lines[0], `The deck is up at ${base}`);
  assert.match(lines[1], /^open .+[\\/]pilot-deck-\d+(\.exe)?$/);
  assert.equal(path.dirname(lines[1].slice('open '.length)), path.join(root, 'deck', 'rune', 'target', 'run'));
  assert.equal(net.calls.length, 1);
});
