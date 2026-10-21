/**
 * `pilot base` — the ref the next run is cut from, in one line (pilot-branch spec 1; L12).
 * Run in the repository the run is for:
 *
 *   base pilot <sha>                          origin's pilot branch and its tip
 *   base pilot <sha> (created from <default>) origin had none: the default tip, pushed
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
 *
 * The deck is read only through `concluding`, which `main` points at `/api/tickets`; without it, today's line.
 */

import { execFileSync } from 'node:child_process';
import { bearer } from '../hooks/lib/deck-secret.js';
import { deckUrl } from '../deck/tools.mjs';
import { ensurePilotBranch, firstLine, PILOT_BRANCH } from './pilot-branch.mjs';

/** How long the deck has to answer before `pilot base` calls it not reached. */
const TIMEOUT_MS = 5000;

/** The deck's concluding feature for the repository at `cwd`, `{ ticket, slug, branch }` or null; throws when the deck does not answer. */
export const deckConcluding = (cwd) => async () => {
  const response = await fetch(`${deckUrl()}/api/tickets?repo=${encodeURIComponent(cwd)}`, { headers: bearer(), signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!response.ok) throw new Error(`it answered ${response.status}`);
  return (await response.json()).concluding ?? null;
};

/** The chained line's ref and tip, or null when the deck names no feature branch origin holds; throws when the deck does not answer. */
async function chainedOn(concluding, git) {
  const feature = await concluding();
  const branch = feature?.branch;
  // A branch from the deck reaches git as an argument: only a `feat/` name, never one that reads as an option.
  if (typeof branch !== 'string' || !/^feat\/[\w.-]+$/.test(branch)) return null;
  try {
    git(['fetch', '-q', 'origin', `+refs/heads/${branch}:refs/remotes/origin/${branch}`]);
  } catch {
    return null;
  }
  return `${branch} ${git(['rev-parse', '--short', `origin/${branch}`])} (concluding ${feature.ticket})`;
}

/** Print the base line. Answers the exit code. */
export async function base({ cwd = process.cwd(), say = (text) => process.stdout.write(text), warn = (text) => process.stderr.write(text), concluding } = {}) {
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
    pilot = ensurePilotBranch({ git });
  } catch (err) {
    warn(`pilot base: ${firstLine(err)}\n`);
    return 1;
  }
  const from = pilot.created ? ` (created from ${pilot.from})` : '';
  const { runs } = pilot;
  const where = runs === 'origin' ? '' : runs === null ? ' local' : ` on ${runs}`;
  let deck = '';
  // A chain lives on origin, so only a run on origin reads the deck (pilot-fork's other remotes keep today's line).
  if (concluding && runs === 'origin') {
    try {
      const chained = await chainedOn(concluding, git);
      if (chained) {
        say(`base ${chained}\n`);
        return 0;
      }
    } catch {
      deck = ' (deck not reached)';
    }
  }
  say(`base ${PILOT_BRANCH} ${git(['rev-parse', '--short', pilot.sha])}${from}${where}${deck}\n`);
  return 0;
}

/** `pilot base`'s entry point from `bin/pilot.mjs`. */
export async function main(argv) {
  if (argv.length) {
    process.stderr.write('usage: pilot base\n');
    return 2;
  }
  const cwd = process.cwd();
  return base({ cwd, concluding: deckConcluding(cwd) });
}
