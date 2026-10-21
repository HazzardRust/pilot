#!/usr/bin/env node
/**
 * Shared atomic-write helper for hook and deck state files.
 *
 * Write-then-rename: rename is atomic on both POSIX and Windows NTFS, so a
 * process killed mid-write (its own timeout, or the harness tearing it down)
 * can never leave a half-written state file behind. Kept in one place so a
 * fix only has to be made once instead of drifting across copies; every
 * caller inherits the retry below (store-durability A6).
 *
 * The rename retries a Windows lock. A rename onto a target another process
 * holds open — antivirus scanning the file just written, or a concurrent
 * reader mid-readFileSync — fails with EPERM, EBUSY or EACCES. Those codes
 * are retried after 15, 30, 60, 120, 240 and 480 ms (about 945 ms in all);
 * the sleep is `Atomics.wait`, because the helper is synchronous (L8). Past
 * that budget, or at once on any other code, the FIRST error is rethrown,
 * since a caller that silently accepted a failed write would be worse, and
 * the temp file is removed so a failing rename cannot litter the directory.
 *
 * `options.renameSync` and `options.sleep` exist for the tests alone.
 */

'use strict';

const fs = require('fs');

const RETRY_CODES = Object.freeze(['EPERM', 'EBUSY', 'EACCES']);
const RETRY_DELAYS_MS = Object.freeze([15, 30, 60, 120, 240, 480]);

function sleepSync(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function atomicWriteFileSync(targetPath, contents, options) {
  const renameSync = (options && options.renameSync) || fs.renameSync;
  const sleep = (options && options.sleep) || sleepSync;
  const tmp = targetPath + '.' + process.pid + '.tmp';
  fs.writeFileSync(tmp, contents, { encoding: 'utf8', mode: 0o600 });
  fs.chmodSync(tmp, 0o600); // the mode covers only a new file; a stale tmp of a reused pid kept its own
  let firstErr = null;
  for (let attempt = 0; ; attempt++) {
    try {
      renameSync(tmp, targetPath);
      return;
    } catch (err) {
      if (firstErr === null) firstErr = err;
      if (!RETRY_CODES.includes(err && err.code) || attempt >= RETRY_DELAYS_MS.length) break;
      sleep(RETRY_DELAYS_MS[attempt]);
    }
  }
  try { fs.unlinkSync(tmp); } catch (cleanupErr) { /* nothing further to try */ }
  throw firstErr;
}

/**
 * A state dir only its owner can list or enter (mac-linux L6): the deck's store
 * and `pilot-inbox`. The mkdir mode covers only the dirs this call creates, and
 * the umask can narrow it, so the chmod after it is what turns an existing 0755
 * dir 0700. No process-wide umask change. Windows has no POSIX modes; there the
 * chmod leaves the dir writable and changes nothing else.
 *
 * A chmod refused with EPERM is a dir this user does not own, which its owner
 * already reaches, so refusing to write there buys no privacy (A5): the mode is
 * kept, `options.onKept(err)` is told, and the dir is returned. Anything else throws.
 */
function privateDir(dir, options) {
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  try {
    fs.chmodSync(dir, 0o700);
  } catch (err) {
    if (!err || err.code !== 'EPERM') throw err;
    if (options && options.onKept) options.onKept(err);
  }
  return dir;
}

module.exports = { atomicWriteFileSync: atomicWriteFileSync, privateDir: privateDir };
