/**
 * The audit report (housekeeping-audit spec 11-13; L3, L4, L6, L17, A3): what
 * the auditor hands back, checked, ranked, rendered and kept in the deck store,
 * never in the audited repository. A row without the command that measured it
 * and its output is refused in code (L4); a failed command is still a row.
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { atomicWriteFileSync, privateDir } from '../hooks/lib/atomic-write.js';
import { repoKey } from './items.mjs';
import { storeDir } from './store.mjs';
import { zeroCounts } from './transcripts.mjs';

/** The measured concerns, in the order a tie is broken by. `open` is what no named area covers (spec 15). */
export const AREAS = ['setup', 'loops', 'preview', 'navigability', 'context', 'tooling', 'rederived', 'open'];

/** L6: effort weights, and how many tokens are worth one minute. Both printed in the report. */
const EFFORT_WEIGHTS = { S: 1, M: 3, L: 8 };
const TOKENS_PER_MINUTE = 1000;

/** L17: the open area chooses its ten; an eleventh is refused, never dropped. */
export const MAX_OPEN_ROWS = 10;

const TEXT_FIELDS = ['finding', 'command', 'output', 'fix', 'spec'];
/** bigger-jobs L7: the fundamentalist's call on a row, optional; any but `keep` cuts it, never drops it (A4). */
const CALLS = ['keep', 'unnecessary', 'overengineering'];
const isCut = (row) => row.verdict != null && row.verdict.call !== 'keep';
const EXCERPT_CHARS = 200;

const isText = (value) => typeof value === 'string' && value.trim() !== '';
const isAmount = (value) => typeof value === 'number' && Number.isFinite(value) && value >= 0;

function rowProblems(row, n) {
  if (row === null || typeof row !== 'object') return [`row ${n} is not an object`];
  const problems = [];
  if (!AREAS.includes(row.area)) problems.push(`row ${n}: area must be one of ${AREAS.join(', ')}`);
  for (const field of TEXT_FIELDS) {
    if (!isText(row[field])) problems.push(`row ${n}: ${field} is missing; every row carries its ${field}`);
  }
  if (row.exit !== null && !Number.isInteger(row.exit)) problems.push(`row ${n}: exit is an integer, or null for a timeout`);
  if (!isAmount(row.saving?.minutes) || !isAmount(row.saving?.tokens)) {
    problems.push(`row ${n}: saving needs minutes and tokens per run, each a number of at least 0`);
  }
  if (!Object.hasOwn(EFFORT_WEIGHTS, row.effort)) problems.push(`row ${n}: effort is S, M or L`);
  if (Object.hasOwn(row, 'verdict') && !(CALLS.includes(row.verdict?.call) && isText(row.verdict.reason))) {
    problems.push(`row ${n}: verdict is { call, reason }, call one of ${CALLS.join(', ')} and a reason given`);
  }
  return problems;
}

/** The line `unmeasured` carries when there is no `measured` block (spec 10). */
const UNMEASURED_SPEND = 'measured spend:';
const KINDS = Object.keys(zeroCounts());

/** The repository's spend from the usage log, as `scripts/audit-spend.mjs` printed it (L8). */
function measuredProblems(report) {
  const { measured } = report;
  if (measured == null) {
    const said = Array.isArray(report.unmeasured) && report.unmeasured.some((line) => String(line).startsWith(UNMEASURED_SPEND));
    return said ? [] : [`measured is missing: copy audit-spend's block, or say why in unmeasured with a line starting "${UNMEASURED_SPEND}"`];
  }
  if (typeof measured !== 'object' || Array.isArray(measured)) return ['measured is { log, from, to, spend }'];
  const problems = [];
  if (!isText(measured.log)) problems.push('measured.log is missing: name the usage log');
  for (const end of ['from', 'to']) {
    if (Number.isNaN(Date.parse(measured[end]))) problems.push(`measured.${end} is not a date`);
  }
  if (!KINDS.every((kind) => isAmount(measured.spend?.[kind]))) {
    problems.push(`measured.spend needs ${KINDS.join(', ')}, each a number of at least 0`);
  }
  return [...problems, ...runsProblems(measured.runs)];
}

/** `measured.runs` as audit-spend printed it, when given: absent means no share column (S6). */
function runsProblems(runs) {
  if (runs == null) return [];
  if (!Array.isArray(runs)) return ['measured.runs is a list of { slug, updatedAt, tokens, toolCalls, costUSD }'];
  return runs.flatMap((run, i) => {
    const valid = isText(run?.slug) && !Number.isNaN(Date.parse(run.updatedAt)) && isAmount(run.tokens) &&
      Number.isInteger(run.toolCalls) && run.toolCalls >= 0 && (run.costUSD === null || isAmount(run.costUSD));
    return valid ? [] : [`measured.runs ${i + 1} needs slug, updatedAt as a date, tokens and toolCalls of at least 0, and costUSD a number or null`];
  });
}

