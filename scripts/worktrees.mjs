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
 * `pilot worktrees prune` with neither `--run` nor `--base` is the sweep of landed runs' leftovers (S8,
 * spec 11): merged means in the run remote's pilot or in the default branch, and a pilot-landed branch goes with `-D`.
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
import { gitView, tipOf } from './git-view.mjs';
import { keptDir } from './merge-generated.mjs';
import { pilotBranch, remoteDefaultBranch } from './pilot-branch.mjs';
import { runRef, runRemote } from './remotes.mjs';
import { commitStep, isRecord, keptLine, norm, parseWorktrees, removeTree, status } from './worktree-remove.mjs';

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
  return parseWorktrees(out);
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

/** Linked tree `dir`'s admin id, from its `.git` file (`gitdir: <common>/worktrees/<id>`), or null. */
function adminId(dir) {
  let text;
  try {
    text = fs.readFileSync(path.join(dir, '.git'), 'utf8');
  } catch {
    return null;
  }
  const gitdir = /^gitdir: (.+)$/m.exec(text)?.[1].trim();
  if (!gitdir || path.basename(path.dirname(gitdir)) !== 'worktrees') return null;
  const id = path.basename(gitdir);
  return /^[\w.-]+$/.test(id) ? id : null;
}

/** The oldest entry of each of `refs`' reflogs, from one walk; a ref with none is absent. Null when git refuses or a line will not parse. */
function oldestEntries(repo, refs) {
  const log = git(repo, 'log', '-g', '--format=%gD %H', ...refs, '--');
  if (!log.ok) return null;
  const oldest = new Map();
  for (const line of log.out.split('\n').filter(Boolean)) {
    const entry = /^(.+)@\{(\d+)\} ([0-9a-f]+)$/.exec(line);
    if (!entry || !refs.includes(entry[1])) return null;
    const n = Number(entry[2]);
    if (!oldest.has(entry[1]) || oldest.get(entry[1]).n < n) oldest.set(entry[1], { n, sha: entry[3] });
  }
  return new Map([...oldest].map(([ref, { sha }]) => [ref, sha]));
}

/**
 * `moved` for each of `trees` from one reflog walk (S10): a tree's branch log and its own HEAD log,
 * the latter as `worktrees/<id>/HEAD`. A tree whose id cannot be read, or a walk that fails, is
 * asked by `moved`'s own two reads.
 */
function movedReader(repo, trees) {
  const asked = new Map();
  for (const tree of trees) {
    if (tree.locked || tree.prunable || !tree.head) continue;
    const id = adminId(tree.path);
    if (id !== null) asked.set(tree, { branch: tree.branch ? `refs/heads/${tree.branch}` : null, own: `worktrees/${id}/HEAD` });
  }
  const refs = [...asked.values()].flatMap(({ branch, own }) => (branch ? [branch, own] : [own]));
  // Walked on the first ask, so a classify that asks none (a landed run's) walks nothing.
  let oldest;
  const movedBy = (ref, head) => (oldest.get(ref) ?? head) !== head;
  return (tree) => {
    const pair = asked.get(tree);
    if (pair && oldest === undefined) oldest = oldestEntries(repo, refs);
    if (!oldest || !pair) return moved(repo, tree);
    if (pair.branch && !movedBy(pair.branch, tree.head)) return false;
    return movedBy(pair.own, tree.head);
  };
}

/** The run record the deck mirrors into run `slug`'s feature worktree: generated (clean-landing L3), never a change. */
export const runRecord = (slug) => `docs/design/${slug}/run.json`;

/**
 * `sha` less its trailing commits that change only run `slug`'s record (lander-tail A1): each
 * stripped commit has one parent and touches that one path. A merge or the root ends the walk.
 */
