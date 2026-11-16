/**
 * QA's comment rides on its posts (deck-writes-github S3; spec 3, L3, A5). A walkthrough or a gate2
 * carrying `comment` copies it to its ticket's run record as `qaComment`, the newest text winning,
 * then starts the one deck write of the feature PR (`deps.prWrite`). A credential in it is refused
 * before anything is stored. No git, no GitHub: the repository is a plain temp directory.
 */

import './no-open.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { KIND_GATE2, KIND_TICKET, KIND_WALKTHROUGH } from '../items.mjs';
import { DeckRefusal, listItems, recordsFor, registerRun } from '../store.mjs';
import { postStored, shapedTicketBody, takeLive, tempDeck } from '../testUtils.mjs';

const { callTool } = await import('../server.mjs');

const QA = 'pilot:pilot-qa';
const CHECKS = '| spec line | result | evidence |\n| --- | --- | --- |\n| 3 | pass | qa-comment.test.mjs |';

/** A live yellow ticket in a plain temp repository with a run record naming it, and a counting `prWrite`. */
function aTicketWithRecord(t) {
  tempDeck(t);
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-comment-'));
  t.after(() => fs.rmSync(repo, { recursive: true, force: true }));
  const { id: ticket } = postStored({ kind: KIND_TICKET, title: 'Pear', body: shapedTicketBody(), repo, state: 'yellow' });
  takeLive(ticket);
  const run = registerRun({ repo, pid: 4242 });
  callTool('deck_status', { run: run.id, slug: 'pear', ticket, slices: [] }, { prWrite: () => {} });
  const writes = [];
  const deps = { prWrite: (id, at) => writes.push([id, at]) };
  const record = () => recordsFor(repo).find((entry) => entry.ticket === ticket);
  return { repo, ticket, run, deps, writes, record };
}

const walkthrough = (repo, ticket, comment, deps) =>
  callTool('deck_post', { kind: KIND_WALKTHROUGH, title: 'Have a look', body: 'Open the PR and read it.', repo, ticket, author: QA, comment }, deps);

const gate2 = (repo, ticket, comment, deps, extra = {}) =>
  callTool('deck_post', { kind: KIND_GATE2, title: 'Gate 2', body: CHECKS, repo, pr: '#4', sha: '18a7d20', ticket, author: QA, comment, ...extra }, deps);

test('a walkthrough comment lands in the record', (t) => {
  const { repo, ticket, run, deps, writes, record } = aTicketWithRecord(t);
  walkthrough(repo, ticket, `${CHECKS}\n\nWalk pending.`, deps);
  assert.equal(record().qaComment, `${CHECKS}\n\nWalk pending.`);
  assert.deepEqual(writes, [[ticket, repo]], 'one deck write of the feature PR');
  // A later status of the same slug keeps it: deck_status never sends one.
  callTool('deck_status', { run: run.id, slug: 'pear', ticket, slices: [] }, deps);
  assert.equal(record().qaComment, `${CHECKS}\n\nWalk pending.`);
});

test('a gate2 comment replaces it', (t) => {
  const { repo, ticket, deps, writes, record } = aTicketWithRecord(t);
  walkthrough(repo, ticket, 'Walk pending.', deps);
  const named = listItems().find((item) => item.kind === KIND_WALKTHROUGH).id;
  gate2(repo, ticket, 'Walk signed: every row passes.', deps, { walkthrough: named });
  assert.equal(record().qaComment, 'Walk signed: every row passes.');
  assert.equal(writes.length, 2);
});

test('a gate2 with no walkthrough carries it alone', (t) => {
  const { repo, ticket, deps, writes, record } = aTicketWithRecord(t);
  gate2(repo, ticket, CHECKS, deps);
  assert.equal(record().qaComment, CHECKS);
  assert.deepEqual(writes, [[ticket, repo]]);
});

test('a credential in comment is refused', (t) => {
  const { repo, ticket, deps, writes, record } = aTicketWithRecord(t);
  const secret = 'token ghp_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
  assert.throws(() => walkthrough(repo, ticket, secret, deps), (error) => error instanceof DeckRefusal && /looks like/.test(error.message) && !error.message.includes('ghp_'));
  assert.equal(listItems().filter((item) => item.kind === KIND_WALKTHROUGH).length, 0, 'no item stored');
  assert.equal(record().qaComment, undefined, 'nothing on the record');
  assert.equal(writes.length, 0, 'no write started');
});

test("a comment is QA's, on an open ticket of its own repository", (t) => {
  const { repo, ticket, deps, writes, record } = aTicketWithRecord(t);
  const post = (over) => callTool('deck_post', { kind: KIND_WALKTHROUGH, title: 'Look', body: 'Open the PR.', repo, ticket, author: QA, comment: 'checks', ...over }, deps);
  assert.throws(() => post({ author: 'pilot:pilot-implementer' }), (error) => error instanceof DeckRefusal && /QA's to post/.test(error.message));
  assert.throws(() => post({ author: undefined }), DeckRefusal, "the pilot's walkthrough carries none either");
  const elsewhere = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-comment-other-'));
  t.after(() => fs.rmSync(elsewhere, { recursive: true, force: true }));
  assert.throws(() => post({ repo: elsewhere }), (error) => error instanceof DeckRefusal && /open ticket of this repository/.test(error.message));
  assert.throws(() => post({ ticket: undefined }), DeckRefusal, 'a comment names its ticket');
  assert.equal(listItems().filter((item) => item.kind === KIND_WALKTHROUGH).length, 0, 'no item stored');
  assert.equal(record().qaComment, undefined);
  assert.equal(writes.length, 0);
});

test('a comment is bounded and only on a walkthrough or a gate2', (t) => {
  const { repo, ticket, deps, record } = aTicketWithRecord(t);
  assert.throws(() => walkthrough(repo, ticket, 'x'.repeat(20001), deps), (error) => error instanceof DeckRefusal && /20000/.test(error.message));
  assert.throws(
    () => callTool('deck_post', { kind: 'question', title: 'Q?', body: 'Which?', repo, comment: 'no' }, deps),
    (error) => error instanceof DeckRefusal && /takes no comment/.test(error.message),
  );
  assert.equal(record().qaComment, undefined);
});
