/**
 * prebuilt-rune S4: `pinRelease` pins the three Rune binaries a release run built, in the
 * `release.json` shape S1's `readPin` reads, and refuses a file that is not its target's executable.
 *
 * Each test builds a directory of its own. The headers are the smallest each OS's loader format
 * allows; one test also pins this host's own node binary, a header no test wrote.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { pinRelease } from '../rune-pin.mjs';
import { readPin } from '../../deck/rune-bin.mjs';

const SCRIPT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'rune-pin.mjs');
const ASSETS = {
  'win32-x64': 'pilot-deck-win32-x64.exe',
  'darwin-arm64': 'pilot-deck-darwin-arm64',
  'linux-x64': 'pilot-deck-linux-x64',
};
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

/** A PE image for x64: `MZ`, the PE offset at 0x3C, `PE\0\0`, machine 0x8664. */
function pe() {
  const b = Buffer.alloc(0x80);
  b.write('MZ', 0, 'latin1');
  b.writeUInt32LE(0x40, 0x3c);
  b.write('PE\0\0', 0x40, 'latin1');
  b.writeUInt16LE(0x8664, 0x44);
  return b;
}

/** A 64-bit little-endian ELF for x86-64. */
function elf() {
  const b = Buffer.alloc(64);
  Buffer.from([0x7f, 0x45, 0x4c, 0x46, 2, 1, 1]).copy(b, 0);
  b.writeUInt16LE(0x3e, 18);
  return b;
}

/** A 64-bit Mach-O for arm64 carrying one load command, LC_CODE_SIGNATURE unless `signed` is false. */
function macho({ signed = true } = {}) {
  const b = Buffer.alloc(32 + 16);
  b.writeUInt32LE(0xfeedfacf, 0);
  b.writeUInt32LE(0x0100000c, 4);
  b.writeUInt32LE(1, 16);
  b.writeUInt32LE(16, 20);
  b.writeUInt32LE(signed ? 0x1d : 0x19, 32);
  b.writeUInt32LE(16, 36);
  return b;
}

/** `b` with the 32-bit little-endian `value` written at `at`. */
function withU32(b, at, value) {
  b.writeUInt32LE(value, at);
  return b;
}

/** A directory holding `files` (asset name to bytes), removed after the test. */
function distDir(t, files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pilot-rune-pin-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  for (const [name, bytes] of Object.entries(files)) fs.writeFileSync(path.join(dir, name), bytes);
  return dir;
}

const goodFiles = () => ({
  [ASSETS['win32-x64']]: Buffer.concat([pe(), Buffer.from('windows')]),
  [ASSETS['darwin-arm64']]: Buffer.concat([macho(), Buffer.from('macos')]),
  [ASSETS['linux-x64']]: Buffer.concat([elf(), Buffer.from('linux')]),
});

/** A package root holding `json` as its pin, as the plugin ships it. */
function rootWithPin(t, json) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pilot-rune-pin-root-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, 'deck', 'rune'), { recursive: true });
  fs.writeFileSync(path.join(root, 'deck', 'rune', 'release.json'), json);
  return root;
}

test('a pin round-trips through the reader', (t) => {
  const files = goodFiles();
  for (const tag of ['v1.2.3', 'rune-scratch-0a1b2c3']) {
    const { json, problems } = pinRelease({ version: '1.2.3', tag, dir: distDir(t, files) });
    assert.deepEqual(problems, []);
    const root = rootWithPin(t, json);
    for (const [target, file] of Object.entries(ASSETS)) {
      const pin = readPin(root, '1.2.3', target);
      assert.equal(pin.sha256, sha256(files[file]), `${tag} ${target}`);
      assert.equal(pin.url, `https://github.com/HazzardRust/pilot/releases/download/${tag}/${file}`);
    }
  }
});

test("this host's own node binary passes its target's header check", { skip: !ASSETS[`${process.platform}-${process.arch}`] && 'no target for this host' }, (t) => {
  const files = goodFiles();
  const dir = distDir(t, files);
  fs.copyFileSync(process.execPath, path.join(dir, ASSETS[`${process.platform}-${process.arch}`]));
  assert.deepEqual(pinRelease({ version: '1.2.3', tag: 'v1.2.3', dir }).problems, []);
});

test('a wrong header is a problem', (t) => {
  const cases = [
    ['a Linux ELF under the Windows name', { [ASSETS['win32-x64']]: elf() }, ASSETS['win32-x64']],
    ['a Windows PE under the Linux name', { [ASSETS['linux-x64']]: pe() }, ASSETS['linux-x64']],
    ['an unsigned Mach-O', { [ASSETS['darwin-arm64']]: macho({ signed: false }) }, ASSETS['darwin-arm64']],
    ['an empty file', { [ASSETS['darwin-arm64']]: Buffer.alloc(0) }, ASSETS['darwin-arm64']],
    ['a Mach-O claiming 2^32-1 load commands', { [ASSETS['darwin-arm64']]: withU32(macho({ signed: false }), 16, 0xffffffff) }, ASSETS['darwin-arm64']],
    ['a PE offset past the end', { [ASSETS['win32-x64']]: withU32(pe(), 0x3c, 0xffffffff) }, ASSETS['win32-x64']],
  ];
  for (const [what, swap, file] of cases) {
    const { problems } = pinRelease({ version: '1.2.3', tag: 'v1.2.3', dir: distDir(t, { ...goodFiles(), ...swap }) });
    assert.equal(problems.length, 1, what);
    assert.match(problems[0], new RegExp(file.replace(/\./g, '\\.')), what);
  }
});

test('a missing target is a problem', (t) => {
  const files = goodFiles();
  delete files[ASSETS['linux-x64']];
  const { problems } = pinRelease({ version: '1.2.3', tag: 'v1.2.3', dir: distDir(t, files) });
  assert.equal(problems.length, 1);
  assert.match(problems[0], /pilot-deck-linux-x64/);
});

test('a tag that does not match the version is a problem', (t) => {
  const dir = distDir(t, goodFiles());
  for (const tag of ['v1.2.4', 'v1.2', 'rune-scratch-XYZ', '1.2.3', 'rune-scratch-0a1b2c3/../x']) {
    const { problems } = pinRelease({ version: '1.2.3', tag, dir });
    assert.equal(problems.length, 1, tag);
    assert.match(problems[0], /tag/, tag);
  }
  assert.equal(pinRelease({ version: '1.2', tag: 'v1.2', dir }).problems.length, 1);
});

test('the job fails on a problem and prints no pin', (t) => {
  const files = goodFiles();
  files[ASSETS['win32-x64']] = elf();
  const dir = distDir(t, files);
  const bad = spawnSync(process.execPath, [SCRIPT, '1.2.3', 'v1.2.3', dir], { encoding: 'utf8', windowsHide: true });
  assert.equal(bad.status, 1);
  assert.equal(bad.stdout, '');
  assert.match(bad.stderr, /pilot-deck-win32-x64\.exe/);

  fs.writeFileSync(path.join(dir, ASSETS['win32-x64']), pe());
  const good = spawnSync(process.execPath, [SCRIPT, '1.2.3', 'v1.2.3', dir], { encoding: 'utf8', windowsHide: true });
  assert.equal(good.status, 0, good.stderr);
  assert.equal(JSON.parse(good.stdout).tag, 'v1.2.3');
});
