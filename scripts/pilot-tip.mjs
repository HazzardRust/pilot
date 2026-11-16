#!/usr/bin/env node
/**
 * The pilot tip (audit-f1 §4): the run's pilot ref as it resolves locally and its sha
 * (spec 1, 4; L1, L6, L8, A2). `node scripts/pilot-tip.mjs [--fetch]` prints `<ref> <sha>`,
 * or `HEAD <sha>` when there is no pilot tip; it never creates a branch or pushes, and it
 * fetches only under `--fetch`, only a tracking ref that already exists.
 */

import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { runRef, runRemote, shortRef } from './remotes.mjs';

const PILOT = 'pilot';
const FETCH_MS = 30_000;

function gitIn(cwd) {
  return (args, options = {}) =>
    execFileSync('git', args, {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      // Never a prompt: no terminal credential ask, no Git Credential Manager window.
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'never' },
      ...options,
    });
}

/** `{ ref, sha, behind }` for the run's pilot ref, or null: not a repo, no such ref, a bad `pilot.remote`, a git error. */
export function pilotTip({ cwd, fetch = false }) {
  const git = gitIn(cwd);
  try {
    const runs = runRemote(git);
    const ref = runRef(runs, PILOT);
    const sha = () => git(['rev-parse', '--verify', '-q', `${ref}^{commit}`]).trim();
    const known = sha();
    if (fetch && runs !== null) {
      try {
        // Writes the tracking ref and its objects only: no FETCH_HEAD, no submodules, no auto gc.
        git(
          ['-c', 'gc.auto=0', '-c', 'maintenance.auto=false', 'fetch', '-q', '--no-tags', '--no-write-fetch-head',
            '--no-recurse-submodules', runs, `+refs/heads/${PILOT}:${ref}`],
          { timeout: FETCH_MS, killSignal: 'SIGKILL' },
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

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
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
