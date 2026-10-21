/**
 * The process table and which of it pilot owns (process-gc L5-L6). `processTable` reads every
 * process on the machine with one reader per call: on Windows one PowerShell CIM query, elsewhere
 * one `ps`. Both are fixed argv, never a shell string, and `run` is injected in tests.
 * `pilotProcesses` picks the node processes running pilot code (a deck daemon, a `pilot wait`, a
 * `node --test` root) and names each orphan with its reason. The user's deck is never an orphan,
 * and a process this module does not recognise is never listed, so it can never be stopped.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import { hostPlatform } from '../hooks/lib/platform.js';
import { DECK_HOST, DECK_PORT } from './tools.mjs';

const WINDOWS_QUERY = [
  '[Console]::OutputEncoding = [Text.Encoding]::UTF8;',
  '$now = Get-Date;',
  'Get-CimInstance Win32_Process | ForEach-Object { [pscustomobject]@{',
  'ProcessId = $_.ProcessId; ParentProcessId = $_.ParentProcessId; Name = $_.Name; CommandLine = $_.CommandLine;',
  'AgeS = if ($_.CreationDate) { [int]($now - $_.CreationDate).TotalSeconds } else { 0 } } } | ConvertTo-Json -Compress',
].join(' ');
const PS_ARGS = ['-eo', 'pid=,ppid=,etimes=,comm=,args='];
/** macOS `ps` has no `etimes`; its `etime` is `[[dd-]hh:]mm:ss`. */
const PS_ARGS_DARWIN = ['-axo', 'pid=,ppid=,etime=,comm=,args='];
/** By absolute path: a bare name is searched for in the current directory first. */
const POWERSHELL = path.win32.join(process.env.SystemRoot ?? 'C:/Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');

const defaultRun = (cmd, args) => execFileSync(cmd, args, { encoding: 'utf8', windowsHide: true, maxBuffer: 64 * 1024 * 1024 });

function fromWindows(output) {
  const parsed = JSON.parse(output.replace(/^﻿/, '') || '[]');
  return (Array.isArray(parsed) ? parsed : [parsed]).map((row) => ({
    pid: row.ProcessId,
    ppid: row.ParentProcessId,
    name: row.Name ?? '',
    command: row.CommandLine ?? '',
    ageS: row.AgeS ?? 0,
  }));
}

/** `[[dd-]hh:]mm:ss` as seconds. */
export function elapsedSeconds(etime) {
  const [, days = 0, hours = 0, minutes, seconds] = /^(?:(\d+)-)?(?:(\d+):)?(\d+):(\d+)$/.exec(etime) ?? [];
  if (minutes === undefined) throw new Error(`unreadable etime: ${etime}`);
  return ((Number(days) * 24 + Number(hours)) * 60 + Number(minutes)) * 60 + Number(seconds);
}

function fromPs(output, age = Number) {
  const pids = new Set();
  return output
    .split('\n')
    .map((line) => /^\s*(\d+)\s+(\d+)\s+(\d[\d:-]*)\s+(\S+)\s*(.*)$/.exec(line))
    // A row repeating a pid is the tail of an argument with a newline in it.
    .filter((row) => row && !pids.has(row[1]) && pids.add(row[1]))
    // The name is the program `args` starts with: Linux node names its main thread, so `comm` reads
    // `MainThread`, and macOS cuts a `comm` that is not the last column to 16 characters.
    .map(([, pid, ppid, ageS, comm, args]) => ({
      pid: Number(pid),
      ppid: Number(ppid),
      name: path.basename(/^\S*/.exec(args)[0] || comm).replace(/^node-MainThread$/, 'node'),
      command: args.trimEnd(),
      ageS: age(ageS),
    }));
}

/** Every process on the machine: pid, parent, image name, command line and age in seconds. */
export function processTable({ platform = hostPlatform(), run = defaultRun } = {}) {
  return platform === 'win32'
    ? fromWindows(run(POWERSHELL, ['-NoProfile', '-NonInteractive', '-Command', WINDOWS_QUERY]))
    : platform === 'darwin'
      ? fromPs(run('ps', PS_ARGS_DARWIN), elapsedSeconds)
      : fromPs(run('ps', PS_ARGS));
}

/** The command line split into words, a double-quoted span being one word. */
const words = (command) => [...command.matchAll(/"([^"]*)"|(\S+)/g)].map((m) => m[1] ?? m[2]);
const slashed = (word) => word.replaceAll('\\', '/');
const absolute = (word) => /^([A-Za-z]:)?[\\/]/.test(word);
const flagged = (word) => word.startsWith('-');
/** The words after `flag` up to the next flag: `ps` prints a spaced path unquoted. */
function after(argv, flag) {
  const at = argv.indexOf(flag);
  if (at === -1) return undefined;
  const end = argv.findIndex((word, i) => i > at && flagged(word));
  return argv.slice(at + 1, end === -1 ? undefined : end);
}

