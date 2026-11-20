/**
 * The one clash read (two-devices L3, spec 2a, 2c): whether a slug is already taken where another device would
 * see it. A clash is `feat/<slug>` on origin, `design/<slug>` on the run remote, or an open review from either.
 * Each remote is read live with `git ls-remote` (`tipsOn`), never a tracking ref, and each review with the
 * Host's open list; nothing is fetched or written. What cannot be read is `unread`, never a free answer.
 *
 * Trust boundary (L4): the slug is held to `SLUG` before any git or host call, and reaches each as one argv
 * element inside a fixed branch name, never a shell string.
 */

import { firstLine } from '../scripts/pilot-branch.mjs';
import { tipsOn } from '../scripts/branches.mjs';
import { remoteOf, runRemote } from '../scripts/remotes.mjs';
import { SLUG } from './runs.mjs';
import { MAX_SLUG_CHARS } from './tools.mjs';

/** The run branches a slug names; `feat/` lives on origin, `design/` on the run remote (`remoteOf`). */
const branchesOf = (slug) => [`feat/${slug}`, `design/${slug}`];

/**
 * `{ clashes, unread? }` for `slug`: `{ ref: '<remote>/<branch>' }` per branch a remote holds, then
 * `{ pr, head }` per open review from one; `unread` names each remote or host that could not answer.
 * `git` is `(args) => string`, argv only; `host` is `hostFor`'s answer, null at `none` (no review can clash).
 * Throws, calling nothing, on a slug off `SLUG`.
 */
export function slugClashes(slug, { git, host }) {
  if (typeof slug !== 'string' || slug.length > MAX_SLUG_CHARS || !SLUG.test(slug)) {
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
  const tips = new Map(); // remote -> its branch map, or null when it could not be read
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
        tips.set(remote, null);
        unread.push(firstLine(err));
      }
    }
    if (tips.get(remote)?.has(branch)) clashes.push({ ref: `${remote}/${branch}` });
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
