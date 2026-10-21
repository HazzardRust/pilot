/**
 * `pilot worktrees [prune] [--repo <dir>] [--base <ref>] [--dry-run] [--run <slug>]` — lists
 * every worktree of a repository by state, and prunes the merged-clean ones, with `--run` only
 * run <slug>'s (audit-fixes spec 9, 10; ADR 0081; clean-landing L5).
 *
 * A worktree is merged-clean when it is not the main checkout, not locked, has moved since
 * it was created (its HEAD differs from the oldest entry of its branch's reflog, if on one,
 * and of its own HEAD reflog; L10), its HEAD is an ancestor of the fetched base, and
 * `git status` shows nothing, untracked files included. Anything that cannot be shown to be
 * all of these is kept: no reflog, a failed status or a missing directory reads as `open`.
 * A tree whose branch the caller passes in `keep` is never pruned, whatever its state: it reads
 * `concluding` (landing-keeps-worktrees S1).
 *
 * The prune removes with `git worktree remove` (never `--force`) and then `git branch -d`
 * (`-D` only for a branch the caller names as reachable from its landed pilot), so git itself refuses a dirty tree or an unmerged branch even if the test
 * above were wrong (L5). Remote branches are never touched (L6). The base is fetched first,
 * and a failed fetch stops the prune before anything is removed. A landed run's prune is
 * looser, and forced, as ADR 0171 says (`landedRun`, `prune`'s `landed`).
 */

import { spawnSync } from 'node:child_process';
import path from 'node:path';

import { holderOf, pilotProcesses, processTable } from '../deck/procs.mjs';
import { keptDir } from './merge-generated.mjs';
import { PILOT_BRANCH, remoteDefaultBranch } from './pilot-branch.mjs';
import { runRef, runRemote } from './remotes.mjs';

/** Runs git in `cwd`; answers `{ ok, out, err }`, never throws. */
function git(cwd, ...args) {
  const run = spawnSync('git', args, { cwd, encoding: 'utf8', windowsHide: true });
  const ok = run.status === 0 && !run.error;
  return { ok, status: run.status, out: (run.stdout ?? '').trim(), err: (run.stderr || run.error?.message || '').trim() };
}