/** Every reason this report would be refused; `[]` when it is valid. */
export function validateReport(report) {
  if (report === null || typeof report !== 'object') return ['the report is not an object'];
  const problems = [];
  if (!isText(report.repo)) problems.push('repo is missing');
  if (!isText(report.scratch)) problems.push('scratch is missing: name the worktree the audit measured in');
  if (Number.isNaN(Date.parse(report.startedAt))) problems.push('startedAt is not a date');
  if (!isAmount(report.minutes)) problems.push('minutes is not a number of at least 0');
  if (report.tokens !== null && !isAmount(report.tokens)) problems.push('tokens is a number, or null when not measured');
  if (!Array.isArray(report.unmeasured)) problems.push('unmeasured is a list, empty when everything was measured');
  problems.push(...measuredProblems(report));
  if (!Array.isArray(report.rows)) return [...problems, 'rows is not a list'];

  let open = 0;
  report.rows.forEach((row, i) => {
    problems.push(...rowProblems(row, i + 1));
    if (row?.area === 'open' && ++open > MAX_OPEN_ROWS) {
      problems.push(`row ${i + 1}: an open row past the ${MAX_OPEN_ROWS} the open area may report; choose which ten`);
    }
  });
  return problems;
}

const scoreOf = (row) =>
  (row.saving.minutes + row.saving.tokens / TOKENS_PER_MINUTE) / EFFORT_WEIGHTS[row.effort];

/** L6: saving per run over effort, ties by area then finding; ids F1..Fn in that order. New rows, never the given ones. */
export function rankRows(rows) {
  return rows
    .map((row) => ({ ...row, score: scoreOf(row) }))
    .sort(
      (a, b) =>
        b.score - a.score || AREAS.indexOf(a.area) - AREAS.indexOf(b.area) || a.finding.localeCompare(b.finding),
    )
    .map((row, i) => ({ ...row, id: `F${i + 1}` }));
}

const oneLine = (text) => String(text).replace(/\s+/g, ' ').trim();
const cell = (text) => oneLine(text).replace(/\|/g, '\\|');
const excerpt = (text) => {
  const line = oneLine(text);
  return line.length > EXCERPT_CHARS ? `${line.slice(0, EXCERPT_CHARS)}…` : line;
};
const exitOf = (row) => (row.exit === null ? 'timed out' : `exit ${row.exit}`);
const savingOf = (row) => `${row.saving.minutes} min + ${row.saving.tokens} tokens`;

/** The deck body's cuts (thread-kinds S7, L2): the .md report keeps every word, the deck a glance of it. */
const FINDING_CHARS = 100;
const COMMAND_CHARS = 40;
const UNMEASURED_CHARS = 50;
const BASELINE_CHARS = 80;
const FIX_CHARS = 160;
const REASON_CHARS = 160;
/** At most `max` characters, cut at a word where one is near, marked with an ellipsis. */
const cut = (text, max) => {
  const line = oneLine(text);
  if (line.length <= max) return line;
  const head = line.slice(0, max - 1);
  const space = head.lastIndexOf(' ');
  return `${(space > max / 2 ? head.slice(0, space) : head).replace(/[\s,;:.]+$/, '')}…`;
};
const savesSomething = (row) => row.saving.minutes + row.saving.tokens > 0;

const usd = (cost) => (cost === null ? 'no price' : `$${cost.toFixed(2)}`);
const runsOf = ({ measured }) => (Array.isArray(measured?.runs) ? measured.runs : []);

/** The audit's first lines when it measured the spend: the baseline every row is read against (L8), and the latest runs. */
function measuredLine(report) {
  const { measured } = report;
  if (measured == null) return [];
  const { spend } = measured;
  const total = KINDS.reduce((sum, kind) => sum + spend[kind], 0);
  const kinds = KINDS.map((kind) => `${kind} ${spend[kind]}`).join(', ');
  const runs = runsOf(report).map((run) =>
    `${oneLine(run.slug)} (updated ${run.updatedAt}): ${run.tokens} tokens, ${run.toolCalls} tool calls, ${usd(run.costUSD)}`);
  return [
    `Measured spend: ${total} tokens (${kinds}) from ${measured.from} to ${measured.to}, in the usage log ${oneLine(measured.log)}.`,
    ...(runs.length ? [`Latest runs: ${runs.join('; ')}.`] : []),
  ];
}

