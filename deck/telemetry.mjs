/**
 * The usage log (ADR 0043): at every half-hour boundary of epoch time (L7) the daemon appends one
 * JSON line to `<storeDir()>/usage.jsonl` with the tokens spent in the half hour just ended, as the
 * one transcript reader counts them (ADR 0042, L3). One file, appended, never rotated (L2). The
 * timer is started by the daemon's `main()` and unref'd (L1), so nothing that imports this ticks.
 * Nothing renders the log (spec 9).
 */

import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import { repoKey } from './items.mjs';
import { namedWorktrees, storeDir } from './store.mjs';
import { addCounts, readWindow } from './transcripts.mjs';
import { readSnapshot } from './usage.mjs';
import { readUsageSwitch } from './usage-switch.mjs';

export const WINDOW_MS = 30 * 60 * 1000;

export const usageLogFile = () => path.join(storeDir(), 'usage.jsonl');

/** The first half-hour boundary strictly after `nowMs`. */
export const nextBoundary = (nowMs) => (Math.floor(nowMs / WINDOW_MS) + 1) * WINDOW_MS;

const iso = (ms) => new Date(ms).toISOString();

const repos = new Map();

/** The `repoKey` of the main checkout git says `cwd` belongs to, or null when it cannot say. */
const gitRepo = (cwd) => new Promise((resolve) => {
  execFile('git', ['rev-parse', '--git-common-dir'], { cwd, timeout: 5000, windowsHide: true }, (err, stdout) => {
    const common = String(stdout ?? '').trim();
    resolve(err || !common ? null : repoKey(path.dirname(path.resolve(cwd, common))));
  });
});

/** Whether `dir` is there; anything but its plain absence reads as there, so it is never guessed for. */
const exists = (dir) => fs.promises.stat(dir).then(() => true, (err) => !['ENOENT', 'ENOTDIR'].includes(err?.code));

/** `dir` is `worktree` or inside it, however a session spelled either. */
const within = (dir, worktree) => {
  const [inner, outer] = [repoKey(dir), repoKey(worktree)];
  return inner === outer || inner.startsWith(outer.endsWith(path.sep) ? outer : outer + path.sep);
};

/**
 * Where a directory that no longer exists was (L19): the repository of the last run whose
 * table or record names it (`namedWorktrees`' order), or an ancestor of it, as a worktree; else, walking up the removed
 * folders only, the first named `<name>-<something>` whose sibling `<name>` git resolves, the
 * longest `<name>` first. Null for a directory that still exists, and when neither can say.
 */
async function removedRepo(cwd) {
  if (await exists(cwd)) return null;
  let named = [];
  try {
    named = namedWorktrees();
  } catch {
    // An unreadable store names nothing here and says so at its every other reader; the folder name still can.
  }
  const record = named.findLast(({ worktree }) => within(cwd, worktree));
  if (record) return repoKey(record.repo);
  for (let dir = cwd; path.dirname(dir) !== dir && !(await exists(dir)); dir = path.dirname(dir)) {
    const name = path.basename(dir);
    for (let dash = name.lastIndexOf('-'); dash > 0; dash = name.lastIndexOf('-', dash - 1)) {
      const repo = await gitRepo(path.join(path.dirname(dir), name.slice(0, dash)));
      if (repo) return repo;
    }
  }
  return null;
}

/**
 * The main checkout a directory belongs to: the parent of its git common dir, so a worktree
 * answers with its repository (L6). Asynchronous with a 5 s timeout, never `execFileSync` in the
 * daemon; a success is cached for the daemon's life. When git cannot say, a removed directory
 * is looked up by `removedRepo` (L19), and anything else is the directory itself; neither is
 * cached, so each is asked again next time. A resolved checkout is its `repoKey`, case-folded
 * on Windows, so one repository is one key however a session spelled its directory.
 */
export function repoOf(cwd) {
  if (!repos.has(cwd)) {
    repos.set(cwd, !path.isAbsolute(cwd) ? Promise.resolve(cwd) : gitRepo(cwd).then(async (repo) => {
      if (repo) return repo;
      repos.delete(cwd);
      return (await removedRepo(cwd)) ?? cwd;
    }));
  }
  return repos.get(cwd);
}

/** `readWindow`'s per-directory counts regrouped by repository, each model summed across its directories. */
async function byRepoOf(byCwd) {
  const byRepo = new Map();
  const resolved = await Promise.all(Object.entries(byCwd).map(async ([cwd, models]) => [await repoOf(cwd), models]));
  for (const [repo, models] of resolved) {
    const sums = byRepo.get(repo) ?? new Map();
    for (const [model, counts] of Object.entries(models)) sums.set(model, sums.has(model) ? addCounts(sums.get(model), counts) : counts);
    byRepo.set(repo, sums);
  }
  return Object.fromEntries([...byRepo].map(([repo, sums]) => [repo, Object.fromEntries(sums)]));
}

