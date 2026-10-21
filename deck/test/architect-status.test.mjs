/**
 * architect-runs-red fix round, F1: the architect's deck_status carries `ticket`, `slices` and
 * `feature` only. The hook's stamp names the author; a call from the architect that carries
 * `finished`, `next`, `qa` or `worktree` is refused and stores nothing.
 */

import './no-open.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';

import { tempDeck } from '../testUtils.mjs';

const { recordFor, registerRun } = await import('../store.mjs');
const { callTool } = await import('../server.mjs');

const REPO = path.join('D:', 'work', 'pilot');
const ARCHITECT = 'pilot:pilot-architect';
const call = (run, extra) => ({ run: run.id, slug: 'a-feature', slices: [{ slice: 'S1', state: 'planned' }], author: ARCHITECT, ...extra });

test('an architect stamp carrying finished, next, qa or worktree is refused and stores nothing', (t) => {
  tempDeck(t);
  const run = registerRun({ repo: REPO, pid: process.pid });
  for (const extra of [{ finished: 'done' }, { next: 'S1' }, { qa: { url: 'http://x' } }, { worktree: path.join(REPO, 'wt') }]) {
    const field = Object.keys(extra)[0];
    assert.throws(() => callTool('deck_status', call(run, extra)), (err) => err.name === 'DeckRefusal' && err.message.includes(field));
  }
  assert.equal(recordFor(REPO), null);
});

test('an architect stamp with ticket, slices and feature is accepted', (t) => {
  tempDeck(t);
  const run = registerRun({ repo: REPO, pid: process.pid });
  callTool('deck_status', call(run, { ticket: 'itm_1', feature: 'a feature' }));
  assert.equal(recordFor(REPO).slug, 'a-feature');
});
