/**
 * The run remote: where a run's `pilot`, `slice/`, `design/`, `fix/` and `qa/` branches live
 * (pilot-fork spec 2; L1, L2, L3, L14). `pilot.remote` unset means `origin`; `none` means
 * local mode, with run branches as local refs; any other value must be a remote here.
 *
 * `git` is `(args) => string`, argv only, run in the repository's directory: it throws when
 * git exits non-zero, with git's exit code as `status`.
 */

export const RUN_REMOTE_KEY = 'pilot.remote';
const LOCAL = 'none';
const NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

/**
 * The run remote's name, or null in local mode. The only reader of `pilot.remote`. Throws,
 * naming the key, when the value is not a plain name or not listed by `git remote`, so a
 * config value never reaches argv or a ref path unchecked.
 */
export function runRemote(git) {
  let value;
  try {
    value = git(['config', '--get', RUN_REMOTE_KEY]).replace(/\r?\n$/, '');
  } catch (err) {
    if (err.status === 1) return 'origin'; // unset: today's behaviour, no further argv (L3)
    throw err;
  }
  if (value === LOCAL) return null;
  const refuse = (why) => new Error(`${RUN_REMOTE_KEY} names ${JSON.stringify(value)}: ${why}`);
  if (!NAME.test(value)) throw refuse('not a remote name');
  if (!git(['remote']).split(/\r?\n/).includes(value)) throw refuse('not a remote here');
  return value;
}

/** A run branch as a full ref: `refs/remotes/<runs>/<branch>`, or `refs/heads/<branch>` in local mode. */
export const runRef = (runs, branch) => (runs === null ? `refs/heads/${branch}` : `refs/remotes/${runs}/${branch}`);
/** A ref as a message names it: `<runs>/<branch>`, or `<branch>` in local mode. */
export const shortRef = (ref) => ref.replace(/^refs\/(?:heads|remotes)\//, '');
/** The remote `branch` lives on: origin for a `feat/` branch (any case), else the run remote (null: local). */
export const remoteOf = (runs, branch) => (/^feat\//i.test(branch) ? 'origin' : runs);
