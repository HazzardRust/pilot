#!/usr/bin/env node
/**
 * The deck's secret (deck-token spec 1, 2; L2, L3, L6): one per store, `deck.secret` beside
 * `deck.pid`, 32 random bytes as hex, created exclusively and 0600 on POSIX. The daemon's
 * guard refuses a request without it; every client this package ships reads it from here on
 * each request, so a deleted or replaced file is taken at once with nothing restarted (A1).
 *
 * CommonJS so the hooks can load it synchronously; the ESM deck imports it as it imports
 * `atomic-write.js`. The store-dir rule lives here and `deck/store-dir.mjs` delegates to it,
 * so a hook and the daemon can never disagree on where the file is.
 *
 * Nothing here prints, logs or puts a value in an error: a refusal names the file only.
 */

'use strict';

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

const SECRET_FILENAME = 'deck.secret';
const SECRET_SHAPE = /^[0-9a-f]{64}$/;
// A racer that lost `wx` can read the winner's file between its create and its write. Kept short:
// the daemon's guard reads through here on every request, and the wait blocks its event loop.
const SETTLE_TRIES = 3;
const SETTLE_MS = 5;

/** The directory in use: `PILOT_DECK_DIR`, or `~/.claude/pilot` when nothing overrides it. */
function deckDir() {
  return process.env.PILOT_DECK_DIR || path.join(os.homedir(), '.claude', 'pilot');
}

function secretFile(dir) {
  return path.join(dir || deckDir(), SECRET_FILENAME);
}

const sleepSync = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

/** The file's secret, waiting out a writer that has created it and not yet written; null while it is missing. */
function readSettled(file, settleTries = SETTLE_TRIES) {
  for (let tries = 0; ; tries += 1) {
    let text;
    try {
      text = fs.readFileSync(file, 'utf8').trim();
    } catch (err) {
      if (err.code === 'ENOENT') return null;
      throw new Error('the deck secret at ' + file + ' could not be read (' + err.code + ')');
    }
    if (SECRET_SHAPE.test(text)) return text;
    if (tries >= settleTries) throw new Error(file + ' does not hold a deck secret; delete it and the deck makes a new one');
    sleepSync(SETTLE_MS);
  }
}

/** Reads the store's secret, or creates it: exclusively (`wx`), 0600, so two racing starts end with one value. */
function ensureSecret(dir) {
  const file = secretFile(dir);
  const found = readSettled(file);
  if (found !== null) return found;
  const secret = crypto.randomBytes(32).toString('hex');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  let fd;
  try {
    fd = fs.openSync(file, 'wx', 0o600);
  } catch (err) {
    if (err.code !== 'EEXIST') throw new Error('the deck secret at ' + file + ' could not be created (' + err.code + ')');
    const theirs = readSettled(file);
    if (theirs === null) throw new Error('the deck secret at ' + file + ' vanished while it was being made');
    return theirs;
  }
  try {
    fs.writeSync(fd, secret);
  } catch (err) {
    // An empty file left behind would refuse every request until someone deleted it.
    fs.closeSync(fd);
    fd = undefined;
    fs.rmSync(file, { force: true });
    throw new Error('the deck secret at ' + file + ' could not be written (' + err.code + ')');
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
  return secret;
}

/** Reads the store's secret; throws naming the file, never a value, when it is missing. */
function readSecret(dir) {
  const file = secretFile(dir);
  // No settling: the daemon writes the file before its port answers, so a client never meets a half-made one.
  const found = readSettled(file, 0);
  if (found === null) {
    throw Object.assign(new Error('the deck has no secret at ' + file + '; start the deck with `pilot deck`'), { code: 'NO_DECK_SECRET' });
  }
  return found;
}

/** The header every non-browser client sends (L3). */
function bearer(dir) {
  return { authorization: 'Bearer ' + readSecret(dir) };
}

/** The page credential's name, one per port, because cookies do not isolate by port (RFC 6265 §8.5, A3). */
function cookieName(port) {
  return 'pilot_deck_' + port;
}

module.exports = { deckDir, secretFile, ensureSecret, readSecret, bearer, cookieName };
