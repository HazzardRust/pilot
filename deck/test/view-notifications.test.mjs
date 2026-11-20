/**
 * rune-deck-ui S10 (spec 2, 3): the Notifications region as data. Its notices and open threads are the ones the
 * HTML panel draws for the same items, each open thread with the pilot's write count its seen mark is kept against.
 * Every test owns its fixtures.
 */

import './no-open.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';

const { notificationsView } = await import('../view/notifications.mjs');
const { viewOf } = await import('../view/index.mjs');
const { renderNotifications } = await import('../ui/render-rail.mjs');

const MINE = path.join('D:', 'work', 'pilot');

const aQuestion = (id, over = {}) => ({
  id, kind: 'question', title: `question ${id}`, body: 'A or B', repo: MINE, postedAt: '2026-11-01T10:00:00.000Z', replies: [], options: ['A', 'B'], ...over,
});

const closedAt = (id, at) => aQuestion(id, { resolvedAt: at, resolution: 'decided\nmore', notice: true });

const reads = (items) => ({ seq: 1, items, runs: [], numbers: {}, agents: {}, added: [], lanes: { coPilots: {}, switches: {}, records: [] }, held: [], alerts: {} });

/** What the HTML panel draws: the closed notices' ids, then the open threads' ids with their `data-said`. */
const pageIds = (items) => {
  const html = renderNotifications(items, [], '/');
  return {
    notices: [...html.matchAll(/data-notice="([^"]*)"/g)].map(([, id]) => id),
    open: [...html.matchAll(/data-thread="([^"]*)" data-said="(\d+)"/g)].map(([, id, said]) => ({ id, writes: Number(said) })),
  };
};

test('the notices are the page\'s', () => {
  const older = closedAt('itm_0000000000a1', '2026-11-02T10:00:00.000Z');
  const newer = closedAt('itm_0000000000a2', '2026-11-03T10:00:00.000Z');
  const quiet = aQuestion('itm_0000000000a3', { resolvedAt: '2026-11-03T11:00:00.000Z', resolution: 'done' });
  const first = aQuestion('itm_0000000000b1');
  const spoken = aQuestion('itm_0000000000b2', { title: 'Which <port>?', replies: [{ from: 'pilot', text: 'one' }, { from: 'user', text: 'A' }, { from: 'pilot', text: 'two' }] });
  const items = [older, newer, quiet, first, spoken];

  const view = notificationsView(reads(items), {});

  const page = pageIds(items);
  assert.deepEqual(view.notices.map(({ id }) => id), page.notices);
  assert.deepEqual(view.open.map(({ id, writes }) => ({ id, writes })), page.open);
  assert.deepEqual(view.notices[0], { id: newer.id, title: newer.title, href: `/thread/${newer.id}`, at: Date.parse(newer.resolvedAt) });
  assert.deepEqual(view.open[0], { id: spoken.id, title: 'Which <port>?', href: `/thread/${spoken.id}`, writes: 3 });
});

test('an empty deck has nothing to notify', () => {
  assert.deepEqual(notificationsView(reads([]), {}), { notices: [], open: [] });
  assert.equal(renderNotifications([], [], '/'), '');
});

test('the region is the view\'s notifications', () => {
  const items = [closedAt('itm_0000000000a1', '2026-11-02T10:00:00.000Z'), aQuestion('itm_0000000000b1')];

  assert.deepEqual(viewOf(reads(items), { screen: 'home' }).regions.notifications, notificationsView(reads(items), {}));
});
