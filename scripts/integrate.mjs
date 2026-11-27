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
 * The base is the pilot branch (pilot-branch spec 3; L5), the default branch for a run cut from it,
 * or a chained run's `feat/<N>` until N's tip is in the default branch (`baseOf`; audit-f14 L5): no PR is read for it,
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
 * branch (pilot-fork spec 6, 8; L4, L5): a slice whose PR does not read MERGED is kept, one with no PR is judged by ancestry, and the line ends `; deleted <slice>` or
 * `; kept <slice>: <why>`. Red, a stop, `--no-push`, local mode (A2) and a `feat/` branch
 * delete nothing.
 */

import { execSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { cleanOnPilot } from '../deck/gate2-base.mjs';
import { hostFor } from '../deck/host.mjs';
import { FULL_SHA } from '../deck/host-github.mjs';
import { processTable } from '../deck/procs.mjs';
import { RUN_BASE } from '../deck/runs.mjs';
import { privateDir } from '../hooks/lib/atomic-write.js';
import { deleteMerged } from './branches.mjs';
import { keptLine, removeTree, worktrees } from './worktree-remove.mjs';
import { behavioursOf } from './check-slices.mjs';
import { checkLine, checksAt } from './checks.mjs';
import { takeSlot } from './gate-slots.mjs';
import { gitView, holdsIn, tipOf } from './git-view.mjs';
import { mergeIntoPilot } from './sync.mjs';
import { conflictLine, conflictPaths, keptDir, mainCheckout } from './merge-generated.mjs';
import { assertPushable, firstLine, git, isPilotBase, isPilotName, landingSubjects, pilotBranch, pilotLineage, remoteDefaultBranch } from './pilot-branch.mjs';
import { remoteOf, runRef, runRemote, shortRef } from './remotes.mjs';
import { scopeOf } from './select-tests.mjs';
import { headOf, nodeMajor, recordRun, worktreeTree } from './test-ledger.mjs';
import { hostPlatform } from '../hooks/lib/platform.js';
import { holderFrom, runRecord } from './worktrees.mjs';

const RECORDS = ':(glob)docs/design/*/run.json';
/** One trailer line: a key of letters and hyphens, a colon, a space, a value on the same line. */
export const TRAILER = /^[A-Za-z][A-Za-z-]*: \S.*$/;

export { git };

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

const SECURITY = 'pilot:security-reviewer';

/**
 * `slice`'s file, `docs/design/<slug>/slices/S<n>.md` from its run record row, as `{ n, text }`;
 * null with no record, row or slice file. Every check that reads the slice file reads it here.
 */
function sliceFileOf(cwd, head, slice) {
  const found = recordIn(cwd, head);
  const n = /^S\d+\w*/.exec(found?.record.slices?.find((r) => r.branch === slice)?.slice ?? '')?.[0];
  const file = n && path.join(cwd, 'docs', 'design', found.slug, 'slices', `${n}.md`);
  if (!file || !fs.existsSync(file)) return null;
  return { n, text: fs.readFileSync(file, 'utf8') };
}

/**
 * Throws when the slice file has a `Reviewers:` line naming `pilot:security-reviewer` and no
 * trailer is that reviewer's `Reviewed-by:`, or its verdict starts `block`: no security verdict,
 * no integration. No slice file: no check.
 */
function assertSecurityVerdict(sliceFile, trailers) {
  if (!sliceFile) return;
  const { n, text } = sliceFile;
  if (!/^Reviewers:.*\bpilot:security-reviewer\b/m.test(text)) return;
  const prefix = `Reviewed-by: ${SECURITY}: `;
  const verdicts = trailers.map(String).filter((line) => line.startsWith(prefix)).map((line) => line.slice(prefix.length));
  if (!verdicts.length) throw new Error(`${n} names ${SECURITY} and no --trailer "${prefix}<verdict>"`);
  if (verdicts.some((v) => /^block/i.test(v))) throw new Error(`${n}: ${SECURITY}'s verdict is block`);
}

/**
 * Throws naming the first behaviour of the slice file's `## Behaviours` (`behavioursOf`) that no
 * trailer `Evidence: B<k> <kind>: <what was seen>` covers, by number alone: the implementer may
 * raise or swap a kind (spec-first spec 2, 8). Each behaviour is checked by its own number, never
 * by a count. An old `## Tests` slice file has no behaviours and needs no evidence (L5); no slice
 * file: no check.
 */
function assertEvidence(sliceFile, trailers) {
  if (!sliceFile) return;
  const evidenced = new Set();
  for (const line of trailers.map(String)) {
    const match = /^Evidence: B(\d+) \w+: \S/.exec(line);
    if (match) evidenced.add(Number(match[1]));
  }
  const missing = behavioursOf(sliceFile.text).find(({ n }) => !evidenced.has(n));
  if (missing) throw new Error(`${sliceFile.n}: B${missing.n} has no --trailer "Evidence: B${missing.n} ${missing.kind}: <what was seen>"`);
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
 *
 * Once the process has exited, one ledger row (`recordRun`; tested-once L3) holds its own status,
 * `where`, `branch` (default the checked-out one), `since` and the tree taken before it started; a
 * throw before the exit writes none. Inside the suite (`PILOT_GATE_HOME_STORE` set) no row is
 * written unless `home` is passed (L8). `minutes` is the run's wall time.
 */
export function runTests(cwd, test, { label = 'tests', where = 'tests', branch, since = null, home, tree, slots = {}, slot: inSlot = true } = {}) {
  const ledgerHome = home ?? (process.env.PILOT_GATE_HOME_STORE ? null : os.homedir());
  home ??= os.homedir();
  // The tree, sha and branch the run starts on, read before it can move them; `tree` is a caller's that just read it.
  let start = null;
  if (ledgerHome !== null) {
    const taken = tree !== undefined ? tree : worktreeTree(cwd);
    // No work tree, no HEAD to ask git about.
    start = { tree: taken, ...(taken === null ? { sha: null, branch: null } : headOf(cwd)) };
  }
  const dir = path.join(home, '.claude', 'pilot', 'logs');
  privateDir(path.dirname(dir)); // the store, if this is its first writer (L6)
  fs.mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[-:.]/g, '');
  const log = path.join(dir, `${stamp}-${String(label).replace(/[^\w.@-]/g, '-')}.log`);
  // A new file, the user's alone: it holds the suite's whole output, and O_EXCL follows no link.
  const fd = fs.openSync(log, 'wx', 0o600);
  let run;
  let slot;
  const started = Date.now();
  try {
    if (inSlot) slot = takeSlot({ cwd, env: process.env, ...slots });
    const env = slot ? { ...process.env, PILOT_GATE_SLOT: String(slot.slot) } : process.env;
    run = spawnSync(test, { cwd, shell: true, env, stdio: ['pipe', fd, fd], windowsHide: true });
  } finally {
    slot?.release();
    fs.closeSync(fd);
  }
  const minutes = Math.round((Date.now() - started) / 600) / 100;
  const output = fs.readFileSync(log, 'utf8');
  const status = run.status ?? run.error?.code ?? run.signal;
  const scope = scopeOf(output);
  if (start !== null) {
    recordRun({
      at: new Date().toISOString(), where, branch: branch ?? start.branch, slug: null, sha: start.sha, tree: start.tree, since, scope,
      exit: status, minutes, platform: hostPlatform(), node: nodeMajor(),
    }, { home: ledgerHome });
  }
  if (status === 0) fs.rmSync(log, { force: true });
  return { status, counts: countsOf(output), failing: failingNames(output), log, scope, minutes };
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
  // An injected command's row says `injected`, a since no request names, so it is never reused.
  return runTests(cwd, chosen.command, { label, where: 'integrate', since: test !== undefined ? 'injected' : chosen.selected ? since : null, slot: !chosen.selected });
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

function needsInstall(cwd, start, view) {
  if (!hasPackage(cwd)) return false;
  const lockMoved = view(['diff', '--cached', '--name-only', start, '--', 'package-lock.json']) !== '';
  return lockMoved || !fs.existsSync(path.join(cwd, 'node_modules'));
}

const commit = (view, message, trailers) => view(['commit', '-q', '-m', message, ...trailers.flatMap((line) => ['--trailer', line])]);

/**
 * Commit whatever run.json the deck wrote under docs/design/ as `chore(<slug>): run
 * record`. Answers whether there was one to commit. Shared with `pilot handoff`. `view`, when
 * given, is the command's view, so the commit goes through it (L3).
 */
export function commitRecords(cwd, trailers = [], view = (args) => git(cwd, ...args)) {
  const records = view(['ls-files', '-m', '-o', '--exclude-standard', '--', RECORDS]);
  if (records === '') return false;
  const files = records.split('\n');
  view(['add', '--', ...files]);
  commit(view, `chore(${files[0].split('/')[2]}): run record`, trailers);
  return true;
}

/** `ref` as a commit, its short SHA: the one argv every existence check and `taken` ask, so one view answers both. */
const verifyShort = (ref) => ['rev-parse', '-q', '--verify', '--short', `${ref}^{commit}`];

/**
 * `ref`'s short SHA, asked as the existence check asked it so the view answers it; a ref that is
 * not a commit asks `rev-parse --short` again, so the line names git's own reason as before.
 */
const shortOf = (git, ref) => {
  try {
    return git(verifyShort(ref));
  } catch {
    return git(['rev-parse', '--short', ref]);
  }
};

/**
 * The pilot branch on the run remote, or the local one in local mode (pilot-branch spec 3;
 * pilot-fork spec 4; L5): `{ ref }`, its name `pilotBranch`'s through `git` (user-pilot-branch L5).
 * No PR is read for it. Throws naming `pilot base` when there is no pilot branch there; there is
 * no fallback to the default branch.
 */
function pilotBase(cwd, runs, git = gitView(cwd)) {
  const ref = runRef(runs === undefined ? runRemote(git) : runs, pilotBranch(git));
  if (!holdsIn(git, verifyShort(ref))) {
    throw new Error(`no ${shortRef(ref)} (run pilot base first)`);
  }
  return { ref: shortRef(ref) }; // short, so an unset pilot.remote merges with today's argv (L3)
}

/**
 * The base every integration takes (pilot-develop-line spec 4a; audit-f14 L5, A7), from the
 * checked-out `feat/<slug>`'s run record: no base or `pilot` (a legacy run, A3) is `pilotBase`'s
 * `{ ref }`; the default branch's own name, as origin says it now, is `{ ref: 'origin/<default>' }`;
 * `feat/<N>` is N's tip on origin, `{ ref: 'origin/feat/<N>', chained: 'feat/<N>' }`, until that tip
 * is in the default branch by ancestry, then the default branch. N's landing on pilot does not end
 * the chain. Any other record base throws. `runs` is `runRemote`'s answer, read here when not given;
 * `git` is the command's view, a new one when not given; `head` the branch checked out, read here when
 * not given (integrate read it before its fetch, a write that empties the view, S9).
 */
export function baseOf(cwd, runs, git = gitView(cwd), head = undefined) {
  if (runs === undefined) runs = runRemote(git);
  if (head === undefined) {
    try {
      head = git(['symbolic-ref', '-q', '--short', 'HEAD']);
    } catch {} // detached: no record to read, so pilot
  }
  const base = recordIn(cwd, head)?.record.base;
  const pilot = pilotBranch(git);
  // A record written before the move says `pilot`: it reads as the pilot branch (L8).
  if (base === undefined || isPilotBase(base, pilot)) return pilotBase(cwd, runs, git);
  if (typeof base !== 'string' || !RUN_BASE.test(base)) throw new Error(`run record base ${JSON.stringify(base)} is not ${pilot}, the default branch or feat/<slug>`);
  const main = remoteDefaultBranch(git);
  const trunk = { ref: `origin/${main}` };
  if (base === main) return trunk;
  if (!/^feat\//.test(base)) throw new Error(`run record base ${JSON.stringify(base)} is not ${pilot}, ${main} or feat/<slug>`);
  const ref = shortRef(runRef(remoteOf(runs, base), base));
  // N's branch gone (deleted on merge, then pruned): no tip to test, so the chain ends only once N has landed on pilot.
  if (!holdsIn(git, verifyShort(ref))) return chainLanded(cwd, base, runs, git) ? trunk : { ref, chained: base };
  return holdsIn(git, ['merge-base', '--is-ancestor', ref, trunk.ref]) ? trunk : { ref, chained: base };
}

/** Whether `feat/<N>`'s landing merge is on the pilot branch's first-parent history, contained in HEAD or not: `chainGuard`'s end of a chain (L5). */
export const chainLanded = (cwd, head, runs, git = gitView(cwd)) => landingsOf(git, head, pilotBase(cwd, runs, git).ref).length > 0;

/** The branch name a base is merged as: `chained`, the pilot branch `pilot` as `pilotBranch` resolved it (`pilotBase`'s exact ref on `runs`), or the default branch of `origin/<default>`. */
const nameOf = (base, runs, pilot) => base.chained ?? (base.ref === shortRef(runRef(runs, pilot)) ? pilot : base.ref.replace(/^origin\//, ''));

/** The message of the merge `pilot land` writes onto the pilot branch `name`. */
export const landingMessage = (head, name) => `Merge ${head} into ${name}`;

/**
 * `head`'s landing merges on `ref`'s first-parent history: two-parent commits subjected with one of
 * `landingSubjects(head, <the pilot branch>)`, so a landing onto the legacy pilot before the move counts (L8).
 */
function landingsOf(git, head, ref) {
  const subjects = landingSubjects(head, pilotBranch(git));
  return git(['log', '--first-parent', '--format=%H %P%x00%s', ref])
    .split('\n')
    .map((line) => line.split('\0'))
    .filter(([ids, s]) => subjects.includes(s) && ids.split(' ').length === 3)
    .map(([ids]) => ids.split(' ')[0]);
}

/**
 * Whether one of `landingSubjects(head, …)` is the subject of a two-parent commit on the pilot branch's (`ref`, default `pilotBase`'s)
 * first-parent history that HEAD does not contain: the feature has landed (a landed feature
 * never holds its own landing, L6). Read from git alone, never the deck; a message reaching
 * pilot only as a second parent, a one-parent commit, or a branch cut after it does not count.
 */
export function landedOnPilot(cwd, head, ref, git = gitView(cwd)) {
  const on = ref === undefined ? pilotBase(cwd, undefined, git).ref : ref;
  return landingsOf(git, head, on).some((id) => git(['rev-list', '-n', '1', id, '^HEAD']) !== '');
}

/**
 * Integrate one slice branch, or with none take the base alone. `test` is the shell
 * command, run as given (default the repository's own since the tip before the merge, `runChosen`), `push` false keeps origin untouched, `trailers` are
 * `Key: value` lines for every commit made. `install`, `host` and `holder` are the calls
 * out to other tools, replaceable for a test. Answers `{ ok, line, failing }`, plus `code` 2 when it was refused for want of a test command.
 */
export function integrate(branch, options = {}) {
  const {
    cwd = process.cwd(),
    test,
    push = true,
    trailers = [],
    host, // the **Host**, null at none; unset, `hostFor(cwd)` when the prune asks
    install = installWithNpm,
    holder = holderFrom(processTable), // a slice tree a live process holds is kept (L4)
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

  // One view for the whole command (land-batching L2): every read and write below goes through it.
  const view = gitView(cwd);
  // The branch every push names, checked before anything is merged onto it.
  let head;
  let subject;
  let pilot;
  try {
    head = view(['symbolic-ref', '--short', 'HEAD']);
    pilot = pilotBranch(view);
    // Any user's pilot branch, the legacy one too (read, never written; L1): only `pilot land` writes one.
    if (isPilotName(head.toLowerCase())) throw new Error(`refusing to integrate onto ${head.toLowerCase()}: pilot land is the only way onto it`);
    assertPushable(head, { git: view });
    // The merge's subject, from the run record before any merge: a slice it does not name is refused here.
    if (slice) subject = subjectOf(cwd, head, slice);
    if (slice) {
      const sliceFile = sliceFileOf(cwd, head, slice);
      assertSecurityVerdict(sliceFile, trailers);
      assertEvidence(sliceFile, trailers);
    }
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
    runs = runRemote(view);
    // --prune: a pilot branch deleted on a remote must not survive as a stale tracking ref.
    view(['fetch', '-q', '--prune', 'origin']);
    if (runs !== null && runs !== 'origin') view(['fetch', '-q', '--prune', runs]);
    base = baseOf(cwd, runs, view, head);
    name = nameOf(base, runs, pilot);
    if (base.chained && !holdsIn(view, verifyShort(base.ref))) throw new Error(`${base.chained} is gone from origin and has not landed on ${pilot}`);
    // Pilot by its full ref, as `pilotBase` checked it: the same argv, so the view answers it.
    taken = `${name}@${shortOf(view, name === pilot ? runRef(runs, pilot) : base.ref)}`;
    // Only a run based on pilot can have landed on it: a chained run's base N has not (L5).
    landed = name === pilot && landedOnPilot(cwd, head, base.ref, view);
  } catch (err) {
    return { ok: false, line: `${not}: ${firstLine(err)}; nothing merged or pushed`, failing: [] };
  }
  const start = view(['rev-parse', 'HEAD']);
  // Back to where this call began, a merge in progress included; local edits neither
  // merge touched, such as the run.json the deck wrote, are kept.
  // A gate may rewrite a file the merge staged, and `reset --merge` then refuses ("not uptodate"):
  // the staged paths are restored first. Returns '' or the line's suffix naming a reset that failed.
  const reset = () => {
    view.forget(); // every git below is a write outside the view (L3)
    const staged = spawnSync('git', ['diff', '--cached', '--name-only', '-z', '--diff-filter=d', '--', '.', ':(exclude,glob)docs/design/*/run.json'], { cwd, encoding: 'utf8', windowsHide: true });
    const paths = staged.status === 0 ? staged.stdout.split('\0').filter(Boolean) : [];
    if (paths.length) spawnSync('git', ['checkout', '--pathspec-from-file=-', '--pathspec-file-nul'], { cwd, input: paths.join('\0'), windowsHide: true });
    const back = spawnSync('git', ['reset', '-q', '--merge', start], { cwd, encoding: 'utf8', windowsHide: true });
    if (back.status === 0) return '';
    return `; reset failed (${firstLine({ stderr: back.stderr, message: `exit ${back.status}` })}): ${cwd} is left mid-merge`;
  };
  // A red return: the line, then the merge in hand undone, its failure named on the line.
  const fail = (line, failing = []) => ({ ok: false, line: line + reset(), failing });

  // A red feature tip takes no slice (ci-gate L4): refused before anything merges or pushes. Only red refuses;
  // green, pending, none and unread leave the line as it was. A host that cannot be built reads as none.
  if (slice && runs !== null) {
    let said;
    try {
      said = checksAt({ host: host === undefined ? hostFor(cwd, { git: view }) : host, sha: start });
    } catch {
      said = { state: 'none' };
    }
    if (said.state === 'red') {
      return { ok: false, line: `${not}: ${checkLine(said)}; fix the feature first; nothing merged or pushed`, failing: [] };
    }
  }

  try {
    // `git merge` has no --trailer: the trailers go in as the message's last paragraph.
    if (!landed) view(['merge', '-q', '--no-ff', '-m', `Merge base ${name}`, ...(trailers.length ? ['-m', trailers.join('\n')] : []), base.ref]);
  } catch (err) {
    const stuck = reset();
    // A branch carrying pilot's commits as copies conflicts with their originals: say how
    // many. The count only adds to the line; git failing to give it leaves the line as it was.
    let copies = 0;
    try {
      copies = pilotLineage(cwd, start, { base: runRef(runs, pilot) }).copies ?? 0;
    } catch {}
    const are = copies === 1 ? 'commits is a copy' : 'commits are copies';
    const carried = copies ? `; ${copies} of ${head}'s ${are} of ${pilot}'s` : '';
    return { ok: false, line: `${not}: taking base ${name} stopped (${firstLine(err)}); not pushed${carried}${stuck}`, failing: [] };
  }

  if (slice) {
    try {
      view(['merge', '--no-ff', '--no-commit', shortRef(runRef(runs, slice))]);
    } catch (err) {
      // A conflict leaves a merge to undo; a branch that does not exist leaves none.
      return fail(`${not}: the merge stopped (${firstLine(err)})`);
    }
    const merging = holdsIn(view, ['rev-parse', '-q', '--verify', 'MERGE_HEAD']);
    if (!merging) {
      return fail(`${not}: nothing to merge`);
    }
  }

  try {
    if (needsInstall(cwd, start, view)) install(cwd);
  } catch (err) {
    return fail(`${not}: npm ci failed (${err.message}); not pushed`);
  }
  const merged = slice ?? taken;
  let run;
  try {
    run = runChosen(cwd, test, start, merged);
    view.forget(); // the test command is git's to touch too, outside the view (L3)
  } catch (err) {
    // The log could not be written: the merge in hand is undone, as on red.
    return fail(`${not}: the tests could not run (${firstLine(err)}); not pushed`);
  }
  if (run.status !== 0) {
    return fail(`${not}: ${redLine(merged, run)}; not pushed`, run.failing);
  }
  const counts = summaryOf(run);

  try {
    if (slice) commit(view, subject, trailers);
  } catch (err) {
    return fail(`${not}: the commit failed (${firstLine(err)}); not pushed`);
  }
  const note = landed ? `base skipped: ${head} is on ${pilot}` : `base ${taken}`;
  const what = (at) => {
    if (slice) return `integrated ${slice} ${at} (${note})`;
    if (landed) return `${note}, ${at}`;
    return `took ${note} ${at}`;
  };
  let pushed = false;
  const pushHead = () => {
    if (!push) return;
    assertPushable(head, { git: view });
    view(['push', '-q', 'origin', head]);
    pushed = true;
  };
  try {
    // A landed feature with no slice merged nothing: nothing to push unless a record is committed.
    if (slice || !landed) pushHead();
    if (commitRecords(cwd, trailers, view)) pushHead();
  } catch (err) {
    // The merge is committed locally by now; say so, in one line, rather than a stack.
    const tip = view(['rev-parse', '--short', 'HEAD']);
    return { ok: false, line: `${what(`locally at ${tip}`)}: ${counts}; push or record failed (${firstLine(err)})`, failing: [] };
  }
  const tip = view(['rev-parse', '--short', 'HEAD']);
  let said = 'not pushed (--no-push)';
  if (push) said = pushed ? 'pushed' : 'nothing to push';
  // A feature branch merged in is not a slice: only a run branch's is ever deleted here.
  const pruned = slice && pushed && runs !== null && !/^feat\//i.test(slice) ? pruneSlice(cwd, host, slice, head, view, holder) : '';
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
  let pilot;
  // One view for the whole command (land-batching L2).
  const view = gitView(cwd);
  try {
    head = view(['symbolic-ref', '--short', 'HEAD']);
    pilot = pilotBranch(view);
    if (isPilotName(head.toLowerCase())) throw new Error(`refusing to try ${head.toLowerCase()} on itself: pilot land is the only way onto it`);
    assertPushable(head, { git: view });
    const runs = runRemote(view);
    // --prune: a pilot branch deleted on a remote must not survive as a stale tracking ref.
    view(['fetch', '-q', '--prune', 'origin']);
    if (runs !== null && runs !== 'origin') view(['fetch', '-q', '--prune', runs]);
    tip = view(['rev-parse', 'HEAD']);
    view(['push', '-q', 'origin', head]);
    tried = trialOnPilot({ cwd, git: view, head });
  } catch (err) {
    return { ok: false, line: `trial NOT run: ${firstLine(err)}`, failing: [] };
  }
  if (tried.clean) return { ok: true, line: `on ${pilot}: clean at ${tip.slice(0, 7)}`, failing: [] };
  return { ok: false, line: conflictLine({ head, onto: pilot, paths: [conflictPaths(tried.paths)], dir: tried.dir }), failing: [], code: 3 };
}

/**
 * The feature's tip tried on pilot by `pilot integrate --trial` (lander spec 2, 3; L6), so QA learns
 * of a conflict before it posts: `cleanOnPilot` holds, `{ clean: true }`; otherwise the landing's
 * merge is prepared in the kept `<checkout>-land-<slug>` the press reuses (`mergeIntoPilot`,
 * `push` false), left mid-merge on pilot's tip for the lander: `{ paths, dir }`. A dir already
 * there is the lander's and is not touched. Pilot never moves. Throws when git could not answer.
 */
function trialOnPilot({ cwd, git, head }) {
  const tip = git(['rev-parse', 'HEAD']);
  // This worktree's own git, not the deck post path's 5 s deadline: integrate waits on its gate anyway.
  const clean = cleanOnPilot(cwd, tip, { git: (_repo, args) => git(args) });
  if (clean.ok) return { clean: true };
  if (clean.why !== undefined) throw new Error(clean.why);
  const dir = keptDir(mainCheckout(git), head);
  if (fs.existsSync(dir)) return { paths: clean.paths, dir };
  try {
    mergeIntoPilot({ cwd, git, source: tip, message: landingMessage(head, pilotBranch(git)), label: head, keep: dir, push: false });
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
function pruneSlice(cwd, host, slice, head, git, holder) {
  return removeSliceTree(cwd, slice, git, holder) + deleteSlice(cwd, host, slice, head, git);
}

/**
 * The worktree on `slice`, if any, through `removeTree`: `; removed <dir>`, `; kept <state> <dir>`, or nothing.
 * No local `slice` in the view's tip snapshot, which `deleteSlice` reads next, means no tree is on it: nothing listed.
 */
function removeSliceTree(cwd, slice, git, holder) {
  let dir = cwd;
  try {
    if (tipOf(git, `refs/heads/${slice}`) === null) return '';
    // removeTree's own git does not go through the view, so the view forgets what it saw.
    git.forget?.();
    const trees = worktrees(cwd);
    if (!trees) return `; ${keptLine(cwd, 'leftover')}`;
    const tree = trees.slice(1).find((t) => t.branch === slice);
    if (!tree) return '';
    dir = tree.path;
    const result = removeTree(cwd, dir, { holder });
    return result.removed ? `; removed ${dir}` : `; ${keptLine(dir, result.kept)}`;
  } catch {
    return `; ${keptLine(dir, 'leftover')}`;
  }
}

/** The pushed slice through `deleteMerged`; see `pruneSlice`. */
function deleteSlice(cwd, host, slice, head, git) {
  try {
    // `fetched` (A3): integrate fetched origin before its merge and pushed `head` itself, so origin's branches
    // are its remote-tracking refs; a slice moved since is refused by the delete's lease, never deleted.
    const { deleted, kept } = deleteMerged({ git, host: host === undefined ? hostFor(cwd, { git }) : host, select: (name) => name === slice, into: head, fetched: true });
    if (deleted.includes(slice)) return `; deleted ${slice}`;
    return kept.length ? `; kept ${slice}: ${kept[0].why}` : '';
  } catch (err) {
    return `; kept ${slice}: ${firstLine(err)}`;
  }
}

/** The real path of the git common dir `cwd` belongs to, or null outside a repository. */
function commonDir(cwd) {
  const found = spawnSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], { cwd, encoding: 'utf8', windowsHide: true });
  if (found.status !== 0) return null;
  try {
    return fs.realpathSync.native(found.stdout.trim());
  } catch {
    return null;
  }
}

/**
 * `pilot integrate [<branch>] [--no-push] [--trailer "<line>"]...`, or `pilot integrate --trial`
 * alone (`trial`), either with `--dir <worktree>` anywhere to run there (deck-writes-github spec 5),
 * so `Bash(pilot integrate *)` matches it with no `cd`; any other flag, `--default` among them, is a
 * usage error, and so is a `--dir` that is not a directory or not a worktree of the repository it
 * is run from. `inject` is `integrate`'s options, for a test.
 */
export function main(argv, inject = {}) {
  const options = { trailers: [] };
  let branch;
  let dir;
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--no-push') options.push = false;
    else if (argv[i] === '--trial') options.trial = true;
    else if (argv[i] === '--trailer') options.trailers.push(argv[++i]);
    else if (argv[i] === '--dir' && dir === undefined) dir = argv[++i] ?? null;
    else if (argv[i].startsWith('-')) options.unknown = true;
    else branch ??= argv[i];
  }
  const trialMixed = options.trial && (branch !== undefined || options.push === false || options.trailers.length > 0);
  if (options.unknown || options.trailers.includes(undefined) || dir === null || trialMixed) {
    process.stderr.write('usage: pilot integrate [<slice-branch>] [--no-push] [--trailer "<line>"]... [--dir <worktree>] | pilot integrate --trial [--dir <worktree>]\n');
    return 1;
  }
  if (dir !== undefined) {
    if (!fs.statSync(dir, { throwIfNoEntry: false })?.isDirectory()) {
      process.stderr.write(`pilot integrate: --dir ${dir} is not a directory\n`);
      return 1;
    }
    // Only a worktree of the repository it is run from: the rule that admits the command never
    // reaches another repository's test command or push.
    const here = commonDir(inject.cwd ?? process.cwd());
    if (here === null || commonDir(dir) !== here) {
      process.stderr.write(`pilot integrate: --dir ${dir} is not a worktree of this repository\n`);
      return 1;
    }
    inject = { ...inject, cwd: path.resolve(dir) };
  }
  const result = options.trial ? trial(inject) : integrate(branch, { ...inject, ...options });
  // The red line names the first NAMED; each one past them once, below it.
  process.stdout.write(`${[result.line, ...result.failing.slice(NAMED).map((name) => `  failing: ${name}`)].join('\n')}\n`);
  return result.ok ? 0 : (result.code ?? 1);
}
