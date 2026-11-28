/**
 * `pilot test [--as <role>] [--scope slice] [--since <ref>]`, the one way an agent runs the tests
 * (tested-once spec 4; L5, A2, A6): a green ledger row for the exact tree starts no process
 * (`tests reused: <where> <sha7>`); else `testCommand` runs through `runTests`, which writes the row.
 * `--scope slice` sets `PILOT_TEST_SCOPE=slice` for the run. Exit 0 green, the run's status red, 2 usage.
 */

import { execFileSync, spawnSync } from 'node:child_process';
import os from 'node:os';

import { hostFor } from '../deck/host.mjs';
import { provenTree } from './checks.mjs';
import { NO_TEST, runTests, testCommand } from './integrate.mjs';
import { reusableRun, worktreeTree } from './test-ledger.mjs';

/** QA reuses CI's proof of the tip (L6, A3); false makes QA ledger-only. */
export const CI_REUSE = true;

const USAGE = 'usage: pilot test [--as <role>] [--scope slice] [--since <ref>]';
const ROLE = /^[a-z][a-z-]*$/;

/** `{ as, scope, since }` from argv, or `{ error }`. */
function parse(argv) {
  const opts = { as: 'cli', scope: null, since: null };
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    const value = argv[i + 1];
    if (!['--as', '--scope', '--since'].includes(flag) || value === undefined) return { error: USAGE };
    i += 1;
    if (flag === '--as' && !ROLE.test(value)) return { error: `--as takes a role name, not ${JSON.stringify(value)}` };
    if (flag === '--scope' && value !== 'slice') return { error: `--scope takes slice, not ${JSON.stringify(value)}` };
    opts[flag.slice(2)] = value;
  }
  return opts;
}

/** `ref` as a full commit sha in `cwd`, or null when it names none. */
function commitOf(cwd, ref) {
  const out = spawnSync('git', ['rev-parse', '-q', '--verify', '--end-of-options', `${ref}^{commit}`], { cwd, encoding: 'utf8', windowsHide: true });
  return out.status === 0 ? out.stdout.trim() : null;
}

/** `provenTree` on `cwd`'s HEAD since `base`, `host` resolved from `cwd` when not given; a throw is no proof. */
function ciProof(cwd, host, base) {
  const head = commitOf(cwd, 'HEAD');
  if (head === null) return { tree: null, line: 'no ci proof: no HEAD' };
  const git = (args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  try {
    return provenTree({ host: host === undefined ? hostFor(cwd) : host, git, sha: head, base });
  } catch (err) {
    return { tree: null, line: `no ci proof: ${String(err?.message ?? err).split(/\r?\n/)[0]}` };
  }
}

// `home` reaches `runTests` as given: inside the suite an unpassed one reads and writes no row (L8).
// `--as qa --since <ref>` with no ledger row asks CI's proof of HEAD (spec 2, L6): the proved tree is this
// worktree's, no process; another tree, the selection since it.
export function testCli(argv, { cwd = process.cwd(), home, host, print = console.log } = {}) {
  const opts = parse(argv);
  if (opts.error) {
    print(opts.error);
    return 2;
  }
  let since;
  if (opts.since !== null) {
    since = commitOf(cwd, opts.since);
    if (since === null) {
      print(`--since names no commit: ${opts.since}`);
      return 2;
    }
  }
  let chosen = testCommand(cwd, since === undefined ? {} : { since });
  if (chosen === undefined) {
    print(NO_TEST);
    return 2;
  }
  const tree = worktreeTree(cwd);
  const ledgerHome = home ?? (process.env.PILOT_GATE_HOME_STORE ? null : os.homedir());
  const reused = ledgerHome === null ? null : reusableRun({ tree, since: since ?? null, home: ledgerHome, scope: opts.scope, command: chosen.command });
  if (reused) {
    print(`tests reused: ${reused.where} ${String(reused.sha ?? reused.tree).slice(0, 7)}`);
    return 0;
  }
  if (CI_REUSE && opts.as === 'qa' && since !== undefined) {
    const proof = ciProof(cwd, host, since);
    if (proof.tree !== null && proof.tree === tree) {
      print(`tests reused: ${proof.line}`);
      return 0;
    }
    print(proof.line);
    if (proof.tree !== null) {
      since = proof.tree;
      chosen = testCommand(cwd, { since });
      if (chosen === undefined) {
        print(NO_TEST);
        return 2;
      }
    }
  }
  const saved = process.env.PILOT_TEST_SCOPE;
  if (opts.scope === 'slice') process.env.PILOT_TEST_SCOPE = 'slice';
  let run;
  try {
    run = runTests(cwd, chosen.command, {
      label: `test-${opts.as}`, where: opts.as, since: chosen.selected ? since : null, home, tree, slot: !chosen.selected,
    });
  } finally {
    if (saved === undefined) delete process.env.PILOT_TEST_SCOPE;
    else process.env.PILOT_TEST_SCOPE = saved;
  }
  const counts = run.counts ?? `exit ${run.status}`;
  const scope = run.scope ? `; ${run.scope}` : '';
  if (run.status === 0) {
    print(`tests green: ${counts}${scope}; ${run.minutes} min`);
    return 0;
  }
  const failing = run.failing.length ? `; failing: ${run.failing.slice(0, 3).join(', ')}` : '';
  print(`tests red: ${counts}${failing}; ${run.minutes} min; log ${run.log}`);
  return typeof run.status === 'number' ? run.status : 1;
}

export const main = (argv) => testCli(argv);
