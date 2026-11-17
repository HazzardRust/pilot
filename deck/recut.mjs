/**
 * Plan drift (never-stuck spec 13, L2-L4, L10): whether a signed plan still stands on what is on `origin`.
 * `gone` when the plan's sha is no longer on `origin/<plan.branch>`; `moved` when a file one of its slices owns
 * changed on `origin/pilot` since the plan's base; `unchecked` with the reason when git cannot answer, which the
 * caller grants on (L10). Git runs through `execFile`, never a shell, and fetches nothing but `origin`.
 */
import { execFile } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';

const GIT_TIMEOUT_MS = 20_000;
const SHA = /^[0-9a-f]{7,40}$/;
// A branch name git would accept that cannot be read as an option or a range.
const BRANCH = /^(?!-)(?!.*\.\.)[A-Za-z0-9._/-]+$/;

/** The first backticked path of each bullet under a slice file's `## Files owned` heading. */
export function ownedFiles(sliceText) {
  const lines = String(sliceText).split(/\r?\n/);
  const start = lines.findIndex((line) => /^##\s+Files owned\s*$/.test(line));
  if (start === -1) return [];
  const files = [];
  for (const line of lines.slice(start + 1)) {
    if (/^#{1,2}\s/.test(line)) break;
    const bullet = /^\s*[-*]\s+[^`]*`([^`]+)`/.exec(line);
    if (bullet) files.push(bullet[1].replace(/\s+\(new\)$/, '').trim());
  }
  return files;
}

class GitError extends Error {}

/**
 * Git in `repoDir` under one deadline shared by every call: `run(args)` resolves `{ code, stdout }` for exit 0 or 1
 * and throws a GitError otherwise. The repo's `core.fsmonitor`, hooks, `ext::` transport, auto gc and maintenance are
 * off and lazy fetches are barred, so its config runs no command of its own; no prompt can hold a fetch open.
 */
const HARDENED = ['-c', 'core.fsmonitor=false', '-c', `core.hooksPath=${os.devNull}`, '-c', 'protocol.ext.allow=never', '-c', 'gc.auto=0', '-c', 'maintenance.auto=false'];

function gitIn(repoDir) {
  const until = Date.now() + GIT_TIMEOUT_MS;
  const env = { ...process.env, GIT_NO_LAZY_FETCH: '1', GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'never' };
  return (args) => new Promise((resolve, reject) => {
    const left = until - Date.now();
    if (left <= 0) return reject(new GitError(`git ${args[0]}: timed out after ${GIT_TIMEOUT_MS / 1000} s`));
    execFile('git', [...HARDENED, ...args], { cwd: repoDir, env, timeout: left, windowsHide: true, maxBuffer: 16 * 1024 * 1024 }, (error, stdout, stderr) => {
      const code = error ? error.code : 0;
      if (code === 0 || code === 1) return resolve({ code, stdout: String(stdout) });
      const why = error.killed ? `timed out after ${GIT_TIMEOUT_MS / 1000} s` : String(stderr).trim().split(/\r?\n/)[0] || error.message;
      reject(new GitError(`git ${args[0]}: ${why}`));
    });
  });
}

/** Every path a slice file of the plan owns, read from the plan's own commit. */
async function ownedAt(git, sha, artefact) {
  const slices = `${path.posix.join(path.posix.dirname(artefact.replaceAll('\\', '/')), 'slices')}/`;
  const listed = await git(['ls-tree', '-z', '--name-only', `${sha}:${slices}`]);
  if (listed.code !== 0) throw new GitError(`git ls-tree: no ${slices} at ${sha}`);
  const owned = new Set();
  for (const name of listed.stdout.split('\0').filter((entry) => entry.endsWith('.md'))) {
    const slice = await git(['show', `${sha}:${slices}${name}`]);
    if (slice.code !== 0) throw new GitError(`git show: ${slices}${name} at ${sha}`);
    for (const file of ownedFiles(slice.stdout)) owned.add(file);
  }
  return owned;
}

/**
 * The drift of `plan` ({ sha, branch, artefact }) in the git repository `repoDir`, against `origin`. Never throws, and
 * answers within the deadline even when a transport helper git started outlives git's own kill.
 */
export function planDrift(repoDir, plan) {
  let timer;
  const late = new Promise((resolve) => {
    timer = setTimeout(() => resolve({ state: 'unchecked', reason: `git timed out after ${GIT_TIMEOUT_MS / 1000} s` }), GIT_TIMEOUT_MS + 1000);
    timer.unref();
  });
  return Promise.race([driftOf(repoDir, plan), late]).finally(() => clearTimeout(timer));
}

/**
 * What a gate1 on `ticket` still owes when the ticket carries a re-cut mark (never-stuck spec 15, L5): a body line
 * `Changed since <sha7>:` telling the user what moved since the plan they signed. An empty list for any other gate1.
 */
export function recutGate1Gaps(ticket, body) {
  if (!ticket?.recut || /^Changed since [0-9a-f]{7}:/m.test(String(body))) return [];
  const from = typeof ticket.recut.from === 'string' ? ticket.recut.from.slice(0, 7) : 'the signed plan';
  return [`a re-cut's gate1 lists what changed since ${from}: add a line \`Changed since ${from}: <what>\` to its body`];
}

const SLUG = /^(?!\.{1,2}$)[A-Za-z0-9._-]+$/;

/**
 * The paths under `docs/design/<slug>/` that differ between two plan commits in `repoDir`, sorted, or null when either
 * sha names no commit there or git cannot answer: an unreadable plan is never proven unchanged (L5). Local objects
 * only; nothing is fetched.
 */
export async function planChanges(repoDir, fromSha, toSha, slug) {
  if (![fromSha, toSha].every((sha) => typeof sha === 'string' && SHA.test(sha)) || typeof slug !== 'string' || !SLUG.test(slug)) return null;
  const git = gitIn(repoDir);
  try {
    for (const sha of [fromSha, toSha]) if ((await git(['rev-parse', '--verify', '--quiet', `${sha}^{commit}`])).code !== 0) return null;
    const diff = await git(['diff', '-z', '--name-only', '--no-renames', fromSha, toSha, '--', `docs/design/${slug}/`]);
    return diff.code === 0 ? diff.stdout.split('\0').filter(Boolean).sort() : null;
  } catch (error) {
    if (error instanceof GitError) return null;
    throw error;
  }
}

/** Sticky approval (L5): whether `docs/design/<slug>/` is textually the same at both shas; false when either is unreadable. */
export async function planUnchanged(repoDir, fromSha, toSha, slug) {
  return (await planChanges(repoDir, fromSha, toSha, slug))?.length === 0;
}

async function driftOf(repoDir, plan) {
  const sha = plan?.sha;
  const branch = plan?.branch;
  const artefact = plan?.artefact;
  if (typeof sha !== 'string' || !SHA.test(sha)) return { state: 'unchecked', reason: 'the plan has no sha' };
  if (typeof branch !== 'string' || !BRANCH.test(branch)) return { state: 'unchecked', reason: 'the plan has no branch' };
  if (typeof artefact !== 'string' || artefact === '' || artefact.startsWith('-')) return { state: 'unchecked', reason: 'the plan has no artefact' };
  const git = gitIn(repoDir);
  const must = async (args) => {
    const run = await git(args);
    if (run.code !== 0) throw new GitError(`git ${args[0]}: exit 1`);
    return run.stdout;
  };
  try {
    // Origin's branches into its remote-tracking refs and nothing else, whatever `remote.origin.fetch` says; no submodule's remote.
    await must(['fetch', '--quiet', '--no-recurse-submodules', 'origin', '+refs/heads/*:refs/remotes/origin/*']);
    const remote = `refs/remotes/origin/${branch}`;
    const pilot = 'refs/remotes/origin/pilot';
    // A branch deleted on origin, or a sha no object here names, leaves the plan nowhere on its branch.
    if ((await git(['show-ref', '--verify', '--quiet', remote])).code !== 0) return { state: 'gone', sha };
    if ((await git(['rev-parse', '--verify', '--quiet', `${sha}^{commit}`])).code !== 0) return { state: 'gone', sha };
    if ((await git(['merge-base', '--is-ancestor', sha, remote])).code !== 0) return { state: 'gone', sha };
    const base = (await must(['merge-base', sha, pilot])).trim();
    const changed = new Set((await must(['diff', '-z', '--name-only', '--no-renames', base, pilot, '--'])).split('\0').filter(Boolean));
    const owned = await ownedAt(git, sha, artefact);
    const files = [...owned].filter((file) => changed.has(file)).sort();
    return files.length ? { state: 'moved', files } : { state: 'ok' };
  } catch (error) {
    // L10: git that cannot answer grants; anything else thrown here is a bug and is said as the reason, never swallowed silently.
    return { state: 'unchecked', reason: error instanceof GitError ? error.message : `planDrift: ${error?.message ?? error}` };
  }
}
