/**
 * S8 of deferred-ledger: the deck has a favicon (spec 12, L16).
 *
 * `deck/ui/favicon.svg` is served at `/ui/favicon.svg` off the same
 * allowlisted route as the page's modules (ADR 0030, L10), named on the list
 * rather than matched by a wildcard, and each of the three templates links it
 * from its `<head>`.
 */

import './no-open.mjs';

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { deckOnAPort } from '../testUtils.mjs';

const { postItem } = await import('../store.mjs');

const FAVICON = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'ui', 'favicon.svg');

const LINK = '<link rel="icon" href="/ui/favicon.svg" />';

test('the favicon is served as image/svg+xml, byte for byte, and revalidated on every load', async (t) => {
  const base = await deckOnAPort(t);

  const answer = await fetch(`${base}/ui/favicon.svg`);
  const body = await answer.text();

  assert.equal(answer.status, 200);
  assert.equal(answer.headers.get('content-type'), 'image/svg+xml', 'a browser tab icon');
  assert.equal(answer.headers.get('cache-control'), 'no-cache', 'kept, but asked about again, so an upgrade is seen');
  assert.equal(body, fs.readFileSync(FAVICON, 'utf8'), 'the bytes on disk');
});

test('the favicon file carries no script and no external reference', () => {
  const svg = fs.readFileSync(FAVICON, 'utf8');

  assert.doesNotMatch(svg, /<script/i, 'nothing the browser would execute');
  assert.doesNotMatch(svg, /href="http/i, 'nothing that reaches off the deck');
  assert.ok(fs.statSync(FAVICON).size < 1024, 'small enough to be one request nobody notices');
});

test('the home page links the favicon', async (t) => {
  const base = await deckOnAPort(t);

  const home = await (await fetch(base)).text();

  assert.ok(home.includes(LINK), 'the home page head carries the icon link');
});

test('the deck page links the favicon', async (t) => {
  const base = await deckOnAPort(t);

  const items = await (await fetch(`${base}/items`)).text();

  assert.ok(items.includes(LINK), 'the deck page head carries the icon link');
});

test('a thread page links the favicon', async (t) => {
  const base = await deckOnAPort(t);
  const item = postItem({ kind: 'question', title: 'Which port?', body: '4321?' });

  const thread = await (await fetch(`${base}/thread/${item.id}`)).text();

  assert.ok(thread.includes(LINK), 'the thread page head carries the icon link');
});
