/** S5 of usage-telemetry: the audit's measured spend from the usage log (spec 10, L8). Fixtures written by hand. */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { repoKey } from '../../deck/items.mjs';
import { flat, read } from './lib/area-file.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SCRIPT = path.join(ROOT, 'scripts', 'audit-spend.mjs');

const counts = (input, output) => ({ input, cacheWrite5m: 0, cacheWrite1h: 0, cacheRead: 10 * input, output });

/** A throwaway git repository, so `repoOf` resolves it to its own `repoKey`, and a directory for the log. */
function scratch(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'audit-spend-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const repo = path.join(dir, 'Alpha');
  fs.mkdirSync(repo);
  const init = spawnSync('git', ['init', '-q'], { cwd: repo, encoding: 'utf8' });
  assert.equal(init.status, 0, init.stderr);
  return { dir, repo };
}

const logLine = (from, to, byRepo) =>
  JSON.stringify({ at: to, window: { from, to }, snapshot: null, snapshotError: 'absent', tokens: { byRepo } });

// A deck directory that does not exist, so no run here reads the user's store (S7's recordsFor).
const NO_DECK = path.join(os.tmpdir(), 'audit-spend-no-deck');
const run = (args, env = {}) => {
  const result = spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8', env: { ...process.env, PILOT_DECK_DIR: NO_DECK, ...env } });
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
};

test("audit-spend sums the repository's byRepo over the fixture log", (t) => {
  const { dir, repo } = scratch(t);
  const log = path.join(dir, 'usage.jsonl');
  const mine = repoKey(repo);
  fs.writeFileSync(
    log,
    [
      logLine('2026-09-28T09:00:00.000Z', '2026-09-28T09:30:00.000Z', {
        [mine]: { 'claude-opus-5-5': counts(100, 20), 'claude-sonnet-5': counts(1, 2) },
        'd:/work/other': { 'claude-opus-5-5': counts(9000, 9000) },
      }),
      logLine('2026-09-28T09:30:00.000Z', '2026-09-28T10:00:00.000Z', {}),
      logLine('2026-09-28T10:00:00.000Z', '2026-09-28T10:30:00.000Z', { [mine]: { 'claude-opus-5-5': counts(10, 5) } }),
      '',
    ].join('\n'),
  );

  const out = run([repo, '--log', log]);
  assert.deepEqual(out, {
    log,
    lines: 3,
    from: '2026-09-28T09:00:00.000Z',
    to: '2026-09-28T10:30:00.000Z',
    spend: counts(111, 27),
    skippedLines: 0,
    runs: [],
    reports: [],
    noReport: 0,
  }, 'other repositories are excluded');
});

test('no log gives lines 0 and spend null, exit 0', (t) => {
  const { dir, repo } = scratch(t);
  const missing = path.join(dir, 'nowhere', 'usage.jsonl');
  assert.deepEqual(run([repo, '--log', missing]), { log: missing, lines: 0, from: null, to: null, spend: null, skippedLines: 0, runs: [], reports: [], noReport: 0 });

  const deckDir = path.join(dir, 'deck');
  const byDefault = run([repo], { PILOT_DECK_DIR: deckDir });
  assert.equal(byDefault.log, path.join(deckDir, 'usage.jsonl'), 'the daemon\'s log in the deck store by default');
  assert.equal(byDefault.spend, null);
  assert.equal(fs.existsSync(deckDir), false, 'reading writes nothing');
});

test('a torn line is skipped and counted', (t) => {
  const { dir, repo } = scratch(t);
  const log = path.join(dir, 'usage.jsonl');
  const mine = repoKey(repo);
  fs.writeFileSync(
    log,
    [
      logLine('2026-09-28T09:00:00.000Z', '2026-09-28T09:30:00.000Z', { [mine]: { m: counts(4, 1) } }),
      '{"at":"2026-09-28T10:00:00.000Z","window":{"fr',
      logLine('2026-09-28T11:00:00.000Z', '2026-09-28T11:30:00.000Z', { [mine]: { m: { input: 5 } } }),
      logLine('not a date', '2026-09-28T12:00:00.000Z', {}),
      logLine('2026-09-28T09:30:00.000Z', '2026-09-28T10:00:00.000Z', { [mine]: { m: counts(6, 1) } }),
    ].join('\n'),
  );

  const out = run([repo, '--log', log]);
  assert.equal(out.lines, 2);
  assert.equal(out.skippedLines, 3, 'torn, a count missing its kinds, a window that is not a date');
  assert.deepEqual(out.spend, counts(10, 2));
  assert.equal(out.to, '2026-09-28T10:00:00.000Z');
});

test('a log of one torn line gives spend null, never zeros', (t) => {
  const { dir, repo } = scratch(t);
  const log = path.join(dir, 'usage.jsonl');
  fs.writeFileSync(log, '{"at":"2026-09-28T10:00:00.000Z","window":{"fr');

  const { spend, lines, skippedLines } = run([repo, '--log', log]);
  assert.deepEqual({ spend, lines, skippedLines }, { spend: null, lines: 0, skippedLines: 1 });
});

test('the auditor runs audit-spend before the areas', () => {
  const source = read('agents/pilot-auditor.md');
  const spend = source.indexOf('scripts/audit-spend.mjs');
  assert.ok(spend > 0, 'the auditor names the script');
  assert.ok(spend < source.indexOf('## Areas'), 'before the areas');
  const prose = flat(source);
  assert.match(prose, /`measured`/, 'its block goes into the report as measured');
  assert.match(prose, /measured spend:/, 'with no log, unmeasured says so');
});
