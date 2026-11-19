/**
 * `pilot land` — puts the finished feature on the pilot branch (pilot-branch spec 2, 4,
 * 6; red-lands-on-pilot spec 1, 3, 4; L2, L7). Run in the `feat/<slug>` worktree:
 *
 *   refuse unless HEAD is a feat/ branch; fast-forward to origin/feat/<slug> (`catchUp`);
 *   push feat/<slug> to origin, never
 *   forced; merge its tip into pilot with `mergeIntoPilot` (a temporary worktree at the run
 *   remote's pilot, `Merge feat/<slug> into pilot`, the tests, a push never forced, or the
 *   local pilot moved under `none`; pilot-fork spec 4, L1, L3). When pilot moved meanwhile,
 *   fetch and merge again once; still moving, stop and ask. Landed, delete the run's merged
 *   design/fix/qa branches on the run remote (`deleteRunBranches`), then clear the run's
 *   merged-clean worktrees from the main checkout (`clear`), except feat/<slug> and qa/<slug>,
 *   which stay as `kept concluding` for the agents still working in them.
 *
 * The feature never takes pilot, so it never carries a later feature; pilot grows by merge
 * commits only. No PR is merged: the feature's PR against pilot reads merged from the push
 * and takes the landing comment, never a close, and main gets pilot through the one open PR `pilot → main`
 * (`releasePr`, one-integration-line A1, A5, A6), which the user merges. Every failure
 * throws with `exitCode` 3 for a conflict merging into pilot, 1 otherwise.
 */

import fs from 'node:fs';
import path from 'node:path';

import { hostFor } from '../deck/host.mjs';
import { deleteMerged } from './branches.mjs';
import { assertPushable, firstLine, holds, PILOT_BRANCH } from './pilot-branch.mjs';
import { baseOf, chainLanded, commitRecords, git as gitAt, landingMessage } from './integrate.mjs';
import { conflictLine, conflictPaths, keptDir, mainCheckout } from './merge-generated.mjs';
import { afterGreen } from './land-adr.mjs';
import { releasePr } from './release.mjs';
import { runRef, runRemote } from './remotes.mjs';
import { prBase } from './stack.mjs';
import { isWorktreeOf, mergeIntoPilot, removeWorktree, resume } from './sync.mjs';
import { holderFrom, prune, runRecord } from './worktrees.mjs';

const fail = (message, exitCode = 1) => Object.assign(new Error(`NOT landed: ${message}`), { exitCode });

/** A failed push's reason: git's ` ! [rejected]`, `error:` or `fatal:` line, not its `To <url>`. */
const reason = (err) =>
  String(err.stderr ?? '').split('\n').find((line) => /^\s*!|^(error|fatal):/.test(line))?.trim() ?? firstLine(err);

/**
 * Lands the feature checked out in `cwd` on the run remote's pilot branch (`runRemote`). `git` is
 * `(args) => string` run in `cwd`, `host` the **Host** (`hostFor(cwd)` by default, null at `none`,
 * where nothing is commented or retargeted), `test` the
 * shell command, the repository's own by default. Answers `{ head, sha, retried, already, adr, host,
 * commentFailed?, stillOpen?, retargeted, main, pushSkipped?, deleted, kept, deleteFailed?, cleared }` for a legacy run (record base
 * pilot, audit-f14 A3); for any other base `feature` (`featurePr`'s) in place of `retargeted` and `main`, no release PR touched and
 * no merged poll. `sha` is pilot's tip after, `already` that the feature was on it,
 * `retargeted` `retarget`'s lines (none off origin), a chained feature refused first by `chainGuard`,
 * `adr` the `{ from, to }` the landing allocated or null,
 * `commentFailed` why `landed on pilot at <sha>` is not on the feature's PR, `stillOpen` the PR numbers
 * that still read open after `wait` ms (30 s by default; `sleep` injected), `main` what
 * `releasePr` answers, `pushSkipped` the push fallback taken (three-lanes spec 17), `deleted`, `kept` and
 * `deleteFailed` what `deleteRunBranches` answers, `cleared` the lines `clear` answers, then
 * `gc`'s (process-gc L14): `() => string[]`, none by default, so only the CLI stops processes.
 * `holder` is `prune`'s (landing-keeps-worktrees L2): none by default, so nothing is held.
 */
