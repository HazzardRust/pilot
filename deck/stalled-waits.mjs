/**
 * The stalled-wait scan (wait-deadlines S3; spec 5, 6, 8, 9; L5-L7, A1, A2, A4): a `bash`/`sh` shell whose script is
 * an unbounded wait, under the `claude` of a live registered run, past the stall age, is stopped with its tree
 * through `gc`, and the run's repository is told. Anything the scan cannot prove is left alone. A command line
 * is only ever tokenised, never run (L8).
 */
import { unboundedWaits } from '../hooks/shell-write-guard.js';
import { gc, stopper } from './gc.mjs';
import { KIND_CHAT, liveTicketOf, sameRepo } from './items.mjs';
import { oneLine } from './one-line.mjs';
import { noteDeck } from './store-items.mjs';
import { listItems } from './store-runs.mjs';
import { holderOfCommand } from './transcripts.mjs';

/** A4: the same 50 minutes as `pilot wait-for`'s cap; a wait older than this under a live registered run is stalled. */
export const STALL_AGE_S = 50 * 60;

const SHELL = /^(?:ba)?sh(?:\.exe)?$/i;
const CLAUDE = /^claude(?:\.exe)?$/i;
const EVAL = /(?:^|[\s;&|(){}])eval '/;
const MARKER_MAX = 200; // as `pilot wait-for` caps `--match` (L8)

/** One argument of a Windows command line from `at`, by `CommandLineToArgvW`'s rules: its text and where it ends. */
function windowsArg(line, at) {
  let text = '';
  let quoted = false;
  let k = at;
  for (; k < line.length; k++) {
    const c = line[k];
    if (c === '\\') {
      let n = 0;
      while (line[k + n] === '\\') n++;
      if (line[k + n] === '"') {
        text += '\\'.repeat(n >> 1);
        if (n % 2 === 1) text += '"';
        else quoted = !quoted;
        k += n;
      } else {
        text += '\\'.repeat(n);
        k += n - 1;
      }
    } else if (c === '"') quoted = !quoted;
    else if (!quoted && (c === ' ' || c === '\t')) break;
    else text += c;
  }
  return { text, end: k };
}

/** The single-quoted argument of the first `eval '…'`, its `'\''` joins undone; null when there is none or it never closes. */
function evalArg(script) {
  const start = script.search(EVAL);
  if (start < 0) return null;
  let k = script.indexOf("'", start);
  let text = '';
  for (;;) {
    const close = script.indexOf("'", k + 1);
    if (close < 0) return null;
    text += script.slice(k + 1, close);
    if (script.startsWith("\\''", close + 1)) {
      text += "'";
      k = close + 3;
    } else return text;
  }
}

/**
 * The `-c` script of a `bash`/`sh` command line, unwrapped from Claude Code's `eval '…'`; null when the line is
 * no shell with `-c`. A Windows line is read by its quoting rules; an unquoted POSIX line's script is the rest of it.
 */
export function shellScript(command) {
  if (typeof command !== 'string') return null;
  let { text: program, end } = windowsArg(command.trimStart(), 0);
  const line = command.trimStart();
  if (!SHELL.test(program.split(/[\\/]/).pop())) return null;
  let script = null;
  while (end < line.length) {
    while (line[end] === ' ' || line[end] === '\t') end++;
    if (end >= line.length) break;
    const arg = windowsArg(line, end);
    if (/^-[a-zA-Z]*c[a-zA-Z]*$/.test(arg.text)) {
      let at = arg.end;
      while (line[at] === ' ' || line[at] === '\t') at++;
      script = line[at] === '"' ? windowsArg(line, at).text : line.slice(at);
      break;
    }
    if (!arg.text.startsWith('-') && !arg.text.startsWith('+')) return null;
    end = arg.end;
  }
  if (script === null || script === '') return null;
  return EVAL.test(script) ? evalArg(script) : script; // an eval that never closes is unsure: null, never the outer script
}

/** The nearest `claude` above `row` in `byPid`, or null; a ppid cycle ends the walk. */
function claudeAbove(row, byPid) {
  const seen = new Set([row.pid]);
  for (let up = byPid.get(row.ppid); up && !seen.has(up.pid); up = byPid.get(up.ppid)) {
    if (CLAUDE.test(up.name ?? '')) return up.pid;
    seen.add(up.pid);
  }
  return null;
}

