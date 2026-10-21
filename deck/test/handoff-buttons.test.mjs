/** S1 of thread-types-phase, spec 3 and 2 (L2-L4): a handoff thread offers Handoff failed and Reply. */

import './no-open.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { HANDOFF_FAILED, KIND_CREW_HANDOFF, KIND_HANDOFF, lastSaid } from '../items.mjs';
import { addReply, listItems, postItem, resolveItem } from '../store.mjs';
import { renderHomePage, renderThreadPage } from '../ui/render.mjs';
import { postStored, postsTheChoice, shapedTicketBody, tempDeck } from '../testUtils.mjs';

const REPO = 'D:/work/alpha';

/** Posted as `hooks/context-size-guard.js` posts it: no options, no slice. */
const aCrewHandoff = () => ({
  kind: KIND_CREW_HANDOFF,
  title: 'Handoff: pilot-implementer is at 160k tokens of its context window',
  body: 'pilot-implementer is past the hard mark. If nothing arrives from it, brief a fresh agent from its branch.',
  repo: REPO,
});

const buttonIn = (html, value) => new RegExp(`name="choice" value="${value}"`).test(html);

test('a crew-handoff posted with no options is stored with options ["Handoff failed"]', (t) => {
  tempDeck(t);
  assert.equal(KIND_CREW_HANDOFF, 'crew-handoff');
  assert.equal(HANDOFF_FAILED, 'Handoff failed');
  assert.deepEqual(postItem(aCrewHandoff()).options, [HANDOFF_FAILED]);
});

test("the chain's handoff gets the same button", (t) => {
  tempDeck(t);
  // As `deck/chain.mjs` posts it: straight into `postItem`, carrying `next`.
  const handoff = postItem({ kind: KIND_HANDOFF, repo: REPO, title: 'Next run: Thing', body: 'The spec.', next: 'itm_0' });
  assert.deepEqual(handoff.options, [HANDOFF_FAILED]);
  assert.equal(handoff.next, 'itm_0');
});

test("a handoff's card and page draw Handoff failed and Reply, and no Dismiss", (t) => {
  tempDeck(t);
  for (const kind of [KIND_HANDOFF, KIND_CREW_HANDOFF]) {
    const item = postItem({ ...aCrewHandoff(), kind });
    const page = renderThreadPage(item, [item], []);
    const card = renderHomePage(listItems().filter((candidate) => candidate.id === item.id));
    for (const [where, html] of [['page', page], ['card', card]]) {
      assert.ok(buttonIn(html, HANDOFF_FAILED), `${kind} ${where}: Handoff failed`);
      assert.match(html, /<button type="submit">Reply<\/button>|class="to-thread"[^>]*>Reply</, `${kind} ${where}: Reply`);
      assert.ok(!buttonIn(html, 'Dismiss'), `${kind} ${where}: no Dismiss button`);
      assert.doesNotMatch(html, /class="dismiss-item"|action="\/dismiss-item"/, `${kind} ${where}: no Dismiss form`);
      assert.ok(!buttonIn(html, 'Teach me'), `${kind} ${where}: no Teach me`);
      assert.match(html, /<div class="choices" data-confirm-row><button [^>]*value="Handoff failed"[^>]* data-confirm /, `${kind} ${where}: confirms in place`);
      assert.match(html, /class="type-note"/, `${kind} ${where}: the type note`);
    }
  }
});

test('a handoff stored before S1, with no options, draws no type note', (t) => {
  tempDeck(t);
  const item = postStored({ ...aCrewHandoff(), kind: KIND_HANDOFF });
  const page = renderThreadPage(item, [item], []);
  assert.doesNotMatch(page + renderHomePage(listItems()), /class="type-note"/, 'no Handoff failed to name');
});

test('pressing Handoff failed stores that reply', async (t) => {
  const stored = await postsTheChoice(t, aCrewHandoff(), HANDOFF_FAILED);
  assert.deepEqual(stored.options, [HANDOFF_FAILED]);
  assert.equal(lastSaid(stored).from, 'user');
  assert.equal(lastSaid(stored).text, HANDOFF_FAILED);
  assert.equal(stored.resolvedAt, undefined, 'the pilot closes it, not the press');
});

test('a stored item of an unknown kind still draws Dismiss', (t) => {
  tempDeck(t);
  const item = postStored({ kind: 'note', title: 'An old note', body: 'Stored before the closed list.', repo: REPO });
  assert.equal(item.options, undefined, 'an unknown kind gets no deck buttons');
  const page = renderThreadPage(item, [item], []);
  const card = renderHomePage(listItems());
  assert.match(page, /class="dismiss-item"|action="\/dismiss-item"/, 'the page offers Dismiss');
  assert.ok(buttonIn(card, 'Dismiss'), 'the card offers Dismiss');
  assert.doesNotMatch(page + card, /class="type-note"/, 'and no type note');
});

// QA F2 moved from Dismiss: `chainNext` took the ticket when it posted the hand-off, so
// a chain hand-off that failed hands its ticket back to Tickets rather than losing it.
test('Handoff failed on a chain hand-off reopens the ticket it was posted to start', (t) => {
  tempDeck(t);
  const ticket = postItem({ kind: 'ticket', sliceCount: 60, title: 'Run 2', body: shapedTicketBody(), repo: REPO });
  const handoff = postItem({ kind: KIND_HANDOFF, title: `Next run: ${ticket.title}`, body: ticket.body, repo: REPO, next: ticket.id });
  resolveItem(ticket.id, `taken by ${handoff.id}`);

  addReply(handoff.id, HANDOFF_FAILED);

  const reopened = listItems().find((item) => item.id === ticket.id);
  assert.equal(reopened.resolvedAt, undefined, 'back to Tickets rather than lost with the failed hand-off');
  assert.equal(reopened.resolution, undefined);
});

test('Handoff failed with no next ticket, or typed words on a chain hand-off, touch nothing else', (t) => {
  tempDeck(t);
  const ticket = postItem({ kind: 'ticket', sliceCount: 60, title: 'Run 2', body: shapedTicketBody(), repo: REPO });
  const chain = postItem({ kind: KIND_HANDOFF, title: 'Next run: Run 2', body: 'spec', repo: REPO, next: ticket.id });
  resolveItem(ticket.id, `taken by ${chain.id}`);

  addReply(postItem({ ...aCrewHandoff() }).id, HANDOFF_FAILED);
  addReply(postItem({ ...aCrewHandoff(), kind: KIND_HANDOFF }).id, HANDOFF_FAILED);
  addReply(chain.id, 'It started fine, thanks.');

  assert.ok(listItems().find((item) => item.id === ticket.id).resolvedAt, 'the ticket stays taken');
});
