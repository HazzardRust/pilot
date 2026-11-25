/**
 * `pilot worktrees [prune] [--repo <dir>] [--base <ref>] [--dry-run] [--run <slug>]` — lists
 * every worktree of a repository by state, and prunes the merged-clean ones, with `--run` only
 * run <slug>'s (audit-fixes spec 9, 10; ADR 0081; clean-landing L5). `pilot worktrees remove <path>`
 * removes one tree through `removeTree`, or prints the one `kept <state> <dir>` line (prune-worktrees S1).
 *
 * A worktree is merged-clean when it is not the main checkout, not locked, has moved since
 * it was created (its HEAD differs from the oldest entry of its branch's reflog, if on one,
 * and of its own HEAD reflog; L10), its HEAD is an ancestor of the fetched base, and
 * `git status` shows nothing, untracked files included. Anything that cannot be shown to be
 * all of these is kept: no reflog, a failed status or a missing directory reads as `open`.
 * A tree whose branch the caller passes in `keep` is never pruned, whatever its state: it reads
 * `concluding` (landing-keeps-worktrees S1).
 *
 * `pilot worktrees add --run <slug> …` tags the tree it adds to the run (S2, A1).
 * `pilot worktrees prune --run <slug> --stage planned|abandoned` is a mid-run job end's prune (`stagePrune`, S5).
 *
 * The prune removes through `removeTree`: `git worktree remove` (never `--force`) and then `git branch -d`
 * (`-D` only for a branch the caller names as reachable from its landed pilot), so git itself refuses a dirty tree or an unmerged branch even if the test
 * above were wrong (L5). Remote branches are never touched (L6). The base is fetched first,
 * and a failed fetch stops the prune before anything is removed. A landed run's prune is
 * looser, and forced, as ADR 0171 says (`landedRun`, `prune`'s `landed`).
 */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import { holderOf, pilotProcesses, processTable } from '../deck/procs.mjs';
import { isWindows } from '../hooks/lib/platform.js';
import { tipOf } from './git-view.mjs';
import { keptDir } from './merge-generated.mjs';
import { pilotBranch, remoteDefaultBranch } from './pilot-branch.mjs';
import { runRef, runRemote } from './remotes.mjs';
import { keptLine, removeTree } from './worktree-remove.mjs';

/** Runs git in `cwd`; answers `{ ok, out, err }`, never throws. */
function git(cwd, ...args) {
  const run = spawnSync('git', args, { cwd, encoding: 'utf8', windowsHide: true });
  const ok = run.status === 0 && !run.error;
  return { ok, status: run.status, out: (run.stdout ?? '').trim(), err: (run.stderr || run.error?.message || '').trim() };
}

/** The argv of the one worktree list; a caller's view that asked it already answers it again for nothing (land-batching S5). */
export const WORKTREE_LIST = ['worktree', 'list', '--porcelain', '-z'];

