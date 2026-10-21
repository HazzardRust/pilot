/**
 * The pilot branch: one per repository on `origin`, the base of every run (spec 1; L12),
 * and the one guard every push the pilot's commands make passes (spec 4; L4, L23).
 *
 * `git` is `(args) => string`, argv only, run in the repository's directory: it throws
 * when git exits non-zero.
 */

import { execFileSync, spawnSync } from 'node:child_process';
import path from 'node:path';
import { runRef, runRemote } from './remotes.mjs';
import { hostPlatform } from '../hooks/lib/platform.js';

export const PILOT_BRANCH = 'pilot';

/** `git` in `cwd`, argv only, its output trimmed; throws when git exits non-zero. */
export const git = (cwd, ...args) =>
  execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true }).trim();

export const firstLine = (err) => String(err.stderr?.trim() || err.message).split('\n')[0];

/** Runs `git`, rethrowing a failure as `<what>: <git's first line>`. */
function step(git, args, what) {
  try {
    return git(args);
  } catch (err) {
    throw new Error(`${what}: ${firstLine(err)}`);
  }
}

/**
 * Called once at each process entry that spawns git in someone's repository (gate-no-stall
 * spec 7): `bin/pilot.mjs` and the deck daemon. On Windows libuv looks a bare `git` up in the
 * spawn's cwd before PATH unless NoDefaultCurrentDirectoryInExePath is set, and resolves a
 * relative PATH entry (`.`, `bin`) against that cwd even when it is, so the PATH this process
 * and every child inherits keeps its absolute entries only. A repository cannot choose its git.
 * The environment as it was is kept once, for `unstrippedEnv`.
 */
export function searchPathOnly(env = process.env, platform = hostPlatform()) {
  if (platform !== 'win32') return;
  if (!unstripped.has(env)) unstripped.set(env, { ...env });
  env.NoDefaultCurrentDirectoryInExePath = '1';
  const key = Object.keys(env).find((name) => name.toLowerCase() === 'path') ?? 'PATH';
  const dirs = String(env[key] ?? '').split(path.win32.delimiter);
  env[key] = dirs.filter((dir) => path.win32.isAbsolute(dir.replace(/^"(.*)"$/, '$1'))).join(path.win32.delimiter);
}

const unstripped = new WeakMap();

/**
 * `env` as it was before `searchPathOnly` stripped it, or `env` itself when it never was: for
 * the `claude` sessions the deck starts (`deck/run.mjs`, `deck/session.mjs`), since spec 7
 * guards git and a session's own tools are the user's.
 */
export const unstrippedEnv = (env = process.env) => unstripped.get(env) ?? env;

/** `true` when git exits 0 in `cwd`, `false` otherwise; for the questions git answers by status. */
export const holds = (cwd, args) => spawnSync('git', args, { cwd, windowsHide: true }).status === 0;

/**
 * The default branch's name from the local origin/HEAD, which a rename on the remote
 * leaves stale: for display only (`pilot tickets`), never for the guard. Throws when unset.
 */
export function defaultBranch(git) {
  const unknown = 'no default branch known (run git remote set-head origin --auto)';
  const full = step(git, ['symbolic-ref', 'refs/remotes/origin/HEAD'], unknown).trim();
  const prefix = 'refs/remotes/origin/';
  if (!full.startsWith(prefix) || full.length === prefix.length) throw new Error(`${unknown}: origin/HEAD is ${full}`);
  return full.slice(prefix.length);
}

/**
 * The default branch's name as the remote says it now (`ls-remote --symref origin HEAD`),
 * so a renamed default is still the default (spec 4; L4). Throws "no default branch known"
 * when the remote cannot be asked or names none; there is no fallback to origin/HEAD.
 */
export function remoteDefaultBranch(git) {
  const unknown = 'no default branch known';
  const said = step(git, ['ls-remote', '--symref', 'origin', 'HEAD'], `${unknown} (origin could not be asked)`);
  const name = /^ref: refs\/heads\/(\S+)\tHEAD$/m.exec(said)?.[1];
  if (!name) throw new Error(`${unknown}: origin's HEAD names no branch`);
  return name;
}

