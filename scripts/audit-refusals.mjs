#!/usr/bin/env node
/**
 * The audit's refusal habits (crew-refusals spec 7, A5, L9): one repository's auto-mode denials
 * from the classifier log, counted by agent and reason, with each command shape refused at least
 * three times reported as a habit row the user can pick as a ticket. Reads only, writes nothing,
 * posts nothing, and prints only JSON.
 *
 *   node scripts/audit-refusals.mjs <repo> [--log <dir>/classifier.log]
 *   -> { log, total, byAgentReason: [{ agent, reason, count }], rows: AuditRow[] }
 *
 * Row text is the log's as S4 stored it (credentials withheld, fields clipped). `<repo>` is matched
 * by `repoOf`, so a worktree counts under its main checkout. Exit 0 whatever the log holds (an
 * unreadable one is named on stderr and read as none); a bad argument exits 2.
 */

import path from 'node:path';
import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';

import { LOG_FILENAME, WITHHELD, readRefusals } from '../deck/classifier-log.mjs';
import { deckDir } from '../hooks/lib/deck-secret.js';
import { pathKey } from '../hooks/lib/platform.js';

/** A recurring habit (A5): this many refusals of one shape in the repository. */
const MIN_HABIT = 3;
const OPERATORS = ['&&', '||', ';', '|', '\n'];

/** The command's parts, split on `&&`, `||`, `;`, `|` and newlines outside quotes. */
function partsOf(command) {
  const parts = [];
  let part = '';
  let quote = null;
  for (let i = 0; i < command.length; i++) {
    const char = command[i];
    if (quote) {
      if (char === quote) quote = null;
      part += char;
      continue;
    }
    if (char === '"' || char === "'") quote = char;
    const operator = OPERATORS.find((op) => command.startsWith(op, i));
    if (operator) {
      parts.push(part);
      part = '';
      i += operator.length - 1;
    } else {
      part += char;
    }
  }
  return [...parts, part];
}

/** A word kept in a shape: a flag or a plain word, its `=value` dropped; never a path, number or string. */
const shapeWord = (word) => {
  const bare = (word ?? '').split('=')[0];
  return /^(-{1,2}[\w-]+|[A-Za-z][\w.-]*)$/.test(bare) ? bare : null;
};

/** Each part's program (its basename) and first word or flag, joined by ` ; `; a part whose program is no plain word is dropped. */
export function commandShape(command) {
  return partsOf(command)
    .map((part) => part.trim().split(/\s+/))
    .map(([program, first]) => [path.basename(program).split('=')[0], shapeWord(first)])
    .filter(([program]) => /^[A-Za-z][\w.-]*$/.test(program))
    .map((words) => words.filter(Boolean).join(' '))
    .join(' ; ');
}

const sorted = (values) => [...new Set(values)].sort();

/** A habit row: what was refused, by whom, why, how often, one stored example and a ticket-ready spec. */
function habitRow(shape, group) {
  const agents = sorted(group.map((r) => r.agent));
  const reasons = sorted(group.map((r) => r.reason));
  const named = agents.filter((agent) => /^[\w:.-]{1,60}$/.test(agent)).join(', ') || 'unnamed agents'; // log text: plain names only
  return {
    finding: `auto mode refused the command shape \`${shape}\` ${group.length} times, from ${named}`,
    agents,
    reasons,
    count: group.length,
    example: group[group.length - 1].command,
    spec:
      `Auto mode refused \`${shape}\` ${group.length} times from ${named}, each a blocked step.\n` +
      `1. None of ${named} issues \`${shape}\` any more: the risky action is removed from the habit, never reworded, ` +
      'split or allowed past auto mode. Evidence: the next audit of this repository has no refusals row for this shape.',
  };
}

/** The refused shapes of at least `MIN_HABIT` refusals each, most refused first, then by shape. */
export function refusalRows(refusals) {
  const groups = new Map();
  for (const refusal of refusals) {
    // A withheld command has no shape to fix: counted by the caller, never grouped into a habit.
    if (refusal.verdict !== 'refused' || refusal.command === WITHHELD) continue;
    const shape = commandShape(refusal.command) || (/^[A-Za-z][\w.-]*$/.test(refusal.tool) ? refusal.tool : 'unshaped command');
    groups.set(shape, [...(groups.get(shape) ?? []), refusal]);
  }
  return [...groups]
    .filter(([, group]) => group.length >= MIN_HABIT)
    .sort(([a, x], [b, y]) => y.length - x.length || a.localeCompare(b))
    .map(([shape, group]) => habitRow(shape, group));
}

/** Refusals and no-verdicts alike, counted by agent and reason, most first. */
function byAgentReason(refusals) {
  const counts = new Map();
  for (const { agent, reason } of refusals) {
    const key = JSON.stringify([agent, reason]);
    counts.set(key, { agent, reason, count: (counts.get(key)?.count ?? 0) + 1 });
  }
  return [...counts.values()].sort((a, b) => b.count - a.count);
}

async function main() {
  let args;
  try {
    args = parseArgs({ options: { log: { type: 'string' } }, allowPositionals: true });
    if (args.values.log !== undefined && path.basename(args.values.log) !== LOG_FILENAME) throw new Error(`--log names a ${LOG_FILENAME}`);
  } catch (err) {
    process.stderr.write(`audit-refusals: ${err.message}\n`);
    process.exit(2);
  }
  const { values, positionals } = args;
  // Loaded here, not at the top: `repoOf` reaches the deck store, which the pure functions above never need.
  const { repoOf } = await import('../deck/telemetry.mjs');
  // One repository is one key however a session spelled its directory; a blank or withheld repo is no one's.
  const keyOf = async (dir) => (path.isAbsolute(dir) ? pathKey(await repoOf(dir)) : null);
  const repo = await keyOf(path.resolve(positionals[0] ?? '.'));
  let log = values.log ?? null;
  let all = [];
  try {
    const dir = log === null ? deckDir() : path.dirname(log);
    log = path.join(dir, LOG_FILENAME);
    all = readRefusals({ dir });
  } catch (err) {
    process.stderr.write(`audit-refusals: the classifier log is not readable (${err.code ?? err.message})\n`);
  }
  // Each spelling once: a removed worktree is not cached by `repoOf`, and the log holds up to 10,000 lines.
  const spellings = [...new Set(all.map((refusal) => refusal.repo))];
  const keys = new Map(await Promise.all(spellings.map(async (dir) => [dir, await keyOf(dir)])));
  const mine = all.filter((refusal) => keys.get(refusal.repo) === repo);
  process.stdout.write(`${JSON.stringify({ log, total: mine.length, byAgentReason: byAgentReason(mine), rows: refusalRows(mine) })}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
