/** S2 of usage-telemetry: the line carries models, repositories and the snapshot (spec 1, 3, 5; L6). */

import './no-open.mjs';
import '../../scripts/test/lib/git-fixture.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { repoKey } from '../items.mjs';
import { registerRun, setSlices } from '../store.mjs';
import { tempDeck } from '../testUtils.mjs';
import { readWindow } from '../transcripts.mjs';
import * as telemetry from '../telemetry.mjs';

const { WINDOW_MS, startUsageLog, usageLogFile } = telemetry;

// The hand-written projects root S1 pinned; its README carries the per-message counts.
const FIXTURE = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'telemetry');

const W_FROM = Date.parse('2026-09-01T10:00:00.000Z');
const W_TO = W_FROM + WINDOW_MS;
const OPUS = 'claude-opus-5-5';
const SONNET = 'claude-sonnet-5';
// msg_a1 + msg_a3 (alpha, Opus) and msg_b1 + msg_b2 (beta and its subagent, Sonnet).
const W_OPUS = { input: 13, cacheWrite5m: 100, cacheWrite1h: 200, cacheRead: 1050, output: 29 };
const W_SONNET = { input: 5, cacheWrite5m: 40, cacheWrite1h: 0, cacheRead: 410, output: 9 };
const HOUR_MS = 60 * 60 * 1000;

/** A scratch directory, its real long path, removed when the test ends. */
function scratch(t, prefix) {
  const dir = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), prefix)));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

/** `PILOT_USAGE_FILE` at a scratch path for one test; returns the path, not yet written. */
function snapshotFile(t) {
  const file = path.join(scratch(t, 'pilot-snapshot-'), 'context-usage-state.json');
  const previous = process.env.PILOT_USAGE_FILE;
  process.env.PILOT_USAGE_FILE = file;
  t.after(() => {
    if (previous === undefined) delete process.env.PILOT_USAGE_FILE;
    else process.env.PILOT_USAGE_FILE = previous;
  });
  return file;
}

/** The line one tick at the end of W writes into a scratch store, parsed. */
async function lineFor(t, projectsRoot) {
  tempDeck(t);
  let clock = W_TO - 1;
  const scheduled = [];
  const log = startUsageLog({ now: () => clock, schedule: (fn) => scheduled.push(fn) && { unref() {} }, projectsRoot });
  t.after(() => log.stop());
  clock = W_TO;
  await scheduled[0]();
  const lines = fs.readFileSync(usageLogFile(), 'utf8').trimEnd().split('\n');
  assert.equal(lines.length, 1);
  return JSON.parse(lines[0]);
}

const git = (cwd, ...args) => execFileSync('git', args, { cwd, stdio: 'ignore' });

test('byModel sums per model and total is their sum', async () => {
  const { total, byModel } = await readWindow(W_FROM, W_TO, { projectsRoot: FIXTURE });

  assert.deepEqual(byModel, { [OPUS]: W_OPUS, [SONNET]: W_SONNET });
  for (const kind of Object.keys(total)) assert.equal(total[kind], W_OPUS[kind] + W_SONNET[kind], kind);
});

test('a worktree cwd lands under its main checkout', async (t) => {
  snapshotFile(t);
  const root = scratch(t, 'pilot-repo-');
  const main = path.join(root, 'main');
  const worktree = path.join(root, 'wt');
  fs.mkdirSync(main);
  git(main, 'init', '-q');
  git(main, 'commit', '-q', '--allow-empty', '-m', 'init');
  git(main, 'worktree', 'add', '-q', '-b', 'wt', worktree);
  const projects = path.join(root, 'projects', 'C--wt');
  fs.mkdirSync(projects, { recursive: true });
  const entry = { type: 'assistant', timestamp: '2026-09-01T10:10:00.000Z', cwd: worktree,
    message: { id: 'msg_w1', model: OPUS, usage: { input_tokens: 2, output_tokens: 3 } } };
  fs.writeFileSync(path.join(projects, 'wwww.jsonl'), `${JSON.stringify(entry)}\n`);

  const line = await lineFor(t, path.join(root, 'projects'));

  const counts = { input: 2, cacheWrite5m: 0, cacheWrite1h: 0, cacheRead: 0, output: 3 };
  assert.deepEqual(line.tokens.byRepo, { [repoKey(main)]: { [OPUS]: counts } });
});

