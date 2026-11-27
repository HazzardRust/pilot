/**
 * rune-deck-ui S11 (spec 2, 3, 4): the chat region as data, `chatView`, read against the Chat panel the HTML
 * deck draws (`renderChat`, reached through `renderStrips`) for the same items. Every test owns its fixtures.
 */

import './no-open.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';

const { chatView } = await import('../view/chat.mjs');
const { renderStrips } = await import('../ui/render-rail.mjs');
const { tabFor, tabsOf } = await import('../tabs.mjs');

const MINE = path.join('D:', 'work', 'pilot');
const THEIRS = path.join('D:', 'work', 'other');
const AT = '2026-11-20T09:00:00.000Z';

const aRun = (id, repo) => ({ id, repo, name: path.basename(repo), pid: process.pid, startedAt: AT, slices: [] });
const aChat = (id, repo, replies) => ({ id, kind: 'chat', title: 'Chat', body: 'Say anything.', repo, postedAt: AT, replies });

const said = [
  { from: 'user', text: 'Is the **build** green?', repliedAt: '2026-11-20T09:01:00.000Z' },
  { from: 'pilot', author: 'pilot-implementer', text: 'Yes, all 12 pass.', repliedAt: '2026-11-20T09:02:00.000Z' },
  { from: 'deck', text: 'Landed `feat/x`.', repliedAt: '2026-11-20T09:03:00.000Z' },
];
const mine = aChat('itm_0000000000a1', MINE, said);
const theirs = aChat('itm_0000000000b1', THEIRS, [{ from: 'user', text: 'not this deck', repliedAt: AT }]);

const readsOf = (items) => ({
  seq: 1,
  items,
  runs: [aRun('run_000000000001', MINE), aRun('run_000000000002', THEIRS)],
  numbers: {},
  agents: {},
  added: [],
  alerts: {},
  lanes: { coPilots: {}, switches: {} },
  held: [],
});

/** What the page's Chat panel draws for `run`: the form's thread id and each message's byline word and text, in order. */
function pageChat(reads, run) {
  const tabs = tabsOf(reads.runs, reads.items, reads.numbers, reads.agents, reads.added, reads.lanes);
  const tab = tabFor(tabs, run);
  const html = renderStrips(tab, tabs, reads.items, {});
  const id = /<form class="chat"[^>]*>\s*<input type="hidden" name="id" value="([^"]+)"/.exec(html)?.[1];
  const messages = [...html.matchAll(/<div class="reply md [^"]*"><span class="who[^"]*">([^<·]+?) ·[\s\S]*?<\/span>([\s\S]*?)<\/div>/g)].map(
    ([, by, body]) => ({ by: by.trim(), text: body.replace(/<[^>]+>/g, '').trim() }),
  );
  return { id, messages };
}

/** The view's messages as the page shows them: markdown marks dropped, so the words compare. */
const plain = (text) => text.replace(/\*\*|`/g, '');

test('the chat is the page\'s: the selected deck\'s thread id and its messages, in order', () => {
  const reads = readsOf([theirs, mine]);
  const view = chatView(reads, { run: MINE });
  const page = pageChat(reads, MINE);

  assert.equal(view.id, 'itm_0000000000a1');
  assert.equal(view.id, page.id);
  assert.deepEqual(
    view.messages.map((message) => ({ by: message.by, text: plain(message.text) })),
    page.messages,
  );
  assert.deepEqual(view.messages.map((message) => message.at), said.map((message) => message.repliedAt));
  assert.deepEqual(view.messages.map((message) => message.by), ['you', 'implementer', 'deck']);
});

test('a deck with no chat thread has no id and no messages, as the page draws no form', () => {
  const reads = readsOf([theirs]);
  const view = chatView(reads, { run: MINE });

  assert.equal(pageChat(reads, MINE).id, undefined);
  assert.deepEqual(view, { messages: [], threads: [] });
});

test('the overview, a page naming no deck, has no chat', () => {
  assert.deepEqual(chatView(readsOf([mine]), { run: null }), { messages: [], threads: [] });
});

const aUser = (id, repo, title, extra = {}) => ({ id, kind: 'user', title, body: 'Create said so.', repo, postedAt: AT, replies: [], ...extra });

test("the tab's Create threads are listed, open and closed alike, and not another deck's", () => {
  const open = aUser('itm_0000000000c1', MINE, 'Add a dark mode');
  const closed = aUser('itm_0000000000c2', MINE, 'Fix the header', { resolution: { at: AT, by: 'user' } });
  const other = aUser('itm_0000000000c3', THEIRS, 'Not this deck');
  const view = chatView(readsOf([mine, theirs, other, open, closed]), { run: MINE });

  assert.deepEqual(view.threads, [
    { id: open.id, title: 'Add a dark mode', href: '/thread/itm_0000000000c1' },
    { id: closed.id, title: 'Fix the header', href: '/thread/itm_0000000000c2' },
  ]);
});

test('the threads are listed with no chat open too', () => {
  const open = aUser('itm_0000000000c1', MINE, 'Add a dark mode');
  const view = chatView(readsOf([theirs, open]), { run: MINE });

  assert.equal(view.id, undefined);
  assert.deepEqual(view.messages, []);
  assert.deepEqual(view.threads.map((thread) => thread.id), [open.id]);
});
