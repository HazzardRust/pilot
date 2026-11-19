/**
 * The stack of feature PRs (audit-f14 L5, L6): the one rule for which branch a feature PR is based on.
 * A run's record base never changes (L6); the PR's base is worked out from it on every write.
 */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { hostFor } from '../deck/host.mjs';
import { landingMessage } from './integrate.mjs';
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
 * After a squash of the lower branch (`squashOf`) the PR's branch is instead rebased onto the default branch and
 * pushed leased, then retargeted (`rebaseAfterSquash`, L3): `rebased <head> onto <main> (squash of <lower>)`, or
 * `not rebased <head>: <why>` with the PR left on its lower base for the next restack.
 * Never pushes the default branch or `pilot` (`assertPushable`, `FEATURE`); the squash rebase is its only rewrite.
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
      // A squash of the lower branch: rebased first, retargeted only once rebased, so a refused rebase keeps the
      // lower name for the next restack to try again.
      const lowerTip = base === main && base !== review.base ? squashOf({ cwd, git, host, lower: review.base, main }) : null;
      const rebase = lowerTip && rebaseAfterSquash({ cwd, git, head, lower: review.base, lowerTip, main });
      if (rebase) {
        lines.push(rebase.line);
        failed ||= rebase.failed === true;
        conflicted ||= rebase.conflict === true;
        if (!rebase.rebased) continue;
      }
      if (base !== review.base) {
        host.edit(number, { base });
        lines.push(`retargeted #${number} to ${base}`);
      }
      if (rebase) continue;
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

/**
 * The tip `lower`'s own-repository PR was merged at, when that tip is not in origin's default branch `main`: a squash
 * (spec 6). `null` when the PR's tip is in `main`, a merge commit, which only retargets. Read from the host and git,
 * never from `pilot.merge` (spec 7). Throws when the merged PR names no commit id.
 */
function squashOf({ cwd, git, host, lower, main }) {
  const merged = host.reviews({ head: lower, state: 'merged', limit: LIST_LIMIT }).find((pr) => pr?.crossRepo === false && pr.state === 'merged');
  const tip = merged?.headSha;
  if (typeof tip !== 'string' || !/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/.test(tip)) throw new Error(`${lower}'s merged PR names no commit`);
  // A tip this clone never fetched is in no branch restack could rewrite: nothing to rebase, so it only retargets.
  if (!holds(cwd, ['cat-file', '-e', `${tip}^{commit}`])) return null;
  const mainTip = git(['rev-parse', '--verify', `refs/remotes/origin/${main}^{commit}`]);
  return holds(cwd, ['merge-base', '--is-ancestor', tip, mainTip]) ? null : tip;
}

/** Whether `head`'s landing (`landingMessage`, two parents) is on origin's pilot's first-parent history (L3). */
function landedOnOriginPilot(cwd, git, head) {
  const ref = `refs/remotes/origin/${PILOT_BRANCH}`;
  if (!holds(cwd, ['rev-parse', '--verify', '-q', `${ref}^{commit}`])) return false;
  const subject = landingMessage(head);
  return git(['log', '--first-parent', '--format=%P%x00%s', ref])
    .split('\n')
    .some((line) => {
      const [parents, said] = line.split('\0');
      return said === subject && parents.split(' ').length === 2;
    });
}

/**
 * The one forced push (L3): `head` rebased in a temporary worktree onto origin's `main`, dropping what `lowerTip`
 * (the squashed lower branch) holds, and pushed leased on the tip fetched in this restack. Only for a feature landed on
 * pilot. Answers `null` when `head` holds none of `lowerTip` (nothing to drop: retarget only), else `{ line, rebased }`,
 * with `failed` for a refusal the pilot must act on and `conflict` for a rebase that stopped; nothing is pushed unless
 * `rebased`. Throws on any other failure.
 */
function rebaseAfterSquash({ cwd, git, head, lower, lowerTip, main }) {
  const refuse = (why, more) => ({ line: `not rebased ${head}: ${why}`, rebased: false, ...more });
  const fetched = git(['rev-parse', '--verify', `refs/remotes/origin/${head}^{commit}`]);
  // A branch holding none of the squashed tip (already rebased, by an earlier restack or by hand) only retargets.
  if (!holds(cwd, ['merge-base', '--is-ancestor', lowerTip, fetched])) return null;
  if (!landedOnOriginPilot(cwd, git, head)) return refuse(`not landed on ${PILOT_BRANCH}`);
  const mainTip = git(['rev-parse', '--verify', `refs/remotes/origin/${main}^{commit}`]);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pilot-restack-'));
  try {
    git(['worktree', 'add', '-q', '--detach', dir, fetched]);
    const tried = spawnSync('git', ['rebase', '-q', '--onto', mainTip, lowerTip], { cwd: dir, encoding: 'utf8', windowsHide: true });
    if (tried.error || tried.status === null) throw new Error(`git rebase could not run: ${tried.error?.message ?? `signal ${tried.signal}`}`);
    if (tried.status !== 0) {
      spawnSync('git', ['rebase', '--abort'], { cwd: dir, windowsHide: true });
      return refuse(`conflict rebasing onto ${main}`, { conflict: true });
    }
    const refspec = `${gitAt(dir, 'rev-parse', 'HEAD')}:refs/heads/${head}`;
    assertPushable(refspec, { git });
    try {
      git(['push', '-q', `--force-with-lease=refs/heads/${head}:${fetched}`, 'origin', refspec]);
    } catch (err) {
      const now = git(['ls-remote', 'origin', `refs/heads/${head}`]).split('\t')[0];
      if (now !== fetched) return refuse('moved since fetched', { failed: true });
      throw err;
    }
    return { line: `rebased ${head} onto ${main} (squash of ${lower})`, rebased: true };
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
