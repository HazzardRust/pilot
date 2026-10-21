/**
 * S1 of short-path (spec 4; L2, A3): a ticket whose signed plan is 2 slices or fewer is a short-path
 * ticket, read from `plan.sliceCount` alone and never stored. The Tickets tab marks its row `short path`.
 */

import './no-open.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';

import { KIND_GATE1, KIND_TICKET, SIGN_OFF, isShortPath } from '../items.mjs';
import { addReply, listItems, postItem, registerRun, resolveItem } from '../store.mjs';
import { renderHomePage } from '../ui/render.mjs';
import { postStored, shapedTicketBody, takeLive, tempDeck } from '../testUtils.mjs';

const REPO = path.resolve('D:/work/pilot');

const planned = (sliceCount) => ({ sliceCount: 5, plan: { sliceCount, gate1: 'itm_0', artefact: 'a.md' } });

const aTicket = (title, sliceCount = 5) =>
  postStored({ kind: KIND_TICKET, title, body: shapedTicketBody(title), repo: REPO, sliceCount, state: 'red' });

/** A live ticket whose gate1 of `sliceCount` slices is signed off. */
function signedPlan(title, sliceCount) {
  const ticket = takeLive(aTicket(title).id);
  const gate = postItem({
    kind: KIND_GATE1, title: 'Gate 1', body: 'The artefact.', repo: REPO, artefact: 'docs/design/small/architecture.md',
    sha: '31efcb0', locked: 1, slices: '| S1 |', sliceCount, branch: 'feat/small', ticket: ticket.id, surface: false,
  });
  addReply(gate.id, SIGN_OFF);
  resolveItem(gate.id, 'Signed off.');
  return ticket;
}

const page = () => {
  const runs = [{ ...registerRun({ repo: REPO, pid: process.pid }), feature: 'x' }];
  return renderHomePage(listItems(), runs, REPO, false, {}, {}, Date.now(), [], null, {}, null, { weekly: true });
};

test('a plan of 2 or fewer is short path', () => {
  assert.equal(isShortPath({ plan: { sliceCount: 1 } }), true);
  assert.equal(isShortPath({ plan: { sliceCount: 2 } }), true);
  assert.equal(isShortPath({ plan: { sliceCount: 3 } }), false);
  assert.equal(isShortPath({ sliceCount: 1 }), false);
});

test("the plan decides, not the ticket's count", () => {
  assert.equal(isShortPath(planned(2)), true);
  assert.equal(isShortPath({ sliceCount: 1, plan: { sliceCount: 3 } }), false);
});

test('the row marks a short ticket', (t) => {
  tempDeck(t);
  const one = signedPlan('One', 1);
  const two = signedPlan('Two', 2);
  const three = signedPlan('Three', 3);
  const unsigned = aTicket('Unsigned', 1);

  const html = page();
  const rowOf = (id) => html.match(new RegExp(`<li [^>]*>(?:(?!<li ).)*?/thread/${id}">.*?</li>`, 's'))[0];
  assert.match(rowOf(one.id), /class="short-path"/);
  assert.match(rowOf(two.id), /class="short-path"/);
  assert.doesNotMatch(rowOf(three.id), /class="short-path"/);
  assert.doesNotMatch(rowOf(unsigned.id), /class="short-path"/);
});
