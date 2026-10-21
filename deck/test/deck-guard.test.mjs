/**
 * The guard (deck-token S1, spec 1, 2, 4; L4, L5, L7, A1): a POST without the store's secret is
 * refused with a 401 that names the file and never holds the value, a client that sends
 * `bearer()` is taken, the page credential is the cookie for this port only, and a replaced
 * file is taken by a running deck with no restart. No assertion prints a secret.
 */
import './no-open.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { bearer, cookieName, ensureSecret, secretFile } from '../../hooks/lib/deck-secret.js';
import { freePort, tempDeck } from '../testUtils.mjs';

const { createDeckHttpServer } = await import('../server.mjs');
const { isAuthorized } = await import('../server-wait.mjs');

const DAEMON = fileURLToPath(new URL('../daemon.mjs', import.meta.url));

/** A deck with the guard as the daemon has it: no `secret` option, so the store's file. */
async function guardedDeck(t) {
  tempDeck(t);
  const server = createDeckHttpServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(
    () =>
      new Promise((resolve) => {
        server.closeAllConnections();
        server.close(resolve);
      }),
  );
  return `http://127.0.0.1:${server.address().port}`;
}

const readTool = (base, headers = {}) =>
  fetch(`${base}/api/tool`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify({ name: 'deck_read', arguments: {} }),
  });

test('a write without the secret is refused', async (t) => {
  const base = await guardedDeck(t);
  const secret = ensureSecret();

  const refused = await readTool(base);
  const text = await refused.text();
  assert.equal(refused.status, 401);
  assert.ok(!text.includes(secret), 'the refusal holds no secret');
  assert.equal(JSON.parse(text).error, `the deck wants its secret, from ${secretFile()}`);

  const wrong = await readTool(base, { authorization: `Bearer ${'0'.repeat(64)}` });
  assert.equal(wrong.status, 401, 'a wrong secret is refused as no secret is');

  const taken = await readTool(base, bearer());
  assert.equal(taken.status, 200, 'the store secret as a Bearer header is taken');

  assert.throws(() => createDeckHttpServer({ secret: '' }), TypeError, 'an empty secret is not a guard');
});

test('a refused page press names pilot deck', async (t) => {
  const base = await guardedDeck(t);
  const secret = ensureSecret();

  const press = await fetch(`${base}/reply`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', origin: base },
    body: new URLSearchParams({ id: 'itm_000000000000', text: 'yes' }),
    redirect: 'manual',
  });
  const text = await press.text();
  assert.equal(press.status, 401, 'its own Origin is not the secret');
  assert.match(press.headers.get('content-type'), /^text\/plain/);
  assert.match(text, /pilot deck/);
  assert.ok(!text.includes(secret), 'the refusal holds no secret');
});

test('the cookie for this port is taken and another port\'s is not', () => {
  const secret = 'a'.repeat(64);
  const port = 43210;
  const asked = (cookie, headers = {}) => ({ headers: { cookie, ...headers }, socket: { localPort: port } });

  assert.equal(isAuthorized(asked(`other=1; ${cookieName(port)}=${secret}`), secret), true);
  assert.equal(isAuthorized(asked(`${cookieName(port + 1)}=${secret}`), secret), false, "another deck's cookie is not this one's");
  assert.equal(isAuthorized(asked(`${cookieName(port)}=${'b'.repeat(64)}`), secret), false);
  assert.equal(isAuthorized(asked(`${cookieName(port)}=${secret.slice(1)}`), secret), false, 'a shorter value is refused, not thrown');
  assert.equal(isAuthorized(asked(undefined), secret), false);
  assert.equal(isAuthorized(asked(undefined, { authorization: `Bearer ${secret}` }), secret), true);
  assert.equal(isAuthorized(asked(undefined, { authorization: secret }), secret), false, 'the scheme is Bearer');
  assert.equal(isAuthorized(asked(undefined), null), true, 'a null secret is the unguarded test deck (L5)');
});

test('a rotated file is taken without a restart', async (t) => {
  const base = await guardedDeck(t);
  const old = bearer();
  assert.equal((await readTool(base, old)).status, 200);

  fs.rmSync(secretFile());
  const fresh = { authorization: `Bearer ${ensureSecret()}` };

  assert.equal((await readTool(base, old)).status, 401, 'the old secret is refused from the next request on');
  assert.equal((await readTool(base, fresh)).status, 200, 'and the new one is taken');
});

test('the MCP client round-trips on a real daemon', async (t) => {
  const dir = tempDeck(t);
  const port = await freePort();
  fs.rmSync(path.join(dir, 'deck.secret'), { force: true }); // tempDeck's, so the daemon has to make its own
  const daemon = spawn(process.execPath, [DAEMON], {
    env: { ...process.env, PILOT_DECK_DIR: dir, PILOT_DECK_PORT: String(port), PILOT_DECK_NO_OPEN: '1' },
    stdio: 'ignore',
    windowsHide: true,
  });
  const gone = new Promise((resolve, reject) => daemon.once('exit', resolve).once('error', reject));
  gone.catch(() => {}); // a failed spawn is rethrown by the `await gone` below, not raised unhandled before it

  const previousPort = process.env.PILOT_DECK_PORT;
  process.env.PILOT_DECK_PORT = String(port);
  try {
    const base = `http://127.0.0.1:${port}`;
    for (let tries = 0; ; tries += 1) {
      const up = await fetch(`${base}/api/health`, { signal: AbortSignal.timeout(1000) }).then((r) => r.ok, () => false);
      if (up) break;
      assert.ok(tries < 200, 'the daemon came up');
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    assert.ok(fs.existsSync(path.join(dir, 'deck.secret')), 'the daemon made its secret before it answered');

    const client = await import('../client.mjs?deck-guard');
    const posted = await client.callDeckTool('deck_post', { kind: 'question', title: 'Which door?', body: 'A or B' });
    const id = posted.content[0].text.match(/itm_[0-9a-f]+/)?.[0];
    assert.ok(id, `deck_post was taken: ${posted.content[0].text}`);

    const press = await fetch(`${base}/reply`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', origin: base, ...bearer() },
      body: new URLSearchParams({ id, text: 'the left one' }),
      redirect: 'manual',
    });
    assert.equal(press.status, 303);

    const { wait } = await import('../wait.mjs');
    const said = [];
    const code = await wait({ repo: process.cwd(), cwd: process.cwd(), timeoutMinutes: 0.1, pollMs: 200, say: (line) => said.push(line), warn: (line) => said.push(line) });
    assert.equal(code, 0, said.join(''));
    assert.match(said.join(''), new RegExp(`REPLY ${id}`));
  } finally {
    if (previousPort === undefined) delete process.env.PILOT_DECK_PORT;
    else process.env.PILOT_DECK_PORT = previousPort;
    daemon.kill();
    await gone;
  }
});
