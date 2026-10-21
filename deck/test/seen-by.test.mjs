/**
 * "Seen by": a user reply that a wait or a read has taken says so under itself (crew-waits
 * spec 9, 10; L7). The mark is drawn from `deliveredTo` and `deliveredAt`, which the store
 * already holds, so no field is added and `threadState`'s words are untouched.
 */

import './no-open.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { tempDeck } from '../testUtils.mjs';

const { postItem, addReply, markDelivered, listItems } = await import('../store.mjs');
const { renderThreadPage } = await import('../ui/render.mjs');

const A = 'D:/work/alpha';
const SEEN = /<p class="type-note seen-by">([^<]*(?:<time[^>]*>[^<]*<\/time>)?[^<]*)<\/p>/;
const reread = (id) => listItems().find((item) => item.id === id);
const live = (html) => html.slice(html.indexOf('data-live="thread"'), html.indexOf('data-live="reply"'));

test('a taken reply shows Seen by its kind and the time', (t) => {
  tempDeck(t);
  const item = postItem({ kind: 'question', title: 'Port?', body: 'b', repo: A });
  addReply(item.id, 'yes');
  const taken = reread(item.id).replies.filter((r) => r.from === 'user');
  markDelivered(taken, 'qa');

  const stored = reread(item.id).replies.find((r) => r.from === 'user');
  const html = renderThreadPage(reread(item.id));
  const mark = SEEN.exec(html);
  assert.ok(mark, 'the mark is drawn');
  assert.match(mark[1], /^Seen by qa · <time datetime="[^"]+">/);
  assert.ok(mark[1].includes(stored.deliveredAt), 'the time is the one the store holds');
});

test('a Sign off delivered to qa and pilot shows both names', (t) => {
  tempDeck(t);
  const item = postItem({ kind: 'walkthrough', title: 'Try it', body: 'b', repo: A, screens: ['open the app'] });
  addReply(item.id, 'Sign off');
  const take = () => reread(item.id).replies.filter((r) => r.from === 'user');
  markDelivered(take(), 'qa');
  markDelivered(take(), 'pilot');

  const mark = SEEN.exec(renderThreadPage(reread(item.id)));
  assert.ok(mark);
  assert.match(mark[1], /^Seen by qa and pilot/);
});

test('an untaken reply shows no mark', (t) => {
  tempDeck(t);
  const item = postItem({ kind: 'question', title: 'Port?', body: 'b', repo: A });
  addReply(item.id, 'yes');
  assert.doesNotMatch(renderThreadPage(reread(item.id)), /Seen by/);
});

test('a deliveredTo outside the owner kinds is not rendered', (t) => {
  tempDeck(t);
  const item = postItem({ kind: 'question', title: 'Port?', body: 'b', repo: A });
  addReply(item.id, 'yes');
  const stored = reread(item.id);
  const reply = stored.replies.find((r) => r.from === 'user');

  reply.deliveredAt = '2026-01-01T00:00:00.000Z';
  reply.deliveredTo = '<img src=x onerror=alert(1)>';
  let html = renderThreadPage(stored);
  assert.doesNotMatch(html, /<img src=x/);
  assert.doesNotMatch(html, /Seen by/, 'no known name left, so no mark');

  reply.deliveredTo = ['qa', '<script>alert(1)</script>'];
  html = renderThreadPage(stored);
  assert.doesNotMatch(html, /<script>alert/);
  assert.match(html, /Seen by qa\b/);
});

test('a reply taken while the page is open gets its mark in the swapped live region', (t) => {
  tempDeck(t);
  const item = postItem({ kind: 'question', title: 'Port?', body: 'b', repo: A });
  addReply(item.id, 'yes');
  const before = renderThreadPage(reread(item.id));
  assert.doesNotMatch(live(before), /Seen by/);

  markDelivered(reread(item.id).replies.filter((r) => r.from === 'user'), 'qa');
  const after = renderThreadPage(reread(item.id));
  assert.match(live(after), /Seen by qa/, 'the mark is inside data-live="thread", which /events swaps');
});
