/**
 * Where the Rune deck comes from (prebuilt-rune, ADR NNNN): a release build made on this machine,
 * else the binary CI built for this target, downloaded once and kept only while its sha256 matches
 * the pin this plugin ships in `deck/rune/release.json` (L1). `findRune` decides from disk alone and
 * never touches the network, so the daemon's auto-open and doctor can call it; `ensureRune` is the
 * one caller of `get`, and only `pilot deck` calls it (L2, A6). Built beats fetched beats the page,
 * and nothing here changes an exit code (L4).
 *
 * No URL or path comes from the environment or a config: the host, repository and directory are
 * constants, the tag and file name come from the pin, and both are checked before they are used.
 */

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

/**
 * The Rune deck built under `root` by `cargo build --release`, or null. A debug build is not the deck,
 * and only a regular file counts, so a half-built target directory opens the page as before.
 */
export function runeBinary(root, platform) {
  const file = path.join(root, 'deck', 'rune', 'target', 'release', platform === 'win32' ? 'pilot-deck.exe' : 'pilot-deck');
  try {
    return fs.statSync(file).isFile() ? file : null;
  } catch {
    return null;
  }
}

/** The one place a binary is downloaded from (L6). */
const RELEASES = 'https://github.com/HazzardRust/pilot/releases/download';
/** A release tag or a scratch prerelease's (L6, A9). */
const TAG = /^v\d+\.\d+\.\d+$|^rune-scratch-[0-9a-f]{7,40}$/;
/** A plain file name, so a pin cannot point a download outside `fetched/`. */
const ASSET = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const SHA256 = /^[0-9a-f]{64}$/;
/** The download rule (A2): https on every hop, at most `hops` redirects, `timeoutMs` in all, `maxBytes` large. */
export const RUNE_LIMITS = Object.freeze({ hops: 5, timeoutMs: 30_000, maxBytes: 100 * 1024 * 1024 });
const REDIRECT = new Set([301, 302, 303, 307, 308]);

const fetchedDir = (root) => path.join(root, 'deck', 'rune', 'target', 'fetched');
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const prefix = (hex) => hex.slice(0, 12);

/** The pinned asset for `target` at `version`, with the URL it is fetched from, or why there is none. */
export function readPin(root, version, target) {
  const file = path.join(root, 'deck', 'rune', 'release.json');
  let pin;
  try {
    pin = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    return { reason: err.code === 'ENOENT' ? 'no Rune release is pinned for this version' : `the Rune pin is unreadable: ${err.message}` };
  }
  if (pin?.version !== version) return { reason: `the Rune pin is for ${pin?.version}, not ${version}` };
  if (typeof pin.tag !== 'string' || !TAG.test(pin.tag)) return { reason: 'the Rune pin names no valid release tag' };
  const asset = pin.assets?.[target];
  if (!asset) return { reason: `no prebuilt Rune deck for ${target}` };
  if (typeof asset.file !== 'string' || !ASSET.test(asset.file) || typeof asset.sha256 !== 'string' || !SHA256.test(asset.sha256)) {
    return { reason: `the Rune pin for ${target} is malformed` };
  }
  return { url: `${RELEASES}/${pin.tag}/${asset.file}`, file: asset.file, sha256: asset.sha256 };
}

/**
 * The Rune deck to run, from disk alone: the release build, else the fetched binary while it matches its
 * pin. A fetched file that no longer matches is deleted here and this launch runs nothing (spec 4).
 */
export function findRune(root, host) {
  const built = runeBinary(root, host.platform);
  if (built) return { source: 'built', file: built };
  const pin = readPin(root, host.version, `${host.platform}-${host.arch}`);
  if (pin.reason) return { source: null, reason: pin.reason, fetchable: false };
  const file = path.join(fetchedDir(root), pin.file);
  let bytes;
  try {
    bytes = fs.readFileSync(file);
  } catch (err) {
    if (err.code === 'ENOENT') return { source: null, reason: 'the Rune deck has not been fetched yet', fetchable: true };
    return { source: null, reason: `could not read ${file}: ${err.message}`, fetchable: false };
  }
  const got = sha256(bytes);
  if (got === pin.sha256) return { source: 'fetched', file };
  let deleted = 'deleted';
  try {
    fs.rmSync(file, { force: true });
  } catch (err) {
    // A lock (antivirus, a window still running it) leaves it in place; it is never run while it differs.
    deleted = `could not delete it: ${err.message}`;
  }
  return {
    source: null,
    reason: `${pin.file} changed on disk (sha256 ${prefix(got)}…, pinned ${prefix(pin.sha256)}…); ${deleted}, opening the page`,
    fetchable: false,
  };
}

/**
 * `findRune`, and where it says the pinned binary is only not fetched yet, the download: one GET, kept
 * only if its sha256 matches the pin, written beside and renamed so no half file is ever run. `line` is
 * the one line `pilot deck` prints: what was fetched, or why the page opens instead.
 */
