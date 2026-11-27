/**
 * `removeTree` — the one guarded removal of a worktree (prune-worktrees L1-L6; ADR 0081, 0171).
 *
 * A tree is kept, and named in one line `kept <state> <dir>` (`keptLine`), when its loss could lose
 * work or break a live session: `not a worktree` (git does not list the dir), `main` (the main
 * checkout), `locked`, `nested` (another worktree lies inside it), `live <pid>` (a holder answers it, never killed, ADR 0163), `dirty` (a tracked
 * change, or mid-run an untracked non-ignored file; once `landed` only tracked dirt, A3), `unpushed`
 * (its HEAD, less a run.json-only tail, is not reachable from a remote-tracking ref, the local pilot
 * branch or another local `feat/*`), and `leftover` (the dir is missing before, or still on disk after,
 * the remove step, or git refused it, or a link would not unlink). Nothing in the tree is changed
 * before every other check has passed. The deck's `docs/design/<slug>/run.json` is never dirt (L3): it is put back
 * before the removal. Links and junctions among the tree's untracked and ignored entries are unlinked
 * first and never followed (L2, F5). `--force` is passed only when `landed`, after the tracked status,
 * read once the safe-head walk is done, is clean (L6). A local branch goes with the tree, its tip being a safe head (L5); remote
 * branches are never touched.
 */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import { isWindows } from '../hooks/lib/platform.js';
import { git as gitText, isPilotName, LEGACY_PILOT, pilotBranch } from './pilot-branch.mjs';

/** Runs git in `cwd`; answers `{ ok, out, raw, err }`, `raw` untrimmed, never throws. */
function git(cwd, ...args) {
  const run = spawnSync('git', args, { cwd, encoding: 'utf8', windowsHide: true });
  const raw = run.stdout ?? '';
  return { ok: run.status === 0 && !run.error, out: raw.trim(), raw, err: (run.stderr || run.error?.message || '').trim() };
}

/** The deck's run record, under any slug. */
const RECORD = /^docs\/design\/[^/]+\/run\.json$/;

/** `kept <state> <dir>`: why a tree was not removed, in one line. */
export const keptLine = (dir, state) => `kept ${state} ${dir}`;

/** A path as git and the file system may both spell it, case-blind on Windows. */
const norm = (p) => {
  const slashed = path.resolve(p).replaceAll('\\', '/');
  return isWindows() ? slashed.toLowerCase() : slashed;
};
const same = (a, b) => norm(a) === norm(b);
/** Whether `p` lies strictly under `dir`. */
const inside = (p, dir) => norm(p).startsWith(`${norm(dir).replace(/\/$/, '')}/`);

