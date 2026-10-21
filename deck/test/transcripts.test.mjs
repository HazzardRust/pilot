/** S1 of run-analytics: the shared transcript reader (spec 2, 6, 7, 8, 9; L3, L4, L5, A4, A6, A7). */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { projectDir, readRun } from '../transcripts.mjs';

// A synthetic projects root, written by hand: two sessions of the `demo` run joined by a
// hand-off, one session of another run, and nothing copied from a real transcript.
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'transcripts');
const REPO = 'C:\\fixture\\repo';
const PLANTED = 'PLANTED-9Q7X-SECRET';

const run = (opts = {}) => readRun(REPO, 'demo', { projectsRoot: ROOT, ...opts });
const agent = (usage, id) => usage.agents.find((a) => a.id === id);

test('a message streamed across several entries is counted once, at its largest output', () => {
  const reviewer = agent(run(), 'a2');

  assert.deepEqual(reviewer.models, {
    'claude-sonnet-5': { input: 10, cacheWrite5m: 100, cacheWrite1h: 200, cacheRead: 1000, output: 40 },
  });
  assert.equal(reviewer.toolCalls, 1);
});

test('a resumed agent in the next session is one agent', () => {
  const usage = run();
  const [implementer, ...again] = usage.agents.filter((a) => a.id === 'a1');

  assert.equal(again.length, 0);
  assert.equal(implementer.role, 'pilot-implementer');
  assert.equal(implementer.description, 'S1 implementer');
  assert.deepEqual(implementer.models, {
    'claude-opus-5-5': { input: 5, cacheWrite5m: 0, cacheWrite1h: 0, cacheRead: 1100, output: 16 },
  });
  assert.equal(implementer.toolCalls, 2);
  assert.equal(implementer.durationMs, 60_000 + 40_000);
  assert.equal(agent(usage, 'a2').parentId, 'a1');
});

test('only sessions whose deck_status names the slug are read', () => {
  const usage = run();

  assert.deepEqual(usage.sessions, ['s-a', 's-b']);
  assert.deepEqual(usage.agents.map((a) => a.id), ['pilot', 'a1', 'a2']);
  assert.deepEqual(agent(usage, 'pilot').models, {
    'claude-fable-5-1': { input: 11, cacheWrite5m: 0, cacheWrite1h: 300, cacheRead: 1000, output: 34 },
  });
  assert.equal(agent(usage, 'pilot').toolCalls, 2);
  assert.equal(agent(usage, 'pilot').durationMs, 600_000 + 10_000);
  // The first session's cost-state alone is not the run's: the second has none.
  assert.equal(usage.claude, null);
  assert.deepEqual(readRun(REPO, 'nothing-here', { projectsRoot: ROOT }).agents, []);
});

test('a half-written last line is skipped and counted', () => {
  assert.equal(run().skippedLines, 1);
});

test('a run\'s sessions are in time order, and a main session\'s half line is counted', () => {
  const usage = readRun(REPO, 'unrecorded', { projectsRoot: ROOT });

  // By name the ...0f session sorts first; by time the ...f2 session began an hour earlier.
  assert.deepEqual(usage.sessions, ['s-f2', 's-f']);
  assert.equal(usage.skippedLines, 1);
});

test('no prompt text leaves the reader', () => {
  const usage = run({ needles: ['slice/demo-s1', 'slice/demo-s2', 'feat/demo'] });

  assert.equal(JSON.stringify(usage).includes(PLANTED), false);
  assert.deepEqual(agent(usage, 'a1').matched, ['slice/demo-s1']);
  assert.deepEqual(agent(usage, 'a2').matched, ['slice/demo-s1']);
  assert.deepEqual(agent(usage, 'pilot').matched, []);
});

test('the projects directory is found whatever the case of the drive path', () => {
  const expected = path.join(ROOT, 'C--fixture-repo');
  assert.equal(projectDir('c:\\FIXTURE\\Repo', ROOT), expected);
  assert.equal(projectDir('C:/fixture/repo', ROOT), expected);
  assert.equal(projectDir('C:\\elsewhere', ROOT), null);
  assert.equal(projectDir(REPO, path.join(ROOT, 'no-such-root')), null);
});
