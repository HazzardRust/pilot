/**
 * The stack of feature PRs (audit-f14 L5, L6): the one rule for which branch a feature PR is based on.
 * A run's record base never changes (L6); the PR's base is worked out from it on every write.
 */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { hostFor } from '../deck/host.mjs';
import { conflictPaths, mergeResolved } from './merge-generated.mjs';
import { assertPushable, firstLine, git as gitAt, holds, PILOT_BRANCH, remoteDefaultBranch } from './pilot-branch.mjs';
import { removeWorktree } from './sync.mjs';

/** How many PRs on the lower head are read, so a fork's PR of the same branch name cannot hide this repository's. */
const LIST_LIMIT = 30;

/** How many open PRs one restack reads: a repository with more open PRs than this restacks only the first. */
const OPEN_LIMIT = 100;

/** A feature branch's name as restack takes it from the host: `feat/` and plain path parts, so no argv option or refspec rides in. */
const FEATURE = /^(?!.*\.\.)feat\/\w[\w.-]*(?:\/\w[\w.-]*)*(?<!\.lock)$/;

/**
 * The base a feature PR targets, from the run record's `base`: `pilot` stays `pilot` (a legacy run, A3);
 * the default branch (as origin says it now, `remoteDefaultBranch`) stays itself; `feat/<N>` stays
 * `feat/<N>` while N's own-repository PR does not read merged on `host`, then the default branch.
 * `git` is `(args) => string`, argv only. Throws on any other base, or when the host or origin cannot be asked.
 */
export function prBase({ git, host, base }) {
  if (base === PILOT_BRANCH) return PILOT_BRANCH;
  const main = remoteDefaultBranch(git);
  if (base === main) return main;
  if (typeof base !== 'string' || !/^feat\//.test(base)) throw new Error(`record base ${JSON.stringify(base)} is not ${PILOT_BRANCH}, ${main} or feat/<slug>`);
  const merged = host.reviews({ head: base, state: 'merged', limit: LIST_LIMIT }).some((pr) => pr?.crossRepo === false && pr.state === 'merged');
  return merged ? main : base;
}

/**
 * Brings each open own-repository feature PR (head `feat/`) level with its base (audit-f14 spec 6, 10; L2, L4, A5):
 * a PR whose `prBase` differs from its base is retargeted (`host.edit`); then a branch behind a lower `feat/<N>` takes
 * N's tip, and one that no longer merges clean onto the default branch takes it, each merged in a temporary worktree
 * (generated paths regenerated, the branch's own run record kept) and pushed to origin, never forced. A `pilot` base
 * (A3) is only retargeted. `git` is `(args) => string` run in `cwd`. Answers `{ lines, exitCode }`: one line per change,
 * `level #<n>` for a PR left as it was; exit 3 a hand conflict (nothing pushed for that branch), 1 any failure,
 * which outranks a conflict on another PR (every line is still printed).
 * Never pushes the default branch or `pilot` (`assertPushable`, `FEATURE`) and never rewrites a branch.
 */
export function restack({ cwd = process.cwd(), git = (args) => gitAt(cwd, ...args), host }) {
  let main;
  let open;
  try {
    git(['fetch', '-q', '--prune', 'origin']);
    main = remoteDefaultBranch(git);
    open = host.reviews({ state: 'open', limit: OPEN_LIMIT });
  } catch (err) {
    return { lines: [`restack failed: ${firstLine(err)}`], exitCode: 1 };
  }
  const lines = [];
  let failed = false;
  let conflicted = false;
  for (const review of open) {
    if (review?.crossRepo !== false || review.state !== 'open' || !FEATURE.test(String(review.head)) || !Number.isSafeInteger(review.number)) continue;
    const { number, head } = review;
    try {
      const base = prBase({ git, host, base: review.base });
      // prBase passes any `feat/` text; only a plain branch name reaches the edit, the refs and the lines.
      if (base !== PILOT_BRANCH && base !== main && !FEATURE.test(base)) throw new Error(`base ${JSON.stringify(base)} is not a plain feat/ branch`);
      if (base !== review.base) {
        host.edit(number, { base });
        lines.push(`retargeted #${number} to ${base}`);
      }
      const forward = base === PILOT_BRANCH ? 'level' : mergeForward({ cwd, git, head, base, main });
      if (forward === 'level') {
        if (base === review.base) lines.push(`level #${number}`);
      } else {
        lines.push(forward.line);
        conflicted ||= forward.conflict === true;
      }
    } catch (err) {
      failed = true;
      lines.push(`restack failed for #${number}: ${firstLine(err)}`);
    }
  }
  return { lines, exitCode: failed ? 1 : conflicted ? 3 : 0 };
}

/**
 * Merges origin's `base` into origin's `head` when `head` is behind a lower `feat/` base, or no longer merges clean onto
 * the default branch `main`: 'level' when neither, `{ line }` merged and pushed unforced, `{ line, conflict: true }` on
 * a hand conflict, with nothing pushed. Throws on any other failure, the push rejected for a branch that moved included.
 */
function mergeForward({ cwd, git, head, base, main }) {
  const ours = git(['rev-parse', '--verify', `refs/remotes/origin/${head}^{commit}`]);
  const theirs = git(['rev-parse', '--verify', `refs/remotes/origin/${base}^{commit}`]);
  if (holds(cwd, ['merge-base', '--is-ancestor', theirs, ours])) return 'level';
  if (base === main) {
    // merge-tree exits 0 clean, 1 on a conflict; anything else is a git that could not try, never a reason to merge.
    const tried = spawnSync('git', ['merge-tree', '--write-tree', ours, theirs], { cwd, encoding: 'utf8', windowsHide: true });
    if (tried.status === 0) return 'level';
    if (tried.status !== 1) throw new Error(`git merge-tree failed: ${String(tried.stderr || tried.error?.message || '').trim().split('\n')[0]}`);
  }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pilot-restack-'));
  try {
    git(['worktree', 'add', '-q', '--detach', dir, ours]);
    // The branch's own run record is the writer side: `ours` (merge-generated L3).
    const { left, why } = mergeResolved(dir, theirs, `Merge ${base} into ${head}`, { side: 'ours' });
    if (left.length) return { line: `conflict ${head}: ${conflictPaths(left, why)}`, conflict: true };
    const sha = gitAt(dir, 'rev-parse', 'HEAD');
    const refspec = `${sha}:refs/heads/${head}`;
    assertPushable(refspec, { git });
    git(['push', '-q', 'origin', refspec]);
    return { line: `merged ${base} into ${head}` };
  } finally {
    removeWorktree(cwd, dir);
  }
}

/** `pilot restack`: one line per open feature PR on stdout; exit 0 level, 1 failed, 3 a conflict. */
export function main(argv, { cwd = process.cwd(), host } = {}) {
  if (argv.length) {
    process.stderr.write('usage: pilot restack\n');
    return 1;
  }
  let said;
  try {
    const found = host ?? hostFor(cwd);
    if (found === null) throw new Error('no host: pilot.host is none');
    said = restack({ cwd, host: found });
  } catch (err) {
    said = { lines: [`restack failed: ${firstLine(err)}`], exitCode: 1 };
  }
  for (const line of said.lines) process.stdout.write(`${line}\n`);
  return said.exitCode;
}
