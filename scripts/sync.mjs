/**
 * `pilot sync` — brings the default branch's work onto the pilot branch
 * (pilot-branch spec 5; L20). It runs when a ticket is taken and as the first act of
 * `pilot land`:
 *
 *   fetch --prune origin and the run remote; when the run remote's pilot (`runRef`) already
 *   contains origin/<default>, say so and stop; otherwise, in a temporary detached worktree at
 *   that pilot, merge --no-ff origin/<default>, npm ci when there is a package.json, the
 *   repository's test command, and on green push the merge's SHA to the run remote's
 *   refs/heads/pilot, never forced, or under `pilot.remote none` move the local pilot with
 *   `git update-ref refs/heads/pilot <new> <old>` (pilot-fork spec 4; L1, L3).
 *
 * The caller's checkout and its HEAD are never touched or read: the merge happens in the
 * temporary worktree, which is removed whatever happens, and the only push names
 * `refs/heads/pilot`, passed through `assertPushable` before the merge and again at the
 * push (spec 4; L4). No rebase. A conflict throws with `exitCode` 3 and the conflicting
 * paths; a red run, a failed install or a failed push throws with `exitCode` 1. Either
 * way nothing is pushed.
 */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { assertPushable, firstLine, holds, PILOT_BRANCH, remoteDefaultBranch } from './pilot-branch.mjs';
import { runRef, runRemote, shortRef } from './remotes.mjs';
import { git as gitAt, installWithNpm, NO_TEST, redLine, runTests, testCommand } from './integrate.mjs';
import { conflictLine, conflictPaths, mergeResolved } from './merge-generated.mjs';
import { allocateAdr } from './adr-allocate.mjs';

const TARGET = `refs/heads/${PILOT_BRANCH}`;

const fail = (reason, exitCode = 1) => Object.assign(new Error(`NOT synced: ${reason}; nothing pushed`), { exitCode, reason });
const short = (sha) => sha.slice(0, 7);

/**
 * Merges the commit `source` (a full SHA) into the run remote's pilot branch as last fetched
 * (the local `pilot` in local mode), and pushes it, or moves the local `pilot` from the tip it
 * merged onto, so a pilot that moved meanwhile is never overwritten: the seam `sync` and `land` share (red-lands-on-pilot L2, L3).
 * `git` is `(args) => string` run in `cwd`; `message` is the merge commit's; `test` the
 * shell command, the merged tree's own (`testCommand`) when empty: selected since `since`
 * (a full sha, pilot's tip before the merge) when given, full when not (land); `label` names the
 * source in `line` and in errors. `keep` is the merge worktree's path, kept on a conflict
 * (red-lands-on-pilot L5); with `reuse` it already holds the merge (`land` checks it), which
 * is tested and pushed instead, and kept when that fails. `push` false (with `keep`) prepares
 * the merge for the press: it is committed and kept in `keep`, with no test, no push and no ADR allocated. Answers `{ sha, merged, line, counts, adr }`, `counts` the run's or null,
 * `adr` what `allocateAdr` answered on a pushed merge (the placeholder renamed, the merge amended) or null:
 * `merged` false, and nothing pushed, when `source` is already an ancestor of
 * `origin/pilot`. Throws `exitCode` 3 with `paths` (and `dir`, the kept worktree) on a
 * conflict, with `why` when the resolver could not finish, 1 otherwise, with `pushRejected` when
 * the push itself failed, and `reason` unprefixed; either way nothing is pushed. A stop on generated files only (`mergeResolved`,
 * `side` the writer side, 'theirs' the source) is resolved and goes on; the merged ADR index
 * is regenerated when it differs (clean-landing L1-L3), so `paths` names source files alone.
 */
