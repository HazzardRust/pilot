/**
 * S3 of start-end-session: a `pilot run` wrapper reads its own change stream,
 * `GET /events?wrapper=<cwd>` (spec 7, L5, F6). It is refused with any Origin, is not a
 * page, and its close tells the pages, so a window closed by hand turns its tab ended live.
 */

import './no-open.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';

import { deckOnAPort } from '../testUtils.mjs';
import { browserCount } from '../server.mjs';
import { addWrapper, wrappersOf } from '../session.mjs';

const REPO = 'D:/work/alpha & co';
const wrapperPath = (repo = REPO) => `/events?wrapper=${encodeURIComponent(repo)}`;

/**
 * Open a stream on `path`; `close` aborts it, `heard` resolves on the first `event: changed`,
 * and `count` is how many have arrived so far.
 */
async function aStream(t, base, path, headers = {}) {
  const stopping = new AbortController();
  const response = await fetch(`${base}${path}`, { headers: { accept: 'text/event-stream', ...headers }, signal: stopping.signal });
  t.after(() => stopping.abort());
  let text = '';
  let seen;
  const first = new Promise((resolve) => { seen = () => resolve(true); });
  const reading = (async () => {
    if (!response.body) return false;
    const decoder = new TextDecoder();
    try {
      for await (const chunk of response.body) {
        text += decoder.decode(chunk, { stream: true });
        if (text.includes('event: changed')) seen?.();
      }
    } catch {
      // Aborted by the test.
    }
    return false;
  })();
  const heard = Promise.race([first, reading]);
  const count = () => text.split('event: changed').length - 1;
  return { response, heard, count, close: () => stopping.abort() };
}

const within = (promise, ms = 2000) =>
  Promise.race([promise, new Promise((resolve) => setTimeout(() => resolve('timed out'), ms))]);

// No re-announce left running into a later test's exact counts.
const NO_GRACE = { wrapperGoneMs: [] };

const settle = () => new Promise((resolve) => setTimeout(resolve, 50));

test('a wrapper stream is refused when an Origin is present', async (t) => {
  const base = await deckOnAPort(t, NO_GRACE);
  // A cross-site `EventSource` sends its Origin; the deck's own page sends the deck's.
  // A wrapper sends none, so either is somebody who is not a wrapper (L5).
  for (const origin of ['http://evil.example', base]) {
    const response = await fetch(`${base}${wrapperPath()}`, { headers: { origin } });
    assert.equal(response.status, 403, `Origin ${origin}`);
    await response.text();
  }
  // A page's no-cors GET (`<img src>`, `fetch(url, { mode: 'no-cors' })`) sends no Origin,
  // but every browser request carries `Sec-Fetch-Site`, which no script can set.
  const noCors = await fetch(`${base}${wrapperPath()}`, { headers: { 'sec-fetch-site': 'cross-site' } });
  assert.equal(noCors.status, 403, 'a browser with no Origin');
  await noCors.text();
  assert.deepEqual(wrappersOf(REPO), [], 'a refused stream is not registered');
});

test('a wrapper stream is not counted by browserCount', async (t) => {
  const base = await deckOnAPort(t, NO_GRACE);
  const before = browserCount();
  const wrapper = await aStream(t, base, wrapperPath());

  assert.equal(wrapper.response.status, 200);
  assert.match(wrapper.response.headers.get('content-type'), /^text\/event-stream/);
  assert.equal(browserCount(), before, 'a wrapper is nobody looking at the deck (F6)');
  assert.equal(wrappersOf(REPO).length, 1, 'it is registered under its repository');

  wrapper.close();
  await settle();
  assert.equal(wrappersOf(REPO).length, 0);
});

test('closing a wrapper stream announces a change', async (t) => {
  const base = await deckOnAPort(t, NO_GRACE);
  const staying = await aStream(t, base, wrapperPath('D:/work/other'));
  const closing = await aStream(t, base, wrapperPath());
  // Opened after the wrappers, whose opening the pages hear as well (S4, L6).
  const page = await aStream(t, base, '/events');

  closing.close();

  assert.equal(await within(page.heard), true, 'the page hears the wrapper go, and re-renders its tab');
  assert.equal(await within(staying.heard), true, 'another wrapper still hears every change');
});

test('a closed wrapper stream announces twice more after a grace', async (t) => {
  // The window's close drops the wrapper's stream before its session's MCP client has
  // died (seen on the live gate: dead within about 15 s), so the first re-render still
  // finds the run's pid alive. Two more announces, keyed to this close and never again,
  // let the page judge the pids again (F1): soon, and once past the slow path. No polling.
  const base = await deckOnAPort(t, { wrapperGoneMs: [300, 900] });
  const closing = await aStream(t, base, wrapperPath());
  // Opened after the wrapper, whose opening the pages hear as well (S4, L6).
  const page = await aStream(t, base, '/events');
  const at = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  closing.close();
  await at(150);
  assert.equal(page.count(), 1, 'at once');
  await at(450);
  assert.equal(page.count(), 2, 'after the first grace');
  await at(600);
  assert.equal(page.count(), 3, 'after the second');
  await at(600);
  assert.equal(page.count(), 3, 'and never again');
});

test('wrappersOf matches by sameRepo and forgets a closed stream', () => {
  const stream = { send() {} };
  const alpha = path.join(os.tmpdir(), 'pilot-wrapper-alpha');
  const remove = addWrapper(alpha, stream);

  assert.deepEqual(wrappersOf(path.join(alpha, 'sub', '..')), [stream], 'any spelling of the same repository');
  assert.deepEqual(wrappersOf(path.join(os.tmpdir(), 'pilot-wrapper-beta')), []);

  remove();
  remove();
  assert.deepEqual(wrappersOf(alpha), []);
});
