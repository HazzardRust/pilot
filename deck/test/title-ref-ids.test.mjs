/**
 * deck-title-prose S2 (spec 2, 3; L5, L6, A2): an item id inside a refusal or a closed notice's
 * resolution line reads as that item's title, in the one `class="ref"` link S1 set up. The text is
 * escaped first, the refusal is capped before the swap (L6), only the items the page already holds
 * are looked up, and an id the deck does not hold stays as written. The store's words do not move.
 */

import './no-open.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';

import { KIND_GATE2, KIND_QUESTION, SIGN_OFF } from '../items.mjs';
import { DeckRefusal, addReply, listItems, postItem } from '../store.mjs';
import { renderHomePage, renderThreadPage } from '../ui/render.mjs';
import { tempDeck, withTicket } from '../testUtils.mjs';

const REPO = path.resolve('D:/work/pilot');

/** The refusal line the thread page draws for `reason`. */
const refusalOn = (item, reason, items = listItems()) =>
  renderThreadPage(item, items, [], {}, {}, false, [], reason).match(/<p class="refused"[^>]*>.*?<\/p>/s)?.[0] ?? '';

/** A gate2 whose one ticket has an open question, so the store refuses its Sign off. */
function aWaitingGate2() {
  const gate = postItem({
    kind: KIND_GATE2, title: 'Gate <b>2</b>', body: 'Walk it.', repo: REPO,
    ...withTicket({ pr: '#250', sha: '0305827' }, REPO, 'yellow'),
  });
  const question = postItem({ kind: KIND_QUESTION, title: 'Which store?', body: 'which?', repo: REPO, options: ['A', 'B'], recommended: 'A', ticket: gate.ticket, blocking: true });
  return { gate, question };
}

const refusalOf = (id) => {
  try {
    addReply(id, SIGN_OFF);
  } catch (error) {
    if (error instanceof DeckRefusal) return error.message;
    throw error;
  }
  throw new Error('Sign off was not refused');
};

test('a gate2 refusal shows its ticket and question titles, not ids', (t) => {
  tempDeck(t);
  const { gate, question } = aWaitingGate2();
  const line = refusalOn(gate, refusalOf(gate.id));
  assert.ok(line.includes(`<a class="ref" href="/thread/${gate.ticket}">The ticket</a>`), line);
  assert.ok(line.includes(`<a class="ref" href="/thread/${question.id}">Which store?</a>`), line);
  assert.ok(line.includes(`<a class="ref" href="/thread/${gate.id}">Gate &lt;b&gt;2&lt;/b&gt;</a>`), line);
  assert.doesNotMatch(line.replace(/<a [^>]*>/g, ''), /itm_[0-9a-f]{12}/, 'no id is bare');
});

test('an id the deck does not hold stays as written', (t) => {
  tempDeck(t);
  const { gate } = aWaitingGate2();
  const line = refusalOn(gate, 'no item itm_000000000000 here');
  assert.ok(line.includes('no item itm_000000000000 here'), line);
  assert.doesNotMatch(line, /<a /);
});

test('a title with markup is escaped, and so is the text around it', (t) => {
  tempDeck(t);
  const { gate } = aWaitingGate2();
  const line = refusalOn(gate, `<script>x</script> ${gate.id}`);
  assert.ok(line.includes('&lt;script&gt;x&lt;/script&gt; '), line);
  assert.ok(line.includes('Gate &lt;b&gt;2&lt;/b&gt;</a>'), line);
  assert.doesNotMatch(line, /<b>|<script>/);
});

test('the cap applies before the swap', (t) => {
  tempDeck(t);
  const { gate } = aWaitingGate2();
  // The id straddles the 300th code point, so a cap after the swap would still draw a link.
  const line = refusalOn(gate, `${'x'.repeat(294)} ${gate.id} ${'y'.repeat(90)}`);
  assert.ok(line.includes(`${'x'.repeat(294)} ${gate.id.slice(0, 5)}</p>`), line);
  assert.doesNotMatch(line, /<a /);
  // Whole inside the cap, it is swapped, and the title's length does not move where the cut falls.
  const whole = refusalOn(gate, `${'x'.repeat(280)} ${gate.id} ${'y'.repeat(100)}`);
  assert.ok(whole.includes(`${'x'.repeat(280)} <a class="ref" href="/thread/${gate.id}">Gate &lt;b&gt;2&lt;/b&gt;</a> yy</p>`), whole);
});

test("a closed notice's resolution line names its item by title", () => {
  const ticket = { id: 'itm_aaaaaaaaaaaa', kind: 'ticket', title: 'Fix <the> port', body: 'x', repo: REPO, replies: [] };
  const closed = {
    id: 'itm_bbbbbbbbbbbb', kind: KIND_QUESTION, title: 'Merge?', body: 'x', repo: REPO, replies: [],
    resolution: `merged none: ${ticket.id}\nmore`, resolvedAt: '2026-10-02T10:00:00.000Z', notice: true,
  };
  const page = renderHomePage([ticket, closed], [{ id: 'run_1', repo: REPO, name: 'pilot', pid: process.pid }], REPO);
  const notice = page.match(/<div class="notice" data-notice="itm_bbbbbbbbbbbb".*?<\/div>/s)?.[0] ?? '';
  assert.ok(notice.includes(`<span class="who"> · merged none: <a class="ref" href="/thread/${ticket.id}">Fix &lt;the&gt; port</a></span>`), notice);
});
