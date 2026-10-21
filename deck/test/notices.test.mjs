/**
 * An agent-closed thread leaves a notice the user clears (deck-press-feedback spec 7, 8, 10, 11;
 * L6, L7, A3, A4, ADR 0097). `resolveItem` stores `notice: true` in its own write when the kind is
 * not silent and the user's last choice was not Sign off; only the user's GET of the thread, or
 * the ×'s own-page POST `/clear-notice`, deletes it. Closing reports keep their own mechanism.
 */

import './no-open.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';

import {
  KIND_CREW_HANDOFF, KIND_GATE1, KIND_HANDOFF, KIND_QUESTION, KIND_REPORT, KIND_TICKET, SIGN_OFF, SILENT_KINDS, noticesOf,
} from '../items.mjs';
import { addReply, clearAllNotices, closeItem, dismissItem, listItems, postItem, resolveItem, storeFile } from '../store.mjs';
import { deckOnAPort, shapedTicketBody, takeLive, tempDeck } from '../testUtils.mjs';
import { renderStrips } from '../ui/render-rail.mjs';
import { renderHomePage } from '../ui/render.mjs';

const REPO = path.resolve('D:/work/pilot');
const reread = (id) => listItems().find((item) => item.id === id);
const aQuestion = (title = 'Which?') => postItem({ kind: KIND_QUESTION, title, body: 'which?', repo: REPO, options: ['A', 'B'], recommended: 'A' });
const aGate1 = () => {
  const ticket = takeLive(postItem({ kind: KIND_TICKET, sliceCount: 60, title: 'Apple', body: shapedTicketBody(), repo: REPO }).id);
  return postItem({ kind: KIND_GATE1, title: 'Gate 1', body: 'The design.', repo: REPO, artefact: 'docs/design/x/architecture.md', sha: '0305827', locked: 3, slices: '| S1 |', sliceCount: 3, branch: 'feat/x', ticket: ticket.id });
};

/** A form post as the browser makes it, over `node:http` so the headers are the test's own. */
const press = (base, route, fields, headers = {}) =>
  new Promise((resolve, reject) => {
    const request = http.request(`${base}${route}`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', ...headers },
    });
    request.on('response', (response) => {
      response.resume();
      response.on('end', () => resolve({ status: response.statusCode, location: response.headers.location ?? null }));
    });
    request.on('error', reject);
    request.end(String(new URLSearchParams(fields)));
  });

test('an agent resolving a question leaves a notice, a handoff none', (t) => {
  tempDeck(t);
  const question = aQuestion();
  const handoff = postItem({ kind: KIND_HANDOFF, title: 'Next run', body: 'go', repo: REPO });
  resolveItem(question.id, 'Went with A.');
  resolveItem(handoff.id, 'delivered');
  assert.deepEqual(SILENT_KINDS, [KIND_HANDOFF, KIND_CREW_HANDOFF, KIND_REPORT]);
  assert.deepEqual(noticesOf(listItems()).map((item) => item.id), [question.id]);
  assert.equal(reread(handoff.id).notice, undefined);
});

test("a resolve after the user's Sign off leaves none", (t) => {
  tempDeck(t);
  const gate = aGate1();
  addReply(gate.id, SIGN_OFF);
  resolveItem(gate.id, 'Signed.');
  assert.equal(reread(gate.id).notice, undefined);
  assert.deepEqual(noticesOf(listItems()), []);
  // A signoff closed unsigned, reopened and then signed keeps no notice from its first close.
  const signoff = postItem({ kind: 'signoff', title: 'Ship it?', body: 'Ready?', repo: REPO });
  resolveItem(signoff.id, 'Closed unsigned.');
  assert.equal(reread(signoff.id).notice, true);
  addReply(signoff.id, SIGN_OFF);
  resolveItem(signoff.id, 'Signed.');
  assert.equal(reread(signoff.id).notice, undefined);
});

test('Close and Dismiss by the user leave none', (t) => {
  tempDeck(t);
  const closed = aQuestion('Closed');
  closeItem(closed.id);
  const dismissed = aGate1();
  dismissItem(dismissed.id);
  assert.deepEqual(noticesOf(listItems()), []);
});

