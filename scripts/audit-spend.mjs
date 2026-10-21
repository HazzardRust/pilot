#!/usr/bin/env node
/**
 * The audit's measured spend (usage-telemetry spec 10, L8): what one repository's sessions spent,
 * summed from the daemon's usage log (ADR 0043) over every line it holds. Reads only, prints only
 * JSON, and exits 0 whatever it finds, so the auditor copies the block into its report as
 * `measured`, or, with `spend` null, says so in `unmeasured`.
 *
 *   node scripts/audit-spend.mjs <repo> [--log <file>]
 *   -> { log, lines, from, to, spend, skippedLines, runs, reports, noReport }
 *
 * `runs` is the three newest run records at `<repo>`'s HEAD by `updatedAt` that a session here named, finished or not (A6),
 * each `{ slug, updatedAt, tokens, toolCalls, costUSD }` as `pilot analytics <slug>` totals it.
 *
 * `reports` is the friction rows of every finished run record of `<repo>` in the deck's store
 * that carries a closing report (ADR 0044), oldest first, each `{ slug, friction }`; a finished
 * record with no report, or one whose friction is not a list of `{ agent, what, evidence }`, is
 * counted in `noReport`.
 *
 * `<repo>` is matched to the log's `byRepo` keys by the rule that wrote them, `repoOf`: a worktree
 * counts under its main checkout. A line that does not parse, torn or not a log line, is skipped
 * and counted.
 */

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { parseArgs } from 'node:util';

import { costOfAgents, loadPrices, unrecordedAgents } from '../deck/analytics.mjs';
import { recordsFor } from '../deck/store.mjs';
import { repoOf, usageLogFile } from '../deck/telemetry.mjs';
import { addCounts, readRun, zeroCounts } from '../deck/transcripts.mjs';

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const KINDS = Object.keys(zeroCounts());
const isCounts = (counts) => isObject(counts) && KINDS.every((kind) => Number.isFinite(counts[kind]) && counts[kind] >= 0);
const isStamp = (value) => typeof value === 'string' && !Number.isNaN(Date.parse(value));

/** One log line's window and this repository's counts, or null when the line is not a whole log line. */
function parseLine(text, key) {
  let line;
  try {
    line = JSON.parse(text);
  } catch {
    return null;
  }
  const { window, tokens } = isObject(line) ? line : {};
  if (!isStamp(window?.from) || !isStamp(window?.to) || !isObject(tokens?.byRepo)) return null;
  const models = Object.values(isObject(tokens.byRepo[key]) ? tokens.byRepo[key] : {});
  return models.every(isCounts) ? { window, models } : null;
}

/**
 * Sums the lines one at a time, never the file whole: the log grows forever (L2). A read error,
 * at the open or mid-file, rejects the iteration; the caller turns it into the no-log answer.
 */
async function auditSpend(repo, log) {
  const key = await repoOf(path.resolve(repo));
  const result = { log, lines: 0, from: null, to: null, spend: zeroCounts(), skippedLines: 0 };
  for await (const text of readline.createInterface({ input: fs.createReadStream(log, 'utf8'), crlfDelay: Infinity })) {
    if (text.trim() === '') continue;
    const parsed = parseLine(text, key);
    if (parsed === null) {
      result.skippedLines += 1;
      continue;
    }
    const { window, models } = parsed;
    result.lines += 1;
    if (result.from === null || Date.parse(window.from) < Date.parse(result.from)) result.from = window.from;
    if (result.to === null || Date.parse(window.to) > Date.parse(result.to)) result.to = window.to;
    for (const counts of models) result.spend = addCounts(result.spend, counts);
  }
  return { ...result, spend: result.lines === 0 ? null : result.spend };
}

const RUNS = 3;
const git = (repo, args) => execFileSync('git', args, { cwd: repo, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 10_000, windowsHide: true });