/** A ref side git takes literally: no option, glob, revision syntax, `HEAD`, `@` or whitespace. */
const PLAIN = /^(?!-)(?!.*\.\.)[A-Za-z0-9._/-]+$/;

/**
 * Throws, naming the ref, unless a push to `ref` lands on one branch that is not the
 * default one. An allowlist: `ref` is `<name>`, `refs/heads/<name>`, or `<src>:<dst>`
 * with `<dst>` one of those two; anything else (a force `+`, an option, a glob, a
 * deletion, `HEAD`, another ref namespace, an unqualified `heads/…`) is refused. The
 * name is compared without case. Fails closed: with no default branch known, every
 * ref is refused.
 */
export function assertPushable(ref, { git }) {
  const text = String(ref);
  const sides = text.split(':');
  const dst = sides.at(-1);
  const name = dst.replace(/^refs\/heads\//, '');
  const refuse = (why) => new Error(`refusing to push ${JSON.stringify(text)}: ${why}`);
  if (sides.length > 2 || (sides.length === 2 && !PLAIN.test(sides[0]))) throw refuse('not a plain <src>:<branch> refspec');
  if (!PLAIN.test(name) || /^(?:refs|heads)\//.test(name) || name === 'HEAD') throw refuse('not a plain branch name');
  let fallback;
  try {
    fallback = remoteDefaultBranch(git);
  } catch (err) {
    throw refuse(err.message);
  }
  if (name.toLowerCase() === fallback.toLowerCase()) throw new Error(`refusing to push ${name}: it is the default branch (${fallback})`);
}

/**
 * Fetches origin (and a named run remote) and answers the pilot branch's tip on the run
 * remote, or the local `pilot` in local mode (pilot-fork spec 3; L7). When there is none,
 * creates it, never forced: from origin's `pilot` when the run remote is not origin and
 * origin has one, else from origin's default tip; it is pushed through `assertPushable`, or
 * made a local branch in local mode. Answers `runs`, `runRemote`'s answer, and `created: true` and
 * `from`, `'origin pilot'` or the default branch's name, then. Throws on a bad `pilot.remote`, a failed fetch, an unknown
 * default branch or a failed push.
 */
export function ensurePilotBranch({ git }) {
  const runs = runRemote(git);
  step(git, ['fetch', '-q', 'origin'], 'git fetch failed');
  if (runs !== null && runs !== 'origin') step(git, ['fetch', '-q', runs], 'git fetch failed');
  const tipOn = (remote) => step(git, ['ls-remote', remote, `refs/heads/${PILOT_BRANCH}`], 'git ls-remote failed').split(/\s/)[0];
  const existing = runs === null ? localTip(git, `refs/heads/${PILOT_BRANCH}`) : tipOn(runs);
  if (existing) return { sha: existing, created: false, runs };
  let sha = runs === 'origin' ? '' : tipOn('origin');
  let from = 'origin pilot';
  if (!sha) {
    from = remoteDefaultBranch(git);
    sha = step(git, ['rev-parse', '--verify', `refs/remotes/origin/${from}^{commit}`], `origin/${from} could not be read`);
  }
  if (runs === null) {
    step(git, ['branch', '--no-track', PILOT_BRANCH, sha], 'git branch failed');
  } else {
    assertPushable(PILOT_BRANCH, { git });
    step(git, ['push', '-q', runs, `${sha}:refs/heads/${PILOT_BRANCH}`], 'git push failed');
  }
  return { sha, created: true, from, runs };
}

/** `ref`'s commit, or '' when it does not exist; any other git failure throws. */
function localTip(git, ref) {
  try {
    return git(['rev-parse', '-q', '--verify', `${ref}^{commit}`]).trim();
  } catch (err) {
    if (err.status === 1) return '';
    throw new Error(`git rev-parse failed: ${firstLine(err)}`);
  }
}

/**
 * `git` in `cwd` as `(args, input) => spawnSync's result`, argv only, with the repository's
 * `core.fsmonitor` off so its config runs no command. With `timeout` (ms), every call shares
 * that one deadline, and a call past it throws with `code: 'ETIMEDOUT'`.
 */
export function gitUnder(cwd, { timeout } = {}) {
  const until = timeout === undefined ? Infinity : Date.now() + timeout;
  return (args, input) => {
    const left = until - Date.now();
    if (left <= 0) throw Object.assign(new Error('git did not answer before the deadline'), { code: 'ETIMEDOUT' });
    const out = spawnSync('git', ['-c', 'core.fsmonitor=false', ...args], {
      cwd,
      input,
      // A promisor remote in the repo's config would lazy-fetch a missing object through a command it names.
      env: { ...process.env, GIT_NO_LAZY_FETCH: '1' },
      encoding: 'utf8',
      maxBuffer: 256 * 1024 * 1024,
      timeout: left === Infinity ? undefined : left,
      windowsHide: true,
    });
    if (out.error?.code === 'ETIMEDOUT') throw out.error;
    return out;
  };
}

/**
 * `ref`'s lineage against the run remote's `pilot` as last fetched (`origin/pilot` unset, the
 * local `pilot` in local mode; pilot-fork L1), with no fetch here (design-docs-only
 * L3, L7): `upstream`, that pilot's full ref (`runRef`); `tip` when pilot's tip is an ancestor of `ref`; and `copies`, how many of
 * `ref`'s own commits (not reachable from pilot) carry the same patch as one of pilot's
 * commits the branch did not start from. Patch equivalence, as `git cherry` judges it,
 * but still counted after the branch has merged pilot, which `git cherry` stops seeing.
 * Only `{ upstream }` when that `pilot` does not exist; throws when `ref` does not resolve or
 * `pilot.remote` is bad.
 * With `timeout` (ms), every git call shares that one deadline, and a call past it throws
 * with `code: 'ETIMEDOUT'`. The repository's `core.fsmonitor` is off for every call, so a
 * hostile repository's config runs no command.
 */
export function pilotLineage(cwd, ref, { timeout } = {}) {
  const git = gitUnder(cwd, { timeout });
  const ok = (args) => git(args).status === 0;
  const text = (args, input) => {
    const out = git(args, input);
    if (out.status !== 0) throw Object.assign(new Error(`git ${args[0]} failed: ${firstLine({ stderr: out.stderr, message: out.error?.message ?? `exit ${out.status}` })}`), { status: out.status });
    return out.stdout;
  };
  const run = (args, input) => text(args, input).split('\n').filter(Boolean);
  const runs = runRemote(text);
  const upstream = runRef(runs, PILOT_BRANCH);
  if (!ok(['rev-parse', '-q', '--verify', `${upstream}^{commit}`])) return { upstream };
  const [sha] = run(['rev-parse', '--verify', '--end-of-options', `${ref}^{commit}`]);
  const tip = ok(['merge-base', '--is-ancestor', upstream, sha]);
  const branchSide = new Set(run(['rev-list', sha, '--not', upstream]));
  const withParents = run(['rev-list', '--no-merges', '--parents', sha, '--not', upstream]).map((line) => line.split(' '));
  const own = withParents.map(([commit]) => commit);
  if (own.length === 0) return { upstream, tip, copies: 0 };
  // Where the branch's own commits start from, off its own side (a merge of pilot is on it):
  // pilot's commits not reachable from there are the ones a copy can be of.
  const forks = withParents.flatMap(([, ...parents]) => parents.filter((p) => !branchSide.has(p)));
  const theirs = run(['rev-list', '--no-merges', '--stdin'], [upstream, '--not', ...forks, ''].join('\n'));
  if (theirs.length === 0) return { upstream, tip, copies: 0 };
  const patchIds = (shas) => run(['patch-id', '--stable'], run(['diff-tree', '--stdin', '--root', '-p'], `${shas.join('\n')}\n`).join('\n')).map((line) => line.split(' ')[0]);
  const pilotIds = new Set(patchIds(theirs));
  return { upstream, tip, copies: patchIds(own).filter((id) => pilotIds.has(id)).length };
}