/** `git worktree list` records; the first is the main checkout. Null when git fails. */
export function worktrees(repo) {
  const list = git(repo, 'worktree', 'list', '--porcelain', '-z');
  if (!list.ok) return null;
  return list.out.split('\0\0').filter(Boolean).map((block) => {
    const tree = { path: null, head: null, branch: null, locked: false };
    for (const line of block.split('\0')) {
      const [key, ...rest] = line.split(' ');
      if (key === 'worktree') tree.path = rest.join(' ');
      else if (key === 'HEAD') tree.head = rest.join(' ');
      else if (key === 'branch') tree.branch = rest.join(' ').replace(/^refs\/heads\//, '');
      else if (key === 'locked') tree.locked = true;
    }
    return tree;
  });
}

/** `git status -z` entries of `dir` as `{ code, file }`, or null when status fails. */
export function status(dir, ...flags) {
  const run = git(dir, 'status', '--porcelain=v1', '-z', ...flags);
  if (!run.ok) return null;
  const entries = [];
  // Untrimmed: the first entry's leading space is half of its code.
  const parts = run.raw.split('\0');
  for (let i = 0; i < parts.length; i += 1) {
    if (!parts[i]) continue;
    const code = parts[i].slice(0, 2);
    entries.push({ code, file: parts[i].slice(3) });
    if (/[RC]/.test(code)) i += 1; // a rename's source follows it
  }
  return entries;
}

/** A run record modified, added or untracked: not dirt (L3), here and in `classify`. A deleted, renamed or unmerged one is. */
const RECORD_CODES = new Set([' M', 'M ', 'MM', ' A', 'A ', 'AM', '??']);
export const isRecord =({ code, file }) => RECORD.test(file) && RECORD_CODES.has(code);

/**
 * `sha`'s parents and changed files in one git call (prune-worktrees S10): `<parents>\0\n<file>\0…`.
 * A merge, the root, an empty diff and a failure print no file, and answer no files.
 */
export function commitStep(repo, sha) {
  const step = git(repo, 'diff-tree', '-r', '-z', '--name-only', '--format=%P', sha);
  if (!step.ok) return { parents: [], files: [] };
  const [parents = '', ...files] = step.raw.split('\0');
  return { parents: parents.split(' ').filter(Boolean), files: files.map((file, i) => (i ? file : file.replace(/^\n/, ''))).filter(Boolean) };
}

/** `sha` less its trailing commits that each change only run records; a merge or the root ends the walk. */
function withoutRecordTail(repo, sha) {
  for (let hops = 0; hops < 100; hops += 1) {
    const { parents, files } = commitStep(repo, sha);
    if (parents.length !== 1 || !files.length || !files.every((file) => RECORD.test(file))) return sha;
    sha = parents[0];
  }
  return sha;
}

/** The pilot branch's name as read (`pilotBranch`, never a literal), or the legacy `pilot` when none can be read. */
function pilotName(repo) {
  try {
    return pilotBranch((args) => gitText(repo, ...args));
  } catch {
    return LEGACY_PILOT;
  }
}

/** Whether `head` is a safe head: reachable from a remote-tracking ref, the local pilot branch (or the legacy one) or a local `feat/*` other than `own`. */
function safeHead(repo, head, own) {
  const pilots = [...new Set([pilotName(repo), LEGACY_PILOT])].map((name) => `refs/heads/${name}`);
  // A pattern also matches refs under it (`refs/heads/pilot/x`): a pilot branch counts only as itself.
  const safe = (ref) => ref.startsWith('refs/remotes/') || ref.startsWith('refs/heads/feat/') || pilots.includes(ref);
  const contained = (sha) => {
    const refs = git(repo, 'for-each-ref', '--contains', sha, '--format=%(refname)', 'refs/remotes', ...pilots, 'refs/heads/feat');
    return refs.ok && refs.out.split('\n').some((ref) => ref && ref !== `refs/heads/${own}` && safe(ref));
  };
  // A ref that holds the head holds its record-free base too, so the tail is walked only when the head is not held (S10).
  if (contained(head)) return true;
  const work = withoutRecordTail(repo, head);
  return work !== head && contained(work);
}

/**
 * Unlinks every link and junction at or under `entry`, never descending through one, so no
 * removal can reach a link's target (L2, F5). lstat sees a junction as a link.
 */
function unlinkLinks(entry) {
  let stat;
  try { stat = fs.lstatSync(entry); } catch { return; }
  if (stat.isSymbolicLink()) {
    // A directory link on Windows may refuse unlink; rmdir removes the link, not its target.
    try { fs.unlinkSync(entry); } catch { fs.rmdirSync(entry); }
  } else if (stat.isDirectory()) {
    for (const name of fs.readdirSync(entry)) unlinkLinks(path.join(entry, name));
  }
}

/** The default remove step: git's own, from the main checkout. */
const gitRemove = (home, dir, force) => git(home, 'worktree', 'remove', ...(force ? ['--force'] : []), dir);

/**
 * Removes worktree `dir` of `repo` and its local branch, or keeps it and says why. Answers
 * `{ removed: true, branch }` (the branch deleted, null for a detached tree or one git refused)
 * or `{ kept: state }`, with `err`, git's own words, when git refused the removal or the branch.
 * The branch goes with `git branch <branchFlag>`, `-D` by default, the tree's tip being a safe head (prune-worktrees S2).
 */
export function removeTree(repo, dir, { landed = false, holder = () => null, remove = gitRemove, branchFlag = '-D' } = {}) {
  const trees = worktrees(repo);
  const index = trees ? trees.findIndex((tree) => same(tree.path, dir)) : -1;
  if (index < 0) return { kept: 'not a worktree' };
  if (index === 0) return { kept: 'main' };
  const tree = trees[index];
  const home = trees[0].path;
  if (tree.locked) return { kept: 'locked' };
  // Another worktree inside this one would go with it, its own work unchecked.
  if (trees.some((other, i) => i !== index && inside(other.path, tree.path))) return { kept: 'nested' };
  if (!fs.existsSync(tree.path)) return { kept: 'leftover' };
  const held = holder(tree.path);
  if (held !== null && held !== undefined) return { kept: `live ${held}` };

  const dirty = (read) => read === null || read.some((entry) => !isRecord(entry));
  let entries;
  if (landed) {
    // --force takes tracked changes too, so the one tracked status is read after the safe-head walk, right
    // before it (S10: the walk used to sit between two equal reads); dirt still outranks unpushed.
    const safe = Boolean(tree.head) && safeHead(repo, tree.head, tree.branch);
    entries = status(tree.path, '--untracked-files=no');
    if (dirty(entries)) return { kept: 'dirty' };
    if (!safe) return { kept: 'unpushed' };
  } else {
    entries = status(tree.path, '--untracked-files=all');
    if (dirty(entries)) return { kept: 'dirty' };
    if (!tree.head || !safeHead(repo, tree.head, tree.branch)) return { kept: 'unpushed' };
  }
  const loose = status(tree.path, '--ignored', '--untracked-files=normal');
  if (loose === null) return { kept: 'leftover' };

  // Nothing is changed before this point: a tree kept above is as it was.
  try {
    // The records go back to HEAD, or away when HEAD has none, so git finds a clean tree. The
    // rmSync takes one record file, never a dir.
    for (const { code, file } of entries) {
      if (/A|\?/.test(code)) {
        if (code.includes('A')) git(tree.path, 'rm', '-q', '--cached', '--force', '--', `:(literal)${file}`);
        fs.rmSync(path.join(tree.path, file), { force: true });
      } else {
        git(tree.path, 'checkout', '-q', 'HEAD', '--', `:(literal)${file}`);
      }
    }
    for (const { code, file } of loose) {
      if (code === '??' || code === '!!') unlinkLinks(path.join(tree.path, file.replace(/\/$/, '')));
    }
  } catch {
    return { kept: 'leftover' };
  }

  const removal = remove(home, tree.path, landed);
  if (!removal.ok) return { kept: 'leftover', ...(removal.err && { err: removal.err }) };
  if (fs.existsSync(tree.path)) return { kept: 'leftover' };
  // A local pilot branch, the read one or the legacy one, is a run's base: it stays even when a tree had it checked out.
  if (!tree.branch || isPilotName(tree.branch)) return { removed: true, branch: null };
  const branch = git(home, 'branch', branchFlag, tree.branch);
  return branch.ok ? { removed: true, branch: tree.branch } : { removed: true, branch: null, err: branch.err };
}