/** The run records at `repo`'s HEAD with a slug and a dated `updatedAt`, newest first (A6); none outside a repository. */
function recordsAtHead(repo) {
  let files;
  try {
    files = git(repo, ['ls-tree', '-r', '--name-only', 'HEAD', '--', 'docs/design']).split('\n');
  } catch {
    return [];
  }
  return files.filter((file) => /^docs\/design\/[^/]+\/run\.json$/.test(file)).flatMap((file) => {
    try {
      const { slug, updatedAt } = JSON.parse(git(repo, ['show', `HEAD:${file}`]));
      return typeof slug === 'string' && isStamp(updatedAt) ? [{ slug, updatedAt }] : [];
    } catch {
      return [];
    }
  }).sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
}

/**
 * The newest three runs' figures, equal by construction to the Total row `pilot analytics` prints
 * (L9): the same reader, the same "not in transcripts" rows, the same prices. `costUSD` is null
 * when a model has no price, or when the price table cannot be read (named on stderr).
 */
function latestRuns(repo, key) {
  let prices = null;
  try {
    prices = loadPrices();
  } catch (err) {
    process.stderr.write(`audit-spend: ${err.message}\n`);
  }
  // A record no session here named (run on another machine, transcripts gone) is skipped, as
  // `pilot analytics` refuses it: never a run of zero tokens.
  const measured = [];
  for (const { slug, updatedAt } of recordsAtHead(repo)) {
    if (measured.length === RUNS) break;
    const run = readRun(key, slug);
    if (run.sessions.length > 0) measured.push({ slug, updatedAt, run });
  }
  return measured.map(({ slug, updatedAt, run }) => {
    const rows = [...run.agents, ...unrecordedAgents(run)];
    const tokens = rows.flatMap((agent) => Object.values(agent.models))
      .reduce((sum, counts) => sum + KINDS.reduce((n, kind) => n + counts[kind], 0), 0);
    return {
      slug,
      updatedAt,
      tokens,
      toolCalls: run.agents.reduce((n, agent) => n + agent.toolCalls, 0),
      costUSD: prices === null ? null : costOfAgents(rows, prices),
    };
  });
}

const isFriction = (row) => isObject(row) && ['agent', 'what', 'evidence'].every((key) => typeof row[key] === 'string');

/** The finished runs' friction rows from the store's records, read-only; the closing report is S4's, never written here. */
function closingReports(key) {
  const out = { reports: [], noReport: 0 };
  for (const record of recordsFor(key)) {
    if (!isObject(record) || record.finished === undefined) continue;
    // A report since yellow-lane S11 holds the deck's ranking; its agent rows are the repository's friction.
    const ranked = record.report?.friction;
    const friction = isObject(ranked) ? ranked.agents : ranked;
    if (Array.isArray(friction) && friction.every(isFriction)) out.reports.push({ slug: record.slug, friction });
    else out.noReport += 1;
  }
  return out;
}

// Exit 0 with JSON on stdout, always: no log is no lines, and a log that cannot be read is named
// on stderr and answered the same way, so the auditor says so under unmeasured.
const { values, positionals } = parseArgs({ options: { log: { type: 'string' } }, allowPositionals: true });
const log = values.log ?? usageLogFile();
const repo = path.resolve(positionals[0] ?? '.');
let out;
try {
  out = await auditSpend(repo, log);
} catch (err) {
  if (err.code !== 'ENOENT') process.stderr.write(`audit-spend: ${log} is not readable (${err.code ?? err.message})\n`);
  out = { log, lines: 0, from: null, to: null, spend: null, skippedLines: 0 };
}
const key = await repoOf(repo);
let runs = [];
try {
  runs = latestRuns(repo, key);
} catch (err) {
  process.stderr.write(`audit-spend: the runs' transcripts are not readable (${err.code ?? err.message})\n`);
}
let reports = { reports: [], noReport: 0 };
try {
  reports = closingReports(key);
} catch (err) {
  process.stderr.write(`audit-spend: the deck's run records are not readable (${err.message})\n`);
}
process.stdout.write(`${JSON.stringify({ ...out, runs, ...reports })}\n`);