/** `git worktree list --porcelain` as records, through `view` when given (any worktree of `repo` lists the same); the first is the main checkout. */
function worktrees(repo, view) {
  // -z: a path git would quote, or one holding a newline, arrives as written.
  let out;
  if (view) {
    out = view(WORKTREE_LIST);
  } else {
    const list = git(repo, ...WORKTREE_LIST);
    if (!list.ok) throw new Error(`git worktree list failed in ${repo}: ${list.err}`);
    out = list.out;
  }
  return out.split('\0\0').filter(Boolean).map((block) => {
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

/** A run slug as `--run` takes it: a name, never a path. */
const SLUG = /^\w[\w.-]*$/;

/** The tag file in a tree's git admin dir (prune-worktrees A1): never in the work tree, so never tracked. */
const TAG = 'pilot-run';

/** A path as git and the file system may both spell it, case-blind on Windows. */
const norm = (p) => {
  const slashed = path.resolve(p).replaceAll('\\', '/');
  return isWindows() ? slashed.toLowerCase() : slashed;
};

/**
 * Each linked tree's tag by its normalized path, read from `<common>/worktrees/*`: a tree's
 * `gitdir` file names its `.git`, so a tree whose dir moved under `git worktree move` is still found.
 */
function tags(repo) {
  const common = git(repo, 'rev-parse', '--path-format=absolute', '--git-common-dir');
  if (!common.ok) throw new Error(`git rev-parse failed in ${repo}: ${common.err}`);
  const admin = path.join(common.out, 'worktrees');
  const found = new Map();
  let names;
  try {
    names = fs.readdirSync(admin);
  } catch (error) {
    if (error.code === 'ENOENT') return found;
    throw error;
  }
  for (const name of names) {
    const read = (file) => {
      try {
        return fs.readFileSync(path.join(admin, name, file), 'utf8').trim();
      } catch (error) {
        if (error.code === 'ENOENT' || error.code === 'ENOTDIR') return null;
        throw error;
      }
    };
    const slug = read(TAG);
    const gitdir = read('gitdir');
    if (slug === null || gitdir === null || !SLUG.test(slug)) continue;
    found.set(norm(path.dirname(path.resolve(admin, name, gitdir))), slug);
  }
  return found;
}

/** The run slug tree `dir` of `repo` was tagged to at creation, or null. */
export function tagOf(repo, dir) {
  return tags(repo).get(norm(dir)) ?? null;
}

/**
 * Run `slug`'s worktrees: those tagged to it, on its branches, and the land dir beside the main
 * checkout; never the main checkout itself. Listed through `view` when given (`worktrees`).
 */
export function runWorktrees(repo, slug, view) {
  const [home, ...rest] = worktrees(repo, view);
  const land = path.resolve(keptDir(home.path, `feat/${slug}`));
  const tagged = tags(repo);
  return rest
    .filter((tree) => tagged.get(norm(tree.path)) === slug || isRunBranch(tree.branch, slug) || path.resolve(tree.path) === land)
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
 * `run` and `landed`, the landed run's rule (ADR 0171). `view`, a caller's `Git`, answers the worktree
 * list, and a full branch ref `base` from its tip snapshot (`tipOf`).
 */
export function classify(repo, base, { run, landed = false, view } = {}) {
  const mirror = run === undefined ? undefined : runRecord(run);
  const known = view && /^refs\/(?:heads|remotes)\//.test(base)
    ? tipOf(view, base) !== null
    : git(repo, 'rev-parse', '--verify', '--quiet', `${base}^{commit}`).ok;
  if (!known) throw new Error(`base ${base} is not a commit in ${repo}`);
  const slug = landed ? run : undefined;
  return worktrees(repo, view).map((tree, index) => ({
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
 * Every removal goes through `removeTree` (prune-worktrees S2, L1), `remove` its remove step: a tree it
 * keeps is `kept` with its state, `leftover` aside, which is `failed`.
 * `git`, a landing's view, answers the worktree list for selection (`classify`, `runWorktrees`) and the
 * base's tip; `removeTree` still lists afresh before each removal, since its guards must see the tree as
 * it is then, not as the landing first read it. `fetched`
 * says the caller's own fetch left `base` current (land-batching A3): no fetch then. Only a landing
 * passes it; `pilot worktrees prune` always fetches.
 */
export function prune(repo, base, { dryRun = false, run, merged = [], keep = [], holder = () => null, landed = false, remove, git: view, fetched = false } = {}) {
  if (!fetched) fetchBase(repo, base);
  const removed = [];
  const kept = [];
  const failed = [];
  const relaxed = landed && run !== undefined;
  const trees = classify(repo, base, { run, landed: relaxed, view });
  const theirs = relaxed ? new Set(runWorktrees(repo, run, view)) : null;
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
    // A landed run's removed tree was merged once its record-only tail was stripped, which git's -d cannot see.
    const flag = (relaxed && isRunBranch(tree.branch, run)) || merged.includes(tree.branch) ? '-D' : '-d';
    let refused = null;
    const dropBranch = (at, name) => {
      const branch = git(at, 'branch', flag, name);
      if (!branch.ok) refused = branch.err;
      return branch;
    };
    // removeTree re-reads every guard, puts the run record back and forces only for a landed run (L1, L6).
    let why = null;
    const removing = (at, dir, force) => {
      const step = remove ? remove(at, dir, force) : git(at, 'worktree', 'remove', ...(force ? ['--force'] : []), dir);
      if (!step.ok) why = step.err;
      return step;
    };
    const result = removeTree(repo, tree.path, { landed: relaxed, remove: removing, branch: dropBranch });
    if (result.kept === 'leftover') {
      // git's own refusal, when it refused, says more than the kept line.
      failed.push({ path: tree.path, reason: why || keptLine(tree.path, result.kept) });
      continue;
    }
    if (result.kept) {
      kept.push({ path: tree.path, state: result.kept });
      continue;
    }
    removed.push(tree.path);
    if (refused !== null) failed.push({ path: `branch ${tree.branch}`, reason: refused });
  }
  return { removed, kept, failed };
}

/** The stages a mid-run prune takes (prune-worktrees A4): Gate 1 signed, and the run abandoned. */
const STAGES = ['planned', 'abandoned'];

/** Whether `head` is in run `slug`'s feat branch, local or on a remote. */
function inFeat(repo, head, slug) {
  const refs = git(repo, 'for-each-ref', '--contains', head, '--format=%(refname)', 'refs/heads/feat', 'refs/remotes');
  if (!refs.ok) return false;
  return refs.out.split('\n').some((ref) => ref === `refs/heads/feat/${slug}` ||
    (ref.startsWith('refs/remotes/') && ref.split('/').slice(3).join('/') === `feat/${slug}`));
}

/**
 * A mid-run job end's prune of run `slug` (prune-worktrees spec 2, 4; A3, A4), every removal through
 * `removeTree`'s mid-run rule. `planned`: only the `design/<slug>` tree, and only once `feat/<slug>` holds
 * its head, else `kept unpushed`. `abandoned`: every `runWorktrees` tree. Answers one line per tree.
 */
export function stagePrune(repo, slug, stage, { holder = () => null } = {}) {
  const trees = stage === 'planned'
    ? worktrees(repo).slice(1).filter((tree) => tree.branch === `design/${slug}`)
    : runWorktrees(repo, slug).map((dir) => ({ path: dir }));
  return trees.map((tree) => {
    if (stage === 'planned' && !(tree.head && inFeat(repo, tree.head, slug))) return keptLine(tree.path, 'unpushed');
    const result = removeTree(repo, tree.path, { holder });
    if (result.kept) return keptLine(tree.path, result.kept);
    return `removed ${tree.path}${result.branch ? ` and branch ${result.branch}` : ''}`;
  });
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

const USAGE = 'usage: pilot worktrees [prune] [--repo <dir>] [--base <ref>] [--dry-run] [--run <slug>]\n' +
  '       pilot worktrees prune --run <slug> --stage planned|abandoned [--repo <dir>]\n' +
  '       pilot worktrees remove <path> [--repo <dir>]\n' +
  '       pilot worktrees add --run <slug> [--repo <dir>] <git worktree add args...>\n';

/**
 * `add --run <slug> <git worktree add args…>`: git's own add, then the slug written to the new
 * tree's `<gitdir>/pilot-run` (A1). Answers git's exit; 2 a usage error, nothing added; 1 when git
 * added a tree this could not tag, said on stderr.
 */
function addMain(args, { out, err }) {
  let repo = process.cwd();
  let run;
  while (args[0] === '--repo' || args[0] === '--run') {
    const [flag, value] = args.splice(0, 2);
    if (flag === '--repo' && value) repo = value;
    else if (flag === '--run' && SLUG.test(value ?? '')) run = value;
    else run = null;
  }
  if (!run || !args.length) {
    err.write(USAGE);
    return 2;
  }
  try {
    const before = new Set(worktrees(repo).map((tree) => norm(tree.path)));
    const added = git(repo, 'worktree', 'add', ...args);
    if (added.out) out.write(`${added.out}\n`);
    if (added.err) err.write(`${added.err}\n`);
    if (!added.ok) return added.status || 1;
    const fresh = worktrees(repo).filter((tree) => !before.has(norm(tree.path)));
    if (fresh.length !== 1) throw new Error(`found ${fresh.length} new trees, not one`);
    const admin = git(fresh[0].path, 'rev-parse', '--absolute-git-dir');
    if (!admin.ok) throw new Error(admin.err);
    fs.writeFileSync(path.join(admin.out, TAG), `${run}\n`);
    out.write(`tagged ${fresh[0].path} to run ${run}\n`);
    return 0;
  } catch (error) {
    err.write(`pilot worktrees add: ${error.message}; the tree, if added, is untagged\n`);
    return 1;
  }
}

/** `remove <path>`: exit 0 removed, 1 kept (its one line), 2 a usage error. */
function removeMain(args, { out, err, read }) {
  let repo = null;
  let dir = null;
  while (args.length) {
    const arg = args.shift();
    if (arg === '--repo' && args.length && !args[0].startsWith('--')) repo = args.shift();
    else if (dir === null && arg && !arg.startsWith('-')) dir = arg;
    else dir = undefined;
  }
  if (!dir) {
    err.write(USAGE);
    return 2;
  }
  dir = path.resolve(dir);
  const result = removeTree(repo ?? dir, dir, { holder: holderFrom(read) });
  if (result.kept) {
    out.write(`${keptLine(dir, result.kept)}\n`);
    return 1;
  }
  out.write(`removed ${dir}${result.branch ? ` and branch ${result.branch}` : ''}\n`);
  return 0;
}

/** The CLI: exit 0 done, 1 a failed fetch, a refused removal or a kept tree, 2 a usage error. */
export function main(argv, { out = process.stdout, err = process.stderr, read = processTable } = {}) {
  const args = [...argv];
  if (args[0] === 'remove') return removeMain(args.slice(1), { out, err, read });
  if (args[0] === 'add') return addMain(args.slice(1), { out, err });
  const isPrune = args[0] === 'prune';
  if (isPrune) args.shift();
  let repo = process.cwd();
  let base = null;
  let dryRun = false;
  let run;
  let stage;
  while (args.length) {
    const flag = args.shift();
    if ((flag === '--repo' || flag === '--base') && args.length && !args[0].startsWith('--')) {
      if (flag === '--repo') repo = args.shift();
      else base = args.shift();
    } else if (flag === '--run' && isPrune && SLUG.test(args[0] ?? '')) {
      run = args.shift();
    } else if (flag === '--stage' && isPrune && STAGES.includes(args[0])) {
      stage = args.shift();
    } else if (flag === '--dry-run' && isPrune) {
      dryRun = true;
    } else {
      err.write(USAGE);
      return 2;
    }
  }
  if (stage !== undefined) {
    // A stage prune judges each tree by removeTree alone: no base, nothing fetched, no --base or --dry-run.
    if (run === undefined || base !== null || dryRun) {
      err.write(USAGE);
      return 2;
    }
    try {
      const lines = stagePrune(repo, run, stage, { holder: holderFrom(read) });
      for (const line of lines) out.write(`${line}\n`);
      if (!lines.length) out.write(`no ${stage === 'planned' ? 'design ' : ''}tree of run ${run}\n`);
      return lines.some((line) => line.startsWith('kept leftover ')) ? 1 : 0;
    } catch (error) {
      err.write(`pilot worktrees: ${error.message}; nothing removed\n`);
      return 1;
    }
  }
  try {
    // A run's trees are judged against the run remote's pilot, as the landing does; else the default branch
    // as origin says it. --base wins.
    const onPilot = run !== undefined && base === null;
    if (onPilot) {
      const probeGit = (gitArgs) => {
        const probe = git(repo, ...gitArgs);
        if (!probe.ok) throw Object.assign(new Error(probe.err), { status: probe.status });
        return probe.out;
      };
      base = runRef(runRemote(probeGit), pilotBranch(probeGit));
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