/** A row's saved tokens as a percentage of the mean latest run, or null without a run to measure against. */
function shareOf(report) {
  const runs = runsOf(report);
  const mean = runs.reduce((sum, run) => sum + run.tokens, 0) / runs.length;
  return mean > 0 ? (row) => `${Number(((row.saving.tokens / mean) * 100).toPrecision(2))}%` : null;
}

function costLine(report) {
  const tokens = report.tokens === null ? 'tokens not measured' : `${report.tokens} tokens`;
  return `Cost: ${tokens}, ${report.minutes} min.`;
}

/** The file's table and the deck's list, each row by its F-id alone (A3); rows the fundamentalist cut follow the kept ones, with its reason (bigger-jobs spec 12). */
export function renderReport(report) {
  const rows = rankRows(report.rows);
  const kept = rows.filter((row) => !isCut(row));
  const cuts = rows.filter(isCut);
  const unmeasured = report.unmeasured.length === 0 ? 'nothing' : report.unmeasured.map(oneLine).join('; ');
  const measured = measuredLine(report);
  const share = shareOf(report);
  const shareCell = (row) => (share ? ` ${share(row)} |` : '');
  const shareNote = (row) => (share ? ` (${share(row)} of a run)` : '');

  const table = [
    `# Audit of ${report.repo}`,
    '',
    `Started ${report.startedAt}, measured in the scratch worktree ${report.scratch}, since removed.`,
    ...(report.duringRun ? ['Measured during a piloted run: timings are noisier than on an idle machine.'] : []),
    ...measured,
    costLine(report),
    `Ranking: score = (minutes + tokens / ${TOKENS_PER_MINUTE}) per run ÷ effort weight (S 1, M 3, L 8); ` +
      `${TOKENS_PER_MINUTE} tokens = 1 minute.`,
    `Unmeasured: ${unmeasured}.`,
    '',
    `| Id | Area | Finding | Evidence | Saving/run | Fix | Effort |${share ? ' Share of a run |' : ''}`,
    `| --- | --- | --- | --- | --- | --- | --- |${share ? ' --- |' : ''}`,
    ...rows.map((row) =>
      `| ${row.id} | ${row.area} | ${cell(row.finding)} | \`${cell(row.command)}\` (${exitOf(row)}): ${cell(excerpt(row.output))} | ` +
      `${savingOf(row)} | ${cell(row.fix)} | ${row.effort} |${shareCell(row)}`,
    ),
    '',
    '## Spec text per row',
    ...rows.flatMap((row) => ['', `### ${row.id}: ${oneLine(row.finding)}`, '', row.spec.trim()]),
    ...(cuts.length ? ['', '## Cut', '', ...cuts.map((row) => `- ${row.id} (${row.verdict.call}): ${oneLine(row.verdict.reason)}`)] : []),
    '',
  ].join('\n');

  const findings = kept.filter(savesSomething);
  const baselines = kept.filter((row) => !savesSomething(row));
  const unmeasuredCut = report.unmeasured.length === 0 ? 'nothing' : report.unmeasured.map((item) => cut(item, UNMEASURED_CHARS)).join('; ');
  const deckBody = [
    ...(measured.length ? [...measured, ''] : []),
    ...findings.flatMap((row) => [
      `- **${row.id}** ${cut(row.finding, FINDING_CHARS)} · score ${Number(row.score.toPrecision(2))} · ` +
        `saves ${savingOf(row)}/run${shareNote(row)} · effort ${row.effort}`,
      `  **Evidence** \`${cut(row.command, COMMAND_CHARS)}\` (${exitOf(row)})`,
      `  **Fix** ${cut(row.fix, FIX_CHARS)}`,
    ]),
    ...(baselines.length ? ['', '### Baselines'] : []),
    ...baselines.map((row) => `- **${row.id}** ${cut(row.finding, BASELINE_CHARS)}`),
    ...(cuts.length ? ['', '### Cut', '', 'Argued down by the fundamentalist; each can still be picked.', ''] : []),
    ...cuts.map((row) => `- **${row.id}** ${cut(row.finding, BASELINE_CHARS)} · ${row.verdict.call}: ${cut(row.verdict.reason, REASON_CHARS)}`),
    '',
    `${costLine(report)} Unmeasured: ${unmeasuredCut}.`,
    '',
    'Reply with the ids to post as tickets (for example F1, F3), or none.',
  ].join('\n');

  return { table, deckBody };
}

