/**
 * The one clash read (two-devices L3, spec 2a, 2c): whether a slug is already taken where another device would
 * see it. A clash is `feat/<slug>` on origin, `design/<slug>` on the run remote, or an open review from either.
 * Each remote is read live with `git ls-remote` (`tipsOn`), never a tracking ref, and each review with the
 * Host's open list; nothing is fetched or written. What cannot be read is `unread`, never a free answer.
 *
 * Trust boundary (L4): the slug is held to `SLUG` before any git or host call, and reaches each as one argv
 * element inside a fixed branch name, never a shell string.
 */

import { firstLine, gitUnder } from '../scripts/pilot-branch.mjs';
import { tipsOn } from '../scripts/branches.mjs';
import { remoteOf, runRemote } from '../scripts/remotes.mjs';
import { isSlug } from './runs.mjs';
import { MAX_SLUG_CHARS } from './tools.mjs';

/** The one deadline every git call of one slug read shares (§8: "bounded by the existing leash"). */
const LEASH_MS = 5000;

/**
 * `git` in `cwd` as `(args) => trimmed stdout`, argv only, every call under one `LEASH_MS` deadline
 * (`gitUnder`) that starts at the first call: a non-zero exit throws with its `status` and `stderr`, and a call
 * past the deadline throws, so a remote that never answers reads `cannot tell`, never a hang.
 */
export function leashedGit(cwd) {
  let git;
  return (args) => {
    git ??= gitUnder(cwd, { timeout: LEASH_MS });
    let out;
    try {
      out = git(args);
    } catch (err) {
      if (err.code === 'ETIMEDOUT') throw new Error(`git ${args[0]} did not answer within ${LEASH_MS / 1000} s`);
      throw err;
    }
    if (out.error) throw out.error;
    if (out.status !== 0) throw Object.assign(new Error(out.stderr.trim() || `git ${args[0]} exited ${out.status}`), { stderr: out.stderr, status: out.status });
    return out.stdout.trim();
  };
}

/** The run branches a slug names; `feat/` lives on origin, `design/` on the run remote (`remoteOf`). */
const branchesOf = (slug) => [`feat/${slug}`, `design/${slug}`];

/** One clash as its reader prints it: the remote ref, or the review and its head. */
export const clashText = (clash) => ('ref' in clash ? clash.ref : `PR #${clash.pr} from ${clash.head}`);

/**
 * `{ clashes, unread? }` for `slug`: `{ ref: '<remote>/<branch>' }` per branch a remote holds, then
 * `{ pr, head }` per open review from one; `unread` names each remote or host that could not answer.
 * `git` is `(args) => string`, argv only; `host` is `hostFor`'s answer, null at `none` (no review can clash).
 * `tips` caches each remote's branch map, or why it could not be read; one Map across slugs reads each remote once.
 * Throws, calling nothing, on a slug off `SLUG`.
 */
export function slugClashes(slug, { git, host, tips = new Map() }) {
  if (!isSlug(slug)) {
    throw new Error(`not a slug: ${JSON.stringify(slug)}; a slug is kebab-case, at most ${MAX_SLUG_CHARS} characters`);
  }
  const clashes = [];
  const unread = [];
  const branches = branchesOf(slug);

  let runs;
  try {
    runs = runRemote(git);
  } catch (err) {
    unread.push(firstLine(err)); // `runs` stays undefined: origin is still read for `feat/`
  }
  for (const branch of branches) {
    const remote = remoteOf(runs, branch);
    if (remote === undefined) continue; // the run remote could not be read; named above
    if (remote === null) {
      unread.push(`${branch}: pilot.remote is none, so no other device can see it`);
      continue;
    }
    if (!tips.has(remote)) {
      try {
        tips.set(remote, tipsOn(git, remote));
      } catch (err) {
        tips.set(remote, firstLine(err)); // why it could not be read, named again for every slug that asks
      }
    }
    const read = tips.get(remote);
    if (typeof read === 'string') {
      if (!unread.includes(read)) unread.push(read);
    } else if (read.has(branch)) clashes.push({ ref: `${remote}/${branch}` });
  }

  if (host !== null) {
    try {
      for (const head of branches) {
        for (const review of host.reviews({ head, state: 'open' })) clashes.push({ pr: review.number, head });
      }
    } catch (err) {
      unread.push(`${host.cli}: ${firstLine(err)}`);
    }
  }
  return unread.length ? { clashes, unread: unread.join('; ') } : { clashes };
}
