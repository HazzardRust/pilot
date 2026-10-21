/**
 * S1 of architect-runs-red (spec 3, 5; §5 L4): the architect posts the gate1 on its own
 * ticket, read from the hook's stamp, and the thread is the pilot's whoever posted it, so
 * the user's press wakes the pilot and never the architect. gate2's posters do not widen.
 *
 * Every test takes its own store; nothing touches the real deck or port 4321. Tool calls
 * go over `node:http` with no agent, as in `architect-owner.test.mjs`.
 */

import './no-open.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';

import { deckOnAPort, tempDeck, withTicket } from '../testUtils.mjs';

const { KIND_GATE1, KIND_GATE2, ownerOf } = await import('../items.mjs');
const { DeckRefusal, addReply, listItems, postItem, refusePoster, registerRun, resolveItem } = await import('../store.mjs');
const { callTool } = await import('../server.mjs');

const ARCHITECT = 'pilot:pilot-architect';
const GATE1 = { artefact: 'docs/design/x/architecture.md', sha: '0305827', locked: 3, slices: '| S1 |' };
const stored = (id) => listItems().find((item) => item.id === id);

/** A directory that is not a git repository, so the gate1's lineage is not read (gate1-lineage). */
function plainRepo(t) {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'architect-gate1-'));
  t.after(() => fs.rmSync(repo, { recursive: true, force: true }));
  return repo;
}

/** The evidence of a gate1 on a live red ticket in `repo`, its merge decision taken first (merge-first). */
function gate1Evidence(repo) {
  const evidence = withTicket({ ...GATE1 }, repo);
  const merge = postItem({ kind: 'question', title: 'Merge?', body: 'None.', repo, ticket: evidence.ticket, author: ARCHITECT });
  resolveItem(merge.id, 'merged nothing', ARCHITECT);
  return evidence;
}

const callApi = (base, name, args = {}) =>
  new Promise((resolve, reject) => {
    const request = http.request(`${base}/api/tool`, { method: 'POST', agent: false, headers: { 'content-type': 'application/json' } }, (response) => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => (body += chunk));
      response.on('end', () => resolve(body));
    });
    request.on('error', reject);
    request.end(JSON.stringify({ name, arguments: args }));
  });
const saidIn = (body) => JSON.parse(JSON.parse(body).content[0].text).replies.map((reply) => reply.text);

test('an architect-stamped gate1 passes the poster check', () => {
  assert.doesNotThrow(() => refusePoster(KIND_GATE1, ARCHITECT));
  assert.doesNotThrow(() => refusePoster(KIND_GATE1, 'pilot:pilot'));
  assert.throws(() => refusePoster(KIND_GATE1, 'pilot:pilot-implementer'), (error) => error instanceof DeckRefusal && error.message.includes('a gate1 is posted by pilot and architect'));
  assert.throws(() => refusePoster(KIND_GATE2, ARCHITECT), DeckRefusal, 'gate2 does not widen');
});

test('an architect-posted gate1 is stored', (t) => {
  tempDeck(t);
  const repo = plainRepo(t);
  const said = callTool('deck_post', { kind: KIND_GATE1, title: 'Gate 1', body: 'The design.', repo, ...gate1Evidence(repo), author: ARCHITECT });
  assert.match(said.content[0].text, /^Posted itm_/);
  assert.equal(listItems().filter((item) => item.kind === KIND_GATE1).length, 1);
});

test("an architect-posted gate1 is the pilot's thread", async (t) => {
  const base = await deckOnAPort(t);
  const repo = plainRepo(t);
  registerRun({ repo, pid: process.pid });
  const gate1 = postItem({ kind: KIND_GATE1, title: 'Gate 1', body: 'The design.', repo, ...gate1Evidence(repo), author: ARCHITECT });
  assert.equal(ownerOf(stored(gate1.id)), 'pilot');
  addReply(gate1.id, 'Sign off');

  const architect = await callApi(base, 'deck_wait', { since: 0, timeout: 50, repo, author: 'architect', item: gate1.id, untaken: true });
  assert.deepEqual(saidIn(architect), [], "the architect's wait is handed nothing of the gate1");
  const pilot = await callApi(base, 'deck_wait', { since: 0, timeout: 50, repo, author: '' });
  assert.deepEqual(saidIn(pilot), ['Sign off']);
});
