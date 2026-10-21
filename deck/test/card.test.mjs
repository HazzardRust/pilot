/**
 * Slice 7: a card is a preview you can answer.
 *
 * A card used to render the whole body and every message of a thread, so a deck
 * holding three sixty-line arguments was a home page nobody could see the shape
 * of — "the pilot deck should show only the first few lines of that thread
 * rather than the entire thing" (spec 2). And a question's options only existed
 * on the thread page, so answering one meant a navigation there and a
 * navigation back (spec 3).
 *
 * Two claims, and they are tested at the two different levels they live at. How
 * much of a body reaches the page is a claim about bytes, so it is asserted
 * against the strings the renderers return. Where the browser goes after an
 * option is clicked is a claim about a `Location` header, so it runs against a
 * real HTTP server on an ephemeral port — including for the `back` values a
 * hostile page would try, which is the whole reason the field is checked before
 * it is echoed (D7).
 *
 * Every test takes its own store directory and its own port. Nothing here may
 * touch the real store or port 4321: this machine runs a real deck.
 */

import './no-open.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';

import { deckOnAPort, postStored, tempDeck } from '../testUtils.mjs';

const { addReply, listItems, listRuns, postItem, registerRun, resolveItem } =
  await import('../store.mjs');
const { renderDeckPage, renderHomePage, renderThreadPage } = await import('../ui/render.mjs');

/** A repository, spelled the way the platform running the test spells them. */
const REPO = path.join('D:', 'work', 'pilot');

const aQuestion = (over = {}) => ({
  kind: 'question',
  title: 'Which port?',
  body: 'The deck wants one fixed port. I recommend 4321.',
  options: ['4321', '4317', 'let the daemon pick'],
  recommended: '4321',
  repo: REPO,
  ...over,
});

/** Sixty numbered lines, each one findable in a page and in nothing else. */
const SIXTY_LINES = Array.from(
  { length: 60 },
  (unused, index) => `body line ${String(index + 1).padStart(2, '0')}`,
).join('\n');

/** The markup of the first card's excerpt: what a card shows of a body. */
const previewMarkup = (page) => /<div class="preview md">([\s\S]*?)<\/div>/.exec(page)?.[1] ?? null;

/**
 * That excerpt as the browser lays it out, which is what these bounds are about.
 * The excerpt is markdown since the walkthrough of 2026-09-19, so the pilot's
 * own line breaks are `<br />` and each block is an element: both come back to
 * newlines, and the rest of the markup comes off. Every assertion below is the
 * string it was when the excerpt was plain text in a `<pre>`, which is the
 * point — rendering it changed what the card *looks* like and not how much of
 * the body reaches the browser.
 */
const firstPre = (page) =>
  previewMarkup(page)
    ?.replace(/<br \/>/g, '\n')
    .replace(/<\/(p|h[1-6]|li|pre)>/g, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/\n$/, '') ?? null;

/**
 * The markup inside a thread page's body block: what a thread shows of a body.
 * S9 renders it as markdown, so it is no longer the page's first `<pre>`.
 */
// Past the author's byline a body opens with since run-record S1.
const threadBody = (page) =>
  /<div class="body md">(?:<span class="who [^"]*">[^<]*<\/span>)?([\s\S]*?)<\/div>/.exec(page)?.[1] ?? null;

/** A run on the deck, so that the page under test is a tab and not the overview. */
const aRunOn = (repo) => registerRun({ repo, pid: process.pid });

// --- how much of a body a card shows (spec 2, D6) --------------------------

test('a 60-line body is six lines on a card and the whole argument in its thread', (t) => {
  tempDeck(t);
  const item = postItem(aQuestion({ body: SIXTY_LINES }));

  const home = renderHomePage(listItems());

  assert.ok(home.includes('body line 06'), 'the preview reaches the sixth line');
  assert.ok(!home.includes('body line 07'), 'and stops there — the rest is one click away');
  assert.ok(!home.includes('body line 60'), 'the browser is never sent the body it is not shown');
  assert.ok(home.includes(`/thread/${item.id}`), 'and the way into the whole of it is on the card');

  const thread = renderThreadPage(item, listItems());

  assert.ok(thread.includes('body line 01'), 'the thread page opens with the first line');
  assert.ok(thread.includes('body line 60'), 'and carries the sixtieth');
});

