/**
 * yellow-never-idle S1 (spec 1-4, 9; L2, L3, L8): a non-blocking walkthrough the pilot or QA posts on an open yellow
 * ticket of its repository is the concluding move, in the post's own write: the ticket turns green and its co-pilot
 * is released, as a gate2's post does. `deck_post`'s answer says so once. Each test takes its own store; the
 * repository is a plain temp directory, so no git and no GitHub; nothing touches 4321.
 */

import './no-open.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { KIND_GATE2, KIND_REPORT, KIND_TICKET, KIND_WALKTHROUGH } from '../items.mjs';
import { lanesOf } from '../lanes.mjs';
import { coPilotFor, listItems, needTicket, pivotTicket, postItem, reopenItem, setCoPilot } from '../store.mjs';
import { postStored, shapedTicketBody, tempDeck } from '../testUtils.mjs';

const { callTool } = await import('../server.mjs');

const ARCHITECT = 'pilot:pilot-architect';
const reread = (id) => listItems().find((item) => item.id === id);

/** A yellow ticket held by a live co-pilot, in a plain temp repository of the test's own. */
function heldYellow(t, extra = {}) {
  tempDeck(t);
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'walk-concludes-'));
  t.after(() => fs.rmSync(repo, { recursive: true, force: true }));
  const ticket = postStored({ kind: KIND_TICKET, title: 'Pear', body: shapedTicketBody('pear'), repo, sliceCount: 2, state: 'yellow', ...extra });
  setCoPilot(ticket.id, true);
  assert.equal(coPilotFor(repo).live, true, 'the fixture holds the yellow lane');
  return { repo, ticket };
}

const walkthrough = (repo, ticket, extra = {}) => ({
  kind: KIND_WALKTHROUGH, title: 'Have a look', body: 'Open the card and read it.', repo, ticket: ticket.id, ...extra,
});

const CLAUSE = (id) => ` ${id} is now green (concluding); the yellow lane is free.`;
const count = (text, part) => text.split(part).length - 1;
const answerOf = (result) => result.content.map((part) => part.text).join('');

test('a pilot walkthrough on a yellow ticket concludes it', (t) => {
  const { repo, ticket } = heldYellow(t);

  postItem(walkthrough(repo, ticket));

  assert.equal(reread(ticket.id).state, 'green');
  assert.equal(coPilotFor(repo).live, false, 'the co-pilot is released in the same write');
  assert.equal(lanesOf(repo).yellowClause, 'Yellow: empty');
});

const NO_PR = { prWrite: () => {} };
const gate2 = (repo, ticket, extra = {}) => ({ kind: KIND_GATE2, title: 'Gate 2', body: 'Walk it.', repo, pr: '#4', sha: '18a7d20', ticket: ticket.id, ...extra });

test('the answer says so once for a walkthrough that moved its ticket', (t) => {
  const { repo, ticket } = heldYellow(t);
  const walked = answerOf(callTool('deck_post', walkthrough(repo, ticket), NO_PR));
  assert.equal(count(walked, CLAUSE(ticket.id)), 1);
  assert.ok(walked.endsWith(CLAUSE(ticket.id)), 'after the existing text');
});

test('the answer says so once for a gate2 that moved its ticket', (t) => {
  const { repo, ticket } = heldYellow(t);
  const gated = answerOf(callTool('deck_post', gate2(repo, ticket), NO_PR));
  assert.equal(count(gated, CLAUSE(ticket.id)), 1);
});

test('a gate2 after the walkthrough that concluded its ticket posts, and says nothing of green', (t) => {
  // The co-pilot's ticket is never live in the main slot (ADR 0087); the walkthrough has already turned it green.
  for (const named of [true, false]) {
    const { repo, ticket } = heldYellow(t);
    const walk = postItem(walkthrough(repo, ticket));

    const onGreen = answerOf(callTool('deck_post', gate2(repo, ticket, named ? { walkthrough: walk.id } : {}), NO_PR));

    assert.equal(count(onGreen, 'is now green'), 0);
    assert.equal(listItems().filter((item) => item.kind === KIND_GATE2 && item.ticket === ticket.id).length, 1, `stored, the walkthrough named: ${named}`);
  }
});

test("a gate2 on a green ticket only another author's walkthrough names is still the live ticket's", (t) => {
  const { repo, ticket } = heldYellow(t);
  postItem(walkthrough(repo, ticket, { author: ARCHITECT }));
  needTicket(ticket.id); // green by the pilot's need, not by a concluding walkthrough

  assert.throws(() => postItem(gate2(repo, ticket)), /is not live; deck_ticket take it first/);
});

