/**
 * The gate2 `checks` field (ci-gate spec 4; L6, A2, A5): on a sha with CI configured, a gate2 carries the line
 * `pilot checks <sha>` printed, green at its own sha. The line is QA's word and is not re-read here; land re-reads.
 * Local git only, argv only, under one 5 s deadline: no `gh`, no `glab`, nothing on the network.
 */

import path from 'node:path';
import { ciConfigured, parseCheckLine } from '../scripts/checks.mjs';
import { gitUnder } from '../scripts/pilot-branch.mjs';
import { CHECKS_FIELD, SHA_FIELD } from './items-bounds.mjs';
import { repoOf } from './runs.mjs';

const CHECK_MS = 5000;

/** `git` in `repo` under the one deadline, answering stdout; throws on a timeout or a non-zero exit. */
function checkGit(repo) {
  const git = gitUnder(repo, { timeout: CHECK_MS });
  return (args) => {
    const out = git(args);
    if (out.error) throw out.error;
    if (out.status !== 0) throw new Error(out.stderr.trim() || `git ${args[0]} exited ${out.status}`);
    return out.stdout;
  };
}

/**
 * `NOT posted: <why>` for a gate2 at `sha` in `repo` whose `checks` is missing, at another sha, or not green;
 * null where it passes or CI is not configured at `sha`. A tree git cannot read counts as configured (A2), so the
 * gate stays shut. A `repo` that is no checkout, or a sha of the wrong shape, is the store's to refuse, as for
 * `assertCleanOnPilot`. `none ... : no host` passes, as at land (A2).
 */
export function checksRefusal(repo, sha, checks) {
  if (typeof sha !== 'string' || !SHA_FIELD.shape.test(sha.trim())) return null;
  if (typeof repo !== 'string' || !path.isAbsolute(repo) || repoOf(repo) === null) return null;
  const at = sha.trim().toLowerCase();
  let full = null;
  let configured = true;
  try {
    const git = checkGit(repo);
    full = git(['rev-parse', '--verify', '-q', `${at}^{commit}`]).trim();
    configured = ciConfigured(git, full);
  } catch {
    // Unreadable: configured stays true, and the line is checked against the gate2's own sha.
  }
  if (!configured) return null;
  const sha7 = (full ?? at).slice(0, 7);
  const line = typeof checks === 'string' ? checks.trim() : '';
  if (line === '') return `NOT posted: CI is configured at ${sha7}, so a gate2 carries checks, the line \`pilot checks ${full ?? at}\` printed`;
  const read = CHECKS_FIELD.shape.test(line) ? parseCheckLine(line) : null;
  if (read === null) return 'NOT posted: checks must be one line, as `pilot checks <sha>` printed it';
  if (!(full ?? at).startsWith(read.sha7)) return `NOT posted: checks at ${read.sha7}, the gate2 is ${sha7}`;
  if (read.state === 'green' || (read.state === 'none' && read.names.join(', ') === 'no host')) return null;
  return `NOT posted: checks ${read.state} at ${read.sha7}${read.names.length > 0 ? `: ${read.names.join(', ')}` : ''}; post the gate2 once they are green`;
}
