/**
 * `pilot branches prune --slug <slug> [--dry-run]` and the one code path that deletes a remote branch
 * (pilot-fork spec 6, 7, 8; L4, L5, L13). `refusal` is the deletion guard, apart from
 * `assertPushable`, which stays the only push guard. `deleteMerged` is the only caller of
 * `git push <remote> --delete`, leased, never forced: `feat/` branches on origin, the other run
 * branches on the run remote, none in local mode (A2). Merged: gh reads its PR MERGED at
 * the current tip, or, with no PR, its tip is a proper ancestor of `origin/<into>`. A gh
 * failure, an open or closed PR, or any doubt keeps the branch and names why. `git` and `gh`
 * are `(args) => string`, argv only; each throws on a non-zero exit, git with `status`.
 */

import { execFileSync } from 'node:child_process';
import { parseArgs } from 'node:util';

import { firstLine, PILOT_BRANCH, remoteDefaultBranch } from './pilot-branch.mjs';
import { remoteOf, runRemote } from './remotes.mjs';
import { isRunBranch } from './worktrees.mjs';

/** A run branch name: a run prefix, then plain `/`-separated segments; no `..`, no option. */
const DELETABLE = /^(slice|fix|qa|design|feat)\/(?!.*\.\.)(?!.*\/\/)[A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+)*$/i;
const POLL_MS = 1000;
/** How many PRs one `gh pr list` reads; a list that long may miss a branch's PR, so it keeps them all. */
const PR_LIMIT = 1000;

/** Why `branch` may not be deleted, or null when it may; the guard's one rule. */
function refusal(branch, defaultName) {
  const name = String(branch);
  if (!DELETABLE.test(name) || /\.(lock)?$/.test(name)) return 'not a plain run branch';
  const lower = name.toLowerCase();
  if (lower === PILOT_BRANCH || lower === defaultName.toLowerCase()) return 'it is the pilot or the default branch';
  return null;
}

/** Runs git, rethrowing a failure as `<what>: <git's first line>` with git's `status`. */
function step(git, args, what) {
  try {
    return git(args);
  } catch (err) {
    throw Object.assign(new Error(`${what}: ${firstLine(err)}`), { status: err.status });
  }
}

const sleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

/** `remote`'s branches as a name → sha map, from the remote itself. */
function tipsOn(git, remote) {
  const tips = new Map();
  for (const line of step(git, ['ls-remote', '--heads', remote], `git ls-remote ${remote} failed`).split(/\r?\n/)) {
    const [sha, ref] = line.split('\t');
    if (ref?.startsWith('refs/heads/')) tips.set(ref.slice('refs/heads/'.length), sha);
  }
  return tips;
}

/** Every same-repository PR, any state, by head branch, in one gh call; an Error when gh fails or the list may be cut short. */
function prsByHead(gh) {
  try {
    const prs = JSON.parse(gh(['pr', 'list', '--state', 'all', '--limit', String(PR_LIMIT), '--json', 'number,state,headRefName,headRefOid,isCrossRepository']));
    if (prs.length >= PR_LIMIT) throw new Error(`gh listed ${PR_LIMIT} PRs, so one may be missing`);
    const by = new Map();
    for (const pr of prs.filter((p) => p.isCrossRepository !== true)) by.set(pr.headRefName, [...(by.get(pr.headRefName) ?? []), pr]);
    return by;
  } catch (err) {
    return err;
  }
}

/**
 * Deletes each branch `select` takes that is merged, on the remote it lives on (origin and
 * the run remote, each listed here), with one `git push <remote> --delete` per remote, and
 * answers `{ deleted, kept }`: the names deleted, and `{ branch, why }` for each one kept.
 * `into` (default origin's default branch) is what a branch with no PR must be an ancestor
 * of; `wait` (ms, default 0) is how long an open PR is polled for GitHub to read it merged
 * (L5). With `dryRun`, `deleted` is what would be deleted and nothing is pushed. A failed
 * push throws with `deleted`, what went before it, and `kept`. Throws, deleting nothing,
 * when the run remote, origin's default branch or a remote's branch list cannot be read.
 */