test('a gate2 on a green ticket whose naming walkthrough did not conclude it is not live', (t) => {
  const { repo, ticket } = heldYellow(t);
  postItem(walkthrough(repo, ticket, { author: ARCHITECT })); // names the ticket, moves nothing, so need may turn it green
  needTicket(ticket.id);
  postItem(walkthrough(repo, ticket)); // a concluding kind of walkthrough, but the ticket is not yellow: it moves nothing

  assert.equal(reread(ticket.id).state, 'green');
  assert.throws(() => postItem(gate2(repo, ticket)), /is not live; deck_ticket take it first/);
});

test('a stale concluding walkthrough no longer exempts a ticket pivoted and made green by need', (t) => {
  const { repo, ticket } = heldYellow(t);
  postItem(walkthrough(repo, ticket)); // concludes: green
  pivotTicket(ticket.id); // back to yellow
  needTicket(ticket.id); // green again, by need

  assert.throws(() => postItem(gate2(repo, ticket)), /is not live; deck_ticket take it first/);
});

test('a gate2 from another repository naming a concluded green ticket is not live', (t) => {
  const { repo, ticket } = heldYellow(t);
  postItem(walkthrough(repo, ticket));
  const other = fs.mkdtempSync(path.join(os.tmpdir(), 'walk-concludes-other-'));
  t.after(() => fs.rmSync(other, { recursive: true, force: true }));

  assert.throws(() => postItem(gate2(other, ticket)), /is not live; deck_ticket take it first/);
});

test('a concluded ticket closed by its report and reopened is not exempt for a gate2', (t) => {
  const { repo, ticket } = heldYellow(t);
  postItem(walkthrough(repo, ticket)); // concludes: green
  postItem({ kind: KIND_REPORT, title: 'Done', body: 'Closed.', repo, ticket: ticket.id });
  assert.equal(reread(ticket.id).state, 'closed');
  reopenItem(ticket.id);

  assert.equal(reread(ticket.id).state, 'green');
  assert.throws(() => postItem(gate2(repo, ticket)), /is not live; deck_ticket take it first/);
});

test('a blocking walkthrough leaves it yellow', (t) => {
  const { repo, ticket } = heldYellow(t);

  postItem(walkthrough(repo, ticket, { blocking: true }));

  assert.equal(reread(ticket.id).state, 'yellow');
  assert.equal(coPilotFor(repo).live, true);
});

test("another author's walkthrough moves nothing", (t) => {
  const { repo, ticket } = heldYellow(t);

  const posted = postItem(walkthrough(repo, ticket, { author: ARCHITECT }));

  assert.equal(reread(posted.id).kind, KIND_WALKTHROUGH, 'the walkthrough is stored');
  assert.equal(reread(ticket.id).state, 'yellow');
  assert.equal(coPilotFor(repo).live, true);
});

test('a walkthrough on a ticket of another repository moves nothing', (t) => {
  const { ticket } = heldYellow(t);
  const elsewhere = fs.mkdtempSync(path.join(os.tmpdir(), 'walk-elsewhere-'));
  t.after(() => fs.rmSync(elsewhere, { recursive: true, force: true }));

  postItem(walkthrough(elsewhere, ticket));

  assert.equal(reread(ticket.id).state, 'yellow');
});

test('the incident replays green', (t) => {
  // itm_50652e3e4f6f as it stood at 2026-11-17 17:16Z: short path, 1 slice, yellow, its co-pilot held.
  const { repo, ticket } = heldYellow(t, { title: 'Audit F6: syntax check in scripts/gate.mjs', sliceCount: 1 });

  // itm_ab39b4603222's post shape: author pilot, no blocking, a worktree dir, two screens.
  postItem({
    kind: KIND_WALKTHROUGH,
    title: 'audit-f6: the gate stops on a syntax error before the suite',
    body: 'Built (S1, feat/audit-f6 at 3614c05f): `npm test` checks the syntax of every tracked .mjs/.js first.',
    repo,
    ticket: ticket.id,
    author: 'pilot',
    login: 'none needed',
    shell: 'PowerShell',
    screens: [
      "Set-Content scripts/tmp-broken.mjs 'export const a = ;'; npm test -- --since=HEAD -> stops in about 1 s, exit 1",
      'Remove-Item scripts/tmp-broken.mjs; npm test -- --since=HEAD -> first line `syntax ok <n> files in <ms> ms`',
    ],
  });

  assert.equal(reread(ticket.id).state, 'green', 'green after 1 call, where the incident took 9 h');
  assert.equal(coPilotFor(repo).live, false);
});
