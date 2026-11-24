/**
 * archive-page S2: a row opens its thread, plan and closing report (spec 2, 6, 7; L3, L11, A3).
 *
 * Every test takes its own store directory; nothing here touches port 4321 or the real store. Items are stored by
 * `postStored`, the month file written by the deck's own `archiveOld`.
 */

import './no-open.mjs';

import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

import { bearer } from '../../hooks/lib/deck-secret.js';
import { deckOnAPort, postStored, shapedTicketBody, tempDeck } from '../testUtils.mjs';

const { archiveOld, listItems } = await import('../store.mjs');
const { archiveDetail } = await import('../archive-detail.mjs');

const REPO = 'D:/work/alpha';
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const ago = (ms) => new Date(Date.now() - ms).toISOString();

const PLAN = { artefact: 'docs/design/alpha/architecture.md', branch: 'feat/alpha', sha: 'abc1234', slug: 'alpha', sliceCount: 3 };

/** A ticket closed `at` ago, with two replies, a signed plan naming its gate1, and its closing report. */
function story(title, at, over = {}) {
  const gate1 = postStored({ kind: 'gate1', title: `Plan for ${title}`, repo: REPO, resolvedAt: ago(at + 2 * HOUR), postedAt: ago(at + 3 * HOUR) });
  const replies = [
    { from: 'user', text: 'Go ahead.', repliedAt: ago(at + 2 * HOUR) },
    { from: 'pilot', author: 'architect', text: `Signed, see ${gate1.id}.`, repliedAt: ago(at + HOUR) },
  ];
  const ticket = postStored({
    kind: 'ticket', title, body: shapedTicketBody(title), repo: REPO, sliceCount: 3, state: 'green',
    postedAt: ago(at + 4 * HOUR), resolvedAt: ago(at), replies, plan: { ...PLAN, gate1: gate1.id }, ...over,
  });
  const report = postStored({ kind: 'report', title: `Closing report: ${title}`, body: '## Landed\n\n- **S1** merged', ticket: ticket.id, repo: REPO, resolvedAt: ago(at), postedAt: ago(at) });
  return { gate1, ticket, report };
}

const sha = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');

test("a ticket's detail joins its thread, plan and report", (t) => {
  tempDeck(t);
  const { gate1, ticket } = story('the joined ticket', HOUR);
  postStored({ kind: 'report', title: 'another ticket report', body: 'x', ticket: 'itm_000000000000', repo: REPO, resolvedAt: ago(HOUR) });
  listItems();

  const detail = archiveDetail(ticket.id);

  assert.equal(detail.id, ticket.id);
  assert.equal(detail.title, 'the joined ticket');
  assert.equal(detail.kind, 'tickets');
  assert.deepEqual(detail.fields.map((field) => field.label), ['Repository', 'State', 'Closed']);
  assert.deepEqual(detail.replies.map((reply) => reply.who), ['you', 'architect']);
  assert.equal(detail.replies[1].body, 'Signed, see Plan for the joined ticket.', 'an id reads as its title');
  assert.match(detail.replies[0].at, /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/, 'a local stamp');
  assert.deepEqual(detail.plan, [
    { label: 'Artefact', value: PLAN.artefact },
    { label: 'Branch', value: 'feat/alpha' },
    { label: 'Commit', value: 'abc1234' },
    { label: 'Slices', value: '3' },
    { label: 'Gate 1', value: gate1.title },
  ]);
  assert.deepEqual(detail.report, { title: 'Closing report: the joined ticket', body: '## Landed\n\n- **S1** merged' });
});

test('a ticket with no plan or report gives null for each, and an unknown id gives null', (t) => {
  tempDeck(t);
  const bare = postStored({ kind: 'ticket', title: 'bare', body: shapedTicketBody('bare'), repo: REPO, resolvedAt: ago(HOUR) });
  const open = postStored({ kind: 'ticket', title: 'open', body: shapedTicketBody('open'), repo: REPO });
  listItems();

  const detail = archiveDetail(bare.id);
  assert.deepEqual([detail.replies, detail.plan, detail.report], [[], null, null]);
  assert.equal(archiveDetail('itm_ffffffffffff'), null);
  assert.equal(archiveDetail(open.id), null, 'an open ticket is no archive row');
});

test('an archived ticket opens too', (t) => {
  const dir = tempDeck(t);
  const { ticket } = story('the archived ticket', 40 * DAY);
  archiveOld();
  assert.ok(!listItems().some((item) => item.id === ticket.id), 'the ticket left the live store');
  assert.ok(fs.readdirSync(dir).some((name) => /^deck\.archive-\d{4}-\d{2}\.json$/.test(name)), 'for a month file');

  const detail = archiveDetail(ticket.id);

  assert.equal(detail.title, 'the archived ticket');
  assert.equal(detail.report.title, 'Closing report: the archived ticket');
});

test('a credential in a reply or report is withheld', (t) => {
  tempDeck(t);
  const key = `sk-${'b'.repeat(40)}`;
  const { ticket } = story('the leaky ticket', HOUR, { replies: [{ from: 'user', text: `use ${key}`, repliedAt: ago(HOUR) }] });
  listItems();

  const detail = archiveDetail(ticket.id);

  assert.equal(detail.replies[0].body, '<withheld: credential>');
  assert.ok(!JSON.stringify(detail).includes(key));
});

test('opening a detail writes nothing', async (t) => {
  const base = await deckOnAPort(t);
  const file = path.join(process.env.PILOT_DECK_DIR, 'deck.json');
  const { ticket } = story('the noticed ticket', HOUR, { notice: true });
  listItems();
  const before = sha(file);

  const direct = archiveDetail(ticket.id);
  const { regions } = await (await fetch(`${base}/api/view?screen=archive&id=${ticket.id}`, { headers: bearer() })).json();

  assert.equal(direct.title, 'the noticed ticket');
  assert.equal(regions.archiveDetail.report.title, 'Closing report: the noticed ticket');
  assert.equal(sha(file), before, 'no stored byte changed');
  assert.equal(listItems().find((item) => item.id === ticket.id).notice, true, 'the notice is still there');
});

test('the detail region is null off its screen or without an id', async (t) => {
  const base = await deckOnAPort(t);
  const { ticket } = story('a ticket', HOUR);
  const view = async (query) => (await (await fetch(`${base}/api/view?${query}`, { headers: bearer() })).json()).regions;

  assert.equal((await view('screen=archive')).archiveDetail, null);
  assert.equal((await view(`screen=home&id=${ticket.id}`)).archiveDetail, null);
});
