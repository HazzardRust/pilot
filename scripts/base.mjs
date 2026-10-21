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
 */

import { execFileSync } from 'node:child_process';
import { ensurePilotBranch, firstLine, PILOT_BRANCH } from './pilot-branch.mjs';

/** Print the base line. Answers the exit code. */
export async function base({ cwd = process.cwd(), say = (text) => process.stdout.write(text), warn = (text) => process.stderr.write(text) } = {}) {
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
  say(`base ${PILOT_BRANCH} ${git(['rev-parse', '--short', pilot.sha])}${from}${where}\n`);
  return 0;
}

/** `pilot base`'s entry point from `bin/pilot.mjs`. */
export async function main(argv) {
  if (argv.length) {
    process.stderr.write('usage: pilot base\n');
    return 2;
  }
  return base();
}