test('one checkout named in two casings is one repository on Windows', { skip: process.platform !== 'win32' }, async (t) => {
  snapshotFile(t);
  const main = path.join(scratch(t, 'pilot-repo-'), 'main');
  fs.mkdirSync(main);
  git(main, 'init', '-q');
  const projects = path.join(path.dirname(main), 'projects', 'C--main');
  fs.mkdirSync(projects, { recursive: true });
  const entries = [main, main.toUpperCase()].map((cwd, i) => ({ type: 'assistant', timestamp: '2026-09-01T10:10:00.000Z', cwd,
    message: { id: `msg_c${i}`, model: OPUS, usage: { input_tokens: 1, output_tokens: 1 } } }));
  fs.writeFileSync(path.join(projects, 'cccc.jsonl'), entries.map((e) => `${JSON.stringify(e)}\n`).join(''));

  const line = await lineFor(t, path.dirname(projects));

  assert.deepEqual(Object.keys(line.tokens.byRepo), [repoKey(main)]);
  assert.equal(line.tokens.byRepo[repoKey(main)][OPUS].output, 2);
});

test('an unresolvable cwd keys itself', async (t) => {
  snapshotFile(t);
  const notARepo = scratch(t, 'pilot-norepo-');
  assert.equal(await telemetry.repoOf(notARepo), notARepo);

  // The fixture's cwds name no directory on this machine.
  const line = await lineFor(t, FIXTURE);
  assert.deepEqual(line.tokens.byRepo, { 'C:/fixture/alpha': { [OPUS]: W_OPUS }, 'C:/fixture/beta': { [SONNET]: W_SONNET } });
  assert.deepEqual(line.tokens.byModel, { [OPUS]: W_OPUS, [SONNET]: W_SONNET });
});

/** A living repository called `name` in a scratch folder; the removed worktrees in these tests sit beside it. */
function livingRepo(t, name, root = scratch(t, 'pilot-gone-')) {
  const repo = path.join(root, name);
  fs.mkdirSync(repo);
  git(repo, 'init', '-q');
  return { root, repo };
}

/** A run in `repo` whose record names `worktree` as the feature's and `slice` as S1's. */
function recordNaming(repo, { worktree, slice }) {
  const run = registerRun({ repo, pid: process.pid });
  setSlices(run.id, [{ slice: 'S1', ...(slice && { worktree: slice }) }], 'f', { slug: 'f', ...(worktree && { worktree }) });
}

test('a removed worktree named in a run record keys under that run\'s repository', async (t) => {
  tempDeck(t);
  const { root, repo } = livingRepo(t, 'main');
  // Its folder name begins with no living repository's, so only the record can say.
  const gone = path.join(root, 'elsewhere-s1');
  recordNaming(repo, { slice: gone });

  assert.equal(await telemetry.repoOf(gone), repoKey(repo));
});

test('a removed worktree no record names keys under the sibling repository its folder name begins with', async (t) => {
  tempDeck(t);
  const { root, repo } = livingRepo(t, 'pilot');

  assert.equal(await telemetry.repoOf(path.join(root, 'pilot-usage-telemetry-s1')), repoKey(repo));
});

test('a subdirectory of a removed worktree resolves as the worktree does', async (t) => {
  tempDeck(t);
  const { root, repo } = livingRepo(t, 'pilot');
  const feature = path.join(root, 'feature-tree');
  recordNaming(repo, { worktree: feature });

  assert.equal(await telemetry.repoOf(path.join(feature, 'deck', 'test')), repoKey(repo), 'by the record');
  assert.equal(await telemetry.repoOf(path.join(root, 'pilot-s2', 'deck')), repoKey(repo), 'by the folder name');
});

