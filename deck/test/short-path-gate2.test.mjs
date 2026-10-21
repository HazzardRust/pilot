/**
 * S3 of short-path (spec 2, 3; L4, A2): a gate1 of `SHORT_PATH_MAX` slices or fewer names its `surface`, and a
 * short-path ticket's gate2 carries one `Verdict:` line per slice, a `Gate:` line and, for a surface, its
 * walkthrough; the deck refuses it at post, before anything is written. Its Sign off then lands as any other.
 */

import './no-open.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';

import { KIND_GATE1, KIND_GATE2, KIND_TICKET, SIGN_OFF } from '../items.mjs';
import { DeckRefusal, addReply, beginLanding, coPilotFor, listItems, postItem, resolveItem, setCoPilot } from '../store.mjs';
import { renderThreadPage } from '../ui/render.mjs';
import { shapedTicketBody, takeLive, tempDeck } from '../testUtils.mjs';

const REPO = path.resolve('D:/work/short');
const reread = (id) => listItems().find((item) => item.id === id);
const refused = (message) => (error) => error instanceof DeckRefusal && error.message === message;

const redTicket = () => takeLive(postItem({ kind: KIND_TICKET, title: 'Small', body: shapedTicketBody('small'), repo: REPO, sliceCount: 2 }).id);

const gate1 = (ticket, sliceCount, extra = {}) =>
  postItem({
    kind: KIND_GATE1, title: 'Gate 1', body: 'The artefact.', repo: REPO, artefact: 'docs/design/small/architecture.md',
    sha: '31efcb0', locked: 1, slices: '| S1 |', sliceCount, branch: 'feat/small', ticket: ticket.id, ...extra,
  });

/** A yellow ticket whose signed plan has `sliceCount` slices and the `surface` given. */
function signedPlan(sliceCount, surface) {
  const ticket = redTicket();
  const gate = gate1(ticket, sliceCount, { surface });
  addReply(gate.id, SIGN_OFF);
  resolveItem(gate.id, 'Signed off.');
  return reread(ticket.id);
}

const gate2 = (ticket, body, extra = {}) =>
  postItem({ kind: KIND_GATE2, title: 'Gate 2', body, repo: REPO, pr: '#250', sha: '0305827', ticket: ticket.id, ...extra });

const gate2s = () => listItems().filter((item) => item.kind === KIND_GATE2);

test('a small gate1 names its surface', (t) => {
  tempDeck(t);
  const ticket = redTicket();
  assert.throws(() => gate1(ticket, 2), refused('a gate1 of 2 slices names surface: true or false'));
  assert.equal(listItems().filter((item) => item.kind === KIND_GATE1).length, 0, 'nothing stored');

  assert.equal(gate1(ticket, 2, { surface: false }).ticket, ticket.id);

  tempDeck(t);
  assert.equal(gate1(redTicket(), 3).sliceCount, 3, 'a 3-slice gate1 needs no surface');
});

test("a gate1's thread shows the surface flag only when it is set", (t) => {
  tempDeck(t);
  const withSurface = gate1(redTicket(), 2, { surface: true });
  assert.match(renderThreadPage(withSurface, listItems(), []), /<dt>Surface<\/dt><dd>yes: a walkthrough is owed<\/dd>/);

  tempDeck(t);
  const without = gate1(redTicket(), 2, { surface: false });
  assert.doesNotMatch(renderThreadPage(without, listItems(), []), /<dt>Surface<\/dt>/);
});

test('a short gate2 carries a Verdict per slice and a Gate line', (t) => {
  tempDeck(t);
  const ticket = signedPlan(2, false);
  assert.equal(ticket.plan.sliceCount, 2);

  assert.throws(
    () => gate2(ticket, 'S1 typescript-reviewer\nVerdict: approve\nGate: 1210 pass, 0 fail'),
    refused('a short-path gate2 carries one Verdict: line per slice: 1 for 2 slices'),
  );
  assert.throws(
    () => gate2(ticket, 'Verdict: approve\nVerdict: approve'),
    refused("a short-path gate2 carries a Gate: line, the slice gate's pass and fail counts"),
  );
  assert.equal(gate2s().length, 0, 'nothing stored');
  assert.equal(reread(ticket.id).state, 'yellow', 'the refused post moved nothing');

  const posted = gate2(ticket, 'Verdict: approve\nVerdict: approve\nGate: 1210 pass, 0 fail');
  assert.equal(posted.walkthrough, undefined, 'no surface, no walkthrough');
});

test('a surface needs its walkthrough', (t) => {
  tempDeck(t);
  const ticket = signedPlan(1, true);
  assert.equal(ticket.plan.surface, true, 'the plan carries the gate1 surface');
  const body = 'Verdict: approve\nGate: 1210 pass, 0 fail';

  assert.throws(() => gate2(ticket, body), refused('a short-path gate2 with a surface names its walkthrough'));
  assert.equal(gate2s().length, 0, 'nothing stored');

  assert.equal(gate2(ticket, body, { walkthrough: 'itm_0a1b2c3d4e5f' }).walkthrough, 'itm_0a1b2c3d4e5f');
});

test('a short gate2 lands as any other', (t) => {
  tempDeck(t);
  const ticket = signedPlan(2, false);
  setCoPilot(ticket.id, true);
  assert.equal(coPilotFor(REPO).live, true);

  const gate = gate2(ticket, 'Verdict: approve\nVerdict: approve\nGate: 1210 pass, 0 fail');
  assert.equal(reread(ticket.id).state, 'green');
  assert.equal(coPilotFor(REPO).live, false, 'the lane claim is released');

  addReply(gate.id, SIGN_OFF);
  beginLanding(gate.id, { worktree: 'D:/work/short-wt' });
  assert.equal(reread(gate.id).replies.at(-1).text, 'landing started in D:/work/short-wt');
});
