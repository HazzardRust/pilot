/**
 * S4 of handoff-no-wait (spec 3; F3, F5, L4): the deck knows its co-pilot's agent id. The first co-pilot heartbeat
 * after the grant stamps `deck.coPilots[repo].agent`, and `coPilotFor` (so `GET /api/record`'s `coPilot`) serves it.
 * Every test takes its own store; nothing touches 4321.
 */

import './no-open.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { KIND_TICKET } from '../items.mjs';
import { forgetAgents } from '../agents.mjs';
import { coPilotFor, releaseCoPilot, setCoPilot, storeFile } from '../store.mjs';
import { noteCoPilotAgent } from '../store-tickets.mjs';
import { deckOnAPort, postStored, shapedTicketBody, tempDeck } from '../testUtils.mjs';

const REPO = path.join('D:', 'work', 'pilot');
const CO_PILOT = 'pilot:pilot-co-pilot';

const granted = (repo = REPO) => {
  const ticket = postStored({ kind: KIND_TICKET, title: 'Building', body: shapedTicketBody('building'), repo, sliceCount: 60, state: 'yellow' });
  setCoPilot(ticket.id, true);
  return ticket;
};

/** The store file's identity and mtime: any write replaces it (an atomic rename), so a changed value is a write. */
const stamp = () => {
  const { ino, mtimeNs } = fs.statSync(storeFile(), { bigint: true });
  return `${ino}:${mtimeNs}`;
};

test('a co-pilot heartbeat after the grant stamps the entry', (t) => {
  tempDeck(t);
  granted();
  assert.equal(coPilotFor(REPO).agent, undefined, 'no stamp before a heartbeat');

  assert.equal(noteCoPilotAgent(REPO, 'a1b2c3d4e5f6a7b8c', CO_PILOT), true);
  assert.equal(coPilotFor(REPO).agent, 'a1b2c3d4e5f6a7b8c');
  assert.equal(coPilotFor(REPO).live, true, 'the stamp leaves the grant as it was');
});

test('nothing else stamps it', (t) => {
  tempDeck(t);
  granted();
  const at = Date.parse(coPilotFor(REPO).at);
  const before = stamp();

  assert.equal(noteCoPilotAgent(REPO, 'impl0000000000001', 'pilot:pilot-implementer'), false, "an implementer's type");
  assert.equal(noteCoPilotAgent(REPO, 'late0000000000001', CO_PILOT, at - 1000), false, 'a heartbeat older than the grant');
  assert.equal(noteCoPilotAgent(REPO, 'same0000000000001', CO_PILOT, at), false, 'a heartbeat at the grant itself');
  assert.equal(noteCoPilotAgent(path.join('D:', 'work', 'other'), 'away0000000000001', CO_PILOT), false, 'a repository with no entry');
  assert.equal(stamp(), before, 'no store write for any of them');

  assert.equal(noteCoPilotAgent(REPO, 'cop00000000000001', CO_PILOT), true);
  const once = stamp();
  assert.equal(noteCoPilotAgent(REPO, 'cop00000000000001', CO_PILOT), false, 'the same id twice');
  assert.equal(stamp(), once, 'one store write in all');

  releaseCoPilot(REPO);
  const released = stamp();
  assert.equal(noteCoPilotAgent(REPO, 'cop00000000000002', CO_PILOT), false, 'a released entry');
  assert.equal(stamp(), released);
  assert.equal(coPilotFor(REPO).agent, undefined);
});

test('a malformed id stamps nothing', (t) => {
  tempDeck(t);
  granted();
  for (const id of ['', ' ', '-flag', 'a'.repeat(65), 'a/b', 42, null]) {
    assert.equal(noteCoPilotAgent(REPO, id, CO_PILOT), false, JSON.stringify(id));
  }
  assert.equal(coPilotFor(REPO).agent, undefined);
});

test('a worktree heartbeat counts for its repository', (t) => {
  tempDeck(t);
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'co-pilot-agent-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const repo = path.join(root, 'repo');
  const worktree = path.join(root, 'repo-s4');
  fs.mkdirSync(path.join(repo, '.git', 'worktrees', 'repo-s4'), { recursive: true });
  fs.mkdirSync(worktree);
  // What `git worktree add` writes into the worktree's `.git` file.
  fs.writeFileSync(path.join(worktree, '.git'), `gitdir: ${path.join(repo, '.git', 'worktrees', 'repo-s4').replace(/\\/g, '/')}\n`);
  granted(repo);

  assert.equal(noteCoPilotAgent(worktree, 'wt000000000000001', CO_PILOT), true);
  assert.equal(coPilotFor(repo).agent, 'wt000000000000001');
});

test('the id is served', async (t) => {
  const base = await deckOnAPort(t);
  t.after(forgetAgents);
  granted();
  const answer = await fetch(`${base}/api/agents`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ agentId: 'served00000000001', agentType: CO_PILOT, cwd: REPO }),
  });
  assert.equal(answer.status, 200);

  const record = await (await fetch(`${base}/api/record?repo=${encodeURIComponent(REPO)}`)).json();
  assert.equal(record.coPilot.agent, 'served00000000001');
});
