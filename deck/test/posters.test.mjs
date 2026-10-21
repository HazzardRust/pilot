/**
 * S7 of three-lanes (spec 14, L14): only the pilot or the architect posts a gate1 (architect-runs-red L4), and only the pilot or QA a
 * gate2; the deck refuses the rest by the hook's stamp, before the store is read. The pilot's
 * own ticket moves are refused to a stamped crew agent, but for the architect's `merge`.
 * An unstamped call is the pilot's and is never gated.
 *
 * Every test takes its own store; nothing touches the real deck or port 4321.
 */

import './no-open.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

import { KIND_GATE1, KIND_GATE2, KIND_TICKET, stateOf } from '../items.mjs';
import { DeckRefusal, listItems, postItem } from '../store.mjs';
import { postStored, shapedTicketBody, takeLive, tempDeck } from '../testUtils.mjs';

const require = createRequire(import.meta.url);
const { stampAuthor } = require('../../hooks/deck-author.js');
const HOOKS = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'hooks', 'hooks.json');

const REPO = path.resolve('D:/work/pilot');
const GATE1 = { artefact: 'docs/design/x/architecture.md', sha: '0305827', locked: 3, slices: '| S1 |', sliceCount: 3, branch: 'feat/x' };
const reread = (id) => listItems().find((item) => item.id === id);
const aRedTicket = (title = 'Planning') => takeLive(postItem({ kind: KIND_TICKET, sliceCount: 3, title, body: shapedTicketBody(title), repo: REPO }).id);
const aGreenTicket = () => {
  const ticket = postStored({ kind: KIND_TICKET, title: 'Concluding', body: shapedTicketBody('Concluding'), repo: REPO, sliceCount: 3, state: 'green' });
  return takeLive(ticket.id);
};
const aGate2 = (ticket, author) =>
  postItem({ kind: KIND_GATE2, title: 'Gate 2', body: 'Walk it.', repo: REPO, pr: '#250', sha: '0305827', ticket: ticket.id, author });
const refusedNaming = (...words) => (error) =>
  error instanceof DeckRefusal && words.every((word) => error.message.includes(word));

test('a gate2 from QA is accepted and from the architect refused', (t) => {
  tempDeck(t);
  const ticket = aGreenTicket();
  assert.throws(() => aGate2(ticket, 'pilot:pilot-architect'), refusedNaming('a gate2 is posted by pilot and qa, not pilot:pilot-architect'));
  assert.equal(listItems().filter((item) => item.kind === KIND_GATE2).length, 0, 'nothing was stored');
  const gate2 = aGate2(ticket, 'pilot:pilot-qa');
  assert.equal(reread(gate2.id).kind, KIND_GATE2);
});

test('a gate1 from QA is refused', async (t) => {
  tempDeck(t);
  const { callTool } = await import('../server.mjs');
  // No evidence and no ticket: the poster is refused first, before any field or the store is read.
  assert.throws(
    () => postItem({ kind: KIND_GATE1, title: 'Gate 1', body: 'The design.', repo: REPO, author: 'pilot:pilot-qa' }),
    refusedNaming('a gate1 is posted by pilot and architect, not pilot:pilot-qa'),
  );
  // Through the tool, before the gate's lineage is read: a QA call makes the deck run no git.
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'posters-'));
  t.after(() => fs.rmSync(repo, { recursive: true, force: true }));
  execFileSync('git', ['init', '-q', repo]);
  assert.throws(
    () => callTool('deck_post', { kind: KIND_GATE1, title: 'Gate 1', body: 'The design.', repo, ...GATE1, author: 'pilot:pilot-qa' }),
    refusedNaming('a gate1 is posted by pilot and architect, not pilot:pilot-qa'),
  );
});

test("an unstamped gate1 is the pilot's", (t) => {
  tempDeck(t);
  const ticket = aRedTicket();
  const gate1 = postItem({ kind: KIND_GATE1, title: 'Gate 1', body: 'The design.', repo: REPO, ...GATE1, ticket: ticket.id });
  assert.equal(reread(gate1.id).kind, KIND_GATE1);
  // The main session's stamp is the empty agent_type, which is the pilot's too: it passes the
  // posters and is refused only by the gate's own shape further on.
  assert.throws(
    () => postItem({ kind: KIND_GATE1, title: 'Gate 1', body: 'The design.', repo: REPO, author: '' }),
    (error) => error instanceof DeckRefusal && !error.message.includes('is posted by'),
  );
});

test('the architect may merge and may not need', async (t) => {
  tempDeck(t);
  const { callTool } = await import('../server.mjs');
  const host = aRedTicket('host');
  const absorbed = postItem({ kind: KIND_TICKET, sliceCount: 2, title: 'absorbed', body: shapedTicketBody('absorbed'), repo: REPO });
  callTool('deck_ticket', { id: absorbed.id, action: 'merge', author: 'pilot:pilot-architect' });
  assert.equal(reread(absorbed.id).mergedInto, host.id);
  assert.throws(
    () => callTool('deck_ticket', { id: host.id, action: 'need', author: 'pilot:pilot-architect' }),
    refusedNaming("deck_ticket need is the pilot's", 'pilot:pilot-architect'),
  );
  assert.equal(stateOf(reread(host.id)), 'red', 'the refused need moved nothing');
  assert.throws(
    () => callTool('deck_ticket', { id: host.id, action: 'park', author: 'pilot:pilot-qa' }),
    refusedNaming("deck_ticket park is the pilot's", 'pilot:pilot-qa'),
  );
});

test('deck_ticket is stamped', async (t) => {
  tempDeck(t);
  const { callTool } = await import('../server.mjs');
  const manifest = JSON.parse(fs.readFileSync(HOOKS, 'utf8'));
  const entry = manifest.hooks.PreToolUse.find((e) => e.hooks.some((h) => h.command.includes('deck-author.js')));
  assert.ok(new RegExp(`^(?:${entry.matcher})$`).test('mcp__plugin_pilot_deck__deck_ticket'), 'deck-author runs before deck_ticket');

  const host = aRedTicket('host');
  // The architect claims to be the pilot; the hook's stamp wins, and the deck refuses on it.
  const payload = { tool_name: 'mcp__plugin_pilot_deck__deck_ticket', tool_input: { id: host.id, action: 'need', author: 'pilot:pilot' }, agent_type: 'pilot:pilot-architect' };
  const { updatedInput } = stampAuthor(payload).hookSpecificOutput;
  assert.equal(updatedInput.author, 'pilot:pilot-architect');
  assert.throws(() => callTool('deck_ticket', updatedInput), refusedNaming("deck_ticket need is the pilot's", 'pilot:pilot-architect'));
});