/** What a node command line runs, if it is pilot's: the kind and the words it was given. */
function recognise(argv) {
  const daemonAt = argv.findIndex((word, i) => i > 0 && slashed(word).endsWith('deck/daemon.mjs'));
  if (daemonAt !== -1) {
    let from = daemonAt;
    while (from > 1 && !absolute(argv[from]) && !flagged(argv[from - 1])) from -= 1;
    return { kind: 'daemon', file: argv.slice(from, daemonAt + 1), rest: argv.slice(daemonAt + 1) };
  }
  const scriptAt = argv.findIndex((word, i) => i > 0 && ['pilot.mjs', 'launcher.mjs'].includes(path.basename(slashed(word))));
  if (scriptAt !== -1) {
    let rest = argv.slice(scriptAt + 1);
    let dir;
    if (rest[0] === '--dir') {
      // `ps` prints a spaced path unquoted: the words up to the next flag, minus the `wait` verb that ends them.
      const span = after(rest, '--dir');
      const verb = span.lastIndexOf('wait');
      const count = verb > 0 ? verb : span.length;
      dir = span.slice(0, count).join(' ') || undefined;
      if (dir !== undefined) rest = rest.slice(1 + count);
    }
    return rest[0] === 'wait' ? { kind: 'wait', dir } : null;
  }
  const script = argv.findIndex((word, i) => i > 0 && !flagged(word));
  return argv.slice(1, script === -1 ? undefined : script).includes('--test') ? { kind: 'test', argv } : null;
}

/**
 * Whether a process-table row is node running pilot's deck daemon: the proof a kill by pid takes
 * (daemon-lifecycle L4). Stricter than `recognise`: the script node runs, its first word that is not
 * a flag, is an absolute `deck/daemon.mjs` in a pilot checkout, so an argument that only names the
 * daemon, or another project's `deck/daemon.mjs`, is no deck.
 */
export function isDeckDaemon(p, exists = fs.existsSync) {
  if (!/^node(\.exe)?$/i.test(p.name)) return false;
  const argv = words(String(p.command));
  const what = recognise(argv);
  if (what?.kind !== 'daemon') return false;
  const first = argv.findIndex((word, i) => i > 0 && !flagged(word));
  const script = slashed(what.file.join(' '));
  if (argv.slice(first, first + what.file.length).join(' ') !== what.file.join(' ') || !absolute(script)) return false;
  return exists(`${path.posix.dirname(path.posix.dirname(script))}/bin/pilot.mjs`);
}

/** Whether an absolute `word` lies under a pilot checkout: a directory holding `bin/pilot.mjs`. */
function underPilot(word, exists) {
  for (let dir = slashed(word); absolute(dir); ) {
    if (exists(`${dir}/bin/pilot.mjs`)) return true;
    const up = path.posix.dirname(dir);
    if (up === dir) return false;
    dir = up;
  }
  return false;
}

/** Whether a process-table row is a Claude session. */
export const isClaude = (p) => /^claude(\.exe)?$/i.test(p.name);

/**
 * The pilot-owned processes in `table` with each one's owner, worktree and orphan reason (L5).
 * A daemon's owner is its `--leash` pid, else its parent; a wait's is its nearest `claude`
 * ancestor; a test root's is its parent. A test root is listed only when it names a path under a
 * pilot checkout, and a test process under another test is part of that tree.
 * What cannot be read for sure is never an orphan: a leashless daemon unless the user's deck
 * answered another pid (refused or silent leaves it unsure), a leash that is not a pid, a relative path, a wait whose
 * ancestor chain reaches a live root with no `claude` in it.
 */
