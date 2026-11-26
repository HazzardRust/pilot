/**
 * archive-page S4: closing reports, hand-offs and every settled thread are rows (spec 3, 6; A7).
 *
 * Every test takes its own store directory. Items are written by `postStored`, the month file by `archiveOld`.
 */

import './no-open.mjs';

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { postStored, shapedTicketBody, tempDeck } from '../testUtils.mjs';

const { archiveOld, listItems } = await import('../store.mjs');
const { archiveRows } = await import('../archive.mjs');
const { localStamp } = await import('../archive-time.mjs');

const REPO = 'D:/work/alpha';
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const ago = (ms) => new Date(Date.now() - ms).toISOString();

const SETTLED_KINDS = ['question', 'walkthrough', 'signoff', 'gate1', 'gate2', 'chat', 'user', 'audit', 'lesson'];
const settled = (kind, over = {}) =>
  postStored({ kind, title: `a settled ${kind}`, body: `the ${kind} body`, repo: REPO, postedAt: ago(2 * HOUR), resolvedAt: ago(HOUR), ...over });
const rowsOfKind = (kind) => archiveRows().filter((row) => row.kind === kind);
const labelled = (row, label) => row.fields.find((field) => field.label === label)?.value;

test('a closing report reads as named fields', (t) => {
  tempDeck(t);
  const posted = '2026-03-04T05:06:00.000Z';
  const report = settled('report', { title: 'a report title', feature: { slug: 'archive-page' }, ticket: 'itm_abc123', body: 'Landed at abc123.', postedAt: posted, resolvedAt: undefined });
  listItems();

  const rows = rowsOfKind('report');

  assert.deepEqual(rows.map((row) => row.id), [report.id]);
  assert.equal(labelled(rows[0], 'Ticket'), 'itm_abc123');
  assert.equal(labelled(rows[0], 'Feature'), String({ slug: 'archive-page' }), 'an object-valued field is not stringified to JSON');
  assert.equal(labelled(rows[0], 'Body'), 'Landed at abc123.');
  assert.equal(labelled(rows[0], 'Landed'), localStamp(posted), 'a report is never resolved: it landed when it was posted');
  assert.ok(rows[0].fields.every((field) => !field.value.includes('{"')), 'no raw JSON in a field');
});

test('both hand-off kinds are one kind', (t) => {
  tempDeck(t);
  const pilot = settled('handoff', { next: 'itm_next01' });
  const crew = settled('crew-handoff');
  const open = settled('handoff', { resolvedAt: undefined });
  listItems();

  const rows = rowsOfKind('handoff');

  assert.deepEqual(rows.map((row) => row.id).sort(), [pilot.id, crew.id].sort());
  assert.ok(!rows.some((row) => row.id === open.id), 'an open hand-off is no row');
  assert.equal(labelled(rows.find((row) => row.id === pilot.id), 'Next ticket'), 'itm_next01');
  assert.equal(labelled(rows.find((row) => row.id === crew.id), 'Kind'), 'crew-handoff');
});

test('each item is listed once', (t) => {
  tempDeck(t);
  const items = [
    postStored({ kind: 'ticket', title: 'closed ticket', body: shapedTicketBody('closed ticket'), repo: REPO, sliceCount: 3, state: 'green', resolvedAt: ago(HOUR) }),
    settled('report'),
    settled('handoff'),
    settled('crew-handoff'),
    ...SETTLED_KINDS.map((kind) => settled(kind, { replies: [{ seq: 1, from: 'user', text: 'ok', repliedAt: ago(HOUR) }] })),
  ];
  listItems();

  const kindsOf = new Map();
  for (const row of archiveRows()) kindsOf.set(row.id, [...(kindsOf.get(row.id) ?? []), row.kind]);

  for (const item of items) assert.equal(kindsOf.get(item.id)?.length, 1, `${item.kind} ${item.id} appears under exactly one kind`);
});

test('a thread row counts its replies', (t) => {
  tempDeck(t);
  const q = settled('question', { replies: [{ seq: 1, from: 'user', text: 'ok', repliedAt: ago(HOUR) }] });
  listItems();

  const row = rowsOfKind('thread').find((r) => r.id === q.id);

  assert.ok(row, 'the settled question is a row');
  assert.equal(labelled(row, 'Replies'), '1');
});

test('an open thread is no row', (t) => {
  tempDeck(t);
  const open = settled('question', { resolvedAt: undefined });
  listItems();

  assert.ok(!archiveRows().some((row) => row.id === open.id));
});

test('a markdown field keeps its flag through archiveRows (spec 6)', (t) => {
  tempDeck(t);
  settled('report', { body: '## Landed' });
  listItems();

  const [row] = rowsOfKind('report');

  assert.equal(row.fields.find((field) => field.label === 'Body').markdown, true);
  assert.equal(row.fields.find((field) => field.label === 'Ticket').markdown, undefined, 'an unflagged field gains no flag');
});

test('archived items are included', (t) => {
  tempDeck(t);
  const old = settled('report', { postedAt: ago(41 * DAY), resolvedAt: undefined });
  const oldThread = settled('question', { postedAt: ago(41 * DAY), resolvedAt: ago(40 * DAY) });
  archiveOld();
  assert.ok(listItems().some((item) => item.id === old.id), 'a report is never resolved, so it stays live');
  assert.ok(!listItems().some((item) => item.id === oldThread.id), 'the thread sits only in a month file');

  assert.deepEqual(rowsOfKind('report').map((row) => row.id), [old.id]);
  assert.deepEqual(rowsOfKind('thread').map((row) => row.id), [oldThread.id]);
});
