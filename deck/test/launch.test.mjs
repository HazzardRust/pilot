/**
 * The deck launch (deck-token S3, spec 3, 4, 7; A2, A3, L7): the open file forwards a browser to
 * `GET /open?key=`, which sets the page credential for this port and goes home; a wrong key sets
 * nothing; `pilot deck` and `--scratch` print the open file's path and never the secret; and
 * `pilot deck --rotate` replaces the secret a running deck takes. No assertion prints a secret.
 */
import './no-open.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

import { cookieName, ensureSecret } from '../../hooks/lib/deck-secret.js';
import { tempDeck } from '../testUtils.mjs';

const { createDeckHttpServer } = await import('../server.mjs');
const { openCookie, openFile, rotateSecret, writeOpenFile } = await import('../launch.mjs');

const CLI = fileURLToPath(new URL('../../bin/pilot.mjs', import.meta.url));
const run = promisify(execFile);

/** A guarded deck on its own store dir, as the daemon stands it: no `secret` option, so the store's file. */
async function guardedDeck(t) {
  const dir = tempDeck(t);
  const server = createDeckHttpServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(
    () =>
      new Promise((resolve) => {
        server.closeAllConnections();
        server.close(resolve);
      }),
  );
  const { port } = server.address();
  return { dir, port, base: `http://127.0.0.1:${port}` };
}

const readTool = (base, headers = {}) =>
  fetch(`${base}/api/tool`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify({ name: 'deck_read', arguments: {} }),
  });

/** The `name=value` a browser sends back for a Set-Cookie. */
const sentBack = (setCookie) => setCookie.split(';')[0];

/** The CLI, async so the in-process deck it asks can answer, in `dir` and on `port`. */
const pilot = (args, dir, port) =>
  run(process.execPath, [CLI, ...args], {
    encoding: 'utf8',
    timeout: 20_000,
    windowsHide: true,
    // The test is the session, so a scratch deck it starts is leashed to it (process-gc S1).
    env: { ...process.env, PILOT_DECK_DIR: dir, PILOT_DECK_PORT: String(port), PILOT_DECK_NO_OPEN: '1', CLAUDE_PID: String(process.pid) },
  });

test('the right key sets the cookie and forwards home', async (t) => {
  const { base, port } = await guardedDeck(t);
  const secret = ensureSecret();

  // A 200 that forwards home from the deck's own origin, not a 303: the open file is a file://
  // start, so a redirect's landing is cross-site and SameSite=Strict would withhold the cookie.
  const opened = await fetch(`${base}/open?key=${secret}`, { redirect: 'manual' });
  assert.equal(opened.status, 200);
  assert.match(opened.headers.get('content-type'), /^text\/html/);
  const body = await opened.text();
  assert.match(body, /http-equiv="refresh" content="0; url=\/"/, 'the page forwards to /');
  assert.ok(!body.includes(secret), 'the forward holds no key');
  const setCookie = opened.headers.get('set-cookie');
  assert.ok(setCookie === openCookie(port, secret), 'the page credential is the open cookie for this port');
  assert.match(setCookie, new RegExp(`^${cookieName(port)}=`));
  for (const attribute of ['HttpOnly', 'SameSite=Strict', 'Path=/', 'Max-Age=34560000']) {
    assert.ok(setCookie.split('; ').includes(attribute), `the cookie carries ${attribute}`);
  }

  const press = await readTool(base, { cookie: sentBack(setCookie), origin: base });
  assert.equal(press.status, 200, 'a press carrying the cookie is taken');
});

test('a wrong key sets nothing', async (t) => {
  const { base } = await guardedDeck(t);
  const secret = ensureSecret();
  const wrong = '0'.repeat(64);

  for (const query of [`?key=${wrong}`, '', '?key=', `?key=${secret.slice(1)}`]) {
    const refused = await fetch(`${base}/open${query}`, { redirect: 'manual' });
    const text = await refused.text();
    assert.equal(refused.status, 401, `/open${query.replace(/key=.*/, 'key=…')} is refused`);
    assert.equal(refused.headers.get('set-cookie'), null, 'and sets no cookie');
    assert.match(text, /pilot deck/, 'the page says to open the deck with pilot deck');
    assert.ok(!text.includes(wrong) && !text.includes(secret.slice(1)), 'with no echo of the key');
  }
});

