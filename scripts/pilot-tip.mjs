#!/usr/bin/env node
/**
 * The pilot tip (audit-f1 §4): the run's pilot ref as it resolves locally and its sha
 * (spec 1, 4; L1, L6, L8, A2). `node scripts/pilot-tip.mjs [--fetch]` prints `<ref> <sha>`,
 * or `HEAD <sha>` when there is no pilot tip; it never creates a branch or pushes, and it
 * fetches only under `--fetch`, only a tracking ref that already exists.
 * `--session-start` is the SessionStart hook (spec 2): the payload's `cwd` on stdin, one warning
 * line as hook JSON when that checkout is over `BEHIND_BAR` behind, else nothing; it never fetches.
 */

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { pilotBranch } from './pilot-branch.mjs';
import { runRef, runRemote, shortRef } from './remotes.mjs';

const FETCH_MS = 30_000;

function gitIn(cwd) {
  return (args, options = {}) =>
    execFileSync('git', args, {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
      // Never a prompt: no terminal credential ask, no Git Credential Manager window.
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'never' },
      ...options,
    });
}

/** `{ ref, sha, behind }` for the run's pilot ref, or null: not a repo, no such ref, no pilot branch name, a bad `pilot.remote`, a git error. */
export function pilotTip({ cwd, fetch = false }) {
  const git = gitIn(cwd);
  try {
    const runs = runRemote(git);
    const name = pilotBranch((args) => git(args));
    const ref = runRef(runs, name);
    const sha = () => git(['rev-parse', '--verify', '-q', `${ref}^{commit}`]).trim();
    const known = sha();
    if (fetch && runs !== null) {
      try {
        // Writes the tracking ref and its objects only: no FETCH_HEAD, no submodules, no auto gc.
        git(
          ['-c', 'gc.auto=0', '-c', 'maintenance.auto=false', 'fetch', '-q', '--no-tags', '--no-write-fetch-head',
            '--no-recurse-submodules', runs, `+refs/heads/${name}:${ref}`],
          // No pipes: a grandchild ssh holding them cannot keep the call past the timeout.
          { timeout: FETCH_MS, killSignal: 'SIGKILL', stdio: ['ignore', 'ignore', 'ignore'] },
        );
      } catch {
        // Offline or refused: the tracking ref as it stands is the answer (A2).
      }
    }
    const tip = fetch ? sha() : known;
    const behind = Number(git(['rev-list', '--count', `HEAD..${tip}`]).trim());
    return { ref: shortRef(ref), sha: tip, behind };
  } catch {
    return null;
  }
}

/** A checkout more than this many commits behind its pilot tip is stale (L4). */
export const BEHIND_BAR = 100;

/** The SessionStart hook output warning a stale checkout, or null: no tip, or `behind` not over the bar. */
export function staleNotice(tip) {
  if (!tip || !(tip.behind > BEHIND_BAR)) return null;
  const line = `This checkout is ${tip.behind} commits behind ${tip.ref} (${tip.sha.slice(0, 7)}): ` +
    `cut a worktree from ${tip.ref} before working here.`;
  return { systemMessage: line, hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: line } };
}

/** The SessionStart hook (L2, L3, L5): one JSON line for a stale checkout, else nothing; never fetches, exits 0. */
function sessionStart() {
  try {
    let cwd;
    try {
      cwd = JSON.parse(fs.readFileSync(0, 'utf8'))?.cwd;
    } catch {
      // No payload, or not JSON: the process's own directory is the session's.
    }
    const notice = staleNotice(pilotTip({ cwd: typeof cwd === 'string' && cwd ? cwd : process.cwd() }));
    if (notice) process.stdout.write(`${JSON.stringify(notice)}\n`);
  } catch {
    // A session start this hook could fail is worse than a missed warning.
  }
}

const main = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (main && process.argv.includes('--session-start')) {
  sessionStart();
} else if (main) {
  const cwd = process.cwd();
  const tip = pilotTip({ cwd, fetch: process.argv.includes('--fetch') });
  let line = tip && `${tip.ref} ${tip.sha}`;
  if (!line) {
    try {
      line = `HEAD ${gitIn(cwd)(['rev-parse', '--verify', '-q', 'HEAD^{commit}']).trim()}`;
    } catch {
      // No pilot tip and no commit to fall back to: nothing to cut at, so no line.
      process.stderr.write('pilot-tip: no pilot ref and no HEAD commit here\n');
      process.exit(1);
    }
  }
  process.stdout.write(`${line}\n`);
}