/**
 * The `gc` rows of the stalled waits in `table` (L6): a `bash`/`sh` row whose `-c` script `unboundedWaits` reads as
 * a wait, whose nearest `claude` is the parent of a live run's pid, aged `stallAgeS` or more. Of a matched shell
 * and its matched child (Claude Code's pair) only the top one, since its tree stop takes the child.
 */
export function stalledWaits(table, { runs, stallAgeS = STALL_AGE_S }) {
  const byPid = new Map(table.map((row) => [row.pid, row]));
  const runOf = new Map();
  for (const run of runs) {
    const client = byPid.get(run.pid);
    if (client && typeof run.repo === 'string' && !runOf.has(client.ppid)) runOf.set(client.ppid, run);
  }
  const matched = new Map();
  for (const row of table) {
    if (!SHELL.test(row.name ?? '') || !(row.ageS >= stallAgeS)) continue;
    const script = shellScript(row.command);
    const waits = script === null ? [] : unboundedWaits(script);
    if (waits.length === 0) continue;
    const owner = claudeAbove(row, byPid);
    const run = owner === null ? undefined : runOf.get(owner);
    if (!run) continue;
    const minutes = Math.floor(row.ageS / 60);
    matched.set(row.pid, {
      pid: row.pid, kind: 'shell', owner, worktree: run.repo, orphan: `stalled ${minutes} min`,
      marker: waits[0].marker, repo: run.repo, script,
    });
  }
  const underMatched = (row) => {
    const seen = new Set([row.pid]);
    for (let up = byPid.get(row.ppid); up && !seen.has(up.pid); up = byPid.get(up.ppid)) {
      if (matched.has(up.pid)) return true;
      seen.add(up.pid);
    }
    return false;
  };
  return [...matched.values()].filter((row) => !underMatched(byPid.get(row.pid)));
}

/**
 * One scan (L5, L6): one read of the process table, `stalledWaits` over it and the live runs, `gc` stopping each
 * with its tree, then `note(repo, line)` for each stop that went. `holder(row)` names the agent whose call started
 * a wait, or null, and defaults to the one subagent whose Bash call ran the row's script (`holderOfCommand` under
 * `projectsRoot`, S4); `kill(pid, tree)` defaults to `gc`'s `stopper` over the same table. A read failure is one line
 * and stops nothing. Answers `gc`'s lines, none when nothing is stalled.
 */
export function reapStalled({ read, runs, kill, note, holder, stallAgeS = STALL_AGE_S, projectsRoot }) {
  holder ??= (row) => {
    const found = holderOfCommand(row.repo, row.script, { projectsRoot });
    return found && `${found.agentType} ${found.agentId}`;
  };
  let table, rows;
  try {
    table = read();
    rows = stalledWaits(table, { runs: runs(), stallAgeS });
  } catch (err) {
    return [`stalled waits: could not read the process table, nothing stopped: ${oneLine(err?.message ?? err, 200)}`];
  }
  if (rows.length === 0) return [];
  const stop = kill ?? stopper(table);
  const lines = gc(rows, { kill: (pid) => stop(pid, true) });
  rows.forEach((row, k) => {
    if (!lines[k]?.startsWith('stopped ')) return;
    let by = null;
    try {
      by = holder(row);
    } catch {
      /* an unreadable holder is unknown; the stop has already gone */
    }
    note(row.repo, `stopped stalled wait ${row.pid} "${oneLine(row.marker ?? '', MARKER_MAX)}" held by ${by ? oneLine(by, MARKER_MAX) : 'unknown'} for ${row.orphan.replace(/^stalled /, '')}`);
  });
  return lines;
}

/** The daemon's `note` (L7): a deck line on the repository's live ticket, else its chat item; neither, no line. */
export function noteStall(repo, line) {
  const items = listItems();
  const to = liveTicketOf(items, repo) ?? items.find((item) => item?.kind === KIND_CHAT && sameRepo(item.repo, repo));
  if (to) noteDeck(to.id, line);
}