test('notices survive a reopened store', async (t) => {
  tempDeck(t);
  const first = aQuestion('First');
  const second = aQuestion('Second');
  resolveItem(first.id, 'one');
  resolveItem(second.id, 'two');
  const fresh = await import(`../store.mjs?reopened=${Date.now()}`);
  assert.deepEqual(noticesOf(fresh.listItems()).map((item) => item.id).sort(), [first.id, second.id].sort());
});

test('opening the thread clears its notice', async (t) => {
  const base = await deckOnAPort(t);
  const opened = aQuestion('Opened');
  const other = aQuestion('Other');
  resolveItem(opened.id, 'done');
  resolveItem(other.id, 'done');
  const answer = await fetch(`${base}/thread/${opened.id}`);
  assert.equal(answer.status, 200);
  assert.doesNotMatch(await answer.text(), new RegExp(`data-notice="${opened.id}"`), 'the page it opens no longer lists it');
  assert.deepEqual(noticesOf(listItems()).map((item) => item.id), [other.id]);
});

test('the × clears it, and a foreign Origin is refused', async (t) => {
  const base = await deckOnAPort(t);
  const item = aQuestion();
  resolveItem(item.id, 'done');
  const foreign = await press(base, '/clear-notice', { id: item.id, back: '/' }, { origin: 'http://evil.example' });
  assert.equal(foreign.status, 403);
  const bare = await press(base, '/clear-notice', { id: item.id, back: '/' });
  assert.equal(bare.status, 403, 'no Origin is not the page either');
  assert.equal(reread(item.id).notice, true);
  const own = await press(base, '/clear-notice', { id: item.id, back: '/?run=x' }, { origin: base });
  assert.equal(own.status, 303);
  assert.equal(own.location, '/?run=x');
  assert.equal(reread(item.id).notice, undefined);
  const unknown = await press(base, '/clear-notice', { id: 'itm_0123456789ab' }, { origin: base });
  assert.equal(unknown.status, 400);
});

// --- Mark all seen (notifications-seen S1, spec 1-6, L1, L3) ---------------

/** The store with every `notice` taken off, which is all a Mark all seen may change (spec 2). */
const withoutNotices = (items) => items.map(({ notice, ...rest }) => rest);

test('one press clears every notice on the deck', async (t) => {
  const base = await deckOnAPort(t);
  const first = aQuestion('First');
  const second = aQuestion('Second');
  aQuestion('Still open');
  resolveItem(first.id, 'one');
  resolveItem(second.id, 'two');
  const before = listItems();
  assert.equal(noticesOf(before).length, 2);
  const own = await press(base, '/clear-notices', { back: '/?run=x' }, { origin: base });
  assert.equal(own.status, 303);
  assert.equal(own.location, '/?run=x');
  assert.deepEqual(noticesOf(listItems()), []);
  assert.deepEqual(listItems(), withoutNotices(before), 'nothing closed and nothing else changed');
  const page = await (await fetch(`${base}/`)).text();
  assert.doesNotMatch(page, /<summary[^>]*data-count/, 'the served Notifications summary carries no count (spec 4)');
});

test("the press is refused off the deck's own page", async (t) => {
  const base = await deckOnAPort(t);
  const item = aQuestion();
  resolveItem(item.id, 'done');
  const foreign = await press(base, '/clear-notices', { back: '/' }, { origin: 'http://evil.example' });
  assert.equal(foreign.status, 403);
  const bare = await press(base, '/clear-notices', { back: '/' });
  assert.equal(bare.status, 403, 'no Origin is not the page either');
  assert.equal(reread(item.id).notice, true, 'the notice is kept');
});

test('clearing none writes nothing', (t) => {
  tempDeck(t);
  aQuestion();
  const file = storeFile();
  const bytes = fs.readFileSync(file);
  const { mtimeMs } = fs.statSync(file);
  clearAllNotices();
  assert.equal(fs.statSync(file).mtimeMs, mtimeMs);
  assert.deepEqual(fs.readFileSync(file), bytes);
});