test('a removed folder whose prefix names no living repository keys itself', async (t) => {
  tempDeck(t);
  const { root, repo } = livingRepo(t, 'main');
  fs.mkdirSync(path.join(root, 'docs'));
  const cases = [path.join(root, 'pilot-notes'), path.join(root, 'docs-old'), path.join(repo, '.claude', 'worktrees', 'agent-a1')];

  for (const gone of cases) assert.equal(await telemetry.repoOf(gone), gone);
});

test('of two sibling repositories the longest name wins', async (t) => {
  tempDeck(t);
  const { root } = livingRepo(t, 'pilot');
  const { repo: deck } = livingRepo(t, 'pilot-deck', root);

  assert.equal(await telemetry.repoOf(path.join(root, 'pilot-deck-s1')), repoKey(deck));
});

test('a living directory that is no repository still keys itself', async (t) => {
  tempDeck(t);
  const { root } = livingRepo(t, 'pilot');
  const notes = path.join(root, 'pilot-notes');
  fs.mkdirSync(notes);

  assert.equal(await telemetry.repoOf(notes), notes);
});

test('an unresolved directory is asked again next time', async (t) => {
  const dir = scratch(t, 'pilot-later-');
  assert.equal(await telemetry.repoOf(dir), dir);

  git(dir, 'init', '-q');

  assert.equal(await telemetry.repoOf(dir), repoKey(dir));
});

test('the snapshot is logged with the file\'s mtime as at', async (t) => {
  const file = snapshotFile(t);
  const resetsAt = Math.floor(Date.parse('2026-09-01T12:00:00.000Z') / 1000);
  fs.writeFileSync(file, JSON.stringify({
    ctx: 40,
    session: { pct: 47.4, resetsAt },
    weekly: { pct: 7, resetsAt },
    session_id: 'not-logged',
    decks: {
      'c:/fresh': { ctx: 19.6, at: new Date().toISOString() },
      'c:/stale': { ctx: 74, at: new Date(Date.now() - 13 * HOUR_MS).toISOString() },
    },
  }));
  const mtime = new Date('2026-09-01T09:58:00.000Z');
  fs.utimesSync(file, mtime, mtime);

  const line = await lineFor(t, FIXTURE);

  const limit = (pct) => ({ pct, resetsAt: '2026-09-01T12:00:00.000Z' });
  assert.deepEqual(line.snapshot, { at: mtime.toISOString(), session: limit(47), weekly: limit(7), decks: { 'c:/fresh': 20 } });
  assert.equal('snapshotError' in line, false);
});

test('an absent snapshot logs snapshot null and snapshotError absent', async (t) => {
  snapshotFile(t);

  const line = await lineFor(t, FIXTURE);

  assert.equal(line.snapshot, null);
  assert.equal(line.snapshotError, 'absent');
  assert.deepEqual(line.tokens.byModel, { [OPUS]: W_OPUS, [SONNET]: W_SONNET }, 'the line is still appended whole');
});

test('a half-written one logs malformed', async (t) => {
  fs.writeFileSync(snapshotFile(t), '{"session":{"pct":4');

  const line = await lineFor(t, FIXTURE);

  assert.equal(line.snapshot, null);
  assert.equal(line.snapshotError, 'malformed');
  assert.deepEqual(line.tokens.byModel, { [OPUS]: W_OPUS, [SONNET]: W_SONNET }, 'the line is still appended whole');
});

test('a snapshot of null logs malformed', async (t) => {
  fs.writeFileSync(snapshotFile(t), 'null');

  const line = await lineFor(t, FIXTURE);

  assert.equal(line.snapshot, null);
  assert.equal(line.snapshotError, 'malformed');
  assert.deepEqual(line.tokens.byModel, { [OPUS]: W_OPUS, [SONNET]: W_SONNET }, 'the line is still appended whole');
});
