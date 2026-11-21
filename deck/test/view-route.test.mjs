/**
 * rune-deck-ui S1: `GET /api/view` and `viewOf`, the one read the Rune deck draws from (L2, L5).
 *
 * Every test takes its own store directory; nothing here touches port 4321 or the real store.
 */

import './no-open.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { bearer } from '../../hooks/lib/deck-secret.js';
import { deckOnAPort, tempDeck } from '../testUtils.mjs';

const { postItem, registerRun } = await import('../store.mjs');
const { viewOf } = await import('../view/index.mjs');
const { readDeck } = await import('../view/reads.mjs');

const ALPHA = 'D:/work/alpha';

test('the view names every region of the screen', (t) => {
  tempDeck(t);

  const view = viewOf(readDeck(), { screen: 'home' });

  assert.equal(view.screen, 'home');
  assert.deepEqual(Object.keys(view.regions).sort(), [
    'agents', 'chat', 'graph', 'history', 'notifications', 'queue', 'reply',
    'reports', 'status', 'strip', 'tabs', 'thread', 'tickets', 'usage',
  ]);
});

test('the view route is behind the secret', async (t) => {
  const base = await deckOnAPort(t, { secret: undefined });

  const refused = await fetch(`${base}/api/view?screen=home`);
  assert.equal(refused.status, 401);

  const response = await fetch(`${base}/api/view?screen=home`, { headers: bearer() });
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type'), /^application\/json/);
  const view = await response.json();
  assert.equal(view.screen, 'home');
  assert.equal(typeof view.seq, 'number');
  assert.equal(view.regions.tabs.tabs[0].code, 'Overview');
});

test('an unknown screen is a 404 naming it', async (t) => {
  const base = await deckOnAPort(t);

  const response = await fetch(`${base}/api/view?screen=nowhere`);

  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), { error: 'no screen nowhere' });
});

test('an unknown kind still has its tab counted', (t) => {
  tempDeck(t);
  registerRun({ repo: ALPHA, pid: process.pid });
  // `steps` is a standing kind now, so the read is the store's with a kind swapped in:
  // a kind this code has never seen, as a newer daemon's store would hold it.
  const posted = postItem({ kind: 'question', title: 'Do these', body: '1. press it', repo: ALPHA, author: '' });
  const reads = readDeck();
  reads.items = reads.items.map((item) => (item.id === posted.id ? { ...item, kind: 'mystery' } : item));

  const { tabs } = viewOf(reads, { screen: 'home', run: ALPHA }).regions.tabs;

  const alpha = tabs.find((tab) => tab.name === 'alpha');
  assert.equal(alpha.count, 1);
  assert.equal(alpha.selected, true);
  assert.equal(alpha.ended, false);
  assert.equal(alpha.href, `/?run=${encodeURIComponent(ALPHA)}`);
  assert.equal(tabs[0].count, 1, 'the overview counts it too');
});
