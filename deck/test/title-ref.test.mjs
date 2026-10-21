/**
 * deck-title-prose S1 (spec 1, 3, 4; L2-L4, L8): every title the deck places in a line is drawn
 * inside the one set-off element, `class="ref"`, styled by one rule in `deck.css`. A chain hand-off's
 * "Next run: ‹ticket›" sets its ticket off only while the stored title still names the ticket's current
 * title, and the page's `<title>` stays plain text. Every test takes its own store.
 */

import './no-open.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { KIND_GATE1, KIND_GATE2, KIND_HANDOFF, KIND_QUESTION } from '../items.mjs';
import { chainNext } from '../chain.mjs';
import { FINISHED_CLEAN } from '../runs.mjs';
import { listItems, postItem, registerRun, setSlices } from '../store.mjs';
import { renderDeckPage, renderThreadPage } from '../ui/render.mjs';
import { aTicket, page, postStored, rowsOf, takeLive, tempDeck, withTicket } from '../testUtils.mjs';

const REPO = path.resolve('D:/work/pilot');
const CSS = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'ui', 'deck.css');

const cardOf = (id) =>
  renderDeckPage(listItems(), []).match(new RegExp(`<article[^>]*>(?:(?!</article>).)*/thread/${id}".*?</article>`, 's'))?.[0] ?? '';
const threadOf = (item) => renderThreadPage(item, listItems(), []);
const ask = (ticket, title = 'Which store?', extra = {}) =>
  postItem({ kind: KIND_QUESTION, title, body: 'which?', repo: REPO, options: ['A', 'B'], recommended: 'A', ticket, ...extra });
const handoff = (title, next, extra = {}) => postStored({ kind: KIND_HANDOFF, repo: REPO, title, body: 'Go on.', next, ...extra });
const NAMED = 'Fix the <b>port</b>';
const SET_OFF = 'Next run: <span class="ref">Fix the &lt;b&gt;port&lt;/b&gt;</span>';

test("a card's ticket line wraps the ticket title", (t) => {
  tempDeck(t);
  const { ticket } = withTicket({}, REPO);
  const question = ask(ticket);
  assert.ok(cardOf(question.id).includes(`<a class="ref ticket" href="/thread/${ticket}">The ticket</a>`), cardOf(question.id));
});

test("the thread header's ticket line and a gate's Ticket row wrap it too", (t) => {
  tempDeck(t);
  const gate = postItem({
    kind: KIND_GATE1, title: 'A gate1', body: 'The evidence.', repo: REPO,
    ...withTicket({ artefact: 'docs/a.md', sha: '31efcb0', locked: 1, slices: '| S |\n| --- |\n| S1 |' }, REPO),
  });
  const question = ask(gate.ticket);
  assert.ok(threadOf(question).includes(`<a class="ref ticket" href="/thread/${gate.ticket}">The ticket</a>`), 'the header');
  const row = threadOf(gate).match(/<dt>Ticket<\/dt><dd>(.*?)<\/dd>/s)?.[1] ?? '';
  assert.equal(row, `<a class="ref" href="/thread/${gate.ticket}">The ticket</a>`);
});

test('Waits on wraps each blocking question title', (t) => {
  tempDeck(t);
  const gate = postItem({
    kind: KIND_GATE2, title: 'A gate2', body: 'The evidence.', repo: REPO,
    ...withTicket({ pr: 'https://github.com/HazzardRust/pilot/pull/250', sha: '0305827', walkthrough: 'itm_0123456789ab' }, REPO, 'yellow'),
  });
  const first = ask(gate.ticket, 'Which <b>store</b>?', { blocking: true });
  const second = ask(gate.ticket, 'Which port?', { blocking: true });
  const asked = threadOf(gate).match(/<div class="asked">.*?<\/div>/s)?.[0] ?? '';
  const links = [...asked.matchAll(/<a [^>]*>/g)].map(([link]) => link);
  assert.deepEqual(links, [`<a class="ref" href="/thread/${first.id}">`, `<a class="ref" href="/thread/${second.id}">`]);
});

test('Switch to wraps the ticket title', (t) => {
  tempDeck(t);
  takeLive(aTicket('Live', 'red').id);
  const green = aTicket('Green <b>', 'green');
  assert.match(rowsOf(page())[green.id], /<p>Switch to <span class="ref">Green &lt;b&gt;<\/span>\?<\/p>/);
});

