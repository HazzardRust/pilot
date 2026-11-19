/**
 * The stack of feature PRs (audit-f14 L5, L6): the one rule for which branch a feature PR is based on.
 * A run's record base never changes (L6); the PR's base is worked out from it on every write.
 */

import { PILOT_BRANCH, remoteDefaultBranch } from './pilot-branch.mjs';

/** How many PRs on the lower head are read, so a fork's PR of the same branch name cannot hide this repository's. */
const LIST_LIMIT = 30;

/**
 * The base a feature PR targets, from the run record's `base`: `pilot` stays `pilot` (a legacy run, A3);
 * the default branch (as origin says it now, `remoteDefaultBranch`) stays itself; `feat/<N>` stays
 * `feat/<N>` while N's own-repository PR does not read merged on `host`, then the default branch.
 * `git` is `(args) => string`, argv only. Throws on any other base, or when the host or origin cannot be asked.
 */
export function prBase({ git, host, base }) {
  if (base === PILOT_BRANCH) return PILOT_BRANCH;
  const main = remoteDefaultBranch(git);
  if (base === main) return main;
  if (typeof base !== 'string' || !/^feat\//.test(base)) throw new Error(`record base ${JSON.stringify(base)} is not ${PILOT_BRANCH}, ${main} or feat/<slug>`);
  const merged = host.reviews({ head: base, state: 'merged', limit: LIST_LIMIT }).some((pr) => pr?.crossRepo === false && pr.state === 'merged');
  return merged ? main : base;
}
