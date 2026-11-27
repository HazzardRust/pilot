/**
 * The test ledger (tested-once spec 4; ADR NNNN L3, L4, L8): one jsonl line per test run, appended by
 * `runTests` after the process exits, its `exit` that process's own status. Reuse is keyed by the
 * worktree's exact tree; `docs/design/<slug>/run.json` is taken from HEAD, since the deck rewrites it
 * while a run is in flight. Any process of the user can append here, so agents never write it (L4).
 */

import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { privateDir } from '../hooks/lib/atomic-write.js';
import { hostPlatform } from '../hooks/lib/platform.js';

const RECORDS = ':(glob)docs/design/*/run.json';

/** The ledger file under `home`. */
export const ledgerPath = (home) => path.join(home, '.claude', 'pilot', 'tests', 'ledger.jsonl');

/** This process's node major, the `node` of every row it writes and reads. */
export const nodeMajor = () => Number(process.versions.node.split('.')[0]);

const gitIn = (cwd, args, env = process.env) => execFileSync('git', args, { cwd, env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true }).trim();

/** `{ sha, branch }` of `cwd`'s HEAD, each null where git names none (no repository, unborn, detached). */
export function headOf(cwd) {
  const out = (args) => spawnSync('git', args, { cwd, encoding: 'utf8', windowsHide: true });
  // One git for a born HEAD; an unborn one (or none) fails it, and only then is the branch asked for.
  const both = out(['rev-parse', 'HEAD', '--symbolic-full-name', 'HEAD']);
  if (both.status === 0) {
    const [sha, ref] = both.stdout.trim().split('\n');
    return { sha, branch: ref.startsWith('refs/heads/') ? ref.slice('refs/heads/'.length) : null };
  }
  return { sha: null, branch: out(['branch', '--show-current']).stdout?.trim() || null };
}

/**
 * The tree sha of `cwd`'s worktree, untracked files included and run records from HEAD, written
 * through a copy of the index so the real one is untouched; null when `cwd` is not in a git work
 * tree. Any other git failure throws.
 */
export function worktreeTree(cwd) {
  const where = spawnSync('git', ['rev-parse', '--is-inside-work-tree', '--show-toplevel', '--git-path', 'index'], { cwd, encoding: 'utf8', windowsHide: true });
  const [inside, top, gitIndex] = (where.stdout ?? '').trim().split('\n');
  if (where.status !== 0 || inside !== 'true') return null;
  const index = path.resolve(cwd, gitIndex);
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'pilot-tree-'));
  try {
    const copy = path.join(scratch, 'index');
    if (fs.existsSync(index)) fs.copyFileSync(index, copy);
    const env = { ...process.env, GIT_INDEX_FILE: copy };
    gitIn(top, ['add', '-A', '--', '.', `:(exclude,glob)docs/design/*/run.json`], env);
    gitIn(top, ['reset', '-q', 'HEAD', '--', RECORDS], env);
    return gitIn(top, ['write-tree'], env);
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true });
  }
}

/** The feature slug a branch belongs to: `feat/<slug>`, `slice/<slug>-s<n>`, `fix/<slug>-s<n>`, `qa/<slug>`; else null. */
export function slugOf(branch) {
  const match = /^(feat|slice|fix|qa)\/(.+)$/.exec(String(branch ?? ''));
  if (!match) return null;
  return match[1] === 'slice' || match[1] === 'fix' ? match[2].replace(/-s\d+\w*$/, '') : match[2];
}

/** Appends `row` as one line, its `slug` from its branch, to the ledger under `home` (0600 on create). */
export function recordRun(row, { home }) {
  const file = ledgerPath(home);
  privateDir(path.dirname(file));
  fs.appendFileSync(file, `${JSON.stringify({ ...row, slug: slugOf(row.branch) })}\n`, { mode: 0o600 });
}

/** Every well-formed row of the ledger under `home`, oldest first; an unreadable line is skipped. */
function rowsIn(home) {
  let text;
  try {
    text = fs.readFileSync(ledgerPath(home), 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }
  return text.split('\n').flatMap((line) => {
    try {
      const row = JSON.parse(line);
      return row && typeof row === 'object' ? [row] : [];
    } catch {
      return []; // A blank, torn or foreign line proves nothing; the rows around it still stand.
    }
  });
}

/** A scope line that defers part of the run to a later step: the row is not complete. */
const deferred = (scope) => typeof scope === 'string' && /\bdeferred\b/.test(scope);

/**
 * The latest green row for exactly `tree` on this platform and node, since `since` or full; else null.
 * A row that deferred part of its run matches only an asking `scope` of `slice`, since only a
 * slice-scope run defers; integrate and QA need a complete row (L4, amended by itm_ce0954d114aa).
 */
export function reusableRun({ tree, since = null, home, scope = null }) {
  if (typeof tree !== 'string' || !tree) return null;
  const fits = (row) =>
    row.exit === 0 && row.tree === tree && (scope === 'slice' || !deferred(row.scope)) && (row.since === null || row.since === since) &&
    row.platform === hostPlatform() && row.node === nodeMajor();
  return rowsIn(home).filter(fits).at(-1) ?? null;
}

/** Every row of the feature `slug`, oldest first. */
export function testRunsFor({ slug, home }) {
  return rowsIn(home).filter((row) => row.slug === slug);
}