/** `git worktree list --porcelain` as records; the first is the main checkout. */
function worktrees(repo) {
  // -z: a path git would quote, or one holding a newline, arrives as written.
  const list = git(repo, 'worktree', 'list', '--porcelain', '-z');
  if (!list.ok) throw new Error(`git worktree list failed in ${repo}: ${list.err}`);
  return list.out.split('\0\0').filter(Boolean).map((block) => {
    const record = { path: null, head: null, branch: null, locked: false, prunable: false };
    for (const line of block.split('\0')) {
      const [key, ...rest] = line.split(' ');
      const value = rest.join(' ');
      if (key === 'worktree') record.path = value;
      else if (key === 'HEAD') record.head = value;
      else if (key === 'branch') record.branch = value.replace(/^refs\/heads\//, '');
      else if (key === 'locked') record.locked = true;
      else if (key === 'prunable') record.prunable = true;
    }
    return record;
  });
}

/** Whether `ref`'s reflog has entries and HEAD differs from the oldest one's value. */
function movedFrom(cwd, ref, head) {
  const log = git(cwd, 'reflog', 'show', '--format=%H', ref, '--');
  if (!log.ok || !log.out) return false;
  const entries = log.out.split('\n');
  return entries[entries.length - 1] !== head;
}

/**
 * Moved since creation (L10): by the branch's reflog when on a branch, and always by the
 * worktree's own HEAD reflog, which starts when the worktree was added, so a worktree just
 * added on an existing merged branch stays open. No reflog answers false.
 */
function moved(repo, tree) {
  if (tree.branch && !movedFrom(repo, `refs/heads/${tree.branch}`, tree.head)) return false;
  return movedFrom(tree.path, 'HEAD', tree.head);
}

/** The run record the deck mirrors into run `slug`'s feature worktree: generated (clean-landing L3), never a change. */
export const runRecord = (slug) => `docs/design/${slug}/run.json`;

/**
 * `sha` less its trailing commits that change only run `slug`'s record (lander-tail A1): each
 * stripped commit has one parent and touches that one path. A merge or the root ends the walk.
 */
function withoutRecordTail(repo, sha, slug) {
  const record = runRecord(slug);
  for (let hops = 0; hops < 100; hops += 1) {
    const [, ...parents] = git(repo, 'rev-list', '--parents', '-n', '1', sha).out.split(' ');
    if (parents.length !== 1) return sha;
    const files = git(repo, 'diff-tree', '--no-commit-id', '--name-only', '-r', '-z', sha);
    if (!files.ok || files.out.split('\0').filter(Boolean).join('\0') !== record) return sha;
    sha = parents[0];
  }
  return sha;
}

/**
 * Whether `feat/<slug>`, less its record-only tail, has moved since it was cut and is in `base`: the
 * run has landed (lander-tail A1, A2). A feat branch just cut from the base, or one with no reflog, has not.
 */
export function landedRun(repo, base, slug) {
  const ref = `refs/heads/feat/${slug}`;
  const head = git(repo, 'rev-parse', '--verify', '--quiet', `${ref}^{commit}`);
  if (!head.ok) return false;
  const work = withoutRecordTail(repo, head.out, slug);
  return movedFrom(repo, ref, work) && git(repo, 'merge-base', '--is-ancestor', work, base).ok;
}

/** Run `slug`'s worktrees: its branches' and the land dir beside the main checkout, never the main checkout itself. */
export function runWorktrees(repo, slug) {
  const [home, ...rest] = worktrees(repo);
  const land = path.resolve(keptDir(home.path, `feat/${slug}`));
  return rest
    .filter((tree) => isRunBranch(tree.branch, slug) || path.resolve(tree.path) === land)
    .map((tree) => tree.path);
}

/**
 * The status lines of `dir` that are dirt, or null when status fails; untracked files count unless
 * `tracked` (a landed run's rule). A tracked mirror modified in place is not dirt; an untracked,
 * deleted or unmerged one is. The first line's leading space is trimmed with the output, so ` M`
 * reads there as `M `.
 */
function dirtOf(dir, mirror, { tracked = false } = {}) {
  const status = git(dir, 'status', '--porcelain', `--untracked-files=${tracked ? 'no' : 'all'}`);
  if (!status.ok) return null;
  const modified = new Set(mirror === undefined ? [] : [` M ${mirror}`, `M ${mirror}`, `M  ${mirror}`, `MM ${mirror}`]);
  return status.out.split('\n').filter((line) => line && !modified.has(line));
}

/** A tree's state; with `landedSlug`, the landed run's, unmoved is no longer open and a record-only tail is stripped. */
function stateOf(repo, base, tree, index, mirror, landedSlug) {
  if (index === 0) return 'main';
  if (tree.locked) return 'locked';
  if (tree.prunable || !tree.head || (!landedSlug && !moved(repo, tree))) return 'open';
  const head = landedSlug ? withoutRecordTail(repo, tree.head, landedSlug) : tree.head;
  if (!git(repo, 'merge-base', '--is-ancestor', head, base).ok) return 'open';
  const dirt = dirtOf(tree.path, mirror, { tracked: Boolean(landedSlug) });
  if (dirt === null) return 'open';
  return dirt.length ? 'merged-dirty' : 'merged-clean';
}

/**
 * Every worktree of `repo` with its state against `base`, which is not fetched here; with
 * `run`, that run's tracked run record changed in place does not make a worktree dirty; with
 * `run` and `landed`, the landed run's rule (ADR 0171).
 */
export function classify(repo, base, { run, landed = false } = {}) {
  const mirror = run === undefined ? undefined : runRecord(run);
  if (!git(repo, 'rev-parse', '--verify', '--quiet', `${base}^{commit}`).ok) {
    throw new Error(`base ${base} is not a commit in ${repo}`);
  }
  const slug = landed ? run : undefined;
  return worktrees(repo).map((tree, index) => ({
    path: tree.path,
    branch: tree.branch,
    state: stateOf(repo, base, tree, index, mirror, slug),
  }));
}

/**
 * Whether `branch` is one of run `slug`'s: `feat|design|fix|qa/<slug>` and
 * `slice|fix/<slug>-s<n>` (clean-landing glossary, QA's worktree, and slices as they are
 * named), so `slice/clean-landing-s1` is never `clean`'s.
 */
export function isRunBranch(branch, slug) {
  if (typeof branch !== 'string') return false;
  return ['feat', 'design', 'fix', 'qa'].some((kind) => branch === `${kind}/${slug}`) ||
    ['slice', 'fix'].some((kind) => branch.startsWith(`${kind}/${slug}-`) && /^s\d+$/.test(branch.slice(`${kind}/${slug}-`.length)));
}

/** Fetches the remote `base` tracks, or nothing for a local `refs/heads/` base; throws when it is neither or the fetch fails. */
function fetchBase(repo, base) {
  if (base.startsWith('-')) throw new Error(`base ${base} is not a ref; nothing fetched`);
  if (base.startsWith('refs/heads/')) return; // a local base (pilot.remote none) has nothing to fetch
  const remotes = git(repo, 'remote');
  if (!remotes.ok) throw new Error(`git remote failed in ${repo}: ${remotes.err}`);
  const remote = remotes.out.split('\n').find((name) => name && base.replace(/^refs\/remotes\//, '').startsWith(`${name}/`));
  if (!remote) throw new Error(`base ${base} is not a remote-tracking ref; nothing fetched`);
  const fetch = git(repo, 'fetch', '-q', remote);
  if (!fetch.ok) throw new Error(`git fetch ${remote} failed: ${fetch.err}`);
}

/**
 * Fetches, then removes each merged-clean worktree and its local branch. Answers
 * `{ removed, kept, failed }`: `removed` the paths taken (or that would be, on a dry run),
 * `kept` every other worktree with its state, `failed` each removal git refused, with why.
 * With `run`, only that run's worktrees are looked at or reported, never the main checkout
 * (clean-landing L5). A branch in `merged`, reachable from the landed pilot, goes with `-D`. A tree
 * whose branch is in `keep` is a concluding run's: kept with state `concluding`, merged-clean or not.
 * A merged-clean tree `holder` answers a pid or `'unsure'` for is kept as `live <pid>` or
 * `live unsure` (landing-keeps-worktrees L2, L3); no holder, nothing is held.
 * With `run` and `landed`, the run has landed (ADR 0171): `runWorktrees` are looked at, the land dir
 * among them, and a merged tree goes unless a tracked change or a holder keeps it, with `--force`
 * once its tracked status reads clean again, and its branch with `-D`. Without `run`, `landed` is ignored.
 */
export function prune(repo, base, { dryRun = false, run, merged = [], keep = [], holder = () => null, landed = false } = {}) {
  fetchBase(repo, base);
  const removed = [];
  const kept = [];
  const failed = [];
  const relaxed = landed && run !== undefined;
  const trees = classify(repo, base, { run, landed: relaxed });
  // Removals run from the main checkout, never from inside a worktree being removed.
  const home = trees[0].path;
  const theirs = relaxed ? new Set(runWorktrees(repo, run)) : null;
  const ours = (tree, index) => run === undefined ||
    (index > 0 && (relaxed ? theirs.has(tree.path) : isRunBranch(tree.branch, run)));
  for (const tree of trees.filter(ours)) {
    if (tree.branch && keep.includes(tree.branch) && tree.state !== 'main') {
      kept.push({ path: tree.path, state: 'concluding' });
      continue;
    }
    if (tree.state !== 'merged-clean') {
      kept.push({ path: tree.path, state: tree.state });
      continue;
    }
    const held = holder(tree.path);
    if (held !== null) {
      kept.push({ path: tree.path, state: `live ${held}` });
      continue;
    }
    if (dryRun) {
      removed.push(tree.path);
      continue;
    }
    // The mirror's copy goes first, so the removal, forced only for a landed run, finds a clean tree.
    if (run !== undefined) git(tree.path, 'checkout', '-q', 'HEAD', '--', `:(literal)${runRecord(run)}`);
    if (relaxed) {
      // --force takes tracked changes too, so the tracked status is read again right before it.
      const dirt = dirtOf(tree.path, undefined, { tracked: true });
      if (dirt === null || dirt.length) {
        kept.push({ path: tree.path, state: dirt === null ? 'open' : 'merged-dirty' });
        continue;
      }
    }
    const remove = git(home, 'worktree', 'remove', ...(relaxed ? ['--force'] : []), tree.path);
    if (!remove.ok) {
      failed.push({ path: tree.path, reason: remove.err });
      continue;
    }
    removed.push(tree.path);
    if (!tree.branch) continue;
    // A landed run's removed tree was merged once its record-only tail was stripped, which git's -d cannot see.
    const branch = git(home, 'branch', (relaxed && isRunBranch(tree.branch, run)) || merged.includes(tree.branch) ? '-D' : '-d', tree.branch);
    if (!branch.ok) failed.push({ path: `branch ${tree.branch}`, reason: branch.err });
  }
  return { removed, kept, failed };
}

/**
 * A `prune` holder over the process table `read` answers, read once, on the first tree asked
 * about. A read that fails, or rows that cannot be mapped, hold every tree as `'unsure'` (L3).
 */
export function holderFrom(read) {
  let holds;
  return (dir) => {
    if (!holds) {
      try {
        // No deck pid: a leashless daemon then reads as live, never as an orphan, which keeps its tree.
        holds = holderOf(pilotProcesses(read(), {}));
      } catch {
        holds = () => 'unsure';
      }
    }
    return holds(dir);
  };
}

const USAGE = 'usage: pilot worktrees [prune] [--repo <dir>] [--base <ref>] [--dry-run] [--run <slug>]\n';

/** The CLI: exit 0 done, 1 a failed fetch or a refused removal, 2 a usage error. */
export function main(argv, { out = process.stdout, err = process.stderr, read = processTable } = {}) {
  const args = [...argv];
  const isPrune = args[0] === 'prune';
  if (isPrune) args.shift();
  let repo = process.cwd();
  let base = null;
  let dryRun = false;
  let run;
  while (args.length) {
    const flag = args.shift();
    if ((flag === '--repo' || flag === '--base') && args.length && !args[0].startsWith('--')) {
      if (flag === '--repo') repo = args.shift();
      else base = args.shift();
    } else if (flag === '--run' && isPrune && /^\w[\w.-]*$/.test(args[0] ?? '')) {
      run = args.shift();
    } else if (flag === '--dry-run' && isPrune) {
      dryRun = true;
    } else {
      err.write(USAGE);
      return 2;
    }
  }
  try {
    // A run's trees are judged against the run remote's pilot, as the landing does; else the default branch
    // as origin says it. --base wins.
    const onPilot = run !== undefined && base === null;
    if (onPilot) {
      base = runRef(runRemote((gitArgs) => {
        const probe = git(repo, ...gitArgs);
        if (!probe.ok) throw Object.assign(new Error(probe.err), { status: probe.status });
        return probe.out;
      }), PILOT_BRANCH);
    }
    base ??= `origin/${remoteDefaultBranch((gitArgs) => {
      const run = git(repo, ...gitArgs);
      if (!run.ok) throw Object.assign(new Error(run.err), { stderr: run.err });
      return run.out;
    })}`;
    if (!isPrune) {
      fetchBase(repo, base);
      for (const row of classify(repo, base)) {
        out.write(`${row.state.padEnd(12)}  ${(row.branch ?? '(detached)').padEnd(24)}  ${row.path}\n`);
      }
      return 0;
    }
    // A branch in the landed pilot goes with -D, as the landing does: git's own -d judges against main.
    // Fetched first, so the list and landedRun read the base as origin has it.
    if (run !== undefined) fetchBase(repo, base);
    const merged = onPilot
      ? git(repo, 'for-each-ref', '--merged', base, '--format=%(refname:short)', 'refs/heads/').out.split(/\r?\n/).filter(Boolean)
      : [];
    const landed = run !== undefined && landedRun(repo, base, run);
    const { removed, kept, failed } = prune(repo, base, { dryRun, run, merged, landed, holder: holderFrom(read) });
    for (const p of removed) out.write(`${dryRun ? 'would remove' : 'removed'}  ${p}\n`);
    for (const { path, state } of kept) out.write(`kept ${state.padEnd(12)}  ${path}\n`);
    for (const { path, reason } of failed) err.write(`NOT removed ${path}: ${reason}\n`);
    return failed.length ? 1 : 0;
  } catch (error) {
    err.write(`pilot worktrees: ${error.message}; nothing removed\n`);
    return 1;
  }
}
