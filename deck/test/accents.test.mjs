/**
 * S2 of ticket-state-accents (spec 3, 4, 8; L4-L6, L11, A3): every card and thread page wears its
 * ticket's accent, read per draw by `accentOf` and never stored, and a thread page names its ticket
 * with `standingOf`'s word. The thread page's mark sits inside the `kind` region (L5), so the
 * region swap recolours it. Every test takes its own store; nothing touches 4321.
 */

import './no-open.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { KIND_QUESTION, KIND_TICKET, KIND_WALKTHROUGH, accentOf, repoKey, standingOf } from '../items.mjs';
import { listItems, mergeTicket, needTicket, setCoPilot, storeFile } from '../store.mjs';
import { renderDeckPage, renderThreadPage } from '../ui/render.mjs';
import { postStored, shapedTicketBody, takeLive, tempDeck } from '../testUtils.mjs';

const REPO = path.resolve('D:/work/pilot');

const aTicket = (title, state) => postStored({ kind: KIND_TICKET, title, body: shapedTicketBody(title), repo: REPO, sliceCount: 60, state });
const aThread = (title, ticket, kind = KIND_QUESTION) =>
  postStored({ kind, title, body: `${title}?`, repo: REPO, ...(kind === KIND_QUESTION ? { options: ['A', 'B'] } : {}), ...(ticket ? { ticket } : {}) });
const closed = (fields) => ({ ...fields, resolvedAt: new Date().toISOString(), resolution: 'done' });
const reread = (id) => listItems().find((item) => item.id === id);

/** The `data-accent` of the card whose title links to `id`, as `/items` draws it. */
const cardAccent = (html, id) =>
  html.match(new RegExp(`<article[^>]* data-accent="([a-z]+)">(?:(?!<article).)*?<h2><a href="/thread/${id}">`, 's'))?.[1];
/** What the thread page's `kind` region holds, up to its owner line. */
const kindRegion = (html) => html.match(/data-live="kind">(.*?)<span class="owner">/s)?.[1];

test('five threads draw five accents', (t) => {
  tempDeck(t);
  const red = aThread('Red', aTicket('G', 'red').id);
  const yellow = aThread('Yellow', aTicket('Y', 'yellow').id);
  const green = aThread('Green', aTicket('R', 'green').id);
  const shut = postStored(closed({ kind: KIND_QUESTION, title: 'Shut', body: 'x', repo: REPO, ticket: aTicket('S', 'red').id }));
  const unticketed = aThread('Unticketed', null);

  const html = renderDeckPage(listItems());
  assert.deepEqual(
    [red, yellow, green, shut, unticketed].map((item) => cardAccent(html, item.id)),
    ['red', 'yellow', 'green', 'plain', 'blue'],
  );
});

test('a closed thread of an open ticket is plain, and an open thread of a closed ticket is plain', () => {
  const ticket = { kind: KIND_TICKET, id: 'itm_t', state: 'green', repo: REPO };
  assert.equal(accentOf(closed({ kind: KIND_QUESTION, ticket: 'itm_t' }), [ticket]), 'plain');
  const done = closed({ kind: KIND_TICKET, id: 'itm_d', state: 'closed', repo: REPO });
  assert.equal(accentOf({ kind: KIND_QUESTION, ticket: 'itm_d' }, [done]), 'plain');
});

test('a thread naming no ticket the deck holds is blue, and a repo-less ticket still draws', () => {
  assert.equal(accentOf({ kind: KIND_QUESTION, ticket: 'itm_gone' }, []), 'blue');
  const merged = closed({ kind: KIND_TICKET, id: 'itm_m', state: 'closed', mergedInto: 'itm_gone' });
  assert.equal(accentOf({ kind: KIND_QUESTION, ticket: 'itm_m' }, [merged]), 'blue', 'a dangling host');
  const bare = { kind: KIND_TICKET, id: 'itm_b', title: 'Bare', state: 'yellow' };
  const thread = { kind: KIND_QUESTION, id: 'itm_q', title: 'Q', body: 'q', ticket: 'itm_b', replies: [] };
  assert.match(kindRegion(renderThreadPage(thread, [bare, thread])), /<span class="standing">parked<\/span>/);
});

test("a merged ticket's open question takes its host's accent", (t) => {
  tempDeck(t);
  const host = aTicket('Host', 'red');
  takeLive(host.id);
  const merged = aTicket('Merged', 'red');
  const question = aThread('Asked of the merged', merged.id);
  mergeTicket(merged.id, 'pilot');
  assert.equal(accentOf(reread(question.id), listItems()), 'red');
  const items = listItems().map((item) => (item.id === host.id ? { ...item, state: 'green' } : item));
  assert.equal(accentOf(reread(question.id), items), 'green', "the host's state, not the merged ticket's");
});

test("a ticket's own card wears its own state", (t) => {
  tempDeck(t);
  const yellow = aTicket('Y', 'yellow');
  const green = aTicket('R', 'green');
  const html = renderDeckPage(listItems());
  assert.equal(cardAccent(html, yellow.id), 'yellow');
  assert.equal(cardAccent(html, green.id), 'green');
});

test('the accent is read per draw', (t) => {
  tempDeck(t);
  const ticket = aTicket('Building', 'yellow');
  const walk = aThread('Walk it', ticket.id, KIND_WALKTHROUGH);
  assert.equal(cardAccent(renderDeckPage(listItems()), walk.id), 'yellow');
  assert.match(kindRegion(renderThreadPage(reread(walk.id), listItems())), /data-accent="yellow"/);

  needTicket(ticket.id);
  assert.equal(cardAccent(renderDeckPage(listItems()), walk.id), 'green');
  assert.match(kindRegion(renderThreadPage(reread(walk.id), listItems())), /data-accent="green"/);
  assert.doesNotMatch(fs.readFileSync(storeFile(), 'utf8'), /accent/, 'no item stores an accent');
});

test("the thread page's accent sits inside the kind region", (t) => {
  tempDeck(t);
  const question = aThread('Asked', aTicket('R', 'green').id);
  const html = renderThreadPage(reread(question.id), listItems());
  assert.match(kindRegion(html), /^<span class="accent" data-accent="green"><\/span>/);
  assert.doesNotMatch(html, /<[^>]*data-live[^>]*data-accent|<[^>]*data-accent[^>]*data-live/, 'never on a region element');
});

test('a walkthrough under a parked ticket names the ticket and parked', (t) => {
  tempDeck(t);
  const live = aTicket('Live', 'red');
  takeLive(live.id);
  const parked = aTicket('Parked', 'red');
  const held = aTicket('Held', 'yellow');
  setCoPilot(held.id, true);
  const page = (ticket) => kindRegion(renderThreadPage(aThread(`Under ${ticket.title}`, ticket.id, KIND_WALKTHROUGH), listItems(), [], {}, {}, false, [], null, { coPilots: { [repoKey(REPO)]: held.id }, switches: {} }));

  assert.match(page(parked), new RegExp(`<a class="ref ticket" href="/thread/${parked.id}">Parked</a> <span class="standing">parked</span>`));
  assert.match(page(live), /<span class="standing">in hand<\/span>/);
  assert.match(page(held), /<span class="standing">co-pilot<\/span>/);
  assert.equal(standingOf(closed(live), listItems(), null), 'closed');
});
