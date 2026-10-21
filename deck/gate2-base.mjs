/**
 * The gate2 base check (lander spec 3; one-integration-line spec 1): a gate2's `sha` must merge
 * clean onto pilot, read as fetched, so the press never meets a conflict; it need not hold
 * `origin/<default>`, since pilot is the one integration line. Apart from `server-tools.mjs`, which names
 * no `child_process` (deck/test/create.test.mjs): `callTool('deck_post')` calls it before
 * `postItem`. Local git only, argv only: no shell, no fetch, no `gh`, nothing on the network.
 */

import path from 'node:path';
import { autoResolves, keptDir, mainCheckout } from '../scripts/merge-generated.mjs';
import { firstLine, gitUnder, PILOT_BRANCH } from '../scripts/pilot-branch.mjs';
import { runRef, runRemote, shortRef } from '../scripts/remotes.mjs';
import { SHA_FIELD } from './items-bounds.mjs';

// One 5 s deadline covers every git call one check makes, as the gate1 lineage check (L4).
const CHECK_MS = 5000;

/** `git` in `repo` under one deadline (`gitUnder`), answering stdout; throws on a non-zero exit. */
function checkGit(repo) {
  const git = gitUnder(repo, { timeout: CHECK_MS });
  return (_cwd, args) => {
    let out;
    try {
      out = git(args);
    } catch (err) {
      if (err.code === 'ETIMEDOUT') throw new Error(`git did not answer within ${CHECK_MS / 1000} s; post again`);
      throw err;
    }
    if (out.error) throw out.error;
    if (out.status !== 0) throw Object.assign(new Error(out.stderr.trim() || `git ${args[0]} exited ${out.status}`), { stderr: out.stderr, stdout: out.stdout, status: out.status });
    return out.stdout;
  };
}

/**
 * Whether `sha` merges clean onto the run remote's pilot as fetched (lander spec 3; L6), so the
 * press never meets a conflict: `git merge-tree` lists no path but generated ones
 * (`autoResolves`), or a kept `<checkout>-land-*` worktree's HEAD is a committed merge with
 * `sha` as a parent that itself merges clean there, the lander's prepared merge. No pilot there
 * is not checked: the landing refuses that itself. `{ ok: false, onto, paths }` names the
 * source conflicts; `why` what git said when the question could not be asked, a timeout included.
 */
export function cleanOnPilot(repo, sha, { git = checkGit(repo) } = {}) {
  const at = { onto: `origin/${PILOT_BRANCH}`, paths: [] };
  // Checked before git sees it, so a caller's string never reaches argv as an option: the store's
  // own gate2 `sha` shape, in which no hex digit is a `-`.
  if (typeof sha !== 'string' || !SHA_FIELD.shape.test(sha)) return { ok: false, ...at, why: `${JSON.stringify(sha)} is not a commit sha` };
  const run = (args) => git(repo, args);
  try {
    const ref = runRef(runRemote(run), PILOT_BRANCH);
    at.onto = shortRef(ref);
    let onto;
    try {
      onto = run(['rev-parse', '-q', '--verify', `${ref}^{commit}`]).trim();
    } catch (err) {
      if (err.status === 1) return { ok: true };
      throw err;
    }
    const full = run(['rev-parse', '--verify', `${sha}^{commit}`]).trim();
    // The paths merge-tree could not merge, generated ones left out: exit 1 is a conflict, its
    // stdout the tree and then each path, NUL-separated.
    const conflicts = (commit) => {
      try {
        run(['merge-tree', '--write-tree', '--name-only', '--no-messages', '-z', onto, commit]);
        return [];
      } catch (err) {
        if (err.status !== 1) throw err;
        return [...new Set(String(err.stdout).split('\0').slice(1).filter(Boolean))].filter((file) => !autoResolves(file));
      }
    };
    at.paths = conflicts(full);
    if (at.paths.length === 0) return { ok: true };
    const trees = run(['worktree', 'list', '--porcelain']).split(/\r?\n\r?\n/).map((tree) => tree.split(/\r?\n/));
    const field = (tree, key) => tree.find((line) => line.startsWith(`${key} `))?.slice(key.length + 1);
    const land = keptDir(mainCheckout(run));
    for (const tree of trees) {
      const where = path.normalize(field(tree, 'worktree') ?? '');
      const head = field(tree, 'HEAD');
      if (!head || !where.startsWith(land) || /[\\/]/.test(where.slice(land.length))) continue;
      const parents = run(['rev-list', '--parents', '-n', '1', head]).trim().split(' ').slice(1);
      if (parents.length > 1 && parents.includes(full) && conflicts(head).length === 0) return { ok: true };
    }
    return { ok: false, ...at };
  } catch (err) {
    return { ok: false, ...at, why: firstLine(err) };
  }
}

/** The deck's answer to a gate2 that is not clean on pilot. */
export function cleanRefusal(sha, { onto, paths, why }) {
  if (why !== undefined) return `NOT posted: ${sha} could not be checked against ${onto}: ${why}`;
  return `NOT posted: ${sha} conflicts with ${onto} in ${paths.join(', ')}; the lander resolves it first`;
}
