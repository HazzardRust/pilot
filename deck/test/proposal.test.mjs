/**
 * S4 of yellow-lane (spec 6, L4): a ticket-making proposal is a `question` with `proposal: true`
 * and no `ticket`. It never holds a gate1, signoff or gate2, and the Tickets tab still lists it open.
 * The deck checks the flag itself: only a boolean `true`, only on a question, never beside
 * `ticket` or `blocking`.
 */

import './no-open.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';

import { KIND_GATE1, KIND_GATE2, KIND_QUESTION, KIND_SIGNOFF, KIND_TICKET, KIND_WALKTHROUGH, holdsGates } from '../items.mjs';
import { DeckRefusal, listItems, postItem } from '../store.mjs';
import { callTool } from '../server.mjs';
import { postStored, shapedTicketBody, takeLive, tempDeck } from '../testUtils.mjs';

const REPO = path.resolve('D:/work/pilot');
const GATE1 = { artefact: 'docs/design/x/architecture.md', sha: '31efcb0', locked: 3, slices: '| S1 | x | 1 |', sliceCount: 1, surface: false, branch: 'feat/x' };

const propose = (extra = {}) =>
  callTool('deck_post', { kind: KIND_QUESTION, title: 'Make these tickets?', body: 'Three tickets, one per surface.', repo: REPO, proposal: true, ...extra });
const reread = (id) => listItems().find((item) => item.id === id);
const proposals = () => listItems().filter((item) => item.proposal === true);
const refusedNaming = (...words) => (error) => error instanceof DeckRefusal && words.every((word) => error.message.includes(word));

test('a proposal is posted without a ticket', (t) => {
  tempDeck(t);
  const ticket = postStored({ kind: KIND_TICKET, title: 'Built', body: shapedTicketBody('Built'), repo: REPO, sliceCount: 3, state: 'green' });

  assert.match(propose().content[0].text, /^Posted itm_[0-9a-f]+/);
  assert.equal(proposals().length, 1, 'stored with its flag');

  assert.throws(() => propose({ ticket: ticket.id }), refusedNaming('proposal', 'ticket'), 'with ticket');
  assert.throws(() => propose({ blocking: true, recommended: 'A', options: ['A', 'B'] }), refusedNaming('proposal', 'blocking'), 'with blocking');
  for (const value of ['true', 1, null]) {
    assert.throws(() => propose({ proposal: value }), refusedNaming('proposal', 'true'), `proposal ${JSON.stringify(value)}`);
  }
  assert.throws(
    () => callTool('deck_post', { kind: KIND_WALKTHROUGH, title: 'Walk it', body: 'Steps.', repo: REPO, proposal: true }),
    refusedNaming('takes no proposal'),
    'on another kind',
  );
  assert.equal(proposals().length, 1, 'nothing refused was stored');

  // proposal: false is the default spelled out: a plain question, which may name its ticket.
  const plain = propose({ proposal: false, ticket: ticket.id }).content[0].text.match(/itm_[0-9a-f]+/)[0];
  assert.equal(reread(plain).proposal, undefined, 'stored without the flag');
  assert.equal(holdsGates(reread(plain)), true, 'it holds gates like any open question');
});

test('a proposal holds no gate1, signoff or gate2', (t) => {
  tempDeck(t);
  const red = postItem({ kind: KIND_TICKET, title: 'Planned', body: shapedTicketBody('Planned'), repo: REPO, sliceCount: 1 });
  const yellow = postStored({ kind: KIND_TICKET, title: 'Built', body: shapedTicketBody('Built'), repo: REPO, sliceCount: 3, state: 'yellow' });
  const id = propose().content[0].text.match(/itm_[0-9a-f]+/)[0];
  const proposal = reread(id);

  takeLive(red.id);
  assert.equal(postItem({ kind: KIND_GATE1, title: 'Gate 1', body: 'The artefact.', repo: REPO, ticket: red.id, ...GATE1 }).kind, KIND_GATE1);
  assert.equal(postItem({ kind: KIND_SIGNOFF, title: 'Ship it?', body: 'Ready?', repo: REPO }).kind, KIND_SIGNOFF);
  takeLive(yellow.id);
  assert.equal(postItem({ kind: KIND_GATE2, title: 'Gate 2', body: 'Walk it.', repo: REPO, pr: '#250', sha: '0305827', ticket: yellow.id }).kind, KIND_GATE2);
  assert.equal(reread(id).resolvedAt, undefined, 'the proposal is still open');

  assert.equal(holdsGates(proposal), false, 'a proposal');
  const plain = postItem({ kind: KIND_QUESTION, title: 'Which?', body: 'which?', repo: REPO });
  assert.equal(holdsGates(reread(plain.id)), true, 'an unticketed plain question still does');
  const held = (error) => refusedNaming(plain.id)(error) && !error.message.includes(id);
  assert.throws(() => postItem({ kind: KIND_SIGNOFF, title: 'Ship it?', body: 'Ready?', repo: REPO }), held, 'and holds a signoff, naming it alone');
});

test('the Tickets tab still lists it', (t) => {
  tempDeck(t);
  const id = propose().content[0].text.match(/itm_[0-9a-f]+/)[0];
  const read = JSON.parse(callTool('deck_read', { repo: REPO, open: true }).content[0].text);
  const listed = read.items.find((item) => item.id === id);
  assert.ok(listed, 'an open read lists it');
  assert.equal(listed.proposal, true);
  assert.equal(listed.ticket, undefined);
});
