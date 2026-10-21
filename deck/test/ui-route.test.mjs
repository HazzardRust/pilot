/**
 * Slice S4 of deferred-ledger: the page's script is ES modules the daemon
 * serves (spec 9, L10, ADR 0030).
 *
 * `GET /ui/<name>.mjs` answers from a fixed list: the files in `deck/ui/js/`,
 * read once when the daemon starts. The claim here is about what it refuses as
 * much as what it serves, because the name comes off the request line and a
 * route that joined it onto a directory would hand out every file the daemon
 * can read. So every request goes out raw through `http.request`, which sends
 * the path exactly as written: `fetch` would tidy `..` away in this process
 * before the daemon ever saw it, and the test would prove nothing.
 */

import './no-open.mjs';

import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { aSandbox, deckOnAPort } from '../testUtils.mjs';

const JS = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'ui', 'js');

/** One request, the path and the `Host` exactly as given. */
const ask = (base, urlPath, host = new URL(base).host) =>
  new Promise((resolve, reject) => {
    const request = http.request(
      { hostname: '127.0.0.1', port: new URL(base).port, path: urlPath, headers: { host }, setHost: false },
      (response) => {
        let text = '';
        response.on('data', (chunk) => {
          text += chunk;
        });
        response.on('end', () => resolve({ status: response.statusCode, headers: response.headers, text }));
      },
    );
    request.on('error', reject);
    request.end();
  });

test('the entry module is served as JavaScript, byte for byte, and revalidated on every load', async (t) => {
  const base = await deckOnAPort(t);

  const answer = await ask(base, '/ui/deck.mjs');

  assert.equal(answer.status, 200);
  assert.equal(answer.headers['content-type'], 'text/javascript; charset=utf-8', 'a module the browser will run');
  assert.equal(answer.headers['cache-control'], 'no-cache', 'kept, but asked about again, so an upgrade is seen');
  assert.equal(answer.text, fs.readFileSync(path.join(JS, 'deck.mjs'), 'utf8'), 'the bytes the tests import');
});

test('every module in deck/ui/js is on the list', async (t) => {
  const base = await deckOnAPort(t);

  for (const name of fs.readdirSync(JS).filter((file) => file.endsWith('.mjs'))) {
    assert.equal((await ask(base, `/ui/${name}`)).status, 200, `${name} is served`);
  }
});

test('nothing off the list is served, however the path is spelled', async (t) => {
  const base = await deckOnAPort(t);

  for (const urlPath of [
    '/ui/../store.mjs',
    '/ui/%2e%2e/server.mjs',
    '/ui/%2E%2E/server.mjs',
    '/ui/..%2fserver.mjs',
    '/ui/js/deck.mjs',
    '/ui/nope.mjs',
    '/ui/deck.css',
    '/ui/render.mjs',
    '/ui/render-parts.mjs',
    '/ui/render-cards.mjs',
    '/ui/render-strip.mjs',
    '/ui/render-rail.mjs',
    '/ui/render-pages.mjs',
    '/ui/deck.mjs/',
    '/ui/',
  ]) {
    const answer = await ask(base, urlPath);
    assert.equal(answer.status, 404, `${urlPath} is not a module the page loads`);
    assert.doesNotMatch(answer.text, /import|export/, `and nothing of a source file comes back for ${urlPath}`);
  }
});

test('a Host that is not the deck gets no module either', async (t) => {
  const base = await deckOnAPort(t);

  const answer = await ask(base, '/ui/deck.mjs', 'evil.example:4321');

  assert.equal(answer.status, 421, 'the route sits behind isOwnHost like every other');
});

/**
 * The entry is the one module that touches `window` (L11), so it is imported
 * here with a sandbox standing in for one: what it must do is install every
 * region against it, the page's regions and the usage readout,
 * which is what a page running it gets. Each test file runs in its own process,
 * and the stand-in is taken away again all the same.
 */
test('the entry installs the page against the window, and reads nothing else', async (t) => {
  const asked = [];
  const listening = [];
  const streams = [];
  const figure = { dataset: { usage: 'session' }, textContent: 'unknown', parentNode: { hidden: false } };
  globalThis.window = aSandbox({
    document: {
      activeElement: null,
      querySelectorAll: (selector) => (selector === '[data-usage]' ? [figure] : []),
      querySelector: () => null,
      addEventListener: (type) => listening.push(type),
    },
    fetch: (url) => {
      asked.push(url);
      return new Promise(() => {});
    },
    EventSource: function EventSource(url) {
      streams.push(url);
      this.addEventListener = () => {};
    },
  });
  t.after(() => delete globalThis.window);

  await import('../ui/js/deck.mjs');

  assert.deepEqual(streams, ['/events'], 'live.mjs is installed: the page listens for the deck moving');
  assert.ok(listening.includes('submit'), 'and replies in place');
  assert.deepEqual(asked, ['/api/usage', '/api/health'], 'the usage readout asks for its figures, and the page for its root');
});
