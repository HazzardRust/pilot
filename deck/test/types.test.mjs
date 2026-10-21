/**
 * S2 of thread-types-phase, spec 1 (L1, L3, ADR 0051): `deck_post` accepts only
 * the deck's thread types, refuses any other kind by naming them, and an item
 * already stored under another kind still reads, renders and dismisses.
 */

import './no-open.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { POSTABLE_KINDS, isOpen } from '../items.mjs';
import { DeckRefusal, dismissItem, listItems, postItem } from '../store.mjs';
import { TOOLS } from '../tools.mjs';
import { callTool } from '../server.mjs';
import { renderThreadPage } from '../ui/render.mjs';
import { postStored, shapedTicketBody, tempDeck, withTicket } from '../testUtils.mjs';

const ELEVEN = [
  'question',
  'walkthrough',
  'signoff',
  'report',
  'ticket',
  'audit',
  'handoff',
  'crew-handoff',
  'lesson',
  'gate1',
  'gate2',
];

const EVIDENCE = { gate1: { artefact: 'docs/design/x/architecture.md', sha: '0305827', locked: 3, slices: '| S1 |' }, gate2: { pr: '#1', sha: '0305827' } };
const anItem = (kind) => ({
  kind,
  title: `A ${kind}`,
  body: kind === 'ticket' ? shapedTicketBody() : 'The body.',
  ...(kind === 'ticket' ? { sliceCount: 60 } : {}),
  // A gate1 names a red ticket and a gate2 a yellow one (ticket-states spec 2), put here first.
  ...(kind === 'gate1' ? withTicket(EVIDENCE.gate1) : kind === 'gate2' ? withTicket(EVIDENCE.gate2, undefined, 'yellow') : EVIDENCE[kind]),
});

test('every postable kind is accepted', (t) => {
  tempDeck(t);
  assert.deepEqual([...POSTABLE_KINDS].sort(), [...ELEVEN].sort(), 'the eleven thread types, no more and no fewer');
  for (const kind of POSTABLE_KINDS) {
    assert.equal(postItem(anItem(kind)).kind, kind, `${kind} is posted`);
  }
  assert.equal(listItems().length, ELEVEN.length + 2, 'and the tickets the gate1 and the gate2 name');
});

test('an unknown kind is refused, naming all eleven types', (t) => {
  tempDeck(t);
  for (const kind of ['note', 'wizard', 'Question']) {
    assert.throws(
      () => callTool('deck_post', anItem(kind)),
      (err) => {
        assert.ok(err instanceof DeckRefusal, `${kind}: a refusal, not a crash`);
        assert.match(err.message, new RegExp(`not "${kind}"`), `${kind}: the refusal names what was sent`);
        for (const type of ELEVEN) assert.ok(err.message.includes(type), `${kind}: the refusal names ${type}`);
        return true;
      },
    );
  }
  assert.deepEqual(listItems(), [], 'and nothing is stored');
});

test('chat and user are still refused with their own reasons', (t) => {
  tempDeck(t);
  assert.throws(() => postItem(anItem('chat')), /kind chat is refused: the deck makes a repository's chat itself/);
  assert.throws(() => postItem(anItem('user')), /kind user is refused: only the user opens one, with Create/);
  assert.deepEqual(listItems(), []);
});

test('a stored item of an unknown kind still reads, renders and dismisses', (t) => {
  tempDeck(t);
  // Stored before the list closed (L3): written as the store writes it, not posted.
  const read = postStored({ kind: 'note', title: 'An old note', body: 'Kept.' });
  assert.equal(read?.kind, 'note', 'it reads');
  const page = renderThreadPage(read, [read], []);
  assert.match(page, /An old note/, 'it renders');
  assert.match(page, /<form class="dismiss-item" method="post" action="\/dismiss-item" data-in-place>/, 'with Dismiss');

  dismissItem(read.id);
  assert.ok(!isOpen(listItems().find((item) => item.id === read.id)), 'and Dismiss closes it');
});

test("deck_post's schema lists exactly POSTABLE_KINDS", () => {
  const kind = TOOLS.find((tool) => tool.name === 'deck_post').inputSchema.properties.kind;
  assert.deepEqual(kind.enum, POSTABLE_KINDS);
});