test('the panel opens with Mark all seen only when it has a row', (t) => {
  tempDeck(t);
  const panelOf = (items) => renderStrips(null, [], items).match(/data-live="notifications"[^>]*>(.*?)<\/div>\s*<\/details>/s)?.[1];
  assert.equal(panelOf([]), '', 'an empty panel draws no button');
  const item = aQuestion();
  resolveItem(item.id, 'done');
  const panel = panelOf(listItems());
  assert.match(
    panel,
    /^<form method="post" action="\/clear-notices" data-in-place class="mark-all-form"><input type="hidden" name="back" value="\/" \/><button type="submit" class="mark-all">Mark all seen<\/button><\/form><div class="notice" data-notice=/,
  );
  assert.equal((panel.match(/class="mark-all"/g) ?? []).length, 1);
});

test("the panel lists notices newest first with kind, title and the resolution's first line, escaped", () => {
  const notice = (id, title, resolution, resolvedAt) => ({
    id, kind: KIND_QUESTION, title, body: 'x', repo: REPO, replies: [], resolution, resolvedAt, notice: true,
  });
  const items = [
    notice('itm_old', 'Older', 'first\nsecond line', '2026-10-01T10:00:00.000Z'),
    notice('itm_new', '<b>Newer</b>', 'Took <A> & B.\nmore', '2026-10-02T10:00:00.000Z'),
    { id: 'itm_gone', kind: KIND_QUESTION, title: 'Cleared', body: 'x', repo: REPO, replies: [], resolution: 'r', resolvedAt: '2026-10-03T10:00:00.000Z' },
  ];
  const page = renderHomePage(items, [{ id: 'run_1', repo: REPO, name: 'pilot', pid: process.pid }], REPO);
  const panel = page.match(/data-live="notifications"[^>]*>(.*?)<\/div>\s*<\/details>/s)?.[1] ?? '';
  const rows = [...panel.matchAll(/data-notice="([^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual(rows, ['itm_new', 'itm_old']);
  assert.match(panel, /question/);
  assert.match(panel, /&lt;b&gt;Newer&lt;\/b&gt;/);
  assert.match(panel, /Took &lt;A&gt; &amp; B\./);
  assert.doesNotMatch(panel, /more|second line/, 'first line only');
  assert.match(panel, /href="\/thread\/itm_new"/);
  assert.match(panel, /action="\/clear-notice"/);
});

test('a notice row carries a no-script × form: the id, a back field, and the clear action', (t) => {
  tempDeck(t);
  const item = aQuestion();
  resolveItem(item.id, 'done');
  const page = renderHomePage(listItems(), [{ id: 'run_1', repo: REPO, name: 'pilot', pid: process.pid }], REPO);
  const row = page.match(new RegExp(`<div class="notice" data-notice="${item.id}".*?</form>`, 's'))?.[0] ?? '';
  assert.match(row, /<form method="post" action="\/clear-notice" data-in-place>/, 'the × posts in place (S4)');
  assert.match(row, new RegExp(`name="id" value="${item.id}"`));
  assert.match(row, /name="back" value="[^"]*"/);
});

test('notices come out of noticesOf newest close first', () => {
  const shut = (id, resolvedAt) => ({ id, kind: KIND_QUESTION, title: id, body: 'x', repo: REPO, replies: [], resolution: 'r', resolvedAt, notice: true });
  const found = noticesOf([shut('itm_a', '2026-10-01T10:00:00.000Z'), shut('itm_b', '2026-10-03T10:00:00.000Z'), shut('itm_c', '2026-10-02T10:00:00.000Z')]);
  assert.deepEqual(found.map((each) => each.id), ['itm_b', 'itm_c', 'itm_a']);
});

test('closing reports render and hide as before', (t) => {
  tempDeck(t);
  const report = postItem({ kind: KIND_REPORT, title: 'A closing report', body: 'x', repo: REPO });
  resolveItem(report.id, 'closed');
  assert.equal(reread(report.id).notice, undefined);
  const page = renderHomePage(listItems(), [{ id: 'run_1', repo: REPO, name: 'pilot', pid: process.pid }], REPO);
  assert.match(page, new RegExp(`<li data-report="${report.id}">`));
  assert.doesNotMatch(page, /data-notice=/);
});
