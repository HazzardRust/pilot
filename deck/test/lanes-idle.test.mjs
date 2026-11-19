/**
 * yellow-never-idle S2, spec 5, 8; L4, L5, A2.
 *
 * A held yellow ticket whose crew has made no tool call for `CREW_IDLE_MS` is named in `lanesFrom`'s refusal; one that is
 * blocked on the user or draining is not idle. `crewSeenAt` is the yellow crew's last heartbeat in a repository, a
 * worktree's folded into its repository's, and the daemon's start when none has reported.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { MAX_AGENTS, crewSeenAt, forgetAgents, noteAgent, sweepAgents } from '../agents.mjs';
import { CREW_IDLE_MS, idleYellowOf, lanesFrom } from '../lanes.mjs';

const REPO = 'D:/work/alpha';
const NOW = Date.parse('2026-11-19T12:00:00.000Z');
const MIN = 60_000;

const ticket = (id, state, more = {}) => ({ kind: 'ticket', id, title: id, repo: REPO, state, ...more });
const held = { ticket: 'itm_y1', live: true };
const lanes = (items, seen) => lanesFrom(items, REPO, { switching: {}, coPilot: held, crewSeenAt: seen, now: NOW });
const IDLE = 'yellow lane idle; itm_y1 has had no crew for 20 min — deck_ticket need it if its walkthrough or gate2 is up, else release it and spawn its successor';

test('a quiet crew is named', () => {
  assert.equal(CREW_IDLE_MS, 20 * MIN);
  assert.equal(lanes([ticket('itm_y1', 'yellow')], NOW - 21 * MIN).refusal, IDLE);
  assert.equal(lanes([ticket('itm_y1', 'yellow')], NOW - 19 * MIN).refusal, null, 'seen 19 min ago');
  assert.equal(lanesFrom([ticket('itm_y1', 'yellow')], REPO, { switching: {}, coPilot: held }).refusal, null, 'no crew input is never idle');
  assert.equal(
    lanes([ticket('itm_y1', 'yellow'), ticket('itm_g1', 'red')], NOW - 21 * MIN).refusal,
    'planning lane empty; itm_g1 is queued — deck_ticket take it first',
    "a stage lane's refusal comes first",
  );
});

test('a blocked or draining ticket is not idle', () => {
  const seen = NOW - 21 * MIN;
  const yellow = ticket('itm_y1', 'yellow');
  assert.deepEqual(idleYellowOf([yellow], REPO, 'itm_y1', seen), { ticket: 'itm_y1', at: NOW - MIN });
  assert.deepEqual(idleYellowOf([yellow], REPO, 'itm_y1', NOW), { ticket: 'itm_y1', at: NOW + 20 * MIN }, 'a future at is still returned');
  const question = { kind: 'question', id: 'itm_q1', title: 'q', repo: REPO, ticket: 'itm_y1', blocking: true, replies: [] };
  assert.equal(idleYellowOf([yellow, question], REPO, 'itm_y1', seen), null, 'an unanswered blocking question');
  const answered = { ...question, replies: [{ from: 'user', text: 'yes', at: '2026-11-19T11:00:00.000Z' }] };
  assert.deepEqual(idleYellowOf([yellow, answered], REPO, 'itm_y1', seen), { ticket: 'itm_y1', at: NOW - MIN }, 'an answered one holds nothing');
  assert.equal(idleYellowOf([ticket('itm_y1', 'yellow', { yielding: true })], REPO, 'itm_y1', seen), null, 'yielding');
  assert.equal(idleYellowOf([yellow], REPO, undefined, seen), null, 'no live co-pilot');
  assert.equal(idleYellowOf([ticket('itm_y1', 'green')], REPO, 'itm_y1', seen), null, 'not yellow');
  assert.equal(idleYellowOf([ticket('itm_y1', 'yellow', { resolvedAt: '2026-11-19T11:00:00.000Z' })], REPO, 'itm_y1', seen), null, 'closed');
  assert.equal(idleYellowOf([yellow], 'D:/work/beta', 'itm_y1', seen), null, 'another repository');
  assert.equal(lanes([ticket('itm_y1', 'yellow', { yielding: true })], seen).refusal, null);
});

test('a restart is a heartbeat', (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: NOW });
  forgetAgents();
  assert.equal(crewSeenAt(REPO), NOW);
});

test('only the crew counts', (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: NOW });
  forgetAgents();
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'pilot-crew-'));
  const worktree = fs.mkdtempSync(path.join(os.tmpdir(), 'pilot-crew-wt-'));
  t.after(() => {
    fs.rmSync(repo, { recursive: true, force: true });
    fs.rmSync(worktree, { recursive: true, force: true });
  });
  fs.mkdirSync(path.join(repo, '.git'));
  fs.writeFileSync(path.join(worktree, '.git'), `gitdir: ${repo.split(path.sep).join('/')}/.git/worktrees/s2\n`);

  noteAgent({ agentId: 'a1', agentType: 'Explore', cwd: repo }, NOW + 5 * MIN);
  assert.equal(crewSeenAt(repo), NOW, 'an Explore heartbeat is not the crew');
  noteAgent({ agentId: 'a2', agentType: 'pilot:pilot-implementer', cwd: worktree }, NOW + 7 * MIN);
  assert.equal(crewSeenAt(repo), NOW + 7 * MIN, "an implementer's worktree heartbeat counts for its repository");
  noteAgent({ agentId: 'a3', agentType: 'pilot:pilot-qa', cwd: repo }, NOW + 9 * MIN);
  assert.equal(crewSeenAt(repo), NOW + 9 * MIN, 'QA is crew');
});

test('a real repository is recorded once the table is full of stale ones', (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: NOW });
  forgetAgents();
  for (let filled = 0; filled < MAX_AGENTS; filled += 1) {
    noteAgent({ agentId: `old${filled}`, agentType: 'pilot:pilot-implementer', cwd: `D:/work/stale${filled}` }, NOW - 60 * MIN);
  }
  sweepAgents(NOW);

  noteAgent({ agentId: 'real', agentType: 'pilot:pilot-implementer', cwd: 'D:/work/real' }, NOW + MIN);
  assert.equal(crewSeenAt('D:/work/real'), NOW + MIN, 'its crew is recorded, not left to read as the daemon start');
});