export function land({ cwd = process.cwd(), git = (args) => gitAt(cwd, ...args), host, test, gc = () => [], holder, remove = removeWorktree, wait, sleep } = {}) {
  let head;
  try {
    head = git(['symbolic-ref', '--short', 'HEAD']);
  } catch {
    head = 'a detached HEAD';
  }
  if (!head.startsWith('feat/')) throw fail(`${head} is not a feat/ branch; nothing pushed`);
  try {
    assertPushable(head, { git });
  } catch (err) {
    throw fail(`${firstLine(err)}; nothing pushed`);
  }
  // `pilot.host` read before anything moves: a bad value refuses the landing, naming the key (L2).
  if (host === undefined) {
    try {
      host = hostFor(cwd, { git });
    } catch (err) {
      throw fail(`${firstLine(err)}; nothing pushed`);
    }
  }

  const { moved } = catchUp({ cwd, git, head });
  // Said above the landing's line, red or green: the worktree moved either way.
  const caughtUp = moved > 0 ? `caught up ${moved} commits from origin/${head}\n` : '';
  try {
    const landed = landCaughtUp({ cwd, git, host, test, head, wait, sleep });
    const branches = deleteRunBranches({ git, host, head });
    const cleared = clear({ cwd, git, head, holder, remove });
    return { ...landed, ...branches, host, caughtUp, cleared: [...cleared, ...collect(gc)] };
  } catch (err) {
    throw Object.assign(err, { caughtUp });
  }
}

/**
 * Brings the worktree in `cwd` on `head` to `origin/<head>`, fast-forward only (clean-landing
 * L4), so a fix pushed from another worktree is landed, not refused. Answers `{ moved }`, the
 * commits it moved; 0 when origin has no `head` yet, or holds nothing the worktree lacks.
 * Throws, exit 1, on a diverged branch, naming both SHAs, and, when behind, on tracked changes,
 * naming the files, but for the deck's run.json mirror, which is discarded; untracked files are not changes, but an ignored one at a path origin adds
 * is refused by name, since git's fast-forward overwrites it silently. Never a rebase, a merge
 * commit, a reset or a stash.
 */
export function catchUp({ cwd, git, head }) {
  const ask = (args) => {
    try {
      return git(args);
    } catch (err) {
      throw fail(`git ${args[0]} failed (${firstLine(err)}); nothing pushed`);
    }
  };
  ask(['fetch', '-q', '--prune', 'origin']);
  // Empty when origin has no `head` yet; a git that cannot answer throws, never reads as absent.
  const theirs = ask(['for-each-ref', '--format=%(objectname)', `refs/remotes/origin/${head}`]);
  if (!theirs) return { moved: 0 };
  const ours = ask(['rev-parse', 'HEAD']);
  // Commits only ours holds, then only theirs: a git that cannot answer throws, never reads as diverged.
  const [ahead, moved] = ask(['rev-list', '--left-right', '--count', `${ours}...${theirs}`]).split(/\s+/).map(Number);
  if (moved === 0) return { moved: 0 };
  if (ahead > 0) throw fail(`${head} has diverged from origin/${head} (local ${ours.slice(0, 7)}, origin ${theirs.slice(0, 7)}); nothing pushed`);
  const names = (args) => ask(args).split('\0').filter(Boolean);
  // The deck's mirror of the run record is generated (L3): never a change, discarded before the fast-forward.
  const mirror = runRecord(head.slice('feat/'.length));
  const changed = names(['diff', '-z', '--name-only', 'HEAD']);
  const others = changed.filter((p) => p !== mirror);
  if (others.length) throw fail(`${cwd} has uncommitted changes in ${others.join(', ')}; nothing pushed`);
  const added = names(['diff', '-z', '--no-renames', '--name-only', '--diff-filter=A', 'HEAD', theirs]);
  const ignored = added.length ? names(['ls-files', '-z', '--others', '--ignored', '--exclude-standard', '--', ...added.map((p) => `:(literal)${p}`)]) : [];
  if (ignored.length) throw fail(`${cwd} has ignored files origin/${head} would overwrite: ${ignored.join(', ')}; nothing pushed`);
  if (others.length < changed.length) ask(['checkout', '-q', 'HEAD', '--', `:(literal)${mirror}`]);
  try {
    git(['merge', '-q', '--ff-only', theirs]);
  } catch (err) {
    throw fail(`the fast-forward of ${cwd} to origin/${head} stopped (${reason(err)}); nothing pushed`);
  }
  return { moved };
}