export function mergeIntoPilot({ cwd = process.cwd(), git = (args) => gitAt(cwd, ...args), source, message, test, label: taken, keep, reuse = false, side = 'theirs', push = true, since }) {
  if (!/^[0-9a-f]{40}(?:[0-9a-f]{24})?$/.test(String(source))) throw fail(`${JSON.stringify(source)} is not a full commit SHA`);
  let runs;
  let pilotTip;
  try {
    assertPushable(TARGET, { git });
    runs = runRemote(git);
    pilotTip = pilotTipOf(git, runs);
  } catch (err) {
    throw fail(firstLine(err));
  }
  if (holds(cwd, ['merge-base', '--is-ancestor', source, pilotTip])) {
    return { sha: pilotTip, merged: false, line: `${PILOT_BRANCH} already has ${taken}`, counts: null, adr: null };
  }

  const dir = keep ?? fs.mkdtempSync(path.join(os.tmpdir(), 'pilot-sync-'));
  let kept = false;
  try {
    if (!reuse) {
      git(['worktree', 'add', '-q', '--detach', dir, pilotTip]);
      let merge;
      try {
        merge = mergeResolved(dir, source, message, { side });
      } catch (err) {
        throw fail(`the merge of ${taken} ${err.stage === 'merge' ? 'stopped' : 'could not be committed'} (${err.message})`);
      }
      const { left, why } = merge;
      if (left.length) {
        kept = keep !== undefined;
        const paths = conflictPaths(left, why);
        const stop = fail(`${taken} conflicts with ${PILOT_BRANCH} in ${paths}`, 3);
        // A kept worktree ends the line on the lander that resolves it, as the deck parses it.
        if (kept) stop.message = `NOT synced: ${conflictLine({ head: taken, onto: PILOT_BRANCH, paths: [paths], dir })}`;
        throw Object.assign(stop, { paths: left, why }, kept && { dir });
      }
    }
    // A resolution that fails from here on stays where it was made.
    kept = reuse;
    // The feature's placeholder ADR is numbered in the merge that will be tested and pushed,
    // the lander's reused one included; the prepared trial and sync's main merge allocate nothing (one-integration-line L4).
    let adr = null;
    try {
      if (push && side === 'theirs') adr = allocateAdr(dir, { since: pilotTip });
    } catch (err) {
      throw fail(firstLine(err));
    }
    // Read before the install and the tests run code in `dir`: the push is the merge that was tested.
    const sha = gitAt(dir, 'rev-parse', 'HEAD');
    if (!push) {
      // Prepared for the press: the landing reuses it, and tests and pushes it then.
      kept = true;
      return { sha, merged: true, line: `prepared ${PILOT_BRANCH} ${short(sha)} (${taken}) in ${dir}`, counts: null, adr: null };
    }
    // Given `since`, the selection since it, in no slot (suite-at-landing L4, L9); absent, the full command.
    const chosen = test ? { command: test, selected: false } : testCommand(dir, { since });
    if (chosen === undefined) throw fail(NO_TEST);
    if (fs.existsSync(path.join(dir, 'package.json'))) {
      try {
        installWithNpm(dir);
      } catch (err) {
        throw fail(`npm ci failed (${firstLine(err)})`);
      }
    }
    let run;
    try {
      run = runTests(dir, chosen.command, { label: taken, slot: !chosen.selected });
    } catch (err) {
      throw fail(`the tests could not run (${firstLine(err)})`);
    }
    if (run.status !== 0) throw fail(redLine(taken, run));
    try {
      assertPushable(`${sha}:${TARGET}`, { git });
    } catch (err) {
      throw fail(firstLine(err));
    }
    // A local pilot checked out in a worktree is not moved under it (git would leave that worktree stale).
    const holder = runs === null && git(['worktree', 'list', '--porcelain']).split('\n\n').find((tree) => tree.split('\n').includes(`branch ${TARGET}`));
    if (holder) throw fail(`${PILOT_BRANCH} is checked out in ${holder.split('\n')[0].slice('worktree '.length)}`);
    try {
      if (runs === null) git(['update-ref', TARGET, sha, pilotTip]);
      else git(['push', '-q', runs, `${sha}:${TARGET}`]);
    } catch (err) {
      throw Object.assign(fail(`the push failed (${firstLine(err)})`), { pushRejected: true });
    }
    kept = false;
    // The counts, then `; <scope>` when the run printed one, as integrate's line has them (R10).
    const summary = [run.counts, run.scope].filter(Boolean).join('; ');
    const line = `synced ${PILOT_BRANCH} ${short(sha)} (${taken})${summary ? `: ${summary}` : ''}`;
    return { sha, merged: true, line, counts: run.counts, adr };
  } finally {
    if (!kept) removeWorktree(cwd, dir);
  }
}