test('the open file forwards with the key and is 0600', (t) => {
  const dir = tempDeck(t);
  const secret = ensureSecret(dir);
  const url = 'http://127.0.0.1:5011';

  const file = writeOpenFile(dir, url, secret);
  assert.equal(file, openFile(dir));
  assert.equal(file, path.join(dir, 'deck-open.html'));
  const html = fs.readFileSync(file, 'utf8');
  assert.ok(html.includes(`${url}/open?key=${secret}`), 'the file forwards to /open with the key');
  assert.match(html, /http-equiv="refresh"/);
  if (process.platform !== 'win32') assert.equal(fs.statSync(file).mode & 0o777, 0o600);

  // Written again over itself, as each daemon start does, it still holds one forward.
  writeOpenFile(dir, 'http://127.0.0.1:5012', secret);
  assert.ok(!fs.readFileSync(file, 'utf8').includes(url), 'the old port is gone');

  // The href is an attribute value: a quote or an ampersand in it is escaped, never closes the attribute.
  writeOpenFile(dir, 'http://127.0.0.1:5013/a&b"c', secret);
  assert.ok(fs.readFileSync(file, 'utf8').includes('url=http://127.0.0.1:5013/a&amp;b&quot;c/open?key='));
});

test("two decks' cookies stand side by side", async (t) => {
  const users = await guardedDeck(t);
  const usersSecret = ensureSecret(users.dir);
  const scratch = await guardedDeck(t);
  const scratchSecret = ensureSecret(scratch.dir);

  const usersCookie = sentBack(openCookie(users.port, usersSecret));
  const scratchCookie = sentBack(openCookie(scratch.port, scratchSecret));
  assert.notEqual(usersCookie.split('=')[0], scratchCookie.split('=')[0], 'one name per port');

  assert.equal((await readTool(users.base, { cookie: scratchCookie })).status, 401, "the scratch deck's cookie is refused by the user's deck");
  assert.equal((await readTool(users.base, { cookie: `${scratchCookie}; ${usersCookie}` })).status, 200, 'its own is taken beside it');
  assert.equal((await readTool(scratch.base, { cookie: `${usersCookie}; ${scratchCookie}` })).status, 200, 'and the scratch deck takes its own');
});

test('rotation replaces the secret and the open file', async (t) => {
  const { dir, port, base } = await guardedDeck(t);
  const old = ensureSecret(dir);
  fs.writeFileSync(path.join(dir, 'deck.pid'), `${process.pid} ${port}`);

  const file = rotateSecret(dir);
  const fresh = ensureSecret(dir);
  assert.ok(fresh !== old, 'a new value');
  assert.equal(file, openFile(dir));
  assert.ok(fs.readFileSync(file, 'utf8').includes(`${base}/open?key=${fresh}`), 'the open file holds the new key, on the port deck.pid names');
  assert.equal((await readTool(base, { authorization: `Bearer ${old}` })).status, 401, 'the running deck refuses the old');
  assert.equal((await readTool(base, { authorization: `Bearer ${fresh}` })).status, 200, 'and takes the new');

  const { stdout } = await pilot(['deck', '--rotate'], dir, port);
  const rotated = ensureSecret(dir);
  assert.ok(rotated !== fresh, 'the command rotates too');
  assert.equal(stdout.trim(), `rotated; open ${openFile(dir)}`);
  assert.ok(![old, fresh, rotated].some((value) => stdout.includes(value)), 'stdout holds no secret');
});

test('pilot deck prints the open line, not the secret', async (t) => {
  const { dir, port, base } = await guardedDeck(t);
  const secret = ensureSecret(dir);

  // A deck older than its open file: the line says how to get one, not a path to nothing.
  const older = await pilot(['deck'], dir, port);
  assert.deepEqual(older.stdout.trim().split(/\r?\n/), [`The deck is up at ${base}`, 'no open file: `pilot deck --rotate` writes one']);

  writeOpenFile(dir, base, secret);
  const { stdout } = await pilot(['deck'], dir, port);
  assert.deepEqual(stdout.trim().split(/\r?\n/), [`The deck is up at ${base}`, `open ${openFile(dir)}`]);
  assert.ok(!stdout.includes(secret), 'stdout holds no secret');

  const scratch = await pilot(['deck', '--scratch'], dir, port);
  const lines = Object.fromEntries(scratch.stdout.trim().split(/\r?\n/).map((line) => line.split(/ (.*)/s).slice(0, 2)));
  t.after(() => pilot(['deck', '--stop', lines.pid], dir, port));
  assert.deepEqual(Object.keys(lines), ['url', 'pid', 'dir', 'open']);
  assert.equal(lines.open, openFile(lines.dir));
  const scratchSecret = ensureSecret(lines.dir);
  assert.ok(fs.readFileSync(lines.open, 'utf8').includes(`${lines.url}/open?key=${scratchSecret}`), "the scratch daemon wrote its own open file");
  assert.ok(!scratch.stdout.includes(scratchSecret), 'stdout holds no secret');
});