/** A repo key as one directory name: readable, and unique by a hash of the key itself. */
function directoryFor(repo) {
  const key = repoKey(repo);
  const readable = key.replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(-60);
  const hash = crypto.createHash('sha256').update(key).digest('hex').slice(0, 10);
  return `${readable}-${hash}`;
}

const auditDir = (repo) => path.join(storeDir(), 'audits', directoryFor(repo));
const recordFile = (repo) => path.join(auditDir(repo), 'record.json');

/** L15: the offer repeats after this many counted runs since the last offer or report. */
export const OFFER_EVERY_RUNS = 10;

/** The audit record of one repository: `{ offers: [{ run, at }], counted: [run key] }`. */
function readRecord(repo) {
  const file = recordFile(repo);
  let record;
  try {
    record = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    if (err.code === 'ENOENT') return { offers: [], counted: [] };
    throw new Error(`the audit record ${file} is not readable JSON (${err.message}); move it aside to start over`);
  }
  if (!Array.isArray(record?.offers) || !Array.isArray(record?.counted)) {
    throw new Error(`the audit record ${file} is not an audit record; move it aside to start over`);
  }
  return record;
}

function writeRecord(repo, record) {
  // Inside the store, which this may be first to make (L6).
  privateDir(auditDir(repo));
  atomicWriteFileSync(recordFile(repo), `${JSON.stringify(record, null, 2)}\n`);
  return record;
}

const hasReport = (repo) =>
  fs.existsSync(auditDir(repo)) && fs.readdirSync(auditDir(repo)).some((file) => /^\d.*\.json$/.test(file));

/**
 * Adds a run key once (L15: step 1 run twice counts once) and returns the count since the last
 * offer or report. A run key already offered is a no-op too (B2): a resume of the run just
 * offered the audit must not count it a second time, or the next offer would come a run early.
 */
export function countRun(repo, runKey) {
  const record = readRecord(repo);
  if (record.counted.includes(runKey) || record.offers.some((offer) => offer.run === runKey)) {
    return record.counted.length;
  }
  return writeRecord(repo, { ...record, counted: [...record.counted, runKey] }).counted.length;
}

/** Reads only: 'first' when never offered nor audited (A9), 'every' on the tenth counted run, else null. */
export function auditDue(repo) {
  const record = readRecord(repo);
  if (record.offers.length === 0 && !hasReport(repo)) return 'first';
  return record.counted.length >= OFFER_EVERY_RUNS ? 'every' : null;
}

/**
 * Records that this run was offered the audit, whatever the user answers (P15: the answer itself
 * is never read); re-arms the count for ten more runs.
 */
export function recordOffer(repo, runKey) {
  const record = readRecord(repo);
  return writeRecord(repo, { offers: [...record.offers, { run: runKey, at: new Date().toISOString() }], counted: [] });
}

/** L3: the report in the deck store, beside its json and the deck's body. Throws with every problem. */
export function saveReport(repo, report) {
  const problems = validateReport(report);
  if (problems.length > 0) throw new Error(`the audit report is refused:\n${problems.join('\n')}`);

  const dir = auditDir(repo);
  const stamp = new Date(report.startedAt).toISOString().replace(/[:.]/g, '-');
  const base = path.join(dir, stamp);
  const saved = { json: `${base}.json`, markdown: `${base}.md`, deck: `${base}.deck.md` };
  const { table, deckBody } = renderReport(report);

  privateDir(dir);
  fs.writeFileSync(saved.json, `${JSON.stringify({ ...report, rows: rankRows(report.rows) }, null, 2)}\n`);
  fs.writeFileSync(saved.markdown, table);
  fs.writeFileSync(saved.deck, `${deckBody}\n\nFull report: ${saved.markdown}\n`);
  writeRecord(repo, { ...readRecord(repo), counted: [] });
  return saved;
}

const PICK_ID = /^F\d+$/i;
const PICK_SEPARATORS = /[\s,;&]+/;

/**
 * L11: the user's typed pick, read strictly. Only a reply whose every word is an
 * id, `and`, or a separator picks anything, so "F1 but not F3" posts nothing
 * rather than F3 against the user's words. Ids come back upper-case, once each,
 * in pick order; ids the report does not carry are named in `unknown`.
 */
export function parsePicks(reply, ids) {
  const words = String(reply).trim().replace(/\.$/, '').split(PICK_SEPARATORS).filter((word) => word !== '');
  const tokens = words.filter((word) => word.toLowerCase() !== 'and');
  if (tokens.length === 0 || !tokens.every((word) => PICK_ID.test(word))) return { picked: [], unknown: [] };
  const known = new Set(ids.map((id) => id.toUpperCase()));
  const chosen = [...new Set(tokens.map((word) => word.toUpperCase()))];
  return { picked: chosen.filter((id) => known.has(id)), unknown: chosen.filter((id) => !known.has(id)) };
}

