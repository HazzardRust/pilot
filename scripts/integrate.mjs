/**
 * `pilot integrate [<slice-branch>]` — one call that lands a slice on the feature branch
 * (independence spec 22.1). Run in the `feat/<slug>` worktree:
 *
 *   fetch; take the base (merge --no-ff <run remote>/pilot, committed); merge --no-ff
 *   --no-commit <run remote>/<branch>; npm ci when the lockfile moved or node_modules is
 *   missing; the test command; on green commit the merge, push, commit whatever run.json
 *   the deck wrote under docs/design/, and push again. With no branch it takes the base
 *   alone.
 *
 * The base is the pilot branch (pilot-branch spec 3; L5), or a chained run's `feat/<N>` until
 * N lands (`baseOf`; pilot-develop-line spec 4a, L6): no PR is read for it,
 * and a missing pilot branch on the run remote (`runRemote`; the local `pilot` under
 * `none`) stops with nothing merged rather than falling back to the default branch. A
 * feature already landed on pilot (`landedOnPilot`) takes no base, so a later feature on
 * pilot never reaches its PR (red-lands-on-pilot spec 3; L6). The branch checked out
 * must not be `pilot` (`pilot land` is the only way onto it) and must pass
 * `assertPushable` before anything is merged, and every push names that branch, so a run
 * sitting on the default branch pushes nothing (spec 4; L4).
 * On `feat/<slug>` the slice's merge is subjected `feat(<slug>): S<n> <title>` from the run
 * record row whose `branch` is the slice (`sliceSubject`; pilot-develop-line spec 3), and no
 * PR is read; a record naming no such row refuses the slice before anything is merged, and
 * no record at all leaves `Merge <slice>`. On red or a stop the branch is reset to where it started,
 * so nothing is committed or pushed, and the failing tests are named. The answer is one
 * line: the tip, the pass and fail counts, and whether it was pushed. Written because the
 * pilot did these steps by hand for every slice, and the S3 merge of independence
 * reported ten false failures from a worktree with no node_modules.
 *
 * Once the push has succeeded, the slice goes through `deleteMerged` with `into` the feature
 * branch (pilot-fork spec 6, 8; L4, L5): a PR is polled up to `wait` ms for gh to read it
 * MERGED, a slice with none is judged by ancestry, and the line ends `; deleted <slice>` or
 * `; kept <slice>: <why>`. Red, a stop, `--no-push`, local mode (A2) and a `feat/` branch
 * delete nothing.
 */

import { execFileSync, execSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { cleanOnPilot } from '../deck/gate2-base.mjs';
import { RUN_BASE } from '../deck/runs.mjs';
import { privateDir } from '../hooks/lib/atomic-write.js';
import { deleteMerged } from './branches.mjs';
import { takeSlot } from './gate-slots.mjs';
import { mergeIntoPilot } from './sync.mjs';
import { conflictLine, conflictPaths, keptDir, mainCheckout } from './merge-generated.mjs';
import { assertPushable, firstLine, git, holds, PILOT_BRANCH, pilotLineage } from './pilot-branch.mjs';
import { remoteOf, runRef, runRemote, shortRef } from './remotes.mjs';
import { scopeOf } from './select-tests.mjs';
import { runRecord } from './worktrees.mjs';

const RECORDS = ':(glob)docs/design/*/run.json';
/** One trailer line: a key of letters and hyphens, a colon, a space, a value on the same line. */
const TRAILER = /^[A-Za-z][A-Za-z-]*: \S.*$/;
/** How long a slice's open PR is polled for GitHub to read it merged (L5). */
const MERGE_WAIT_MS = 30_000;

export { git };

/** The real `gh`, argv only, run without a shell in `cwd`. */
export const ghIn = (cwd) => (args) => execFileSync('gh', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });

// A command string, not a file and arguments: `npm` is `npm.cmd` on Windows and needs a shell.
export const installWithNpm = (cwd) => execSync('npm ci', { cwd, stdio: 'ignore', windowsHide: true });

/** A run record row's `S<n> <title>` as the slice merge's subject, `feat(<slug>): S<n> <title>`, the title lower-case first (A3). */
export function sliceSubject(slug, row) {
  return `feat(${slug}): ${String(row.slice).replace(/^(S\d+\w*\s+)(\S)/, (_, n, first) => n + first.toLowerCase())}`;
}

