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
 * A row's text comes from the log as S4 stored it (a credential already withheld, each field
 * clipped); a no-verdict is counted, never a habit. `<repo>` is matched by `repoOf`, so a
 * worktree's refusals count under its main checkout. Exit 0 whatever the log holds; a log that
 * cannot be read is named on stderr and answered as none; a `--log` of another name exits 2.
 */

import path from 'node:path';
import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';

import { LOG_FILENAME, readRefusals } from '../deck/classifier-log.mjs';
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

/** Each part's program and its first word or flag, joined by ` ; `. */
export function commandShape(command) {
  return partsOf(command)
    .map((part) => part.trim().split(/\s+/))
    .filter(([program]) => program)
    .map(([program, first]) => [program.split('=')[0], shapeWord(first)].filter(Boolean).join(' '))
    .join(' ; ');
}

const sorted = (values) => [...new Set(values)].sort();

/** A habit row: what was refused, by whom, why, how often, one stored example and a ticket-ready spec. */
function habitRow(shape, group) {
  const agents = sorted(group.map((r) => r.agent));
  const reasons = sorted(group.map((r) => r.reason));
  return {
    finding: `auto mode refused the command shape \`${shape}\` ${group.length} times (${reasons.join(', ')}), from ${agents.join(', ')}`,
    agents,
    reasons,
    count: group.length,
    example: group[group.length - 1].command,
    spec:
      `Auto mode refused \`${shape}\` ${group.length} times from ${agents.join(', ')}, each a blocked step.\n` +
      `1. None of ${agents.join(', ')} issues \`${shape}\` any more: the risky action is removed from the habit, never reworded, ` +
      'split or allowed past auto mode. Evidence: the next audit of this repository has no refusals row for this shape.',
  };
}

/** The refused shapes of at least `min` refusals each, most refused first, then by shape. */
export function refusalRows(refusals, opts) {
  const min = (opts && opts.min) || MIN_HABIT;
  const groups = new Map();
  for (const refusal of refusals) {
    if (refusal.verdict !== 'refused') continue;
    const shape = commandShape(refusal.command) || refusal.tool;
    groups.set(shape, [...(groups.get(shape) ?? []), refusal]);
  }
  return [...groups]
    .filter(([, group]) => group.length >= min)
    .sort(([a, x], [b, y]) => y.length - x.length || a.localeCompare(b))
    .map(([shape, group]) => habitRow(shape, group));
}

/** Refusals and no-verdicts alike, counted by agent and reason, most first. */
function byAgentReason(refusals) {
  const counts = new Map();
  for (const { agent, reason } of refusals) {
    const key = JSON.stringify([agent, reason]);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts]
    .map(([key, count]) => {
      const [agent, reason] = JSON.parse(key);
      return { agent, reason, count };
    })
    .sort((a, b) => b.count - a.count);
}

async function main() {
  const { values, positionals } = parseArgs({ options: { log: { type: 'string' } }, allowPositionals: true });
  if (values.log !== undefined && path.basename(values.log) !== LOG_FILENAME) {
    process.stderr.write(`audit-refusals: --log names a ${LOG_FILENAME}, not ${values.log}\n`);
    process.exit(2);
  }
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
  const mine = [];
  for (const refusal of all) if ((await keyOf(refusal.repo)) === repo) mine.push(refusal);
  process.stdout.write(`${JSON.stringify({ log, total: mine.length, byAgentReason: byAgentReason(mine), rows: refusalRows(mine) })}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
