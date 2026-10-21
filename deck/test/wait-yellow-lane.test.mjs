/**
 * yellow-lane S1, spec 1; L2.
 *
 * The pilot's `pilot wait` prints `lanes.refusal` from `GET /api/record` and returns before it
 * parks; with a yellow ticket and no live co-pilot that line is the yellow lane's.
 *
 * The real daemon on its own store and an ephemeral port, never 4321.
 */

import './no-open.mjs';

import path from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { aTicket, deckOnAPort } from '../testUtils.mjs';

const { wait } = await import('../wait.mjs');

const REPO = path.resolve('D:/work/pilot');

test('pilot wait exits on it', async (t) => {
  const base = await deckOnAPort(t);
  process.env.PILOT_DECK_PORT = new URL(base).port;
  const yellow = aTicket('Building', 'yellow', REPO);
  const names = [];
  const real = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    if (String(url).endsWith('/api/tool') && typeof init?.body === 'string') names.push(JSON.parse(init.body).name);
    return real(url, init);
  };
  t.after(() => (globalThis.fetch = real));

  const said = [];
  const code = await wait({ env: {}, repo: REPO, kind: 'pilot', timeoutMinutes: 0.05, pollMs: 200, say: (line) => said.push(line), warn: (line) => said.push(line) });

  assert.equal(code, 0);
  assert.match(said.join(''), new RegExp(`^yellow lane empty; ${yellow.id} is planned — deck_ticket co-pilot it first$`, 'm'));
  assert.equal(names.includes('deck_wait'), false, 'it never parked');
});
