/**
 * The test ledger (tested-once spec 4; ADR 0229 L3, L4, L8): one jsonl line per test run, appended by
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
const ledgerPath = (home) => path.join(home, '.claude', 'pilot', 'tests', 'ledger.jsonl');

/** This process's node major, the `node` of every row it writes and reads. */
const nodeMajor = () => Number(process.versions.node.split('.')[0]);

/** The home whose ledger a run reads and writes: `home` as passed; else none inside the suite (`PILOT_GATE_HOME_STORE` set; L8), the user's own outside it. */
export const ledgerHome = (home) => home ?? (process.env.PILOT_GATE_HOME_STORE ? null : os.homedir());

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
    if (fs.existsSync(index)) {
      fs.copyFileSync(index, copy);
      // The copy is given the index's mtime (Linux stamps a fresh one), which git's racy-git rule
      // reads: an entry no older than it is hashed again, so a same-size edit in that second is seen.
      const { atime, mtime } = fs.statSync(index);
      fs.utimesSync(copy, atime, mtime);
    }
    const env = { ...process.env, GIT_INDEX_FILE: copy };
    gitIn(top, ['add', '-A', '--', '.', `:(exclude,glob)docs/design/*/run.json`], env);
    gitIn(top, ['reset', '-q', 'HEAD', '--', RECORDS], env);
    return gitIn(top, ['write-tree'], env);
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true });
  }
}

/** The feature slug a branch belongs to: `feat/<slug>`, `slice/<slug>-s<n>`, `fix/<slug>-s<n>`, `qa/<slug>`; else null. */
function slugOf(branch) {
  const match = /^(feat|slice|fix|qa)\/(.+)$/.exec(String(branch ?? ''));
  if (!match) return null;
  return match[1] === 'slice' || match[1] === 'fix' ? match[2].replace(/-s\d+\w*$/, '') : match[2];
}

/**
 * Appends `row` as one line to the ledger under `home` (0600 on create), stamped by this process over
 * whatever `row` carries: `at` now, `slug` from its branch, and the `platform` and `node` `reusableRun`
 * matches, so a row's identity is its writer's, never its caller's.
 */
export function recordRun(row, { home }) {
  const file = ledgerPath(home);
  privateDir(path.dirname(file));
  const stamped = { ...row, at: new Date().toISOString(), slug: slugOf(row.branch), platform: hostPlatform(), node: nodeMajor() };
  fs.appendFileSync(file, `${JSON.stringify(stamped)}\n`, { mode: 0o600 });
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
 * The latest green row of exactly `command` for exactly `tree` on this platform and node, since `since`
 * or full; else null. A row that deferred part of its run matches only an asking `scope` of `slice`,
 * since only a slice-scope run defers; integrate and QA need a complete row (L4, amended by
 * itm_ce0954d114aa). A row whose `cargo` was `skipped` matches a `slice` scope too, or `integrate`, which
 * runs no cargo (cargo runs at CI and at land; L4, assumed on itm_8edab381da91); never a non-null `cargo` otherwise.
 */
export function reusableRun({ tree, since = null, home, scope = null, command }) {
  if (typeof tree !== 'string' || !tree || typeof command !== 'string' || !command) return null;
  const fits = (row) =>
    row.exit === 0 && row.tree === tree && row.command === command && (scope === 'slice' || !deferred(row.scope)) &&
    (scope === 'slice' || row.cargo === null || (scope === 'integrate' && row.cargo === 'skipped')) && (row.since === null || row.since === since) &&
    row.platform === hostPlatform() && row.node === nodeMajor();
  return rowsIn(home).filter(fits).at(-1) ?? null;
}

/** Every row of the feature `slug`, oldest first. */
export function testRunsFor({ slug, home }) {
  return rowsIn(home).filter((row) => row.slug === slug);
}