function withoutRunRecordTail(repo, sha, slug) {
  const record = runRecord(slug);
  for (let hops = 0; hops < 100; hops += 1) {
    const { parents, files } = commitStep(repo, sha);
    if (parents.length !== 1 || files.join('\0') !== record) return sha;
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
  const work = withoutRunRecordTail(repo, head.out, slug);
  return movedFrom(repo, ref, work) && git(repo, 'merge-base', '--is-ancestor', work, base).ok;
}

/** A run slug as `--run` takes it: a name, never a path. */
const SLUG = /^\w[\w.-]*$/;

/** The tag file in a tree's git admin dir (prune-worktrees A1): never in the work tree, so never tracked. */
const TAG = 'pilot-run';

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
 * The known runs of `repo` (prune-run-trees glossary): each slug with a `feat/<s>` or `design/<s>` ref,
 * local or on any remote, a `design/` one not ending `-recut` (a re-cut is its run's, never a run), and
 * each slug a tree is tagged to.
 */
function knownRuns(repo, tagged) {
  const refs = git(repo, 'for-each-ref', '--format=%(refname)', 'refs/heads/feat/', 'refs/heads/design/', 'refs/remotes/');
  if (!refs.ok) throw new Error(`git for-each-ref failed in ${repo}: ${refs.err}`);
  const known = new Set(tagged.values());
  for (const ref of refs.out.split('\n').filter(Boolean)) {
    const name = ref.startsWith('refs/remotes/') ? ref.split('/').slice(3).join('/') : ref.slice('refs/heads/'.length);
    const run = /^(feat|design)\/(.+)$/.exec(name);
    if (!run || !SLUG.test(run[2]) || (run[1] === 'design' && run[2].endsWith('-recut'))) continue;
    known.add(run[2]);
  }
  return known;
}

/**
 * Whether untagged `tree` is run `slug`'s by name alone (A1): on `fix/<slug>-<any>` but not a run
 * branch, on `design/<slug>-recut`, or detached at `<home>-fund-<slug>`.
 */
function namedFor(tree, slug, home) {
  const { branch } = tree;
  if (typeof branch === 'string') {
    return (branch.startsWith(`fix/${slug}-`) && branch.length > `fix/${slug}-`.length && !isRunBranch(branch, slug)) ||
      branch === `design/${slug}-recut`;
  }
  return norm(tree.path) === norm(`${home}-fund-${slug}`);
}

/**
 * Run `slug`'s worktrees, each with how it was reached (prune-run-trees L1, L3): the land dir beside
 * the main checkout (`land`), a tree tagged to it (`tag`), one on its run branches (`branch`), and an
 * untagged tree its name gives it (`name`) unless a longer known run's name or branch claims it too, so
 * the longest known slug wins. Never the main checkout. Listed through `view` when given (`worktrees`).
 */
export function runTrees(repo, slug, view) {
  const [home, ...rest] = worktrees(repo, view);
  const land = norm(keptDir(home.path, `feat/${slug}`));
  const tagged = tags(repo);
  let known;
  const found = [];
  for (const tree of rest) {
    const tag = tagged.get(norm(tree.path));
    let by = null;
    if (norm(tree.path) === land) by = 'land';
    else if (tag === slug) by = 'tag';
    else if (isRunBranch(tree.branch, slug)) by = 'branch';
    else if (tag === undefined && namedFor(tree, slug, home.path)) {
      known ??= knownRuns(repo, tagged);
      const longer = [...known].some((other) => other.length > slug.length &&
        (isRunBranch(tree.branch, other) || namedFor(tree, other, home.path)));
      if (!longer) by = 'name';
    }
    if (by) found.push({ path: tree.path, by });
  }
  return found;
}

/** Run `slug`'s worktrees: `runTrees`' paths. */
export function runWorktrees(repo, slug, view) {
  return runTrees(repo, slug, view).map((tree) => tree.path);
}

/**
 * The status entries of `dir` that are dirt, or null when status fails; untracked files count unless
 * `tracked` (a landed run's rule). A run record is judged by `removeTree`'s own rule (`isRecord`, L3).
 */
function dirtOf(dir, { tracked = false } = {}) {
  const entries = status(dir, `--untracked-files=${tracked ? 'no' : 'all'}`);
  return entries === null ? null : entries.filter((entry) => !isRecord(entry));
}

/** A tree's state; with `landedSlug`, the landed run's, unmoved is no longer open and a record-only tail is stripped. */
function stateOf(repo, base, tree, index, landedSlug, movedOf) {
  if (index === 0) return 'main';
  if (tree.locked) return 'locked';
  if (tree.prunable || !tree.head || (!landedSlug && !movedOf(tree))) return 'open';
  const inBase = (sha) => [base].flat().some((ref) => git(repo, 'merge-base', '--is-ancestor', sha, ref).ok);
  if (!inBase(tree.head)) {
    // A base that holds the head holds its record-free part too, so a landed run's tail is walked only when the head is not in (S10).
    const work = landedSlug ? withoutRunRecordTail(repo, tree.head, landedSlug) : tree.head;
    if (work === tree.head || !inBase(work)) return 'open';
  }
  const dirt = dirtOf(tree.path, { tracked: Boolean(landedSlug) });
  if (dirt === null) return 'open';
  return dirt.length ? 'merged-dirty' : 'merged-clean';
}

/**
 * Every worktree of `repo` with its state against `base`, which is not fetched here, a ref or a
 * list of refs a merged head need be in only one of (the sweep's pilot and default branch, S8); a run
 * record is never dirt (L3); with `run` and `landed`, the landed run's rule (ADR 0171). `view`, a
 * caller's `Git`, answers the worktree list, and a full branch ref `base` from its tip snapshot (`tipOf`).
 */
export function classify(repo, base, { run, landed = false, view } = {}) {
  for (const ref of [base].flat()) {
    const known = view && /^refs\/(?:heads|remotes)\//.test(ref)
      ? tipOf(view, ref) !== null
      : git(repo, 'rev-parse', '--verify', '--quiet', `${ref}^{commit}`).ok;
    if (!known) throw new Error(`base ${ref} is not a commit in ${repo}`);
  }
  const slug = landed ? run : undefined;
  const trees = worktrees(repo, view);
  const movedOf = movedReader(repo, trees.slice(1));
  return trees.map((tree, index) => ({
    path: tree.path,
    branch: tree.branch,
    state: stateOf(repo, base, tree, index, slug, movedOf),
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

/**
 * Fetches the remote each of `bases` tracks, each remote once and `git remote` asked once (S10), or
 * nothing for a local `refs/heads/` base; throws when a base is neither or a fetch fails.
 */
function fetchBases(repo, bases) {
  let remotes = null;
  const fetched = new Set();
  for (const base of bases) {
    if (base.startsWith('-')) throw new Error(`base ${base} is not a ref; nothing fetched`);
    if (base.startsWith('refs/heads/')) continue; // a local base (pilot.remote none) has nothing to fetch
    if (remotes === null) {
      const list = git(repo, 'remote');
      if (!list.ok) throw new Error(`git remote failed in ${repo}: ${list.err}`);
      remotes = list.out.split('\n').filter(Boolean);
    }
    const remote = remotes.find((name) => base.replace(/^refs\/remotes\//, '').startsWith(`${name}/`));
    if (!remote) throw new Error(`base ${base} is not a remote-tracking ref; nothing fetched`);
    if (fetched.has(remote)) continue;
    const fetch = git(repo, 'fetch', '-q', remote);
    if (!fetch.ok) throw new Error(`git fetch ${remote} failed: ${fetch.err}`);
    fetched.add(remote);
  }
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
 * With `run`, `runTrees` are looked at, less the land dir (prune-run-trees L2). With `run` and `landed`, the run
 * has landed (ADR 0171): the land dir is among them, and a merged tree goes unless a tracked change or a holder keeps it, with `--force`
 * once its tracked status reads clean again, and its branch with `-D`. Without `run`, `landed` is ignored.
 * Every removal goes through `removeTree` (prune-worktrees S2, L1): a tree it
 * keeps is `kept` with its state, `leftover` aside, which is `failed`.
 * `git`, a landing's view, answers the worktree list for selection (`classify`, `runWorktrees`) and the
 * base's tip; `removeTree` still lists afresh before each removal, since its guards must see the tree as
 * it is then, not as the landing first read it. `fetched`
 * says the caller's own fetch left `base` current (land-batching A3): no fetch then. Only a landing
 * passes it; `pilot worktrees prune` always fetches.
 */
export function prune(repo, base, { dryRun = false, run, merged = [], keep = [], holder = () => null, landed = false, git: view, fetched = false } = {}) {
  if (!fetched) fetchBases(repo, [base].flat());
  const removed = [];
  const kept = [];
  const failed = [];
  const relaxed = landed && run !== undefined;
  // A landed run's selection lists twice (classify, runWorktrees): a view of its own lists once (S10). Selection only: removeTree lists afresh.
  const reads = view ?? (run !== undefined ? gitView(repo) : undefined);
  const trees = classify(repo, base, { run, landed: relaxed, view: reads });
  // One selection on both paths (prune-run-trees L2): the land dir only once landed, since the landing removes it itself after (F4).
  const theirs = run === undefined ? null
    : new Set(runTrees(repo, run, reads).filter(({ by }) => relaxed || by !== 'land').map((tree) => tree.path));
  const ours = (tree, index) => run === undefined || (index > 0 && theirs.has(tree.path));
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
    const branchFlag = (relaxed && isRunBranch(tree.branch, run)) || merged.includes(tree.branch) ? '-D' : '-d';
    // removeTree re-reads every guard, puts the run record back and forces only for a landed run (L1, L6).
    const result = removeTree(repo, tree.path, { landed: relaxed, holder, branchFlag });
    if (result.kept === 'leftover') {
      // git's own refusal, when it refused, says more than the kept line.
      failed.push({ path: tree.path, reason: result.err || keptLine(tree.path, result.kept) });
      continue;
    }
    if (result.kept) {
      kept.push({ path: tree.path, state: result.kept });
      continue;
    }
    removed.push(tree.path);
    if (result.err !== undefined) failed.push({ path: `branch ${tree.branch}`, reason: result.err });
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
    // as origin says it. --base wins. The sweep, a prune with neither, takes a tree in either (S8).
    const onPilot = isPrune && base === null;
    const probeGit = (gitArgs) => {
      const probe = git(repo, ...gitArgs);
      if (!probe.ok) throw Object.assign(new Error(probe.err), { status: probe.status });
      return probe.out;
    };
    const pilotRef = onPilot ? runRef(runRemote(probeGit), pilotBranch(probeGit)) : null;
    if (onPilot && run !== undefined) base = pilotRef;
    base ??= `origin/${remoteDefaultBranch((gitArgs) => {
      const run = git(repo, ...gitArgs);
      if (!run.ok) throw Object.assign(new Error(run.err), { stderr: run.err });
      return run.out;
    })}`;
    const sweep = onPilot && run === undefined;
    // The sweep's selection view, made after its fetch: its tip snapshot answers pilot here and in classify (S10).
    let view;
    if (sweep) {
      // Both bases fetched here, once a remote (S10), so the prune below fetches nothing.
      fetchBases(repo, [pilotRef, base]);
      view = gitView(repo);
      // A remote with no pilot branch leaves the sweep the default branch alone.
      if (tipOf(view, pilotRef) !== null) base = [pilotRef, base];
    }
    if (!isPrune) {
      fetchBases(repo, [base]);
      for (const row of classify(repo, base)) {
        out.write(`${row.state.padEnd(12)}  ${(row.branch ?? '(detached)').padEnd(24)}  ${row.path}\n`);
      }
      return 0;
    }
    // A branch in the landed pilot goes with -D, as the landing does: git's own -d judges against main.
    // Fetched first, so the list and landedRun read the base as origin has it.
    if (run !== undefined) fetchBases(repo, [base]);
    const landedOn = [base].flat().includes(pilotRef) ? pilotRef : null;
    const merged = landedOn
      ? git(repo, 'for-each-ref', '--merged', landedOn, '--format=%(refname:short)', 'refs/heads/').out.split(/\r?\n/).filter(Boolean)
      : [];
    const landed = run !== undefined && landedRun(repo, base, run);
    // Fetched above for a run and for the sweep; a plain --base prune fetches in prune.
    const fetched = sweep || run !== undefined;
    const { removed, kept, failed } = prune(repo, base, { dryRun, run, merged, landed, holder: holderFrom(read), fetched, git: view });
    for (const p of removed) out.write(`${dryRun ? 'would remove' : 'removed'}  ${p}\n`);
    for (const { path, state } of kept) out.write(`${keptLine(path, state)}\n`);
    for (const { path, reason } of failed) err.write(`NOT removed ${path}: ${reason}\n`);
    return failed.length ? 1 : 0;
  } catch (error) {
    err.write(`pilot worktrees: ${error.message}; nothing removed\n`);
    return 1;
  }
}
