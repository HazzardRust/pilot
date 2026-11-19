/**
 * rune-deck-ui S8: the thread screen's view, `threadView`, read against the HTML thread page (L2, L4).
 *
 * Every test takes its own store directory or none; nothing here touches port 4321 or the real store.
 */

import './no-open.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import path from 'node:path';

import { bearer } from '../../hooks/lib/deck-secret.js';
import { deckOnAPort, tempDeck } from '../testUtils.mjs';

const { addPilotMessage, listItems, postItem, resolveItem } = await import('../store.mjs');
const { repoKey } = await import('../items.mjs');
const { renderThreadPage } = await import('../ui/render.mjs');
const { threadView } = await import('../view/thread.mjs');
const { readDeck } = await import('../view/reads.mjs');

const AT = '2026-11-20T09:00:00.000Z';
const MINE = path.join('D:', 'work', 'pilot');
const NUMBERS = { [repoKey(MINE)]: 1 };
const RUNS = [{ id: 'run_000000000001', repo: MINE, name: 'pilot', pid: process.pid, startedAt: AT, slices: [] }];
const LANES = { coPilots: {}, switches: {} };

let minted = 0;
const anItem = (over = {}) => ({
  id: `itm_${String((minted += 1)).padStart(12, '0')}`,
  kind: 'question',
  title: 'A question',
  body: 'the body',
  repo: MINE,
  postedAt: AT,
  replies: [],
  ...over,
});

const readsOf = (items) => ({ seq: 1, items, runs: RUNS, numbers: NUMBERS, agents: {}, added: [], alerts: {}, lanes: LANES, held: [] });

/** The page's walk as the user reads it: each arrow's thread id (null when inert) and the X/N beside them. */
function pageWalk(page) {
  const nav = /<nav class="threads" data-live="nav">([\s\S]*?)<\/nav>/.exec(page)[1];
  const arrow = (glyph) => {
    const link = new RegExp(`<a href="/thread/([^"?]+)[^"]*"[^>]*>${glyph}</a>`).exec(nav);
    return link ? decodeURIComponent(link[1]) : null;
  };
  const position = /<span class="position" data-live="position">([^<]*)<\/span>/.exec(page)?.[1] ?? null;
  return { prev: arrow('‹'), next: arrow('›'), position };
}

test('the walk is the page\'s walk, open and all=1', () => {
  const open = [anItem({ title: 'one' }), anItem({ title: 'two' }), anItem({ title: 'three' })];
  const settled = anItem({ title: 'settled', resolution: 'Done.', resolvedAt: AT });
  const items = [...open, settled];

  for (const all of [false, true]) {
    for (const item of items) {
      const { nav } = threadView(readsOf(items), { id: item.id, all });
      const page = pageWalk(renderThreadPage(item, items, RUNS, {}, NUMBERS, all));
      assert.deepEqual(
        { prev: nav.prev?.id ?? null, next: nav.next?.id ?? null, position: nav.position ?? null },
        page,
        `${item.title}, all=${all}`,
      );
      assert.equal(nav.code, 'D1', 'the code between the arrows is the deck the thread belongs to');
      assert.equal(nav.run, MINE, 'and Escape goes back to that deck');
    }
  }
});

test('an unknown thread has no view', () => {
  assert.equal(threadView(readsOf([anItem()]), { id: 'itm_ffffffffffff', all: false }), null);
});

/** A page's `/events` stream: how many `changed` events it has been sent. */
function listen(base) {
  const seen = { changed: 0 };
  return new Promise((resolve, reject) => {
    const request = http.get(`${base}/events`, { agent: false }, (response) => {
      response.setEncoding('utf8');
      response.on('data', (chunk) => (seen.changed += chunk.split('event: changed').length - 1));
      resolve({ seen, close: () => request.destroy() });
    });
    request.on('error', reject);
  });
}

const settle = async () => {
  for (let i = 0; i < 30; i += 1) await new Promise((resolve) => setImmediate(resolve));
};

test('reading a thread through /api/view clears its notice, announced once', async (t) => {
  const base = await deckOnAPort(t);
  const item = postItem({ kind: 'question', title: 'Which port?', body: '?', repo: MINE, author: 'pilot' });
  resolveItem(item.id, 'Went with 4400.');
  assert.equal(listItems().find((each) => each.id === item.id).notice, true, 'the close left a notice');
  const page = await listen(base);
  t.after(() => page.close());
  await settle();
  const before = page.seen.changed;

  const read = async () => (await fetch(`${base}/api/view?screen=thread&id=${item.id}`, { headers: bearer() })).json();
  const view = await read();
  await settle();

  assert.equal(view.regions.thread.title, 'Which port?');
  assert.equal(listItems().find((each) => each.id === item.id).notice, undefined, 'the notice is gone');
  assert.equal(page.seen.changed, before + 1, 'one change announced');

  await read();
  await settle();
  assert.equal(page.seen.changed, before + 1, 'a second read has nothing to clear and announces nothing');
});

test('an unknown kind reads: a steps thread\'s body, messages and kind line', (t) => {
  tempDeck(t);
  const named = postItem({ kind: 'question', title: 'Which port?', body: '?', repo: MINE, author: '' });
  // The store refuses `steps` until human-steps lands, so the read is the store's with the kind swapped (as view-route).
  const posted = postItem({ kind: 'question', title: 'Do these', body: `1. **press** it, after ${named.id}`, repo: MINE, author: '' });
  addPilotMessage(posted.id, `Answered on ${named.id}.`, 'pilot');
  const reads = readDeck();
  reads.items = reads.items.map((item) => (item.id === posted.id ? { ...item, kind: 'steps' } : item));

  const view = threadView(reads, { id: posted.id, all: false });

  assert.equal(view.title, 'Do these');
  assert.equal(view.body, '1. **press** it, after Which port?', 'markdown kept, the id read as its title');
  assert.equal(view.kindLine.kind, 'steps');
  assert.equal(view.kindLine.state, 'the pilot replied');
  assert.equal(view.messages.length, 1);
  assert.equal(view.messages[0].by, 'pilot');
  assert.equal(view.messages[0].text, 'Answered on Which port?.');
  assert.equal(typeof view.messages[0].at, 'string');
  assert.equal(view.resolution, undefined, 'open: no resolution');
  assert.equal(view.archived, false);
});
