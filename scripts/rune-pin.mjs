#!/usr/bin/env node
/**
 * The pin a Rune release ships (prebuilt-rune S4, ADR 0224): the publish run hands this the three
 * binaries its build jobs made, and it writes `deck/rune/release.json` in the shape `readPin`
 * (`deck/rune-bin.mjs`) reads.
 *
 *   node scripts/rune-pin.mjs <version> <tag> <dir>   # the pin on stdout; problems on stderr, exit 1
 */
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { TAG } from '../deck/rune-bin.mjs';

/** Each target's asset name (A8). */
export const ASSETS = {
  'win32-x64': 'pilot-deck-win32-x64.exe',
  'darwin-arm64': 'pilot-deck-darwin-arm64',
  'linux-x64': 'pilot-deck-linux-x64',
};

const SEMVER = /^\d+\.\d+\.\d+$/;

const u16 = (b, at) => (b.length >= at + 2 ? b.readUInt16LE(at) : -1);
const u32 = (b, at) => (b.length >= at + 4 ? b.readUInt32LE(at) : -1);

/** A PE image for x64: `MZ`, then `PE\0\0` at the offset 0x3C holds, machine AMD64. */
function isWindowsX64(b) {
  const pe = u32(b, 0x3c);
  return b.subarray(0, 2).toString('latin1') === 'MZ' && pe > 0 && b.subarray(pe, pe + 4).toString('latin1') === 'PE\0\0' && u16(b, pe + 4) === 0x8664;
}

/** A 64-bit little-endian ELF for x86-64. */
function isLinuxX64(b) {
  return u32(b, 0) === 0x464c457f && b[4] === 2 && b[5] === 1 && u16(b, 18) === 0x3e;
}

/** A 64-bit Mach-O for arm64 that carries a code signature (the linker's ad-hoc one, spec 1). */
function isSignedDarwinArm64(b) {
  if (u32(b, 0) !== 0xfeedfacf || u32(b, 4) !== 0x0100000c) return false;
  let at = 32;
  for (let i = u32(b, 16); i > 0; i--) {
    const cmd = u32(b, at);
    const size = u32(b, at + 4);
    if (cmd === 0x1d) return true; // LC_CODE_SIGNATURE
    if (size < 8) return false;
    at += size;
  }
  return false;
}

const HEADERS = {
  'win32-x64': [isWindowsX64, 'a Windows x64 executable'],
  'darwin-arm64': [isSignedDarwinArm64, 'a signed macOS arm64 executable'],
  'linux-x64': [isLinuxX64, 'a Linux x64 executable'],
};

/** The pin for the binaries in `dir`, and every reason it must not ship; `json` is empty when there is one. */
export function pinRelease({ version, tag, dir }) {
  const problems = [];
  if (typeof version !== 'string' || !SEMVER.test(version)) problems.push(`version must be x.y.z, got ${JSON.stringify(version)}`);
  // A release tag must be this version's; any other tag `readPin` accepts is a scratch prerelease's (A9, L6).
  else if (tag?.startsWith('v') ? tag !== `v${version}` : !TAG.test(tag ?? '')) problems.push(`tag ${JSON.stringify(tag)} is neither v${version} nor a rune-scratch-<sha> tag`);
  const assets = {};
  for (const [target, file] of Object.entries(ASSETS)) {
    let bytes;
    try {
      bytes = fs.readFileSync(path.join(dir, file));
    } catch (err) {
      problems.push(`${file} is missing: ${err.code ?? err.message}`);
      continue;
    }
    const [isTarget, what] = HEADERS[target];
    if (!isTarget(bytes)) {
      problems.push(`${file} is not ${what}`);
      continue;
    }
    assets[target] = { file, sha256: createHash('sha256').update(bytes).digest('hex') };
  }
  if (problems.length) return { json: '', problems };
  return { json: `${JSON.stringify({ version, tag, assets }, null, 2)}\n`, problems };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [version, tag, dir] = process.argv.slice(2);
  const { json, problems } = pinRelease({ version, tag, dir: dir ?? '' });
  if (problems.length) {
    for (const problem of problems) process.stderr.write(`rune-pin: ${problem}\n`);
    process.exit(1);
  }
  process.stdout.write(json);
}