/** The pilot branch's tip on the run remote as last fetched, or the local one under `none`. */
function pilotTipOf(git, runs) {
  const ref = runRef(runs, PILOT_BRANCH);
  try {
    return git(['rev-parse', '-q', '--verify', `${ref}^{commit}`]);
  } catch (err) {
    if (err.status === 1) throw new Error(`no ${shortRef(ref)} (run pilot base first)`);
    throw err;
  }
}

/** The tree git would make merging `theirs` into `ours`, or null on a conflict. */
function mergeTree(git, ours, theirs) {
  try {
    return git(['merge-tree', '--write-tree', ours, theirs]);
  } catch {
    return null;
  }
}

/** Removes the worktree at `dir`, best effort: a Windows handle still open there must not replace the outcome. Answers whether `dir` is gone. */
export function removeWorktree(cwd, dir) {
  spawnSync('git', ['worktree', 'remove', '--force', dir], { cwd, windowsHide: true });
  try {
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  } catch {}
  spawnSync('git', ['worktree', 'prune'], { cwd, windowsHide: true });
  return !fs.existsSync(dir);
}

const out = (at, ...args) => spawnSync('git', args, { cwd: at, encoding: 'utf8', windowsHide: true }).stdout?.trim() ?? '';

/** Whether `dir` is a worktree of the repository `cwd` is in: not a link, and its top, since a link or a subdirectory would hand the removal another tree. */
export function isWorktreeOf(cwd, dir) {
  const common = (at) => {
    const found = out(at, 'rev-parse', '--path-format=absolute', '--git-common-dir');
    return found && fs.realpathSync.native(found);
  };
  const ours = common(cwd);
  const top = !fs.lstatSync(dir).isSymbolicLink() && out(dir, 'rev-parse', '--show-toplevel');
  return Boolean(ours && top) && fs.realpathSync.native(top) === fs.realpathSync.native(dir) && common(dir) === ours;
}

/**
 * Readies the worktree `dir` an earlier conflict kept (red-lands-on-pilot L5). Answers
 * true when it holds a merge onto `pilotTip` to test and push: a committed merge whose first
 * parent is on pilot and whose second holds `source`, merged into `pilotTip` with `message`
 * first when pilot has moved, so pilot's first parents keep every landing; a stop on generated
 * files only there is resolved (`mergeResolved`, `side` the writer side) and goes on. Any other
 * worktree of this repository there is removed and false answered (a resolution of a source that has since moved on included). `refuse(message, exitCode)`
 * makes the error for a refusal: exit 3 for one mid-merge or with changes, exit 1 for anything
 * that is not a worktree of this repository; `conflict(paths, why)` the one for a stop on source files.
 */
export function resume({ cwd, dir, pilotTip, source, message, side, refuse, conflict }) {
  if (!isWorktreeOf(cwd, dir)) throw refuse(`${dir} exists and is not a worktree of this repository; remove it and try again`);
  if (holds(dir, ['rev-parse', '-q', '--verify', 'MERGE_HEAD']) || out(dir, 'status', '--porcelain', '--untracked-files=all')) throw refuse(`finish and commit the resolution in ${dir}`, 3);
  const below = (a, b) => holds(cwd, ['merge-base', '--is-ancestor', a, b]);
  // A merge onto pilot of `source`, or of such a merge (a resolution merged again after pilot moved).
  const ofSource = (commit) => {
    const [, p1, p2, more] = out(dir, 'rev-list', '--parents', '-n', '1', commit).split(' ');
    return Boolean(p2) && !more && below(p1, pilotTip) && (p2 === source || ofSource(p2));
  };
  const resolution = out(dir, 'rev-parse', 'HEAD');
  const first = out(dir, 'rev-parse', 'HEAD^1');
  if (!ofSource(resolution)) {
    removeWorktree(cwd, dir);
    return false;
  }
  if (first === pilotTip) return true;
  gitAt(dir, 'checkout', '-q', '--detach', pilotTip);
  let merge;
  try {
    merge = mergeResolved(dir, resolution, message, { side });
  } catch (err) {
    throw refuse(`the merge of the resolution ${resolution} in ${dir} ${err.stage === 'merge' ? 'stopped' : 'could not be committed'} (${err.message}); ${PILOT_BRANCH} not pushed`);
  }
  if (merge.left.length) throw conflict(merge.left, merge.why);
  return true;
}