/**
 * Once landed (pilot-fork spec 6, 8; L4, L5): deletes the run's merged `design/<slug>`,
 * `fix/<slug>-s<n>`, `slice/<slug>-s<n>` and `qa/<slug>` branches on the run remote through `deleteMerged`, merged
 * meaning into `feat/<slug>`. Only those exact names are selected, never `feat/<slug>` nor a
 * longer slug's `design/<slug>-y`; under `none` there is no remote to delete on (A2). Answers
 * `{ deleted, kept, deleteFailed? }`. Never throws: the feature is already landed.
 */
function deleteRunBranches({ git, host, head }) {
  const slug = head.slice('feat/'.length);
  const numbered = (prefix, name) => name.startsWith(prefix) && /^\d+$/.test(name.slice(prefix.length));
  const ours = (name) => name === `design/${slug}` || name === `qa/${slug}` || numbered(`fix/${slug}-s`, name) || numbered(`slice/${slug}-s`, name);
  try {
    return deleteMerged({ git, host, select: ours, into: head });
  } catch (err) {
    return { deleted: err.deleted ?? [], kept: err.kept ?? [], deleteFailed: firstLine(err) };
  }
}

/**
 * The landing's last step (clean-landing L5, L6, L10): leaves the feature worktree for the
 * main checkout, so this process stands in nothing it removes, and prunes the run's worktrees
 * against the run remote's pilot (the local one under `none`), keeping the feature's and QA's. Answers one line per worktree of the run:
 * `removed <path>`, `kept <state> <path>` (`kept concluding` for those two) or `NOT removed <path>: <reason>`. Never throws: a
 * removal that fails is a line, never a failed landing. The land dir a conflict kept (`keptDir`) goes too, `removed <dir>` or `NOT removed <dir>: <why>`, when it exists.
 */
function clear({ cwd, git, head, holder, remove }) {
  const run = head.slice('feat/'.length);
  try {
    const checkout = git(['worktree', 'list', '--porcelain']).split('\n')[0].replace(/^worktree /, '');
    const inFeature = path.relative(fs.realpathSync.native(cwd), fs.realpathSync.native(process.cwd()));
    if (inFeature !== '..' && !inFeature.startsWith(`..${path.sep}`) && !path.isAbsolute(inFeature)) process.chdir(checkout);
    const pilot = runRef(runRemote(git), PILOT_BRANCH);
    // A branch in the landed pilot goes with -D: its remote copy, git's other judge, may be deleted already.
    const merged = git(['for-each-ref', '--merged', pilot, '--format=%(refname)', 'refs/heads/']).split('\n').map((ref) => ref.slice('refs/heads/'.length));
    const { removed, kept, failed } = prune(checkout, pilot, { run, merged, keep: [`feat/${run}`, `qa/${run}`], holder });
    // The land dir a conflict kept is the landing's own tail: gone once the landing is (lander-tail S3).
    const land = keptDir(checkout, head);
    const landLine = removeLand(remove, checkout, land);
    return [
      ...removed.map((p) => `removed ${p}`),
      ...kept.map(({ path: p, state }) => `kept ${state} ${p}`),
      ...failed.map(({ path: p, reason: why }) => `NOT removed ${p}: ${why.split('\n')[0]}`),
      ...landLine,
    ];
  } catch (err) {
    return [`NOT removed the worktrees of ${run}: ${firstLine(err)}`];
  }
}

