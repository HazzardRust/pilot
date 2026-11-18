/**
 * The host (other-host spec 1-3; L1-L3, A1): the forge `pilot.host` names, and the **Host** verb interface every
 * host call goes through. `hostOf` is the one reader of the setting; `hostFor` hands back its adapter, or null at
 * `none`, where no host CLI starts and a caller reads null as "no review". Each adapter is the one module that
 * starts its CLI (`deck/host-github.mjs` for `gh`, `deck/host-gitlab.mjs` for `glab`).
 *
 * @typedef {{ number: number, state: 'open'|'merged'|'closed', base: string, head: string, headSha: string,
 *   title: string, body: string, url: string, crossRepo: boolean }} Review
 * @typedef {{ name: string, cli: string, whoami(): string,
 *   reviews(query: { head?: string, base?: string, state: 'open'|'merged'|'closed'|'all', mine?: boolean, limit?: number }): Review[],
 *   review(n: number): Review,
 *   open(pr: { base: string, head: string, title: string, body: string, draft?: boolean, label?: string }): { number: number, why?: string },
 *   edit(n: number, change: { base?: string, title?: string, body?: string, label?: string }): { why?: string },
 *   comment(n: number, body: string): void, upsertComment(n: number, marker: string, body: string): 'posted'|'edited'|'none',
 *   signedIn(): boolean }} Host
 */

import { git as gitAt } from '../scripts/pilot-branch.mjs';
import { ghRun, githubHost } from './host-github.mjs';
import { gitlabHost, glabRun } from './host-gitlab.mjs';

export const HOST_KEY = 'pilot.host';
export const HOST_NAMES = Object.freeze(['github', 'gitlab', 'none']);

/**
 * The host's name from `git config pilot.host`: unset is `github` (L3). Throws, naming the key, on any value off
 * `HOST_NAMES`, so a config value never chooses a CLI unchecked (L2). `git` is `(args) => string`, argv only.
 */
export function hostOf(git) {
  let value;
  try {
    value = git(['config', '--get', HOST_KEY]).replace(/\r?\n$/, '');
  } catch (err) {
    if (err.status === 1) return 'github';
    throw err;
  }
  if (!HOST_NAMES.includes(value)) throw new Error(`${HOST_KEY} names ${JSON.stringify(value)}: not one of ${HOST_NAMES.join(', ')}`);
  return value;
}

/** The **Host** of the repository in `cwd`, or null at `none` (A1). `run` replaces the adapter's CLI runner. */
export function hostFor(cwd, { git = (args) => gitAt(cwd, ...args), run } = {}) {
  const name = hostOf(git);
  if (name === 'none') return null;
  if (name === 'github') return githubHost(run ?? ghRun(cwd));
  if (name === 'gitlab') return gitlabHost(run ?? glabRun(cwd));
  throw new Error(`${HOST_KEY} names ${JSON.stringify(name)}: no adapter`);
}

/** Today's callers' argv runner, until each takes a **Host** (S6). */
export { ghRun as hostIn };
