/**
 * yellow-lane S12 (spec 16-19, A5), its F1 seam: the work the pilot has handled since its last
 * hand-off, counted here from the store and served on `GET /api/record` as `work`, so the
 * context guard reads it through `deck.record` rather than a `deck_read` of the newest items.
 *
 * Every test takes its own store and port; nothing here touches 4321.
 */

import './no-open.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';

import { deckOnAPort, postStored } from '../testUtils.mjs';

const { workSince } = await import('../work.mjs');
const { listItems } = await import('../store.mjs');

const REPO = path.resolve('D:/work/work');
const OTHER = path.resolve('D:/work/elsewhere');
const GATE_OPTIONS = ['Sign off', 'Not yet'];

const press = (text, at) => ({ from: 'user', text, repliedAt: at, seq: 1 });
// A signed gate is closed with deck_resolve, so the count reads closed ones too.
const signed = (kind, at, more = {}) => ({
  id: `itm_${kind}${at.replace(/\D/g, '')}`, kind, title: kind, body: 'gate', repo: REPO,
  postedAt: '2026-10-01T00:00:00.000Z', options: GATE_OPTIONS, replies: [press('Sign off', at)], resolvedAt: at, ...more,
});
const handoff = (at) => ({ id: `itm_handoff${at.replace(/\D/g, '')}`, kind: 'handoff', repo: REPO, postedAt: at, replies: [] });

test('it counts signed gates', () => {
  const items = [
    signed('gate2', '2026-10-02T10:00:00.000Z'),
    signed('gate2', '2026-10-02T11:00:00.000Z', { resolvedAt: undefined }),
    signed('gate1', '2026-10-02T12:00:00.000Z'),
    signed('gate2', '2026-10-02T13:00:00.000Z', { repo: OTHER }),
  ];
  assert.deepEqual(workSince(items, REPO), { landings: 2, designs: 1, since: null });
});

test('a hand-off resets it', () => {
  const items = [
    signed('gate2', '2026-10-02T10:00:00.000Z'),
    signed('gate1', '2026-10-02T11:00:00.000Z'),
    handoff('2026-10-02T09:00:00.000Z'),
    handoff('2026-10-02T12:00:00.000Z'),
    signed('gate2', '2026-10-02T13:00:00.000Z'),
  ];
  assert.deepEqual(workSince(items, REPO), { landings: 1, designs: 0, since: 'itm_handoff20261002120000000' });
});

test('an unsigned or Not-yet gate does not count', () => {
  const items = [
    { id: 'itm_open', kind: 'gate2', repo: REPO, postedAt: '2026-10-02T10:00:00.000Z', options: GATE_OPTIONS, replies: [] },
    signed('gate2', '2026-10-02T11:00:00.000Z', {
      resolvedAt: undefined,
      replies: [press('Sign off', '2026-10-02T11:00:00.000Z'), press('Not yet\n\nthe tab is blank', '2026-10-02T11:05:00.000Z')],
    }),
    signed('gate1', '2026-10-02T12:00:00.000Z', { replies: [press('looks good to me', '2026-10-02T12:00:00.000Z')] }),
    // Closed, and its newest press withdraws the Sign off before it.
    signed('gate1', '2026-10-02T13:00:00.000Z', {
      replies: [press('Sign off', '2026-10-02T13:00:00.000Z'), press('Not yet', '2026-10-02T13:05:00.000Z')],
    }),
  ];
  assert.deepEqual(workSince(items, REPO), { landings: 0, designs: 0, since: null });
  assert.deepEqual(workSince(null, REPO), { landings: 0, designs: 0, since: null });
});

test('the record route serves it', async (t) => {
  const base = await deckOnAPort(t);
  postStored({ kind: 'gate2', title: 'landed', body: 'gate', repo: REPO, options: GATE_OPTIONS, replies: [press('Sign off', '2026-10-02T10:00:00.000Z')] });
  postStored({ kind: 'question', title: 'not a gate', body: 'asked', repo: REPO, options: ['A', 'B'], replies: [press('A', '2026-10-02T10:00:00.000Z')] });

  const served = await (await fetch(`${base}/api/record?repo=${encodeURIComponent(REPO)}`)).json();

  assert.deepEqual(served.work, workSince(listItems(), REPO));
  assert.deepEqual(served.work, { landings: 1, designs: 0, since: null });
});