/**
 * Merges origin's default branch into the run remote's pilot branch and pushes it (or moves
 * the local one), through `mergeIntoPilot`, its tests selected since pilot's tip. `git` is `(args) => string` run in `cwd`, throwing
 * with git's exit code as `status`. A conflict keeps `keep` (`<checkout>-sync` by default) for
 * the lander, and a later sync resumes the merge committed there. Answers `{ sha, merged, line }`:
 * `sha` is the pilot branch's tip afterwards, `merged` whether a merge was pushed.
 */
export function sync({ cwd = process.cwd(), git = (args) => gitAt(cwd, ...args), test, keep } = {}) {
  let fallback;
  let mainTip;
  let runs;
  let pilotTip;
  let checkout;
  try {
    // --prune: a pilot branch deleted on origin must not survive as a stale tracking ref.
    git(['fetch', '-q', '--prune', 'origin']);
    runs = runRemote(git);
    if (runs !== null && runs !== 'origin') git(['fetch', '-q', '--prune', runs]);
    fallback = remoteDefaultBranch(git);
    mainTip = git(['rev-parse', '--verify', `refs/remotes/origin/${fallback}^{commit}`]);
    pilotTip = pilotTipOf(git, runs);
    // The main checkout is the parent of the common git dir; `worktree list` is land's to count.
    checkout = path.dirname(git(['rev-parse', '--path-format=absolute', '--git-common-dir']));
  } catch (err) {
    throw fail(firstLine(err));
  }
  keep ??= `${checkout}-sync`;
  const message = `Merge ${fallback} into ${PILOT_BRANCH}`;
  const label = `${fallback}@${short(mainTip)}`;
  const stop = (reason, exitCode) => Object.assign(new Error(`NOT synced: ${reason}`), { exitCode });
  const conflict = (paths, why) => stop(conflictLine({ head: label, onto: PILOT_BRANCH, paths: [conflictPaths(paths, why)], dir: keep }), 3);
  // Main's merge changes no file (it holds only pilot's work, by merge or squash): nothing to push or test.
  if (!holds(cwd, ['merge-base', '--is-ancestor', mainTip, pilotTip]) && mergeTree(git, pilotTip, mainTip) === git(['rev-parse', `${pilotTip}^{tree}`])) {
    return { sha: pilotTip, merged: false, line: `${PILOT_BRANCH} already has ${label}` };
  }
  const reuse = fs.existsSync(keep) && !holds(cwd, ['merge-base', '--is-ancestor', mainTip, pilotTip]) && resume({ cwd, dir: keep, pilotTip, source: mainTip, message, side: 'ours', refuse: stop, conflict });
  // Pilot writes the run records it carries; the default branch holds older copies (clean-landing L3).
  return mergeIntoPilot({ cwd, git, source: mainTip, message, test, label, keep, reuse, side: 'ours', since: pilotTip });
}

/** `pilot sync`, no arguments: exit 0 synced or nothing new, 1 red or failed, 3 a conflict. */
export function main(argv) {
  if (argv.length) {
    process.stderr.write('usage: pilot sync\n');
    return 1;
  }
  try {
    process.stdout.write(`${sync().line}\n`);
    return 0;
  } catch (err) {
    process.stdout.write(`${err.message}\n`);
    return err.exitCode ?? 1;
  }
}