test('a body of one long line is 400 characters on a card and whole in its thread', (t) => {
  tempDeck(t);
  const item = postItem(aQuestion({ body: 'y'.repeat(500) }));

  const preview = firstPre(renderHomePage(listItems()));

  assert.equal(preview, `${'y'.repeat(400)}\n…`, 'the character bound bites before the line bound');
  // The card's preview is still plain text in a `<pre>`, which is what the line
  // above reads and what D6 asks for; the thread has the whole 500 as markdown.
  assert.equal(threadBody(renderThreadPage(item, listItems())), `<p>${'y'.repeat(500)}</p>`);
});

/** A code unit that is half of a character: what cutting a body by `slice` leaves. */
const halfACharacter = (text) =>
  [...text].some((character) => {
    const code = character.codePointAt(0);
    return code >= 0xd800 && code <= 0xdfff;
  });

test('the 400-character bound counts characters, and never cuts one in half', (t) => {
  tempDeck(t);
  // An emoji straddling the bound is two code units and one character. Cut
  // between them and what reaches the browser is a lone surrogate, which the
  // wire turns into a replacement character: a bound that damages what it bounds.
  postItem(aQuestion({ body: `${'y'.repeat(399)}😀${'z'.repeat(50)}` }));

  const preview = firstPre(renderHomePage(listItems()));

  assert.ok(!halfACharacter(preview), 'no half a character reaches the page');
  assert.ok(preview.endsWith('😀\n…'), 'the 400th character is whole, and more is behind it');
  assert.equal([...preview].length, 402, '400 characters, a newline and the elision');
});

test('a body already inside both bounds is shown whole, with nothing added to it', (t) => {
  tempDeck(t);
  postItem(aQuestion());

  assert.equal(
    firstPre(renderHomePage(listItems())),
    'The deck wants one fixed port. I recommend 4321.',
    'a short body carries no elision: there is nothing it is hiding',
  );
});

test('a body that ends in a newline is not marked as having more to read', (t) => {
  tempDeck(t);
  // Most posted bodies end in one, and six lines plus a trailing newline is
  // seven to `split`: an elision here would be the card saying there is more of
  // the body to read when the whole of it is already on screen.
  postItem(aQuestion({ body: 'one\ntwo\nthree\nfour\nfive\nsix\n' }));

  assert.equal(firstPre(renderHomePage(listItems())), 'one\ntwo\nthree\nfour\nfive\nsix');
});

test('a body ending in two trailing newlines previews without a dangling blank line', (t) => {
  tempDeck(t);
  postItem(aQuestion({ body: 'one\ntwo\nthree\nfour\nfive\nsix\n\n' }));

  assert.equal(
    firstPre(renderHomePage(listItems())),
    'one\ntwo\nthree\nfour\nfive\nsix',
    'every trailing blank line is trimmed, not just the very last character',
  );
});

test('a card is the item and not the argument: replies stay in the thread', (t) => {
  tempDeck(t);
  const item = postItem(aQuestion());
  addReply(item.id, 'the answer I typed, at length, more than once');

  const home = renderHomePage(listItems());

  assert.ok(!home.includes('the answer I typed'), 'a card of a long argument stays a card');
  assert.ok(
    renderThreadPage(listItems()[0], listItems()).includes('the answer I typed'),
    'and the argument itself is one click away, whole',
  );
});

/**
 * The walkthrough of 2026-09-19: "get rid of the 'open the thread' link at the
 * bottom - made redundant we can just click the title of the thread instead".
 * The card carried the same href twice, once on its title and once as a line of
 * its own under the options.
 */