export function deleteMerged({ git, gh, select, into, wait = 0, dryRun = false }) {
  const runs = runRemote(git);
  const defaultName = remoteDefaultBranch(git);
  const target = into ?? defaultName;
  const remotes = runs === null || runs === 'origin' ? ['origin'] : ['origin', runs];
  for (const remote of remotes) step(git, ['fetch', '-q', remote], `git fetch ${remote} failed`);
  const candidates = remotes.flatMap((remote) =>
    [...tipsOn(git, remote)].filter(([branch]) => remoteOf(runs, branch) === remote && select(branch)).map(([branch, tip]) => ({ remote, branch, tip })));

  const deleted = [];
  const kept = [];
  const doomed = new Map();
  const pr = { list: null, read: () => (pr.list = prsByHead(gh)) }; // one gh call, again only to poll
  for (const { remote, branch, tip } of candidates) {
    const why = whyKept({ git, pr, branch, tip, into: target, wait, refused: refusal(branch, defaultName) });
    if (why) {
      kept.push({ branch, why });
    } else {
      deleted.push(branch);
      doomed.set(remote, [...(doomed.get(remote) ?? []), { branch, tip }]);
    }
  }
  const gone = [];
  for (const [remote, names] of dryRun ? [] : doomed) {
    const leases = names.map(({ branch, tip }) => `--force-with-lease=refs/heads/${branch}:${tip}`);
    try {
      step(git, ['push', '-q', ...leases, remote, '--delete', ...names.map(({ branch }) => `refs/heads/${branch}`)], `git push ${remote} --delete failed`);
    } catch (err) {
      throw Object.assign(err, { deleted: gone, kept }); // what an earlier remote already lost
    }
    gone.push(...names.map(({ branch }) => branch));
  }
  return { deleted, kept };
}

/** Why this branch is kept, or null when it is merged. */
function whyKept({ git, pr, branch, tip, into, wait, refused }) {
  if (refused) return `refused: ${refused}`;
  const until = Date.now() + wait;
  let prs;
  for (let list = pr.list ?? pr.read(); ; list = pr.read()) {
    if (list instanceof Error) return `gh failed: ${firstLine(list)}`;
    prs = list.get(branch) ?? [];
    if (!prs.some((p) => p.state === 'OPEN') || Date.now() >= until) break;
    sleep(Math.min(POLL_MS, until - Date.now()));
  }
  const open = prs.find((pr) => pr.state === 'OPEN');
  if (open) return `PR #${open.number} open`;
  const merged = prs.find((pr) => pr.state === 'MERGED');
  if (merged) return merged.headRefOid === tip ? null : `tip moved after PR #${merged.number} merged`;
  if (prs.length) return `PR #${prs[0].number} closed unmerged`;
  try {
    // A fresh branch whose tip is the into tip has nothing of its own, so it is kept.
    if (git(['rev-parse', `refs/remotes/origin/${into}`]).trim() === tip) return `nothing landed: its tip is origin/${into}`;
    git(['merge-base', '--is-ancestor', tip, `refs/remotes/origin/${into}`]);
    return null;
  } catch (err) {
    return err.status === 1 ? `not merged into origin/${into}` : `ancestry unknown: ${firstLine(err)}`;
  }
}

const USAGE = 'usage: pilot branches prune --slug <slug> [--dry-run]\n';

/**
 * `pilot branches prune --slug <slug> [--dry-run]`: the run `<slug>`'s branches (`isRunBranch`)
 * on origin and the run remote through `deleteMerged`, never another run's, a line per branch
 * and a count. Exit 0 done, 1 failed, 2 a usage error, a missing `--slug` included.
 */
export function main(argv, inject = {}) {
  const { cwd = process.cwd(), write = (text) => process.stdout.write(text) } = inject;
  const git = inject.git ?? ((args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true }));
  const gh = inject.gh ?? ((args) => execFileSync('gh', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true }));
  let flags = {};
  try {
    flags = parseArgs({ args: argv.slice(1), options: { slug: { type: 'string' }, 'dry-run': { type: 'boolean' } } }).values;
  } catch {} // an unknown flag is the usage line below
  const { slug, 'dry-run': dryRun = false } = flags;
  if (argv[0] !== 'prune' || !slug) {
    process.stderr.write(USAGE);
    return 2;
  }
  const said = (kept) => kept.map(({ branch, why }) => `kept ${branch}: ${why}`);
  try {
    const { deleted, kept } = deleteMerged({ git, gh, select: (name) => isRunBranch(name, slug), dryRun });
    const lines = [...deleted.map((branch) => `${dryRun ? 'would delete' : 'deleted'} ${branch}`), ...said(kept)];
    const count = `${dryRun ? 'dry run: would delete' : 'deleted'} ${deleted.length}, kept ${kept.length}${dryRun ? '; nothing deleted' : ''}`;
    write(`${[...lines, count].join('\n')}\n`);
    return 0;
  } catch (err) {
    write(`${[...(err.deleted ?? []).map((branch) => `deleted ${branch}`), ...said(err.kept ?? []), `NOT pruned: ${err.message}`].join('\n')}\n`);
    return 1;
  }
}