/** How far back the first window after a restart reaches at most (A5). */
export const MAX_BACKFILL_MS = 7 * 24 * 60 * 60 * 1000;

/** Enough of the log's end to hold its last line; a longer line reads as unparseable. */
const TAIL_BYTES = 64 * 1024;

/**
 * The last line's `window.to`, from the file's tail alone: the log grows forever (L2), so it is
 * never read whole. Null when the file is absent or its last line is torn or unparseable.
 */
export function lastWindowEnd(file) {
  let fd;
  try {
    fd = fs.openSync(file, 'r');
    const { size } = fs.fstatSync(fd);
    const length = Math.min(size, TAIL_BYTES);
    const buffer = Buffer.alloc(length);
    fs.readSync(fd, buffer, 0, length, size - length);
    const tail = buffer.toString('utf8');
    if (!tail.endsWith('\n')) return null; // empty, or its last line torn
    const to = Date.parse(JSON.parse(tail.slice(tail.lastIndexOf('\n', tail.length - 2) + 1)).window.to);
    return Number.isFinite(to) ? to : null;
  } catch {
    return null;
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
}

/**
 * Appends the line for `[fromMs, toMs)` and says whether it did; a failure goes to stderr, never
 * thrown (spec 8). A torn
 * last line is left as it is and ended, so the new line stands on its own (spec 6).
 */
async function appendWindow(fromMs, toMs, { now, projectsRoot }) {
  try {
    const { total, byModel, byCwd, skippedLines } = await readWindow(fromMs, toMs, { projectsRoot });
    const tokens = { total, byModel, byRepo: await byRepoOf(byCwd) };
    const line = { at: iso(now()), window: { from: iso(fromMs), to: iso(toMs) }, ...readSnapshot(), tokens, skippedLines };
    const file = usageLogFile();
    await fs.promises.mkdir(path.dirname(file), { recursive: true });
    const handle = await fs.promises.open(file, 'a+');
    try {
      const { size } = await handle.stat();
      const { buffer } = size ? await handle.read(Buffer.alloc(1), 0, 1, size - 1) : { buffer: Buffer.from('\n') };
      await handle.appendFile(`${buffer[0] === 0x0a ? '' : '\n'}${JSON.stringify(line)}\n`, 'utf8');
    } finally {
      await handle.close();
    }
    return true;
  } catch (err) {
    console.error(`[deck] usage log: ${err?.message ?? err}`);
    return false;
  }
}

/**
 * Appends a line at every boundary until stopped. The first window starts where the log's last
 * line ended, at most `MAX_BACKFILL_MS` back, and each later one where the one before it did, so
 * windows are contiguous across restarts (L7), except over time the switch was off. A tick still reading when the next is due skips
 * it, and the next that runs covers both. `now` and `schedule` are the clock and the timer,
 * stubbed by tests; a fired tick returns its append so a test can await it.
 */
export function startUsageLog({ now = Date.now, schedule = setTimeout, projectsRoot } = {}) {
  let stopped = false;
  let timer = null;
  let running = false;
  let from = lastWindowEnd(usageLogFile());
  const arm = (afterMs) => {
    const due = nextBoundary(afterMs);
    timer = schedule(() => {
      if (stopped) return undefined;
      // Never the same boundary twice, even when a timer fires a little early.
      arm(Math.max(now(), due));
      // Read at every tick, so `pilot logging off` reaches a running daemon (spec 13). Off reads and
      // writes nothing, and the window it covered is passed over rather than carried.
      const usage = readUsageSwitch();
      if (!usage.enabled) {
        from = due;
        return undefined;
      }
      if (running) return undefined;
      // Never an empty or inverted window, even if the clock went back past the last line.
      let start = Math.min(Math.max(from ?? due - WINDOW_MS, due - MAX_BACKFILL_MS), due - WINDOW_MS);
      // The first window after on starts when it was turned on; `at` is '' when never set.
      const onAt = Date.parse(usage.at);
      if (onAt > start && onAt < due) start = onAt;
      running = true;
      // The start advances only past a written line, so a failed window is carried into the next;
      // never back, past a boundary an off tick set while this one read.
      return appendWindow(start, due, { now, projectsRoot })
        .then((ok) => {
          if (ok && !(from >= due)) from = due;
          // With no log yet there is no last line to carry from, so a failed first start is kept.
          else if (!ok && from === null) from = start;
        })
        .finally(() => {
          running = false;
        });
    }, due - now());
    timer.unref();
  };
  arm(now());
  return {
    stop() {
      stopped = true;
      clearTimeout(timer);
    },
  };
}