export async function ensureRune(root, host, get) {
  const state = findRune(root, host);
  if (state.source) return state;
  if (!state.fetchable) return { ...state, line: `Rune deck: ${state.reason}` };
  if (host.platform === 'win32' && host.run && smartAppControl(host.run) === 'on') {
    const reason = 'Windows Smart App Control is on and blocks an unsigned Rune deck; nothing downloaded, opening the page';
    return { source: null, reason, fetchable: false, line: `Rune deck: ${reason}` };
  }
  const pin = readPin(root, host.version, `${host.platform}-${host.arch}`);
  let bytes;
  try {
    bytes = await download(pin.url, get);
  } catch (err) {
    return { source: null, reason: err.message, fetchable: true, line: `Rune deck: could not download ${pin.file}: ${err.message}; opening the page` };
  }
  const got = sha256(bytes);
  if (got !== pin.sha256) {
    const reason = `${pin.file} does not match its pin (sha256 ${prefix(got)}…, pinned ${prefix(pin.sha256)}…); nothing stored, opening the page`;
    return { source: null, reason, fetchable: true, line: `Rune deck: ${reason}` };
  }
  const file = path.join(fetchedDir(root), pin.file);
  const part = `${file}.${process.pid}.part`;
  try {
    fs.mkdirSync(fetchedDir(root), { recursive: true });
    fs.writeFileSync(part, bytes, { mode: 0o755 });
    fs.chmodSync(part, 0o755);
    fs.renameSync(part, file);
  } catch (err) {
    fs.rmSync(part, { force: true });
    return { source: null, reason: err.message, fetchable: true, line: `Rune deck: could not store ${pin.file}: ${err.message}; opening the page` };
  }
  return { source: 'fetched', file, line: `Rune deck: fetched ${pin.file}, sha256 ${prefix(got)}… verified` };
}

/**
 * The body at `url` under RUNE_LIMITS. The deadline is raced against every step, so a `get` or a body
 * that ignores the signal still stops at it; no step is retried.
 */
async function download(url, get) {
  const { hops, timeoutMs, maxBytes } = RUNE_LIMITS;
  const controller = new AbortController();
  let timer;
  const deadline = new Promise((_, reject) => {
    timer = setTimeout(() => {
      const err = new Error(`the download took over ${timeoutMs / 1000} s`);
      controller.abort(err);
      reject(err);
    }, timeoutMs);
  });
  deadline.catch(() => {});
  const inTime = (step) => Promise.race([step, deadline]);
  let reader;
  try {
    let at = url;
    for (let hop = 0; hop <= hops; hop += 1) {
      const res = await inTime(get(at, { signal: controller.signal }));
      // Frees the connection of a response whose body is never read.
      if (res.status !== 200) res.body?.cancel?.().catch(() => {});
      if (REDIRECT.has(res.status)) {
        const next = new URL(res.headers?.get?.('location') ?? '', at);
        // The signed URL a redirect names is never printed (L6): only its scheme is.
        if (next.protocol !== 'https:') throw new Error(`a redirect left https (${next.protocol})`);
        at = next.href;
        continue;
      }
      if (res.status !== 200) throw new Error(`HTTP ${res.status}`);
      reader = res.body[Symbol.asyncIterator]();
      const chunks = [];
      let size = 0;
      for (;;) {
        const { done, value } = await inTime(reader.next());
        if (done) {
          reader = undefined;
          return Buffer.concat(chunks);
        }
        size += value.byteLength;
        if (size > maxBytes) throw new Error(`the download is over ${maxBytes / 1024 / 1024} MB`);
        chunks.push(value);
      }
    }
    throw new Error(`more than ${hops} redirects`);
  } finally {
    clearTimeout(timer);
    // A body left mid-read is released, never awaited: one that ignores the signal may never settle.
    if (reader) Promise.resolve(reader.return?.()).catch(() => {});
  }
}

/**
 * Windows Smart App Control's state, from the registry through `run` (spec 10, A5): it blocks unsigned
 * code when on, so `ensureRune` downloads nothing then. Anything unreadable is 'unknown'.
 */
export function smartAppControl(run) {
  let out;
  try {
    out = run('reg.exe', ['query', 'HKLM\\SYSTEM\\CurrentControlSet\\Control\\CI\\Policy', '/v', 'VerifiedAndReputablePolicyState']);
  } catch {
    return 'unknown';
  }
  const value = /VerifiedAndReputablePolicyState\s+REG_DWORD\s+0x([0-9a-f]+)/i.exec(String(out))?.[1];
  return { 1: 'on', 2: 'evaluation', 0: 'off' }[value === undefined ? '' : parseInt(value, 16)] ?? 'unknown';
}

/** The real `run`: a hidden, bounded child process whose stdout is returned. */
export const defaultRun = (cmd, args) => execFileSync(cmd, args, { encoding: 'utf8', windowsHide: true, timeout: 5000, stdio: ['ignore', 'pipe', 'ignore'] });

/** The real `get`: the platform's fetch, redirects handed back so each hop is checked above. */
export const defaultGet = (url, { signal }) => fetch(url, { redirect: 'manual', signal });