export function pilotProcesses(table, { userDeckPid, exists = fs.existsSync }) {
  const byPid = new Map(table.map((p) => [p.pid, p]));
  const ancestors = function* (p) {
    const seen = new Set([p.pid]);
    for (let up = byPid.get(p.ppid); up && !seen.has(up.pid); up = byPid.get(up.ppid)) {
      seen.add(up.pid);
      yield up;
    }
  };
  const seen = table
    .filter((p) => /^node(\.exe)?$/i.test(p.name))
    .map((p) => ({ p, what: recognise(words(p.command)) }))
    .filter(({ what }) => what !== null && (what.kind !== 'test' || what.argv.some((word) => underPilot(word, exists))));
  /** The chain is broken when it ends at a ppid missing from the table; ppid 0 is the root. */
  const broken = (p) => {
    const top = [p, ...ancestors(p)].at(-1);
    return top.ppid !== 0 && !byPid.has(top.ppid);
  };
  const testPids = new Set(seen.filter(({ what }) => what.kind === 'test').map(({ p }) => p.pid));

  const owned = [];
  for (const { p, what } of seen) {
    if (what.kind === 'daemon') {
      const dirWords = after(what.rest, '--leash-dir');
      const leashDir = dirWords?.join(' ');
      const file = what.file.join(' ');
      const worktree = leashDir ?? path.dirname(path.dirname(file));
      if (p.pid === userDeckPid) {
        owned.push({ ...p, kind: 'daemon', owner: null, worktree, orphan: null });
        continue;
      }
      const named = after(what.rest, '--leash')?.join(' ');
      const leash = named === undefined ? p.ppid : /^[1-9]\d*$/.test(named) ? Number(named) : null;
      const paths = [file, ...(leashDir === undefined ? [] : [leashDir])];
      // A path glued from several words that does not exist may be a misreading of what `ps` printed.
      const misread = [what.file, dirWords ?? []].some((ws) => ws.length > 1 && !exists(ws.join(' ')));
      // Leashless is the user's deck or a pre-feature daemon: only a deck that answered another pid tells them apart.
      const deckAnswered = Number.isInteger(userDeckPid) && userDeckPid > 0;
      const unsure = leash === null || (named === undefined && !deckAnswered) || !paths.every(absolute) || misread;
      const orphan = unsure ? null : !byPid.has(leash) ? `leash ${leash} gone` : paths.some((f) => !exists(f)) ? 'worktree gone' : null;
      owned.push({ ...p, kind: 'daemon', owner: leash, worktree, orphan });
    } else if (what.kind === 'wait') {
      const session = [...ancestors(p)].find(isClaude);
      const orphan = session || !broken(p) ? null : 'no claude ancestor';
      owned.push({ ...p, kind: 'wait', owner: session?.pid ?? null, worktree: what.dir ?? null, orphan });
    } else if (![...ancestors(p)].some((up) => testPids.has(up.pid))) {
      const parent = byPid.has(p.ppid);
      owned.push({ ...p, kind: 'test', owner: parent ? p.ppid : null, worktree: null, orphan: parent ? null : `parent ${p.ppid} gone` });
    }
  }
  return owned;
}

/** `dir` resolved through links and, on win32, case-folded; as written when it does not exist. */
function canonical(dir) {
  let full;
  try {
    full = fs.realpathSync.native(dir);
  } catch {
    full = path.resolve(dir);
  }
  return hostPlatform() === 'win32' ? full.toLowerCase() : full;
}

/**
 * Who holds a worktree, over `pilotProcesses` rows (landing-keeps-worktrees L2, L3): a function
 * of a directory answering the pid of a non-orphan row whose worktree is that directory or lies
 * under it, `'unsure'` when every such row's owner is null, and null when no row stands there.
 * A row whose worktree is not absolute could be anywhere, so it makes every directory unsure.
 */
export function holderOf(owned) {
  const rows = owned.filter((row) => (!row.orphan || row.kind === 'wait') && row.worktree);
  const floating = rows.some((row) => !path.isAbsolute(row.worktree));
  const placed = rows.filter((row) => path.isAbsolute(row.worktree)).map((row) => ({ row, at: canonical(row.worktree) }));
  return (dir) => {
    const root = canonical(dir);
    const inside = placed.filter(({ at }) => {
      const rel = path.relative(root, at);
      return rel === '' || (rel !== '..' && !rel.startsWith(`..${path.sep}`) && !path.isAbsolute(rel));
    });
    const sure = inside.find(({ row }) => row.owner !== null && row.owner !== undefined);
    if (sure) return sure.row.pid;
    return inside.length || floating ? 'unsure' : null;
  };
}

/**
 * The pid the user's deck on `DECK_PORT` reports; null when nothing listens there, undefined when
 * something may but did not answer. Either leaves every leashless daemon unsure (the deck may not
 * have bound yet).
 */
export async function userDeckPid() {
  try {
    const response = await fetch(`http://${DECK_HOST}:${DECK_PORT}/api/health`, { signal: AbortSignal.timeout(1000) });
    const { pid } = response.ok ? await response.json() : {};
    return Number.isInteger(pid) ? pid : undefined;
  } catch (err) {
    return err.cause?.code === 'ECONNREFUSED' ? null : undefined;
  }
}

const clock = (s) => `${Math.floor(s / 3600)}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}`;

/** One `pilot ps` line: `<pid> <kind> owner <pid|-> age <h:mm> <worktree|-> <orphan: why|live>`. */
const psLine = (row) =>
  `${row.pid} ${row.kind} owner ${row.owner ?? '-'} age ${clock(row.ageS)} ${row.worktree ?? '-'} ${row.orphan ? `orphan: ${row.orphan}` : 'live'}`;

/**
 * `pilot ps`: one line per pilot-owned process on this machine. A reader that fails (macOS `ps`
 * has no `etimes`, bad JSON, an exceeded buffer) prints one line and names no orphan.
 */
export async function main({ read = processTable, probe = userDeckPid } = {}) {
  let table;
  try {
    table = read();
  } catch (err) {
    console.error(`pilot ps: cannot read the process table (${String(err.message).split('\n')[0]}); no orphan named`);
    return 1;
  }
  const rows = pilotProcesses(table, { userDeckPid: await probe() });
  for (const row of rows) console.log(psLine(row));
  return 0;
}
