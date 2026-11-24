/**
 * `pilot test [--as <role>] [--scope slice] [--since <ref>]`: the one way an agent runs the tests
 * (tested-once spec 4; L5, A2, A6). A green, complete ledger row for the worktree's exact tree
 * (`reusableRun`) starts no test process and prints `tests reused: <where> <sha7>`; otherwise the
 * repository's own command (`testCommand`, the selection since `--since`) runs through `runTests`,
 * which writes the row, and prints its counts and minutes. `--scope slice` sets `PILOT_TEST_SCOPE=slice`
 * for the run, so the selection defers its fallbacks to integrate (A2). Exit 0 green, the run's own
 * status red (1 when that is not a number), 2 on a usage error.
 */

import { spawnSync } from 'node:child_process';
import os from 'node:os';

import { NO_TEST, runTests, testCommand } from './integrate.mjs';
import { reusableRun, worktreeTree } from './test-ledger.mjs';

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

export function testCli(argv, { cwd = process.cwd(), home = os.homedir(), print = console.log } = {}) {
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
  const reused = reusableRun({ tree: worktreeTree(cwd), since: since ?? null, home });
  if (reused) {
    print(`tests reused: ${reused.where} ${String(reused.sha ?? reused.tree).slice(0, 7)}`);
    return 0;
  }
  const chosen = testCommand(cwd, since === undefined ? {} : { since });
  if (chosen === undefined) {
    print(NO_TEST);
    return 2;
  }
  const saved = process.env.PILOT_TEST_SCOPE;
  if (opts.scope === 'slice') process.env.PILOT_TEST_SCOPE = 'slice';
  let run;
  try {
    run = runTests(cwd, chosen.command, {
      label: `test-${opts.as}`, where: opts.as, since: chosen.selected ? since : null, home, slot: !chosen.selected,
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