/** The ranked rows of a saved report's JSON text. */
function savedRows(reportJson) {
  let rows;
  try {
    rows = JSON.parse(reportJson)?.rows;
  } catch (err) {
    throw new Error(`this report is not readable JSON (${err.message}); give the path \`audit save\` printed`);
  }
  if (!Array.isArray(rows)) throw new Error('this is not a saved audit report: it has no rows');
  return rows;
}

/**
 * The ticket body for the picked rows, each spec exactly as the report saved it, never re-flowed
 * (spec 14). One id is its spec alone; several, the picks on one surface (bigger-jobs spec 6), are
 * each under `### <id>: <finding>`, in pick order.
 * @param {string} reportJson
 * @param {string[]} ids
 */
export function specFor(reportJson, ids) {
  const rows = savedRows(reportJson);
  const wanted = ids.map((id) => String(id).toUpperCase());
  if (wanted.length === 0) throw new Error('no ids given: name at least one row');
  const picked = wanted.map((id) => {
    const row = rows.find((candidate) => candidate?.id === id);
    if (!row) throw new Error(`no row ${id} in this report; its ids are ${rows.map((r) => r?.id).join(', ')}`);
    return row;
  });
  if (picked.length === 1) return picked[0].spec;
  return picked.map((row) => `### ${row.id}: ${oneLine(row.finding)}\n\n${row.spec}`).join('\n\n');
}

/**
 * `spec <report.json> <id> [<id>...]` prints the ids' body (`specFor`), then the report it came from, which is what lets
 * the ticket it becomes pass the deck's shape check (crew-voice-rules A8); `pick <report.json> <reply-file>`
 * prints each picked id on its own line and names unknown ids on stderr. The reply is read from a file,
 * never an argument: it is the user's typed text, and a shell line built around it is an injection.
 */
function rowVerb(command, file, args) {
  const [arg] = args;
  if (!file || !arg) {
    process.stderr.write(USAGE);
    return 2;
  }
  try {
    const json = fs.readFileSync(file, 'utf8');
    if (command === 'spec') {
      process.stdout.write(`${specFor(json, args)}\n\nAudit report: ${path.resolve(file)}`);
      return 0;
    }
    const ids = savedRows(json).map((row) => String(row?.id));
    const { picked, unknown } = parsePicks(fs.readFileSync(arg, 'utf8'), ids);
    if (unknown.length > 0) process.stderr.write(`unknown: ${unknown.join(', ')}\n`);
    process.stdout.write(picked.map((id) => `${id}\n`).join(''));
    return 0;
  } catch (err) {
    process.stderr.write(`pilot audit ${command}: ${err.message}\n`);
    return 1;
  }
}

const USAGE =
  'usage: pilot audit save <report.json> | spec <report.json> <id> [<id>...] | pick <report.json> <reply-file>\n' +
  '       | count <run key> | due | offered <run key>\n';

/** L15's three verbs on the repository in the working directory; exit 2 on a word they do not take. */
function offerVerb(command, word) {
  const repo = process.cwd();
  if (command === 'due') {
    const due = auditDue(repo);
    const count = readRecord(repo).counted.length;
    process.stdout.write(due === null ? `not due ${count}\n` : `due ${due === 'first' ? 'first' : `every ${count}`}\n`);
    return due === null ? 1 : 0;
  }
  if (command === 'count' && isText(word)) {
    process.stdout.write(`${countRun(repo, word.trim())}\n`);
    return 0;
  }
  if (command === 'offered' && isText(word)) {
    recordOffer(repo, word.trim());
    return 0;
  }
  process.stderr.write(USAGE);
  return 2;
}

/** `pilot audit save <report.json>`: prints the three paths, or exits 1 with the problems on stderr. */
export function main(argv) {
  const [command, file] = argv;
  if (['count', 'due', 'offered'].includes(command)) return offerVerb(command, file);
  if (command === 'spec' || command === 'pick') return rowVerb(command, file, argv.slice(2));
  if (command !== 'save' || !file) {
    process.stderr.write(USAGE);
    return 2;
  }
  try {
    const report = JSON.parse(fs.readFileSync(file, 'utf8'));
    const saved = saveReport(report?.repo, report);
    process.stdout.write(`${saved.json}\n${saved.markdown}\n${saved.deck}\n`);
    return 0;
  } catch (err) {
    process.stderr.write(`pilot audit save: ${err.message}\n`);
    return 1;
  }
}