/** The land dir's line, or none when it is not there; a removal that throws is a line too, never a failed landing. */
function removeLand(remove, checkout, land) {
  try {
    if (!fs.existsSync(land)) return [];
    // Only a worktree of this repository is removed: a plain directory at the name is someone's.
    if (!isWorktreeOf(checkout, land)) return [`NOT removed ${land}: not a worktree of this repository`];
    return [remove(checkout, land) ? `removed ${land}` : `NOT removed ${land}: still there after the removal`];
  } catch (err) {
    return [`NOT removed ${land}: ${firstLine(err)}`];
  }
}

/** `gc`'s lines; a gc that throws is a line, never a failed landing: the feature is landed (L11). */
function collect(gc) {
  try {
    return gc();
  } catch (err) {
    return [`gc failed: ${firstLine(err)}`];
  }
}

/** The landing once the worktree is caught up: push the feature, merge it into pilot. */
function landCaughtUp({ cwd, git, host, test, head, wait, sleep }) {
  let runs;
  try {
    runs = runRemote(git);
  } catch (err) {
    throw fail(`${firstLine(err)}; nothing pushed`);
  }
  chainGuard({ cwd });
  // A record base of pilot, or none, is a legacy run: it keeps the release PR (audit-f14 A3).
  const recorded = recordBase(cwd, head);
  const legacy = recorded === undefined || recorded === PILOT_BRANCH;
  // The deck's run record rides in the landing merge (lander L10): committed, not discarded.
  commitRecords(cwd);
  const source = git(['rev-parse', 'HEAD']);
  const pushSkipped = pushFeature({ git, head, source });
  const keep = keptDir(mainCheckout(git), head);
  const message = landingMessage(head);
  // The run remote's pilot as last fetched, or the local pilot under `none`.
  const pilotRef = runRef(runs, PILOT_BRANCH);
  for (let retried = false; ; retried = true) {
    const before = git(['rev-parse', pilotRef]);
    const reuse = fs.existsSync(keep) && !holds(cwd, ['merge-base', '--is-ancestor', source, before]) && resume({ cwd, dir: keep, pilotTip: before, source, message, side: 'theirs', refuse: fail, conflict: (left, why) => conflict(head, left, keep, why) });
    let merge;
    try {
      merge = mergeIntoPilot({ cwd, git, source, message, test, label: head, keep, reuse, ...(!legacy && { afterGreen }) });
    } catch (err) {
      if (err.dir) throw conflict(head, err.paths, err.dir, err.why);
      const failed = Object.assign(new Error(`NOT landed: ${err.reason ?? err.message}; ${PILOT_BRANCH} not pushed`, { cause: err }), err);
      // Rejected because pilot moved since the fetch: fetch and merge again once. Anything else stops here.
      if (!err.pushRejected || (runs !== null && !holds(cwd, ['fetch', '-q', '--prune', runs]))) throw failed;
      if (git(['rev-parse', pilotRef]) === before) throw failed;
      if (retried) throw fail(`${PILOT_BRANCH} moved again after one retry; ${head} is pushed, ${PILOT_BRANCH} is not: run pilot land again`);
      continue;
    }
    const landed = { head, sha: merge.sha, retried, already: !merge.merged, adr: merge.adr ?? null, ...(pushSkipped && { pushSkipped }) };
    // A feature already on pilot comments on nothing (spec 2), nor does one with no host (other-host
    // A1). Landed already: neither a refused comment nor an unreadable PR list reads as a failed landing.
    if (host !== null) {
      try {
        // Only a legacy run's PR targets pilot, so only it can read merged from the push (A3).
        const stillOpen = comment({ host, head, sha: merge.sha, counts: merge.counts, already: !merge.merged, wait, sleep, poll: legacy });
        if (stillOpen.length) landed.stillOpen = stillOpen;
      } catch (err) {
        landed.commentFailed = firstLine(err);
      }
    }
    // A main-cut run's PR is its own to main (audit-f14 spec 4): no release PR, no retarget (restack's).
    if (!legacy) return { ...landed, feature: featurePr({ git, host, head, base: recorded }) };
    // Pilot pushed: a chained run's PR based on this feature now shows only its own diff (A6),
    // on the host's origin only, where pilot is.
    const retargeted = runs === 'origin' && host !== null ? retarget({ host, head }) : [];
    // Only now, pilot pushed, and on an already-landed feature too: main gets pilot through one PR (A1).
    return { ...landed, retargeted, main: releasePr({ git, host, already: !merge.merged }) };
  }
}

