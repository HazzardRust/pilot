/**
 * The glossary log (project-glossary S6; spec 10, 11; L12): `GLOSSARY-LOG.md` beside `GLOSSARY.md`
 * holds one Markdown table row per glossary change (date, run, change, term), the run named by
 * its slug so the log reads in another project without this repository's history, and at most
 * 200 rows, the oldest dropped on append. It calls no git and runs no shell.
 *
 *   node scripts/glossary-log.mjs check  [--log GLOSSARY-LOG.md] [--glossary GLOSSARY.md]
 *   node scripts/glossary-log.mjs append <change> <term> --run <slug> [--date YYYY-MM-DD] [--log GLOSSARY-LOG.md]
 *   node scripts/glossary-log.mjs show   [--term <t>] [--limit <n>] [--log GLOSSARY-LOG.md]
 *
 * Exit 0 clean, 1 with one line per problem (`check`), 2 when a file cannot be read, a row is
 * refused or the command is wrong. `append` writes only a file named `GLOSSARY-LOG.md`.
 */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseGlossary } from './glossary.mjs';

export const CAP = 200;
const LOG_NAME = 'GLOSSARY-LOG.md';
const CHANGES = new Set(['added', 'changed', 'removed']);
const HEADER = ['Date', 'Run', 'Change', 'Term'];
const MAX_TERM = 120;
const MAX_RUN = 80;
const TEMPLATE = [
  '# Glossary log',
  '',
  `Each change to \`GLOSSARY.md\`, one row per term added, changed or removed, with the run that made it; at most ${CAP} rows, the oldest dropped by \`glossary-log.mjs append\`.`,
  '',
];

/** A problem with one field of a row, or `null`. Each regex is anchored with no nested quantifier, so linear. */
function fieldProblem({ date, run, change, term }) {
  if (typeof date !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(date)) return `date "${date}" is not YYYY-MM-DD`;
  if (typeof run !== 'string' || run === '') return 'a row without a run';
  if (run.length > MAX_RUN || !/^[a-z0-9-]+$/.test(run) || run.startsWith('-') || run.endsWith('-')) return `run "${run}" is not a slug`;
  if (!CHANGES.has(change)) return `change "${change}" is not added, changed or removed`;
  if (typeof term !== 'string' || term === '' || term !== term.trim() || term.length > MAX_TERM || /[|\x00-\x1f\x7f]/.test(term)) {
    return 'term is empty, padded, over 120 characters, or holds a | or a control character';
  }
  return null;
}

/** The cells of a table line `| a | b |`, or `null` when the line is not one. A split, never a regex over the line. */
function cellsOf(line) {
  if (line.length < 2 || !line.startsWith('|') || !line.endsWith('|')) return null;
  return line.slice(1, -1).split('|').map((cell) => cell.trim());
}

const tableOf = (rows) => [
  `| ${HEADER.join(' | ')} |`,
  `| ${HEADER.map(() => '---').join(' | ')} |`,
  ...rows.map(({ date, run, change, term }) => `| ${date} | ${run} | ${change} | ${term} |`),
];

/**
 * The file split into the lines before the table, its well-formed rows (each with its 1-based
 * `line`), the lines after it, and every malformed row as `{ line, problem }`. `headerLine` is 0
 * when the file has no table.
 */
function parse(text) {
  const lines = text.split(/\r?\n/).map((line) => line.trimEnd());
  if (lines.at(-1) === '') lines.pop();
  const start = lines.findIndex((line) => line.startsWith('|'));
  if (start === -1) return { before: lines, rows: [], after: [], errors: [], headerLine: 0 };
  const errors = [];
  const header = cellsOf(lines[start]);
  if (!header || header.join('|').toLowerCase() !== HEADER.join('|').toLowerCase()) {
    errors.push({ line: start + 1, problem: `the table header is not | ${HEADER.join(' | ')} |` });
  }
  const separator = cellsOf(lines[start + 1] ?? '');
  if (!separator || separator.length !== HEADER.length || !separator.every((cell) => /^:?-+:?$/.test(cell))) {
    errors.push({ line: start + 2, problem: 'the table has no separator row' });
  }
  const rows = [];
  let end = start + 2;
  for (; end < lines.length && lines[end].startsWith('|'); end += 1) {
    const line = end + 1;
    const cells = cellsOf(lines[end]);
    if (!cells || cells.length !== HEADER.length) {
      errors.push({ line, problem: `a row needs ${HEADER.length} cells` });
      continue;
    }
    const [date, run, change, term] = cells;
    const problem = fieldProblem({ date, run, change, term });
    if (problem) errors.push({ line, problem });
    else rows.push({ date, run, change, term, line });
  }
  return { before: lines.slice(0, start), rows, after: lines.slice(end), errors, headerLine: start + 1 };
}

/** The parse of a log that must be well formed: its first malformed row throws naming its line. */
function parseStrict(text) {
  const parsed = parse(text);
  const [first] = parsed.errors;
  if (first) throw new Error(`glossary log line ${first.line}: ${first.problem}`);
  return parsed;
}

const withoutLine = ({ line: _line, ...row }) => row;

/** The table's rows, oldest first; a malformed row throws naming its line. */
export function readLog(text) {
  return parseStrict(text).rows.map(withoutLine);
}

/** The new file text with `row` appended, the oldest rows dropped past `cap`; a file with no table gets one, an empty one the log's title too. */
export function appendLog(text, row, cap = CAP) {
  if (!Number.isInteger(cap) || cap < 1) throw new Error(`cap ${cap} is not a positive integer`);
  const clean = { date: row?.date, run: row?.run, change: row?.change, term: row?.term };
  const problem = fieldProblem(clean);
  if (problem) throw new Error(`glossary log row: ${problem}`);
  const parsed = parseStrict(text);
  let { before } = parsed;
  if (parsed.headerLine === 0) before = before.some((line) => line !== '') ? [...before, ''] : TEMPLATE;
  const rows = [...parsed.rows.map(withoutLine), clean].slice(-cap);
  return `${[...before, ...tableOf(rows), ...parsed.after].join('\n')}\n`;
}