test('a card carries one way into its thread, and it is the title', (t) => {
  tempDeck(t);
  const item = postItem(aQuestion());

  const home = renderHomePage(listItems());
  // The card, and not the page around it. Spec 26's Notifications panel is the
  // one deliberate exception to "a tab is one scope" (D3 of run-tabs) and it
  // links every open thread by title, which is a second way in *from the rail*
  // — this is about the card, which used to carry the same href twice itself.
  const card = home.split('<article')[1].split('</article>')[0];
  const intoTheThread = card.match(new RegExp(`href="/thread/${item.id}"`, 'g')) ?? [];

  assert.equal(intoTheThread.length, 1, 'the second way in was the first one again');
  assert.ok(
    home.includes(`<h2><a href="/thread/${item.id}">Which port?</a></h2>`),
    'and the one that is left is the title, which is what the user clicks',
  );
  assert.ok(!home.includes('open the thread'), 'the redundant line is gone from the card');
});

// --- the options, on the card (spec 3, D7) ---------------------------------

test('a card offers a question\'s options, the recommended one marked, and where to come back to', (t) => {
  tempDeck(t);
  aRunOn(REPO);
  postItem(aQuestion());

  const home = renderHomePage(listItems(), listRuns(), REPO);

  assert.match(home, /<form method="post" action="\/reply">/, 'the card posts the existing form');
  assert.ok(
    home.includes(`name="back" value="/?run=${encodeURIComponent(REPO)}"`),
    'and says which page it was clicked on — the tab the deck holds, never the query it was sent',
  );
  assert.ok(home.includes('name="choice" value="4321"'), 'every option is a button');
  assert.ok(home.includes('name="choice" value="let the daemon pick"'));
  assert.match(home, /4321 <span class="quiet">\(recommended\)<\/span>/, 'one of them is marked');
  assert.equal(
    home.match(/\(recommended\)/g).length,
    1,
    'and only the one the pilot recommends is',
  );
});

test('a card on /items comes back to /items when answered', (t) => {
  tempDeck(t);
  postItem(aQuestion());

  const everything = renderDeckPage(listItems());

  assert.ok(
    everything.includes('name="back" value="/items"'),
    'a card rendered on /items posts back to /items, not the overview',
  );
});

test('a card carries the item\'s own id in its reply form', (t) => {
  tempDeck(t);
  const item = postItem(aQuestion());

  const home = renderHomePage(listItems());

  assert.ok(
    home.includes(`name="id" value="${item.id}"`),
    'the hidden id field names this item, not an empty one',
  );
});

test('a card with nothing to click carries no form at all', (t) => {
  tempDeck(t);
  // An unknown kind and not a walkthrough: S9 gives a walkthrough its own one-click
  // reply (D10), so the kind with nothing to click is now a kind the deck has no
  // rendering of its own for, which is what A11 says any new kind is.
  const generic = postStored({
    kind: 'note',
    title: 'Context is at 40%',
    body: 'Bring the artefact current.',
    repo: REPO,
  });
  const closed = postItem(aQuestion({ title: 'Settled already' }));
  resolveItem(closed.id, 'we went with 4321');

  const everything = renderDeckPage(listItems(), listRuns());

  assert.ok(everything.includes(generic.id), 'both items are on the page');
  assert.ok(everything.includes(closed.id));
  assert.ok(
    !everything.includes('action="/reply"'),
    'an unknown kind offers nothing and a closed thread takes no reply',
  );
});

// --- over HTTP, which is where the click actually lands --------------------

const postForm = (base, body) =>
  fetch(`${base}/reply`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body,
    redirect: 'manual',
  });

test('an option clicked on the home page lands in the thread and comes back to that page', async (t) => {
  const base = await deckOnAPort(t);
  aRunOn(REPO);
  const item = postItem(aQuestion({ body: SIXTY_LINES }));
  const back = `/?run=${encodeURIComponent(REPO)}`;

  const response = await postForm(
    base,
    new URLSearchParams({ id: item.id, back, choice: '4321' }),
  );

  assert.equal(response.status, 303);
  assert.equal(response.headers.get('location'), back, 'the user is left on the page they clicked');
  assert.deepEqual(
    listItems().find((held) => held.id === item.id).replies.map((reply) => reply.text),
    ['4321'],
    'and the click is the reply, in that thread',
  );
});

test('a reply typed in a thread still comes back to the thread', async (t) => {
  const base = await deckOnAPort(t);
  const item = postItem(aQuestion());

  const response = await postForm(base, new URLSearchParams({ id: item.id, text: '4317' }));

  assert.equal(response.headers.get('location'), `/thread/${item.id}#reply`);
});