/** The `base` of `head`'s run record in `cwd`, undefined with no record; a record `chainGuard` read already. */
function recordBase(cwd, head) {
  const file = path.join(cwd, runRecord(head.slice('feat/'.length)));
  if (!fs.existsSync(file)) return undefined;
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')).base;
  } catch (err) {
    throw fail(`run record ${runRecord(head.slice('feat/'.length))} unreadable (${firstLine(err)}); nothing pushed`);
  }
}

/**
 * A main-cut run's hook once the landing merge's suite is green, before anything is pushed
 * (audit-f14 S5 fills it, L7): passed to `mergeIntoPilot` for a non-legacy run. Answers the ADR
 * `{ from, to }` it allocated, or null; its body is `land-adr.mjs`'s.
 */
export { afterGreen };

/**
 * The feature's own PR after a main-cut landing (audit-f14 spec 4): `{ number, base, below? }`, `base`
 * `prBase`'s and `below` the open PR of the `feat/<N>` it stacks on; `{ number: null }` with no host,
 * `{ number: null, why }` when the host cannot say. Never throws: the feature is landed.
 */
function featurePr({ git, host, head, base: recorded }) {
  if (host === null) return { number: null };
  const openOf = (branch) => host.reviews({ head: branch, state: 'open' }).find((pr) => pr.head === branch && pr.crossRepo === false && Number.isSafeInteger(pr.number) && pr.number > 0)?.number;
  try {
    const base = prBase({ git, host, base: recorded });
    const number = openOf(head);
    if (number === undefined) return { number: null, why: `no open PR has head ${head}` };
    const below = base.startsWith('feat/') ? openOf(base) : undefined;
    return { number, base, ...(below !== undefined && { below }) };
  } catch (err) {
    return { number: null, why: firstLine(err) };
  }
}

/**
 * The landing's last line for a main-cut run, which the deck parses (audit-f14 S6), in place of
 * `mainLine`: the feature's own PR and its base, and the PR below it in a stack.
 */