/**
 * Where the log and the glossary disagree, as `{ line, problem }` in line order: a malformed row
 * (a row without a run among them), more rows than the cap, a term whose newest row is `removed`
 * but which the glossary holds, or whose newest is `added`/`changed` but which it lacks. A term
 * with no row passes, since the cap may have dropped it.
 */
export function checkLog(logText, glossaryText) {
  const { rows, errors, headerLine } = parse(logText);
  const problems = [...errors];
  const rowCount = rows.length + errors.filter(({ line }) => line > headerLine + 1).length;
  if (rowCount > CAP) problems.push({ line: headerLine, problem: `the log holds ${rowCount} rows, over the cap of ${CAP}` });
  const terms = new Set(parseGlossary(glossaryText).map(({ term }) => term));
  const newest = new Map();
  for (const row of rows) newest.set(row.term, row);
  for (const { term, change, line } of newest.values()) {
    const present = terms.has(term);
    if (change === 'removed' && present) problems.push({ line, problem: `${term}: newest row is removed but the glossary holds it` });
    if (change !== 'removed' && !present) problems.push({ line, problem: `${term}: newest row is ${change} but the glossary lacks it` });
  }
  return problems.sort((a, b) => a.line - b.line);
}

/** Rows newest first: only `term`'s when given, at most `limit` (default 20). */
export function queryLog(rows, { term, limit = 20 } = {}) {
  if (!Number.isInteger(limit) || limit < 1) throw new Error(`limit ${limit} is not a positive integer`);
  return rows.filter((row) => term === undefined || row.term === term).reverse().slice(0, limit);
}

/** A failure the CLI reports on stderr with exit 2; an empty message prints the usage. */
class UsageError extends Error {}

const USAGE = [
  'usage: node scripts/glossary-log.mjs check [--log GLOSSARY-LOG.md] [--glossary GLOSSARY.md]',
  '       node scripts/glossary-log.mjs append <added|changed|removed> <term> --run <slug> [--date YYYY-MM-DD] [--log GLOSSARY-LOG.md]',
  '       node scripts/glossary-log.mjs show [--term <t>] [--limit <n>] [--log GLOSSARY-LOG.md]',
].join('\n');

/** `argv` as positionals and `--flag value` options; a flag outside `allowed`, repeated, or without a value is a usage error. */
function argsOf(argv, allowed) {
  const positional = [];
  const options = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith('--')) {
      positional.push(arg);
      continue;
    }
    const name = arg.slice(2);
    if (!allowed.includes(name) || i + 1 >= argv.length || Object.hasOwn(options, name)) throw new UsageError();
    i += 1;
    options[name] = argv[i];
  }
  return { positional, options };
}

function readFile(file) {
  try {
    return fs.readFileSync(file, 'utf8');
  } catch (error) {
    throw new UsageError(`glossary-log: cannot read ${file}: ${error.code ?? error.message}`);
  }
}

/** `fn()`, with a thrown refusal (a malformed row or argument) turned into a usage error. */
function refused(fn) {
  try {
    return fn();
  } catch (error) {
    if (error instanceof UsageError) throw error;
    throw new UsageError(`glossary-log: ${error.message}`);
  }
}

function today() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

function check(rest) {
  const { positional, options } = argsOf(rest, ['log', 'glossary']);
  if (positional.length > 0) throw new UsageError();
  const problems = checkLog(readFile(options.log ?? LOG_NAME), readFile(options.glossary ?? 'GLOSSARY.md'));
  for (const { line, problem } of problems) process.stdout.write(`${line} ${problem}\n`);
  return problems.length > 0 ? 1 : 0;
}

function append(rest) {
  const { positional, options } = argsOf(rest, ['run', 'date', 'log']);
  if (positional.length !== 2 || options.run === undefined) throw new UsageError();
  const [change, term] = positional;
  const log = options.log ?? LOG_NAME;
  if (path.basename(log) !== LOG_NAME) throw new UsageError(`glossary-log: append writes only a file named ${LOG_NAME}`);
  const text = fs.existsSync(log) ? readFile(log) : '';
  const next = refused(() => appendLog(text, { date: options.date ?? today(), run: options.run, change, term }));
  try {
    fs.writeFileSync(log, next);
  } catch (error) {
    throw new UsageError(`glossary-log: cannot write ${log}: ${error.code ?? error.message}`);
  }
  return 0;
}

function show(rest) {
  const { positional, options } = argsOf(rest, ['term', 'limit', 'log']);
  if (positional.length > 0) throw new UsageError();
  const limit = options.limit === undefined ? undefined : /^\d{1,6}$/.test(options.limit) ? Number(options.limit) : NaN;
  const text = readFile(options.log ?? LOG_NAME);
  const rows = refused(() => queryLog(readLog(text), { term: options.term, limit }));
  process.stdout.write(`${tableOf(rows).join('\n')}\n`);
  return 0;
}

const COMMANDS = { check, append, show };

function main(argv) {
  const [command, ...rest] = argv;
  try {
    if (!Object.hasOwn(COMMANDS, command ?? '')) throw new UsageError();
    process.exitCode = COMMANDS[command](rest);
  } catch (error) {
    if (!(error instanceof UsageError)) throw error;
    process.stderr.write(`${error.message || USAGE}\n`);
    process.exitCode = 2;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2));
}
