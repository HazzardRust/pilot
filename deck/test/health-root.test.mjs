/**
 * Slice S3 of deck-spawn-root: the deck names the root it serves from, and whether that
 * root is a checkout (spec 8, L7). Health, the probe and `pilot status` each carry it.
 *
 * Every server here is this test's own, on a port the operating system has just handed
 * out; nothing may touch port 4321, where the user's deck runs.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { healthOf } from '../health.mjs';
import { probeDeck } from '../probe.mjs';
import { isCheckout } from '../spawn-root.mjs';
import { statusLines } from '../status-command.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/** A server answering `/api/health` with `body`, and its url. */
async function aHealth(t, body) {
  const server = http.createServer((request, response) => {
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify(body));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  return `http://127.0.0.1:${server.address().port}`;
}

const aDeck = (probe) =>
  statusLines({
    url: 'http://127.0.0.1:1',
    probe: { state: 'deck', pid: 7, version: '0.9.3', startedAt: new Date(0).toISOString(), ...probe },
    agents: {},
    logTail: [],
    pluginVersion: '0.9.3',
    now: 60_000,
  });

test("health names the daemon's root", () => {
  const health = healthOf();
  assert.equal(health.root, ROOT, 'the directory holding the daemon package.json');
  assert.equal(health.checkout, isCheckout(ROOT));
});

test('the probe keeps root and checkout', async (t) => {
  const deck = await aHealth(t, { ok: true, pid: 7, root: 'C:\\plugins\\pilot\\0.9.4', checkout: true });
  const found = await probeDeck(deck);
  assert.equal(found.root, 'C:\\plugins\\pilot\\0.9.4');
  assert.equal(found.checkout, true);

  const installed = await probeDeck(await aHealth(t, { ok: true, pid: 7, root: '/opt/pilot', checkout: false }));
  assert.equal(installed.checkout, false, 'false is kept, not dropped');

  const odd = await probeDeck(await aHealth(t, { ok: true, pid: 7, root: { dir: 'x' }, checkout: 'yes' }));
  assert.equal(odd.state, 'deck');
  assert.equal('root' in odd, false, 'a non-text root is dropped');
  assert.equal('checkout' in odd, false, 'a non-boolean checkout is dropped');
});

test('status prints the root', () => {
  const installed = aDeck({ root: '/opt/pilot', checkout: false });
  assert.ok(installed.includes('root     /opt/pilot'), installed.join('\n'));

  const checkout = aDeck({ root: 'D:\\work\\pilot', checkout: true });
  assert.ok(checkout.includes('root     D:\\work\\pilot, checkout'), checkout.join('\n'));

  const before = aDeck({});
  assert.ok(!before.some((line) => line.startsWith('root')), 'a deck from before this feature prints no root line');

  const hostile = aDeck({ root: 'D:\\x\u001b[2J', checkout: true });
  // eslint-disable-next-line no-control-regex
  assert.ok(hostile.every((line) => !/[\u0000-\u001f\u007f-\u009f]/.test(line)), JSON.stringify(hostile));
});