test("a chain hand-off's card, heading and notices set its ticket off", (t) => {
  tempDeck(t);
  const ticket = aTicket(NAMED, 'red', REPO);
  const open = handoff(`Next run: ${NAMED}`, ticket.id);
  const closed = handoff(`Next run: ${NAMED}`, ticket.id, { resolvedAt: new Date().toISOString(), resolution: 'done', notice: true });
  assert.ok(cardOf(open.id).includes(`<h2><a href="/thread/${open.id}">${SET_OFF}</a></h2>`), 'the card h2');
  const thread = threadOf(open);
  assert.ok(thread.includes(`<h2>${SET_OFF}</h2>`), 'the thread h2');
  assert.match(thread, new RegExp(`data-thread="${open.id}"[^>]*><a href="/thread/${open.id}">${SET_OFF}</a>`), 'the open notice');
  assert.match(thread, new RegExp(`data-notice="${closed.id}".*?<a href="/thread/${closed.id}">${SET_OFF}</a>`, 's'), 'the closed notice');
});

test("the chain's own hand-off sets its ticket off", (t) => {
  tempDeck(t);
  const run = registerRun({ repo: REPO, pid: process.pid });
  const ticket = aTicket(NAMED, 'red', REPO);
  setSlices(run.id, [], undefined, { slug: 'feature-one', finished: FINISHED_CLEAN });
  const { handoff } = chainNext(REPO);
  assert.equal(handoff.next, ticket.id);
  assert.ok(threadOf(handoff).includes(`<h2>${SET_OFF}</h2>`), 'the thread h2');
});

test('a hand-off whose ticket was renamed, or a plain hand-off, is drawn plain', (t) => {
  tempDeck(t);
  const ticket = aTicket('New name', 'red', REPO);
  const renamed = handoff('Next run: Old <b>name</b>', ticket.id);
  const plain = handoff('Next run: New name', undefined);
  assert.ok(threadOf(renamed).includes('<h2>Next run: Old &lt;b&gt;name&lt;/b&gt;</h2>'));
  assert.ok(threadOf(plain).includes('<h2>Next run: New name</h2>'));
  assert.ok(cardOf(renamed.id).includes(`<h2><a href="/thread/${renamed.id}">Next run: Old &lt;b&gt;name&lt;/b&gt;</a></h2>`));
});

test('the tab title stays plain text', (t) => {
  tempDeck(t);
  const ticket = aTicket(NAMED, 'red', REPO);
  const title = threadOf(handoff(`Next run: ${NAMED}`, ticket.id)).match(/<title>(.*?)<\/title>/s)?.[1];
  assert.equal(title, 'Next run: Fix the &lt;b&gt;port&lt;/b&gt; · Pilot deck');
});

test('a 120-character title is drawn whole and escaped', (t) => {
  tempDeck(t);
  takeLive(aTicket('Live', 'red').id);
  const long = `<b>${'x'.repeat(113)}</b>`;
  assert.equal(long.length, 120);
  const green = aTicket(long, 'green');
  const escaped = long.replaceAll('<', '&lt;').replaceAll('>', '&gt;');
  assert.ok(rowsOf(page())[green.id].includes(`<span class="ref">${escaped}</span>`));
});

test('one stylesheet rule', () => {
  const css = fs.readFileSync(CSS, 'utf8').replace(/\/\*.*?\*\//gs, '');
  const rules = [...css.matchAll(/([^{}]*)\{([^}]*)\}/g)].filter(([, selector]) => /\.ref\b/.test(selector));
  assert.equal(rules.length, 1, 'one rule names .ref');
  assert.doesNotMatch(rules[0][2], /nowrap|text-overflow/);
});

test('a chip carries no underline of its own: the tint already marks the title', () => {
  const css = fs.readFileSync(CSS, 'utf8').replace(/\/\*.*?\*\//gs, '');
  const [[, , body]] = [...css.matchAll(/([^{}]*)\{([^}]*)\}/g)].filter(([, selector]) => /\.ref\b/.test(selector));
  assert.match(body, /text-decoration:\s*none/);
});
