/**
 * The deck launch (deck-token spec 3, 7; A2, A3): how a browser gets in. The open file,
 * `deck-open.html` beside `deck.pid`, 0600, forwards to `GET /open?key=<secret>`, which sets the
 * page credential, the cookie named for this port, and sends the browser home. The key never sits
 * in argv or a printed line: `openDeck` and `pilot deck` name the file, as Jupyter's redirect file
 * keeps its token off the command line. Rotation replaces the secret and rewrites the file.
 */

import fs from 'node:fs';
import path from 'node:path';

import { cookieName, deckDir, ensureSecret, secretFile } from '../hooks/lib/deck-secret.js';
import { refuseWithoutSecret, sameSecret } from './server-wait.mjs';
import { escapeHtml } from './ui/markdown.mjs';
import { DECK_HOST, deckPort } from './tools.mjs';

const OPEN_FILENAME = 'deck-open.html';
// 400 days, the most a browser keeps a cookie (RFC 6265bis): rotation, not expiry, ends it (A1).
const MAX_AGE_S = 34_560_000;

// What `/open` answers once the key is right: a forward home from the deck's own origin.
const FORWARD_HOME = [
  '<!doctype html>',
  '<meta charset="utf-8">',
  '<meta http-equiv="refresh" content="0; url=/">',
  '<title>pilot deck</title>',
  '<p><a href="/">Open the deck</a></p>',
  '',
].join('\n');


/** The open file's path in `dir`, the store dir by default. */
export function openFile(dir = deckDir()) {
  return path.join(dir, OPEN_FILENAME);
}

/**
 * Writes the open file for the deck at `url`: a meta refresh to `/open?key=`, sending no referrer.
 * Through a fresh 0600 file renamed over the old, so the secret is never in a file another user
 * can read, even for a moment. Returns its path.
 */
export function writeOpenFile(dir, url, secret) {
  const file = openFile(dir);
  const href = escapeHtml(`${url}/open?key=${encodeURIComponent(secret)}`);
  const html = [
    '<!doctype html>',
    '<meta charset="utf-8">',
    '<meta name="referrer" content="no-referrer">',
    `<meta http-equiv="refresh" content="0; url=${href}">`,
    '<title>pilot deck</title>',
    `<p><a href="${href}">Open the deck</a></p>`,
    '',
  ].join('\n');
  const tmp = `${file}.${process.pid}.tmp`;
  fs.rmSync(tmp, { force: true });
  try {
    fs.writeFileSync(tmp, html, { flag: 'wx', mode: 0o600 });
    fs.renameSync(tmp, file);
  } catch (err) {
    fs.rmSync(tmp, { force: true });
    throw new Error(`the open file ${file} could not be written (${err.code})`);
  }
  return file;
}

/** The port `deck.pid` in `dir` names, or undefined when it names none. */
function pidPort(dir) {
  let text;
  try {
    text = fs.readFileSync(path.join(dir, 'deck.pid'), 'utf8').trim();
  } catch {
    return undefined;
  }
  const named = /^[1-9]\d{0,9} ([1-9]\d{0,4})$/.exec(text);
  return named && Number(named[1]) < 65536 ? Number(named[1]) : undefined;
}

/**
 * Rotate (spec 7): delete the secret, make a new one and rewrite the open file for the port the
 * running deck names in `deck.pid`, else the default. A running deck reads the file on every
 * request, so it refuses the old value from the next one on. Returns the open file.
 */
export function rotateSecret(dir = deckDir(), port = pidPort(dir) ?? deckPort()) {
  fs.rmSync(secretFile(dir), { force: true });
  return writeOpenFile(dir, `http://${DECK_HOST}:${port}`, ensureSecret(dir));
}

/** The page credential for the deck on `port` (A3): HttpOnly, SameSite=Strict, the whole deck. */
export function openCookie(port, secret) {
  return `${cookieName(port)}=${secret}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${MAX_AGE_S}`;
}

/**
 * `GET /open?key=` (spec 3): the right key sets the cookie for the port this request arrived on
 * and forwards home from this page, a 200 rather than a 303. The open file is a file:// start, so
 * a redirect's landing on `/` is cross-site and SameSite=Strict withholds the cookie from it; a
 * forward from the deck's own origin is same-origin and carries it. Anything else is the guard's
 * 401 page (L7), which echoes nothing it was sent. An unguarded test deck (a null secret) has no
 * key to take, so it refuses too.
 */
export function answerOpen(request, response, key, guard) {
  const secret = guard.secret();
  if (!sameSecret(key, secret)) {
    return refuseWithoutSecret(response, '/open', guard.file);
  }
  response.writeHead(200, {
    'content-type': 'text/html; charset=utf-8',
    'set-cookie': openCookie(request.socket.localPort, secret),
    'cache-control': 'no-store',
    'referrer-policy': 'no-referrer',
  });
  return response.end(FORWARD_HOME);
}
