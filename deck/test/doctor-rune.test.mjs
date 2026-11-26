/**
 * prebuilt-rune S3: `pilot doctor` has a Rune row (spec 8, 10).
 *
 * Every missing state comes from S2's real `findRune` over a package root of its own in a temp directory,
 * so the reasons are the ones `pilot deck` prints, never typed here. No test reaches the network or the
 * registry: `fetch` is replaced by one that fails, and Smart App Control is read through a stub `run`.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { checkAll, runeRow } from '../doctor.mjs';
import { findRune } from '../rune-bin.mjs';
import { PLUGIN_VERSION } from '../version.mjs';

// checkAll asks for this plugin's own version, so every pin here names it.
const VERSION = PLUGIN_VERSION;
const HOST = { platform: 'win32', arch: 'x64', version: VERSION };
const ASSET = 'pilot-deck-win32-x64.exe';
const BINARY = Buffer.from('MZ a Rune deck built by CI');
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

/** A package root of its own; `pin: false` writes no `release.json`, `stored` writes those bytes as the fetched file. */
function packageRoot(t, { pin = { version: VERSION, tag: `v${VERSION}`, assets: { 'win32-x64': { file: ASSET, sha256: sha256(BINARY) } } }, stored } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pilot-doctor-rune-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const rune = path.join(root, 'deck', 'rune');
  fs.mkdirSync(rune, { recursive: true });
  if (pin) fs.writeFileSync(path.join(rune, 'release.json'), JSON.stringify(pin));
  if (stored) {
    fs.mkdirSync(path.join(rune, 'target', 'fetched'), { recursive: true });
    fs.writeFileSync(path.join(rune, 'target', 'fetched', ASSET), stored);
  }
  return root;
}

/** What `reg.exe query` prints, as S2 captured it, with the value set per case. */
const regOutput = (value) =>
  `\r\nHKEY_LOCAL_MACHINE\\SYSTEM\\CurrentControlSet\\Control\\CI\\Policy\r\n    VerifiedAndReputablePolicyState    REG_DWORD    ${value}\r\n\r\n`;

/** `checkAll` with every other probe faked and `fetch` failing; `findRune` runs on `root`. */
async function doctorOn(t, root, { platform = 'win32', sac = '0x0' } = {}) {
  const fetched = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    fetched.push(String(url));
    throw new Error('doctor reached the network');
  };
  t.after(() => {
    globalThis.fetch = realFetch;
  });
  const asked = [];
  const rows = await checkAll({
    platform,
    run: (cmd) => {
      if (/reg\.exe$/i.test(cmd)) return regOutput(sac);
      throw new Error('not read in this test');
    },
    root: '/home/dev/projects',
    resolveDep: () => true,
    storeDir: '/home/dev/.claude/pilot',
    canWrite: () => true,
    onPath: () => true,
    git: () => 'none',
    probe: async () => ({ state: 'none' }),
    readView: async () => null,
    readSettings: () => ({}),
    findRune: (...args) => {
      asked.push(args);
      return findRune(root, args[1]);
    },
  });
  return { rows, fetched, asked, rune: rows.filter((row) => row.name === 'rune deck') };
}

test('a built deck is named', () => {
  const file = path.join('C:', 'plugin', 'deck', 'rune', 'target', 'release', 'pilot-deck.exe');
  assert.deepEqual(runeRow({ state: { source: 'built', file }, version: VERSION }), {
    name: 'rune deck',
    verdict: 'pass',
    detail: `built here, ${file}`,
  });
});

test('a fetched deck says verified', (t) => {
  const root = packageRoot(t, { stored: BINARY });
  const state = findRune(root, HOST);
  assert.deepEqual(runeRow({ state, version: '0.9.11' }), { name: 'rune deck', verdict: 'pass', detail: 'fetched 0.9.11, verified' });
});

test('each missing reason names its step', async (t) => {
  const cases = [
    ['not fetched yet', packageRoot(t), HOST, /not been fetched yet/, ['pilot deck']],
    ['no pin for this version', packageRoot(t, { pin: false }), HOST, /no Rune release is pinned/, undefined],
    ['a pin for another version', packageRoot(t), { ...HOST, version: '9.9.9' }, /pin is for .+, not 9\.9\.9/, undefined],
    ['no asset for this platform', packageRoot(t), { platform: 'darwin', arch: 'x64', version: VERSION }, /no prebuilt Rune deck for darwin-x64/, undefined],
    ['hash mismatch', packageRoot(t, { stored: Buffer.from('MZ tampered') }), HOST, /changed on disk/, undefined],
  ];
  for (const [name, root, host, reason, steps] of cases) {
    const row = runeRow({ state: findRune(root, host), version: host.version });
    assert.equal(row.verdict, 'warn', name);
    assert.match(row.detail, /^missing: /, name);
    assert.match(row.detail, reason, name);
    assert.deepEqual(row.steps, steps, name);
  }

  // Smart App Control is read by doctor itself, only where a download is what would help.
  const enforced = await doctorOn(t, packageRoot(t), { sac: '0x1' });
  assert.equal(enforced.rune.length, 1);
  assert.equal(enforced.rune[0].verdict, 'warn');
  assert.match(enforced.rune[0].detail, /^missing: .*Smart App Control is on/);
  assert.equal(enforced.rune[0].steps, undefined);
  const evaluating = await doctorOn(t, packageRoot(t), { sac: '0x2' });
  assert.deepEqual(evaluating.rune[0].steps, ['pilot deck']);
});

test('doctor never downloads', async (t) => {
  const { rows, fetched, asked, rune } = await doctorOn(t, packageRoot(t));
  assert.equal(rows.at(-1), rune[0], 'the Rune row comes last, after the deck rows');
  assert.equal(rune.length, 1);
  assert.equal(rune[0].verdict, 'warn');
  assert.deepEqual(fetched, []);
  assert.equal(asked.length, 1);
  const [, host] = asked[0];
  assert.ok(!Object.values(host).some((value) => typeof value === 'function'), 'findRune is handed no function to call out with');
  assert.deepEqual(Object.keys(host).sort(), ['arch', 'platform', 'version']);
});
