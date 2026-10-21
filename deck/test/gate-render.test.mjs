/**
 * A gate thread draws its evidence block (thread-kinds spec 13, L5): a `gate1`'s and a
 * `gate2`'s fields are drawn as the labelled `<dl class="detail">` a walkthrough's are,
 * above the buttons and not as prose in the body, every value escaped.
 */

import './no-open.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';

import { KIND_GATE1, KIND_GATE2, KIND_QUESTION, NOT_YET, SIGN_OFF } from '../items.mjs';
import { addReply, listItems, postItem, resolveItem } from '../store.mjs';
import { renderDeckPage, renderHomePage, renderThreadPage } from '../ui/render.mjs';
import { tempDeck, withTicket } from '../testUtils.mjs';

const REPO = path.join('D:', 'work', 'pilot');

const GATE1 = {
  artefact: 'docs/design/thread-kinds/architecture.md',
  sha: '31efcb0',
  locked: 19,
  slices: '| Slice | Delivers |\n| --- | --- |\n| S1 | gate kinds |',
};
const GATE2 = { pr: 'https://github.com/HazzardRust/pilot/pull/250', sha: '0305827', walkthrough: 'itm_0123456789ab' };

// A gate1 names a red ticket and a gate2 a yellow one (ticket-states spec 2), put here first.
const post = (kind, fields) =>
  postItem({ kind, title: `A ${kind}`, body: 'The evidence.', repo: REPO, ...withTicket(fields, REPO, kind === KIND_GATE1 ? 'red' : 'yellow') });
const detailOf = (page) => page.match(/<dl class="detail">.*?<\/dl>/s)?.[0] ?? '';
const labelsIn = (detail) => [...detail.matchAll(/<dt>([^<]*)<\/dt>/g)].map((match) => match[1]);
const buttonsIn = (html) => [...html.matchAll(/name="choice" value="([^"]*)"(?![^>]*>Confirm<)/g)].map((match) => match[1]);
const threadOf = (item) => renderThreadPage(item, listItems(), []);

test("a gate1 card's detail lists artefact, sha, locked, slices, slice count, branch and ticket as dt/dd pairs", (t) => {
  tempDeck(t);
  const gate = post(KIND_GATE1, GATE1);
  const page = threadOf(gate);
  const detail = detailOf(page);
  assert.deepEqual(labelsIn(detail), ['Artefact', 'SHA', 'Locked', 'Slices', 'Slice count', 'Branch', 'Ticket'], 'fields in SPECS order');
  assert.match(detail, /<dt>Slice count<\/dt><dd>3<\/dd>/);
  assert.match(detail, /<dd><code>feat\/x<\/code><\/dd>/);
  assert.match(detail, /<dd><code>docs\/design\/thread-kinds\/architecture\.md<\/code><\/dd>/);
  assert.match(detail, /<dd><code>31efcb0<\/code><\/dd>/);
  assert.match(detail, /<dd>19<\/dd>/);
  assert.match(detail, /<td>S1<\/td><td>gate kinds<\/td>/, 'the slice table drawn as a table');
  assert.ok(page.indexOf(detail) < page.indexOf('name="choice"'), 'the block sits above the buttons');
});