test('a back that is not a page of this deck never reaches the Location header', async (t) => {
  const base = await deckOnAPort(t);
  const item = postItem(aQuestion());
  const home = `/thread/${item.id}#reply`;

  const hostile = [
    'https://evil.example/',
    '//evil.example/',
    '/\\evil.example/',
    'javascript:alert(1)',
    'evil.example',
    '/deck\r\nSet-Cookie: taken=1',
    '',
    // Not an escape, because a `Location` Node refuses to write is a 500 on a
    // route that has already stored the reply — the user answered, and the deck
    // told them it fell over. Every `back` the deck itself writes is percent-
    // encoded and so printable ASCII; anything else falls back to the thread.
    `/deck${String.fromCodePoint(0x2028)}evil`,
    `/deck${String.fromCodePoint(0x0085)}evil`,
    '/café',
  ];

  for (const back of hostile) {
    const response = await postForm(
      base,
      new URLSearchParams({ id: item.id, back, choice: '4321' }),
    );
    assert.equal(response.status, 303, `a ${JSON.stringify(back)} back is still a reply`);
    assert.equal(
      response.headers.get('location'),
      home,
      `${JSON.stringify(back)} is not a page of this deck`,
    );
  }
});

// Every card names its ticket (deck-press-feedback spec 5, L5): a link with the ticket's title, read from the
// items the page already holds.
const aTicket = (title, over = {}) => postStored({ kind: 'ticket', title, body: 'Words.', repo: REPO, state: 'yellow', sliceCount: 2, ...over });
const aThreadOn = (title, ticket) => postStored({ kind: 'question', title, body: 'Why?', repo: REPO, ...(ticket ? { ticket } : {}) });
const cardOf = (page, title) => page.split('<article').find((card) => card.includes(`>${title}</a></h2>`)) ?? '';
const ticketLinkIn = (card) => /<a class="ref ticket" href="([^"]*)">([^<]*)<\/a>/.exec(card)?.slice(1) ?? null;

test('cards of two tickets each name their own ticket\'s title', (t) => {
  tempDeck(t);
  const alpha = aTicket('Alpha ticket');
  const beta = aTicket('Beta ticket');
  aThreadOn('On alpha', alpha.id);
  aThreadOn('On beta', beta.id);
  const page = renderHomePage(listItems(), [], null, false, {}, {}, Date.now());
  assert.deepEqual(ticketLinkIn(cardOf(page, 'On alpha')), [`/thread/${alpha.id}`, 'Alpha ticket']);
  assert.deepEqual(ticketLinkIn(cardOf(page, 'On beta')), [`/thread/${beta.id}`, 'Beta ticket']);
});

test('an unticketed card names none', (t) => {
  tempDeck(t);
  aThreadOn('Loose thread');
  const page = renderHomePage(listItems(), [], null, false, {}, {}, Date.now());
  assert.ok(cardOf(page, 'Loose thread'));
  assert.ok(!cardOf(page, 'Loose thread').includes('class="ref ticket"'));
});

test('a card whose ticket is missing or merged names none', (t) => {
  tempDeck(t);
  const host = aTicket('Host ticket');
  const merged = aTicket('Merged ticket', { mergedInto: host.id });
  aThreadOn('On missing', 'itm_000000000000');
  aThreadOn('On merged', merged.id);
  const page = renderHomePage(listItems(), [], null, false, {}, {}, Date.now());
  for (const title of ['On missing', 'On merged']) {
    assert.ok(cardOf(page, title), `${title} is drawn`);
    assert.ok(!cardOf(page, title).includes('class="ref ticket"'), `${title} names no ticket`);
  }
});

test('a ticket title is escaped on the card', (t) => {
  tempDeck(t);
  const ticket = aTicket('<img src=x onerror=alert(1)> & co');
  aThreadOn('On hostile', ticket.id);
  const page = renderHomePage(listItems(), [], null, false, {}, {}, Date.now());
  assert.equal(ticketLinkIn(cardOf(page, 'On hostile'))?.[1], '&lt;img src=x onerror=alert(1)&gt; &amp; co');
  assert.ok(!page.includes('<img src=x'));
});
