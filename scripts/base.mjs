/**
 * `pilot base` — the ref the next run is cut from, in one line (pilot-branch spec 1; L12).
 * Run in the repository the run is for:
 *
 *   base <name> <sha>                         origin's pilot branch (`<login>-pilot`, stored as `pilot.branch`) and its
 *                                             tip, with a host or under `pilot.host none` (landed-pr-closed A1)
 *   base <name> <sha> (created from <default>) origin had none: the default tip, pushed; `(created from pilot)`, the
 *                                             legacy `pilot`'s tip when origin holds no `*-pilot` (user-pilot-branch L10)
 *   no name to read (signed out, or `none` with no `pilot.branch`): exit 1 with the `NO_NAME` line, nothing created
 *   ... on <remote> / ... local               the run remote is not origin (pilot-fork spec 2,
 *                                             3; L7), and a new pilot is "created from origin pilot"
 *
 * Exit 1 with the reason on stderr when origin cannot be reached, the default branch is
 * not known, `pilot.remote` is bad, or the directory is not a git work tree (L13); nothing
 * is created then.
 *
 * With a feature waiting unlanded at Gate 2 (pilot-develop-line spec 4; L5, A5) the run chains on it instead:
 *
 *   base feat/<N> <sha> (concluding <ticket>)  the deck's concluding feature, its branch on origin
 *   base pilot <sha> (deck not reached)        the deck did not answer: today's line, said so
 *   base pilot <sha> (feat/<N> not on origin)  the deck named a branch origin does not hold
 *
 * The deck is read only through `concluding`, which `main` points at `/api/tickets`; without it, today's line.
 *
 * With a `host` (`main` passes the repository's) the printed tip's checks are read, and a red or pending one adds a
 * suffix: ` (CI red at <sha7>: <names>)` or ` (CI pending at <sha7>)`. Green, none and unread add nothing; the exit
 * code never changes (ci-gate L4, L7).
 */

import { execFileSync } from 'node:child_process';
import { checksAt } from './checks.mjs';
import { hostFor } from '../deck/host.mjs';
import { SLUG } from '../deck/runs.mjs';
import { readTickets } from '../deck/tickets.mjs';
import { ensurePilotBranch, firstLine, LEGACY_PILOT, pilotBranch } from './pilot-branch.mjs';

/** The deck's concluding feature for the repository at `cwd`, `{ ticket, slug, branch }` or null; throws when the deck does not answer. */
const deckConcluding = (cwd) => async () => (await readTickets(cwd)).concluding ?? null;

/**
 * The chained line's ref and tip as `{ line }`, `{ note }` when origin lacks the branch, or null when the deck names
 * no feature; throws when the deck does not answer.
 */
async function chainedOn(concluding, git) {
  const feature = await concluding();
  const branch = feature?.branch;
  // A branch and a ticket from the deck reach git and the parsed line: only a feature branch and an item id, never an option.
  if (typeof branch !== 'string' || !branch.startsWith('feat/') || !SLUG.test(branch.slice('feat/'.length))) return null;
  if (typeof feature.ticket !== 'string' || !/^itm_[0-9a-f]+$/.test(feature.ticket)) return null;
  try {
    git(['fetch', '-q', 'origin', `+refs/heads/${branch}:refs/remotes/origin/${branch}`]);
  } catch {
    return { note: ` (${branch} not on origin)` };
  }
  return { branch, line: `${branch} ${git(['rev-parse', '--short', `origin/${branch}`])} (concluding ${feature.ticket})` };
}

/** The suffix a red or pending tip adds, else ''; a host that cannot answer is silent (L4). */
function ciSuffix(host, git, ref) {
  if (host === null) return '';
  let verdict;
  try {
    verdict = checksAt({ host, sha: git(['rev-parse', '--verify', `${ref}^{commit}`]) });
  } catch {
    return '';
  }
  const sha7 = verdict.sha.slice(0, 7);
  if (verdict.state === 'red') return ` (CI red at ${sha7}: ${verdict.failed.join(', ')})`;
  return verdict.state === 'pending' ? ` (CI pending at ${sha7})` : '';
}

/** Print the base line. Answers the exit code. */
export async function base({ cwd = process.cwd(), say = (text) => process.stdout.write(text), warn = (text) => process.stderr.write(text), concluding, host = null } = {}) {
  const git = (args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true }).trim();
  let inWorkTree = false;
  try {
    inWorkTree = git(['rev-parse', '--is-inside-work-tree']) === 'true';
  } catch {}
  if (!inWorkTree) {
    warn('pilot base: a run needs a git repository: run `git init` and add a remote\n');
    return 1;
  }
  let pilot;
  try {
    // The host's login names the pilot branch on first use (user-pilot-branch L3); none and no stored name exits 1.
    pilot = ensurePilotBranch({ git, host });
  } catch (err) {
    warn(`pilot base: ${firstLine(err)}\n`);
    return 1;
  }
  const from = pilot.created ? ` (created from ${pilot.from})` : '';
  // The move (L1) is said on stderr on every path: stdout's first token is parsed, and the chained line drops `from`.
  if (pilot.created && pilot.from === LEGACY_PILOT) warn(`created ${pilotBranch(git)} from ${LEGACY_PILOT}; the legacy pilot is left for you to delete\n`);
  const { runs } = pilot;
  const where = runs === 'origin' ? '' : runs === null ? ' local' : ` on ${runs}`;
  let deck = '';
  // A chain lives on origin, so only a run on origin reads the deck (pilot-fork's other remotes keep today's line).
  if (concluding && runs === 'origin') {
    try {
      const chained = await chainedOn(concluding, git);
      if (chained?.line) {
        say(`base ${chained.line}${ciSuffix(host, git, `origin/${chained.branch}`)}\n`);
        return 0;
      }
      deck = chained?.note ?? '';
    } catch {
      deck = ' (deck not reached)';
    }
  }
  // Every unchained run is cut from the pilot branch, host or none; main gets it by the release PR (landed-pr-closed A1).
  say(`base ${pilotBranch(git)} ${git(['rev-parse', '--short', pilot.sha])}${from}${where}${deck}${ciSuffix(host, git, pilot.sha)}\n`);
  return 0;
}

/** `pilot base`'s entry point from `bin/pilot.mjs`. */
export async function main(argv) {
  if (argv.length) {
    process.stderr.write('usage: pilot base\n');
    return 2;
  }
  const cwd = process.cwd();
  let host = null;
  try {
    host = hostFor(cwd);
  } catch {
    // A host that cannot be chosen is unread, and `base` says nothing of it.
  }
  return base({ cwd, concluding: deckConcluding(cwd), host });
}