test("a gate2 card's detail links the walkthrough id to its thread and the PR", (t) => {
  tempDeck(t);
  const detail = detailOf(threadOf(post(KIND_GATE2, GATE2)));
  assert.deepEqual(labelsIn(detail), ['PR', 'SHA', 'Walkthrough', 'Ticket']);
  assert.match(detail, /<a href="https:\/\/github\.com\/HazzardRust\/pilot\/pull\/250"[^>]*>/);
  assert.match(detail, /<a href="\/thread\/itm_0123456789ab">itm_0123456789ab<\/a>/);
  const bare = detailOf(threadOf(post(KIND_GATE2, { pr: '#250', sha: '0305827' })));
  assert.deepEqual(labelsIn(bare), ['PR', 'SHA', 'Ticket'], 'no walkthrough row when QA posted none (L19)');
  assert.match(bare, /<dd>#250<\/dd>/);
});

test('a gate card draws Sign off and Not yet and no Dismiss', (t) => {
  tempDeck(t);
  for (const [kind, fields] of [[KIND_GATE1, GATE1], [KIND_GATE2, GATE2]]) {
    post(kind, fields);
    const card = renderHomePage(listItems().filter((item) => item.kind === kind));
    assert.deepEqual(buttonsIn(card).slice(0, 2), [SIGN_OFF, NOT_YET], kind);
    assert.ok(!buttonsIn(card).includes('Dismiss'), `${kind}: no Dismiss button`);
    assert.doesNotMatch(card, /action="\/dismiss-item"/, `${kind}: no Dismiss form`);
    assert.doesNotMatch(card, /<dl class="detail">/, `${kind}: the evidence is the thread page's, as a walkthrough's is`);
  }
});

test('a field value is escaped', (t) => {
  tempDeck(t);
  const detail = detailOf(threadOf(post(KIND_GATE1, {
    ...GATE1,
    artefact: 'docs/<b>a</b>.md',
    slices: '| Slice | Delivers |\n| --- | --- |\n| S1 | <script>x</script> |',
  })));
  assert.doesNotMatch(detail, /<script>|<b>/);
  assert.match(detail, /&lt;script&gt;x&lt;\/script&gt;/);
  assert.match(detail, /docs\/&lt;b&gt;a&lt;\/b&gt;\.md/);
});

test('a hostile PR or walkthrough value is drawn as text, not as a link or markup', (t) => {
  tempDeck(t);
  // The store refuses these shapes at post; the renderer must hold without that guard.
  const item = { ...post(KIND_GATE2, GATE2), pr: 'javascript:alert(1)', walkthrough: '"><x>' };
  const detail = detailOf(threadOf(item));
  assert.doesNotMatch(detail, /href="javascript:/i);
  assert.doesNotMatch(detail, /<x>|"><x/);
  assert.match(detail, /<dd>javascript:alert\(1\)<\/dd>/);
  assert.match(detail, /&quot;&gt;&lt;x&gt;/);
});

test("a gate thread's kind line reads Gate 1 or Gate 2, as its note does, not the stored kind", (t) => {
  tempDeck(t);
  for (const [kind, fields, name] of [
    [KIND_GATE1, GATE1, 'Gate 1'],
    [KIND_GATE2, GATE2, 'Gate 2'],
  ]) {
    const page = threadOf(post(kind, fields));
    assert.match(page, new RegExp(`<span data-kind="${kind}">${name}</span>`), name);
    assert.doesNotMatch(page, new RegExp(` · ${kind} · `), `no bare ${kind}`);
  }
});

// A gate2 lists the blocking questions it waits on (deck-press-feedback spec 4, L4; yellow-lane L3).
const askOn = (ticket, title) =>
  postItem({ kind: KIND_QUESTION, title, body: 'which?', repo: REPO, options: ['A', 'B'], recommended: 'A', ticket, blocking: true });
const askedIn = (html) => html.match(/<div class="asked">.*?<\/div>/s)?.[0] ?? '';
const cardOf = (gate) => renderDeckPage(listItems(), []).match(new RegExp(`<article[^>]*>(?:(?!</article>).)*/thread/${gate.id}.*?</article>`, 's'))?.[0] ?? '';

test('a gate2 on a ticket with two open questions lists both as links on its page', (t) => {
  tempDeck(t);
  const gate = post(KIND_GATE2, GATE2);
  const first = askOn(gate.ticket, 'Which <b>store</b>?');
  const second = askOn(gate.ticket, 'Which port?');
  const asked = askedIn(renderThreadPage(gate, listItems(), []));
  assert.match(asked, /^<div class="asked">Waits on: /);
  assert.ok(asked.includes(`<a class="ref" href="/thread/${first.id}">Which &lt;b&gt;store&lt;/b&gt;?</a>`), asked);
  assert.ok(asked.includes(`<a class="ref" href="/thread/${second.id}">Which port?</a>`), asked);
  assert.ok(!asked.includes('<b>'), 'the title is escaped');
});

test("the same gate's card lists both", (t) => {
  tempDeck(t);
  const gate = post(KIND_GATE2, GATE2);
  const first = askOn(gate.ticket, 'Which store?');
  const second = askOn(gate.ticket, 'Which port?');
  const asked = askedIn(cardOf(gate));
  assert.ok(asked.includes(`/thread/${first.id}"`) && asked.includes(`/thread/${second.id}"`), asked);
});

test('an answered question still waiting to be closed says so, on the page and the card', (t) => {
  tempDeck(t);
  const gate = post(KIND_GATE2, GATE2);
  const answered = askOn(gate.ticket, 'Which store?');
  askOn(gate.ticket, 'Which port?');
  addReply(answered.id, 'A');
  for (const [where, asked] of [
    ['page', askedIn(renderThreadPage(gate, listItems(), []))],
    ['card', askedIn(cardOf(gate))],
  ]) {
    assert.ok(asked.includes('Which store?</a> (answered, waiting on the pilot)'), `${where}: ${asked}`);
    assert.ok(asked.includes('Which port?</a>') && !asked.includes('Which port?</a> ('), `${where}: the unanswered one is bare`);
  }
});

test('with none open there is no list', (t) => {
  tempDeck(t);
  const gate = post(KIND_GATE2, GATE2);
  assert.ok(!renderThreadPage(gate, listItems(), []).includes('class="asked"'));
  assert.ok(!cardOf(gate).includes('class="asked"'));
  const closed = askOn(gate.ticket, 'Done?');
  addReply(closed.id, 'A');
  resolveItem(closed.id, 'ok');
  assert.ok(!renderThreadPage(gate, listItems(), []).includes('class="asked"'), 'a closed question is not listed');
  postItem({ kind: KIND_QUESTION, title: 'Plain?', body: 'which?', repo: REPO, options: ['A', 'B'], ticket: gate.ticket });
  assert.ok(!renderThreadPage(gate, listItems(), []).includes('class="asked"'), 'a plain question is not listed');
});

test('a question on another ticket is not listed', (t) => {
  tempDeck(t);
  const gate = post(KIND_GATE2, GATE2);
  const other = withTicket({}, REPO, 'yellow');
  askOn(other.ticket, 'Elsewhere?');
  assert.ok(!renderThreadPage(gate, listItems(), []).includes('class="asked"'));
});

test('a gate1 draws no list', (t) => {
  tempDeck(t);
  const gate = post(KIND_GATE1, GATE1);
  askOn(gate.ticket, 'Which store?');
  assert.ok(!renderThreadPage(gate, listItems(), []).includes('class="asked"'));
  assert.ok(!cardOf(gate).includes('class="asked"'));
});

test("the gate's Ticket row shows the title and links the id", (t) => {
  tempDeck(t);
  const gate = post(KIND_GATE1, GATE1);
  const detail = detailOf(threadOf(gate));
  assert.match(detail, new RegExp(`<dt>Ticket</dt><dd><a class="ref" href="/thread/${gate.ticket}">The ticket</a></dd>`), 'the title is the text, the id is in the link (QA D1)');
  assert.ok(!detail.includes(`>${gate.ticket}</a>`), 'the bare id is not the text');
});