export function featureLine({ number, base, below, why, host }) {
  if (Number.isSafeInteger(number)) return `feature PR: #${number} into ${base}${below === undefined ? '' : ` (after #${below})`}`;
  if (host === null) return 'feature PR: none (no host)';
  return `feature PR: unknown (${String(why).slice(0, 200)})`;
}

/**
 * Refuses, exit 1, a feature built on `feat/<N>` while N has not landed on pilot (pilot-develop-line
 * spec 4b; L6): `baseOf`'s `chained`, read from the run record against the run remote's pilot as
 * last fetched. A record or pilot `baseOf` cannot read refuses too. Never reverts N (A2).
 */
export function chainGuard({ cwd }) {
  let base;
  let landed;
  try {
    base = baseOf(cwd);
    // The chain outlives N's landing for integrate (audit-f14 L5); the guard's end is still that landing.
    landed = base.chained !== undefined && chainLanded(cwd, base.chained);
  } catch (err) {
    throw fail(`${firstLine(err)}; nothing pushed`);
  }
  if (base.chained && !landed) throw fail(`built on ${base.chained}, which has not landed; land it first, or revert it (fix round); nothing pushed`);
}

/**
 * Moves each open feature PR (head `feat/`) based on `head` to pilot, `host.edit(n, { base: 'pilot' })` (spec 4c; A6), and
 * answers one `retargeted #<n> to pilot` line each. Never throws: the feature is landed, so a list or
 * an edit that fails is a `retarget failed` line.
 */
export function retarget({ host, head }) {
  let reviews;
  try {
    reviews = host.reviews({ base: head, state: 'open' });
  } catch (err) {
    return [`retarget failed: ${firstLine(err)}`];
  }
  return reviews
    // A chained feature's PR only: an open slice PR moved to pilot would offer its unreviewed work there.
    .filter((review) => typeof review.head === 'string' && review.head.startsWith('feat/'))
    .map((review) => review.number)
    .filter(Number.isSafeInteger)
    .map((number) => {
      try {
        host.edit(number, { base: PILOT_BRANCH });
        return `retargeted #${number} to ${PILOT_BRANCH}`;
      } catch (err) {
        return `retarget failed for #${number}: ${firstLine(err)}`;
      }
    });
}

/** git's words when origin could not be asked at all, as against a push origin heard and refused. */
const UNREACHABLE = /could not resolve host|unable to access|could not read from remote repository|connection (?:timed out|refused|reset)|operation timed out|the remote end hung up/i;
const unreachable = (err) => {
  const said = `${err.stderr ?? ''}\n${err.message ?? ''}`;
  return UNREACHABLE.test(said) && !/\[(?:remote )?rejected\]/.test(said);
};

/**
 * Pushes `head` to origin, never forced (three-lanes spec 17). A push origin could not be asked
 * for is retried once; still unreachable, it is no failure when origin's `head` as `catchUp` just
 * fetched it is `source` already, and answers the line that says so. Anything else throws.
 */
export function pushFeature({ git, head, source }) {
  for (let tried = 0; ; tried += 1) {
    try {
      git(['push', '-q', 'origin', head]);
      return undefined;
    } catch (err) {
      if (!unreachable(err)) throw fail(`the push of ${head} failed (${reason(err)}); ${PILOT_BRANCH} not pushed`);
      if (tried === 0) continue;
      const theirs = git(['for-each-ref', '--format=%(objectname)', `refs/remotes/origin/${head}`]);
      if (theirs !== source) throw fail(`the push of ${head} failed twice, origin could not be asked (${reason(err)}); ${PILOT_BRANCH} not pushed`);
      // Not git's own words: they name origin's URL, which may carry a credential, on a landing that succeeds.
      return `origin could not be asked for the push; ${head} at ${source.slice(0, 7)} is on origin already`;
    }
  }
}

const conflict = (head, paths, dir, why) => fail(conflictLine({ head, onto: PILOT_BRANCH, paths: [conflictPaths(paths, why)], dir }), 3);

/**
 * Puts `landed on pilot at <sha>`, then `; full suite <counts>` when the feature merge's run
 * printed counts (suite-at-landing L8), on each open or merged PR from this repository whose head
 * is `head`. An open one against pilot is first polled, every `POLL_MS` up to `wait` ms, for
 * GitHub to read it merged from the push (A1); no PR is ever closed. Throws when there is no
 * such PR. `already`, the feature on pilot before this landing, comments on nothing (spec 2).
 * Answers the numbers still reading open after the wait, commented all the same.
 */
export function comment({ host, head, sha, counts, already = false, wait = 30_000, sleep = pause, poll = true }) {
  if (already) return [];
  const ours = host.reviews({ head, state: 'all' }).filter((review) => Number.isSafeInteger(review.number) && review.crossRepo === false && (review.state === 'open' || review.state === 'merged'));
  if (!ours.length) throw new Error(`no open or merged PR has head ${head}`);
  const body = `landed on pilot at ${sha}${counts ? `; full suite ${counts}` : ''}`;
  const stillOpen = [];
  for (const { number, state, base } of ours) {
    if (poll && state === 'open' && base === PILOT_BRANCH && !readsMerged({ host, number, wait, sleep })) stillOpen.push(number);
    host.comment(number, body);
  }
  return stillOpen;
}

const POLL_MS = 2000;

/** Blocks the thread for `ms`; `comment` is synchronous like the rest of the landing. */
const pause = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

/** Whether PR `number` reads MERGED within `wait` ms, asking at least once. */
function readsMerged({ host, number, wait, sleep }) {
  for (let waited = 0; ; waited += POLL_MS) {
    // A read that fails or is unreadable reads as still open: the comment goes all the same.
    try {
      if (host.review(number).state === 'merged') return true;
    } catch {
      return false;
    }
    if (waited >= wait) return false;
    sleep(Math.min(POLL_MS, wait - waited));
  }
}

/**
 * The landing's last line, which the deck's closing report parses (S3): what `releasePr` answered.
 * With no host (`host` null, other-host spec 3) there is no PR to open: pilot is merged into main by hand.
 */
export function mainLine({ number, opened, why, byHand, none, host }) {
  if (number !== null && number !== undefined) return `main gets pilot: #${number}${opened ? ' (opened)' : ''}`;
  if (none) return 'main gets pilot: no open PR';
  if (byHand !== undefined && host === null) return `main gets pilot: merge ${byHand} into main by hand`;
  if (byHand !== undefined) return `main gets pilot: open a PR from ${byHand} to main by hand`;
  return `main gets pilot: unknown (${String(why).slice(0, 200)})`;
}

/** The line before `mainLine` when the release label was refused (S12): its own line, so `mainLine` stays as parsed. */
export function labelLine({ number, labelWhy }) {
  if (number === null || number === undefined || labelWhy === undefined) return '';
  return `release label: ${String(labelWhy).slice(0, 200)}\n`;
}

/** `read` called at most once: every later call answers, or throws, what the first did. */
function once(read) {
  let got;
  return () => {
    if (!got) {
      try {
        got = { table: read() };
      } catch (err) {
        got = { err };
      }
    }
    if (got.err) throw got.err;
    return got.table;
  };
}

/**
 * `pilot land`: exit 0 landed, 1 refused, red or still moving, 3 a conflict; any argument is a
 * usage error. No `--test` (clean-landing L12, ADR 0110): the repository's own test command
 * runs. With `read`, the process table is read once, at the first worktree clear asks about,
 * and that table is `gc`'s argument (L4).
 */
export function main(argv, inject = {}) {
  if (argv.length) {
    process.stderr.write('usage: pilot land\n');
    return 1;
  }
  // `read`, the process table, is read once and shared by clear's holder and `gc` (L4).
  const table = inject.read && once(inject.read);
  const shared = table ? { holder: holderFrom(table), gc: inject.gc && (() => inject.gc(table)) } : {};
  try {
    const { head, sha, retried, already, adr, host, main: mainPr, feature, pushSkipped, commentFailed, stillOpen = [], retargeted = [], deleted, kept, deleteFailed, caughtUp, cleared } = land({ ...inject, ...shared });
    const said = already ? `${head} already on ${PILOT_BRANCH}` : `landed ${head} on ${PILOT_BRANCH}`;
    // Above the main line: the comment that failed, then the number the landing allocated (S8).
    const above = `${commentFailed === undefined ? '' : `pr comment failed: ${commentFailed}\n`}${stillOpen.map((number) => `feature PR #${number} still reads open\n`).join('')}${adr ? `ADR ${adr.from} is ${adr.to}\n` : ''}`;
    // The deck's row keeps only the output's tail (S8): the branch and clear lines go first, so
    // the SHA stays in it, and the main line last, bounded.
    const branches = [
      ...(deleted.length ? [`deleted: ${deleted.join(', ')}`] : []),
      ...(kept.length ? [`kept: ${kept.map(({ branch, why }) => `${branch} (${why})`).join(', ')}`] : []),
      ...(deleteFailed === undefined ? [] : [`branch deletion failed, some may be gone; check the run remote: ${deleteFailed.slice(0, 200)}`]),
      // Each fallback a landing took says so (three-lanes spec 17).
      ...(pushSkipped === undefined ? [] : [pushSkipped]),
      ...retargeted,
    ];
    process.stdout.write(`${caughtUp}${[...branches, ...cleared].map((line) => `${line}\n`).join('')}${said} at ${sha.slice(0, 7)}${retried ? ' (pilot moved; merged again once)' : ''}\n${above}${feature ? featureLine({ ...feature, host }) : `${labelLine(mainPr)}${mainLine({ ...mainPr, host })}`}\n`);
    return 0;
  } catch (err) {
    process.stdout.write(`${err.caughtUp ?? ''}${err.message}\n`);
    return err.exitCode ?? 1;
  }
}