/**
 * The subject of `slice`'s merge onto `feat/<slug>`, from the row of the run record in `cwd`
 * whose `branch` is the slice; never from a PR (pilot-develop-line spec 3). With no record
 * there, or a head that is not `feat/`, the merge reads `Merge <slice>`. A record with no row
 * naming the slice throws: the slice is not this run's.
 */
function subjectOf(cwd, head, slice) {
  const found = recordIn(cwd, head);
  if (!found) return `Merge ${slice}`;
  const row = found.record.slices?.find((r) => r.branch === slice);
  if (!row) throw new Error('no run record row names it');
  return sliceSubject(found.slug, row);
}

/** The run record in `cwd` of `head`, a `feat/<slug>`: `{ slug, record }`, or null with no record there or another head. */
function recordIn(cwd, head) {
  const slug = /^feat\/(.+)$/.exec(head ?? '')?.[1];
  const file = slug && path.join(cwd, runRecord(slug));
  if (!file || !fs.existsSync(file)) return null;
  return { slug, record: JSON.parse(fs.readFileSync(file, 'utf8')) };
}

/**
 * `pass` and `fail` from a `node --test` summary, spec (ℹ) or TAP (#); null when absent. The
 * last of each: the run's own summary closes the output, after any a test printed.
 */
function countsOf(output) {
  const last = (re) => [...output.matchAll(re)].at(-1)?.[1];
  const pass = last(/^\s*[#ℹ]\s*pass\s+(\d+)/gm);
  const fail = last(/^\s*[#ℹ]\s*fail\s+(\d+)/gm);
  return pass === undefined || fail === undefined ? null : `${pass} pass, ${fail} fail`;
}

/**
 * Runs the shell command `test` in `cwd` with its stdout and stderr to
 * `<home>/.claude/pilot/logs/<stamp>-<label>.log`, read back once it exits (clean-landing L8):
 * `{ status, counts, failing, log, scope }`, `counts` null without a summary, `scope` the last
 * scope line the run printed (`scopeOf`) or null. The log is kept on red,
 * for the red line to name, and removed on green. `label` is reduced to `[\w.@-]`, so it names
 * a file in the logs directory and nothing else. The suite runs inside a gate slot (process-gc
 * L8), freed red, green or thrown; `slots` goes to `takeSlot` (a test's lock directory). `slot`
 * false, for a selecting command, takes none and sets no `PILOT_GATE_SLOT`, so a gate inside
 * that falls back to the full suite takes its own (suite-at-landing L9).
 */
export function runTests(cwd, test, { label = 'tests', home = os.homedir(), slots = {}, slot: inSlot = true } = {}) {
  const dir = path.join(home, '.claude', 'pilot', 'logs');
  privateDir(path.dirname(dir)); // the store, if this is its first writer (L6)
  fs.mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[-:.]/g, '');
  const log = path.join(dir, `${stamp}-${String(label).replace(/[^\w.@-]/g, '-')}.log`);
  // A new file, the user's alone: it holds the suite's whole output, and O_EXCL follows no link.
  const fd = fs.openSync(log, 'wx', 0o600);
  let run;
  let slot;
  try {
    if (inSlot) slot = takeSlot({ cwd, env: process.env, ...slots });
    const env = slot ? { ...process.env, PILOT_GATE_SLOT: String(slot.slot) } : process.env;
    run = spawnSync(test, { cwd, shell: true, env, stdio: ['pipe', fd, fd], windowsHide: true });
  } finally {
    slot?.release();
    fs.closeSync(fd);
  }
  const output = fs.readFileSync(log, 'utf8');
  const status = run.status ?? run.error?.code ?? run.signal;
  if (status === 0) fs.rmSync(log, { force: true });
  return { status, counts: countsOf(output), failing: failingNames(output), log, scope: scopeOf(output) };
}

/** How many failing tests a red line names before it counts the rest. */
const NAMED = 3;

/** `<label> merged red: <counts>; failing: <name>, <name> (+n more); log <path>`, from a `runTests` answer. */
export function redLine(label, run) {
  const names = run.failing.slice(0, NAMED).join(', ');
  const more = run.failing.length > NAMED ? ` (+${run.failing.length - NAMED} more)` : '';
  const failing = run.failing.length ? `; failing: ${names}${more}` : '';
  return `${label} merged red: ${run.counts ?? `exit ${run.status}`}${failing}; log ${run.log}`;
}

/** A full object name, sha-1 or sha-256, as `git rev-parse` prints it: the only text composed into a command. */
const FULL_SHA = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;

/**
 * The repository's own test command, `{ command, selected }`: with `since` and a package.json
 * whose scripts have `test:changed`, `npm run test:changed -- --since=<sha>`, selected (A5);
 * else `npm test` where there is a package.json, else the repository's own
 * `git config --local pilot.test` (no includes, no environment), both full; else undefined.
 * Never a command-line argument (ADR 0110; install-allow-land L9, L11), so an allowed merge
 * command carries no shell text of its own; `since` must be a full sha (callers pass
 * `rev-parse` output; L10) and anything else throws, so the command carries hex only.
 */
export function testCommand(cwd, { since } = {}) {
  if (since !== undefined && !FULL_SHA.test(since)) throw new Error(`since is not a full sha: ${JSON.stringify(since)}`);
  if (hasPackage(cwd)) {
    if (since !== undefined && typeof packageScripts(cwd)['test:changed'] === 'string') {
      return { command: `npm run test:changed -- --since=${since}`, selected: true };
    }
    return { command: 'npm test', selected: false };
  }
  const config = spawnSync('git', ['config', '--local', '--no-includes', '--get', 'pilot.test'], { cwd, encoding: 'utf8', windowsHide: true });
  return config.status === 0 && config.stdout.trim() ? { command: config.stdout.trim(), selected: false } : undefined;
}

/** package.json's `scripts`, or none when it is unreadable or holds no object there: the full command then. */
function packageScripts(cwd) {
  try {
    const scripts = JSON.parse(fs.readFileSync(path.join(cwd, 'package.json'), 'utf8')).scripts;
    return scripts && typeof scripts === 'object' ? scripts : {};
  } catch {
    return {};
  }
}

/** Why a merge command with no test command stops before anything moves. */
export const NO_TEST = 'no package.json here; set git config pilot.test "<command>"';

/**
 * `runTests` on the injected `test` as given, in a slot; absent, on the repository's own command
 * since `since`, the tip before the merge (suite-at-landing L4), a selection taking no slot (L9).
 */
function runChosen(cwd, test, since, label) {
  const chosen = test === undefined ? testCommand(cwd, { since }) : { command: test, selected: false };
  if (chosen === undefined) throw new Error(NO_TEST);
  return runTests(cwd, chosen.command, { label, slot: !chosen.selected });
}

/** A green run's `<counts>`, then `; <scope>` when it printed one. */
const summaryOf = (run) => `${run.counts ?? `exit ${run.status}`}${run.scope ? `; ${run.scope}` : ''}`;

/**
 * The failing tests' names, from the spec reporter's ✖ lines or TAP's `not ok`, at the start
 * of a line only: an indented one is a subtest's, or a line inside another test's failure dump.
 */
export function failingNames(output) {
  const names = new Set();
  for (const line of output.split(/\r?\n/)) {
    const spec = /^✖\s+(.+?)(?:\s+\([\d.]+m?s\))?\s*$/.exec(line);
    const tap = /^not ok \d+ - (.+?)\s*$/.exec(line);
    const name = spec?.[1] ?? tap?.[1];
    if (name && name !== 'failing tests:') names.add(name);
  }
  return [...names];
}

const hasPackage = (cwd) => fs.existsSync(path.join(cwd, 'package.json'));

function needsInstall(cwd, start) {
  if (!hasPackage(cwd)) return false;
  const lockMoved = git(cwd, 'diff', '--cached', '--name-only', start, '--', 'package-lock.json') !== '';
  return lockMoved || !fs.existsSync(path.join(cwd, 'node_modules'));
}

const commit = (cwd, message, trailers) =>
  git(cwd, 'commit', '-q', '-m', message, ...trailers.flatMap((line) => ['--trailer', line]));

/**
 * Commit whatever run.json the deck wrote under docs/design/ as `chore(<slug>): run
 * record`. Answers whether there was one to commit. Shared with `pilot handoff`.
 */
export function commitRecords(cwd, trailers = []) {
  const records = git(cwd, 'ls-files', '-m', '-o', '--exclude-standard', '--', RECORDS);
  if (records === '') return false;
  const files = records.split('\n');
  git(cwd, 'add', '--', ...files);
  commit(cwd, `chore(${files[0].split('/')[2]}): run record`, trailers);
  return true;
}

/** `git` as `remotes.mjs` takes it: argv only, in `cwd`, throwing with git's exit code as `status`. */
const gitIn = (cwd) => (args) => git(cwd, ...args);

/**
 * The pilot branch on the run remote, or the local one in local mode (pilot-branch spec 3;
 * pilot-fork spec 4; L5): `{ ref }`. No PR is read for it. Throws naming `pilot base` when there
 * is no pilot branch there; there is no fallback to the default branch.
 */
function pilotBase(cwd, runs = runRemote(gitIn(cwd))) {
  const ref = runRef(runs, PILOT_BRANCH);
  if (!holds(cwd, ['rev-parse', '-q', '--verify', `${ref}^{commit}`])) {
    throw new Error(`no ${shortRef(ref)} (run pilot base first)`);
  }
  return { ref: shortRef(ref) }; // short, so an unset pilot.remote merges with today's argv (L3)
}

/**
 * The base every integration takes (pilot-develop-line spec 4a; L6): with the checked-out
 * `feat/<slug>`'s run record saying `base: feat/<N>` and no landing merge of N on pilot yet,
 * N's tip on origin, `{ ref: 'origin/feat/<N>', chained: 'feat/<N>' }`; else `pilotBase`'s
 * `{ ref }`. The base is the record's, never read from ancestry; a record base that is neither
 * pilot nor `feat/<slug>` throws. `runs` is `runRemote`'s answer, read here when not given.
 */
export function baseOf(cwd, runs = runRemote(gitIn(cwd))) {
  const pilot = pilotBase(cwd, runs);
  let head;
  try {
    head = git(cwd, 'symbolic-ref', '-q', '--short', 'HEAD');
  } catch {} // detached: no record to read, so pilot
  const base = recordIn(cwd, head)?.record.base;
  if (base === undefined || base === PILOT_BRANCH) return pilot;
  if (typeof base !== 'string' || !RUN_BASE.test(base)) throw new Error(`run record base ${JSON.stringify(base)} is not ${PILOT_BRANCH} or feat/<slug>`);
  // Any landing of N on pilot ends the chain, contained in HEAD or not, so it never comes back.
  if (landingsOf(cwd, base, pilot.ref).length) return pilot;
  return { ref: shortRef(runRef(remoteOf(runs, base), base)), chained: base };
}

/** The message of the merge `pilot land` writes onto the pilot branch. */
export const landingMessage = (head) => `Merge ${head} into ${PILOT_BRANCH}`;

/** `head`'s landing merges on `ref`'s first-parent history: two-parent commits subjected `landingMessage(head)`. */
function landingsOf(cwd, head, ref) {
  const subject = landingMessage(head);
  return git(cwd, 'log', '--first-parent', '--format=%H %P%x00%s', ref)
    .split('\n')
    .map((line) => line.split('\0'))
    .filter(([ids, s]) => s === subject && ids.split(' ').length === 3)
    .map(([ids]) => ids.split(' ')[0]);
}

/**
 * Whether `landingMessage(head)` is the subject of a two-parent commit on the pilot branch's (`ref`, default `pilotBase`'s)
 * first-parent history that HEAD does not contain: the feature has landed (a landed feature
 * never holds its own landing, L6). Read from git alone, never the deck; a message reaching
 * pilot only as a second parent, a one-parent commit, or a branch cut after it does not count.
 */
export function landedOnPilot(cwd, head, ref = pilotBase(cwd).ref) {
  return landingsOf(cwd, head, ref).some((id) => git(cwd, 'rev-list', '-n', '1', id, '^HEAD') !== '');
}

/**
 * Integrate one slice branch, or with none take the base alone. `test` is the shell
 * command, run as given (default the repository's own since the tip before the merge, `runChosen`), `push` false keeps origin untouched, `trailers` are
 * `Key: value` lines for every commit made, `wait` the ms a pushed slice's open PR is polled
 * before it is kept. `install` and `gh` are the calls
 * out to other tools, replaceable for a test. Answers `{ ok, line, failing }`, plus `code` 2 when it was refused for want of a test command.
 */
export function integrate(branch, options = {}) {
  const {
    cwd = process.cwd(),
    test,
    push = true,
    trailers = [],
    gh = ghIn(cwd),
    install = installWithNpm,
    wait = MERGE_WAIT_MS,
  } = options;
  const slice = branch?.replace(/^origin\//, '');
  const not = slice ? `NOT integrated ${slice}` : 'base NOT taken';

  // Outside npm and without git config pilot.test there is no test command (A5): stop before anything moves.
  if (test === undefined && testCommand(cwd) === undefined) {
    return { ok: false, line: `${not}: ${NO_TEST}`, failing: [], code: 2 };
  }
  // Each trailer is one `Key: value` line (`.` matches no CR or LF), so no value forges a second, such as a Reviewed-by.
  const forged = trailers.map(String).find((line) => !TRAILER.test(line));
  if (forged !== undefined) {
    return { ok: false, line: `${not}: trailer ${forged.split(/[:\r\n]/)[0]} is not one "Key: value" line; nothing merged or pushed`, failing: [] };
  }

  // The branch every push names, checked before anything is merged onto it.
  let head;
  let subject;
  try {
    head = git(cwd, 'symbolic-ref', '--short', 'HEAD');
    if (head.toLowerCase() === PILOT_BRANCH) throw new Error(`refusing to integrate onto ${PILOT_BRANCH}: pilot land is the only way onto it`);
    assertPushable(head, { git: (args) => git(cwd, ...args) });
    // The merge's subject, from the run record before any merge: a slice it does not name is refused here.
    if (slice) subject = subjectOf(cwd, head, slice);
  } catch (err) {
    return { ok: false, line: `${not}: ${firstLine(err)}; nothing merged or pushed`, failing: [] };
  }

  let runs;
  let base;
  let name;
  let taken;
  let landed;
  try {
    // `pilot` and the slice live on the run remote (L1); `feat/` is only ever on origin.
    runs = runRemote(gitIn(cwd));
    // --prune: a pilot branch deleted on a remote must not survive as a stale tracking ref.
    git(cwd, 'fetch', '-q', '--prune', 'origin');
    if (runs !== null && runs !== 'origin') git(cwd, 'fetch', '-q', '--prune', runs);
    base = baseOf(cwd, runs);
    name = base.chained ?? PILOT_BRANCH;
    taken = `${name}@${git(cwd, 'rev-parse', '--short', base.ref)}`;
    // A chained run cannot have landed: its base N has not (L5).
    landed = !base.chained && landedOnPilot(cwd, head, base.ref);
  } catch (err) {
    return { ok: false, line: `${not}: ${firstLine(err)}; nothing merged or pushed`, failing: [] };
  }
  const start = git(cwd, 'rev-parse', 'HEAD');
  // Back to where this call began, a merge in progress included; local edits neither
  // merge touched, such as the run.json the deck wrote, are kept.
  // A gate may rewrite a file the merge staged, and `reset --merge` then refuses ("not uptodate"):
  // the staged paths are restored first. Returns '' or the line's suffix naming a reset that failed.
  const reset = () => {
    const staged = spawnSync('git', ['diff', '--cached', '--name-only', '-z', '--diff-filter=d', '--', '.', ':(exclude,glob)docs/design/*/run.json'], { cwd, encoding: 'utf8', windowsHide: true });
    const paths = staged.status === 0 ? staged.stdout.split('\0').filter(Boolean) : [];
    if (paths.length) spawnSync('git', ['checkout', '--pathspec-from-file=-', '--pathspec-file-nul'], { cwd, input: paths.join('\0'), windowsHide: true });
    const back = spawnSync('git', ['reset', '-q', '--merge', start], { cwd, encoding: 'utf8', windowsHide: true });
    if (back.status === 0) return '';
    return `; reset failed (${firstLine({ stderr: back.stderr, message: `exit ${back.status}` })}): ${cwd} is left mid-merge`;
  };
  // A red return: the line, then the merge in hand undone, its failure named on the line.
  const fail = (line, failing = []) => ({ ok: false, line: line + reset(), failing });

  try {
    // `git merge` has no --trailer: the trailers go in as the message's last paragraph.
    if (!landed) git(cwd, 'merge', '-q', '--no-ff', '-m', `Merge base ${name}`, ...(trailers.length ? ['-m', trailers.join('\n')] : []), base.ref);
  } catch (err) {
    const stuck = reset();
    // A branch carrying pilot's commits as copies conflicts with their originals: say how
    // many. The count only adds to the line; git failing to give it leaves the line as it was.
    let copies = 0;
    try {
      copies = pilotLineage(cwd, start).copies ?? 0;
    } catch {}
    const are = copies === 1 ? 'commits is a copy' : 'commits are copies';
    const carried = copies ? `; ${copies} of ${head}'s ${are} of ${PILOT_BRANCH}'s` : '';
    return { ok: false, line: `${not}: taking base ${name} stopped (${firstLine(err)}); not pushed${carried}${stuck}`, failing: [] };
  }

  if (slice) {
    try {
      git(cwd, 'merge', '--no-ff', '--no-commit', shortRef(runRef(runs, slice)));
    } catch (err) {
      // A conflict leaves a merge to undo; a branch that does not exist leaves none.
      return fail(`${not}: the merge stopped (${firstLine(err)})`);
    }
    const merging = spawnSync('git', ['rev-parse', '-q', '--verify', 'MERGE_HEAD'], { cwd, windowsHide: true }).status === 0;
    if (!merging) {
      return fail(`${not}: nothing to merge`);
    }
  }

  try {
    if (needsInstall(cwd, start)) install(cwd);
  } catch (err) {
    return fail(`${not}: npm ci failed (${err.message}); not pushed`);
  }
  const merged = slice ?? taken;
  let run;
  try {
    run = runChosen(cwd, test, start, merged);
  } catch (err) {
    // The log could not be written: the merge in hand is undone, as on red.
    return fail(`${not}: the tests could not run (${firstLine(err)}); not pushed`);
  }
  if (run.status !== 0) {
    return fail(`${not}: ${redLine(merged, run)}; not pushed`, run.failing);
  }
  const counts = summaryOf(run);

  try {
    if (slice) commit(cwd, subject, trailers);
  } catch (err) {
    return fail(`${not}: the commit failed (${firstLine(err)}); not pushed`);
  }
  const note = landed ? `base skipped: ${head} is on ${PILOT_BRANCH}` : `base ${taken}`;
  const what = (at) => {
    if (slice) return `integrated ${slice} ${at} (${note})`;
    if (landed) return `${note}, ${at}`;
    return `took ${note} ${at}`;
  };
  let pushed = false;
  const pushHead = () => {
    if (!push) return;
    assertPushable(head, { git: (args) => git(cwd, ...args) });
    git(cwd, 'push', '-q', 'origin', head);
    pushed = true;
  };
  try {
    // A landed feature with no slice merged nothing: nothing to push unless a record is committed.
    if (slice || !landed) pushHead();
    if (commitRecords(cwd, trailers)) pushHead();
  } catch (err) {
    // The merge is committed locally by now; say so, in one line, rather than a stack.
    const tip = git(cwd, 'rev-parse', '--short', 'HEAD');
    return { ok: false, line: `${what(`locally at ${tip}`)}: ${counts}; push or record failed (${firstLine(err)})`, failing: [] };
  }
  const tip = git(cwd, 'rev-parse', '--short', 'HEAD');
  let said = 'not pushed (--no-push)';
  if (push) said = pushed ? 'pushed' : 'nothing to push';
  // A feature branch merged in is not a slice: only a run branch's is ever deleted here.
  const pruned = slice && pushed && runs !== null && !/^feat\//i.test(slice) ? pruneSlice(cwd, gh, slice, head, wait) : '';
  return { ok: true, line: `${what(`at ${tip}`)}: ${counts}; ${said}${pruned}`, failing: [] };
}

/**
 * `pilot integrate --trial` (one-integration-line spec 1; L5, A2): the feature branch checked out
 * is pushed (never forced) and its tip tried on the run remote's pilot as fetched (`trialOnPilot`),
 * so QA learns of a conflict before it posts its gate2. Nothing is merged into the branch, no test
 * runs and origin/main is never read. Clean: `on pilot: clean at <sha7>`, the sha the gate2 names.
 * A conflict: the lander's line naming the kept `-land-` dir, `code` 3. Anything else that stops
 * it: `trial NOT run: <why>`.
 */
export function trial({ cwd = process.cwd() } = {}) {
  let head;
  let tip;
  let tried;
  try {
    head = git(cwd, 'symbolic-ref', '--short', 'HEAD');
    if (head.toLowerCase() === PILOT_BRANCH) throw new Error(`refusing to try ${PILOT_BRANCH} on itself: pilot land is the only way onto it`);
    assertPushable(head, { git: (args) => git(cwd, ...args) });
    const runs = runRemote(gitIn(cwd));
    // --prune: a pilot branch deleted on a remote must not survive as a stale tracking ref.
    git(cwd, 'fetch', '-q', '--prune', 'origin');
    if (runs !== null && runs !== 'origin') git(cwd, 'fetch', '-q', '--prune', runs);
    tip = git(cwd, 'rev-parse', 'HEAD');
    git(cwd, 'push', '-q', 'origin', head);
    tried = trialOnPilot({ cwd, head });
  } catch (err) {
    return { ok: false, line: `trial NOT run: ${firstLine(err)}`, failing: [] };
  }
  if (tried.clean) return { ok: true, line: `on ${PILOT_BRANCH}: clean at ${tip.slice(0, 7)}`, failing: [] };
  return { ok: false, line: conflictLine({ head, onto: PILOT_BRANCH, paths: [conflictPaths(tried.paths)], dir: tried.dir }), failing: [], code: 3 };
}

/**
 * The feature's tip tried on pilot by `pilot integrate --trial` (lander spec 2, 3; L6), so QA learns
 * of a conflict before it posts: `cleanOnPilot` holds, `{ clean: true }`; otherwise the landing's
 * merge is prepared in the kept `<checkout>-land-<slug>` the press reuses (`mergeIntoPilot`,
 * `push` false), left mid-merge on pilot's tip for the lander: `{ paths, dir }`. A dir already
 * there is the lander's and is not touched. Pilot never moves. Throws when git could not answer.
 */
export function trialOnPilot({ cwd, git = gitIn(cwd), head }) {
  const tip = git(['rev-parse', 'HEAD']);
  // This worktree's own git, not the deck post path's 5 s deadline: integrate waits on its gate anyway.
  const clean = cleanOnPilot(cwd, tip, { git: (_repo, args) => git(args) });
  if (clean.ok) return { clean: true };
  if (clean.why !== undefined) throw new Error(clean.why);
  const dir = keptDir(mainCheckout(git), head);
  if (fs.existsSync(dir)) return { paths: clean.paths, dir };
  try {
    mergeIntoPilot({ cwd, git, source: tip, message: landingMessage(head), label: head, keep: dir, push: false });
  } catch (err) {
    if (err.exitCode === 3 && err.dir === dir) return { paths: err.paths, dir };
    throw err;
  }
  return { clean: true }; // only generated files conflicted: the prepared merge is committed in `dir`
}

/**
 * The pushed slice through `deleteMerged` into `head`: `; deleted <slice>`, `; kept <slice>: <why>`,
 * or nothing when the slice is not on its remote. A failure keeps it and names why.
 */
function pruneSlice(cwd, gh, slice, head, wait) {
  try {
    const { deleted, kept } = deleteMerged({ git: gitIn(cwd), gh, select: (name) => name === slice, into: head, wait });
    if (deleted.includes(slice)) return `; deleted ${slice}`;
    return kept.length ? `; kept ${slice}: ${kept[0].why}` : '';
  } catch (err) {
    return `; kept ${slice}: ${firstLine(err)}`;
  }
}

/**
 * `pilot integrate [<branch>] [--no-push] [--trailer "<line>"]...`, or `pilot integrate --trial`
 * alone (`trial`); any other flag, `--default` among them, is a usage error. `inject` is `integrate`'s options, for a test.
 */
export function main(argv, inject = {}) {
  const options = { trailers: [] };
  let branch;
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--no-push') options.push = false;
    else if (argv[i] === '--trial') options.trial = true;
    else if (argv[i] === '--trailer') options.trailers.push(argv[++i]);
    else if (argv[i].startsWith('-')) options.unknown = true;
    else branch ??= argv[i];
  }
  const trialMixed = options.trial && (branch !== undefined || options.push === false || options.trailers.length > 0);
  if (options.unknown || options.trailers.includes(undefined) || trialMixed) {
    process.stderr.write('usage: pilot integrate [<slice-branch>] [--no-push] [--trailer "<line>"]... | pilot integrate --trial\n');
    return 1;
  }
  const result = options.trial ? trial(inject) : integrate(branch, { ...inject, ...options });
  // The red line names the first NAMED; each one past them once, below it.
  process.stdout.write(`${[result.line, ...result.failing.slice(NAMED).map((name) => `  failing: ${name}`)].join('\n')}\n`);
  return result.ok ? 0 : (result.code ?? 1);
}
