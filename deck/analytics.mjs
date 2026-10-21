/**
 * `pilot analytics <slug>`: the run's tokens, tool calls, time and cost per agent, as the Markdown
 * section for the closing report (run-analytics spec 1, 2, 4, 5). Cost is API-equivalent at the
 * prices in `deck/prices.json`, overridden per model by `<store>/prices.json` (L6, A2). It prints only what
 * `deck/transcripts.mjs` returns, which is never prompt or tool text (ADR 0042). The
 * transcripts are the main checkout's, from `git rev-parse --git-common-dir` in the cwd (A9).
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { PROCESSES, memoryLogFile, readMemory } from './memory.mjs';
import { SLUG } from './runs.mjs';
import { identifierOf } from './status.mjs';
import { storeDir } from './store.mjs';
import { readRun } from './transcripts.mjs';
import { listeningRepo } from './wait.mjs';

const USAGE = 'usage: pilot analytics <slug>\n';
const FIGURES = ['Input', 'Cache write', 'Cache read', 'Output', 'Tool calls', 'Duration', 'Cost'];
const COLUMNS = ['Agent', 'Slice', 'Role', 'Description', 'Model', ...FIGURES];
const SLICE_COLUMNS = ['Slice', 'Agents', ...FIGURES];
const MEMORY_FIGURES = ['Peak RSS', 'Free at peak', 'Readings'];
/** The agent table, split so each half fits a terminal: who each agent is, then its figures, rows in the same order. */
const AGENT_TABLES = [COLUMNS.slice(0, 5), [COLUMNS[0], ...FIGURES]];
/** Kept short so the agent table fits a terminal: an id's first 8 characters, a description's first 16. */
const ID_WIDTH = 8;
const DESCRIPTION_WIDTH = 16;

const DEFAULT_PRICES = fileURLToPath(new URL('./prices.json', import.meta.url));
const PRICE_KINDS = ['input', 'output', 'cacheWrite5m', 'cacheWrite1h', 'cacheRead'];
const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

/** A price file's models, validated; anything else throws, naming the file, and is never replaced by a default. */
function readPriceFile(file) {
  const refuse = (why) => { throw new Error(`${file} is not a usable price table: ${why}`); };
  let table;
  try {
    // A leading byte-order mark is how Windows PowerShell 5.1 saves UTF-8; it is not part of the JSON.
    table = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
  } catch (error) {
    refuse(error.message);
  }
  if (!isObject(table) || !isObject(table.models)) refuse('it needs a "models" object');
  for (const [model, price] of Object.entries(table.models)) {
    const bad = PRICE_KINDS.find((kind) => !(isObject(price) && Number.isFinite(price[kind]) && price[kind] >= 0));
    if (bad) refuse(`"${model}" needs "${bad}" as a number of dollars per million tokens, zero or more`);
  }
  return table.models;
}

/** The shipped prices, overridden per model by `<store>/prices.json` when it exists (L6), the file each came from, and the override's path. */
export function loadPrices(dir = storeDir()) {
  const override = path.join(dir, 'prices.json');
  const files = [DEFAULT_PRICES, ...(fs.existsSync(override) ? [override] : [])];
  const entries = files.flatMap((file) => Object.entries(readPriceFile(file)).map(([model, price]) => ({ model, price, file })));
  return {
    models: Object.fromEntries(entries.map((e) => [e.model, e.price])),
    from: Object.fromEntries(entries.map((e) => [e.model, e.file])),
    override,
  };
}

/** Dollars for some token counts per model, or null, never zero, when any model has no price (spec 5). */
export function costOf(counts, prices) {
  if (!Object.keys(counts).every((model) => Object.hasOwn(prices.models, model))) return null;
  return Object.entries(counts).reduce((total, [model, tokens]) =>
    total + PRICE_KINDS.reduce((sum, kind) => sum + (tokens[kind] * prices.models[model][kind]) / 1e6, 0), 0);
}

const count = (n) => n.toLocaleString('en-US');
const money = (usd) => `${usd < 0 ? '-' : ''}$${Math.abs(usd).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** The summed cost of some agents, null when any of them used an unpriced model. */
export function costOfAgents(agents, prices) {
  const each = agents.map((agent) => costOf(agent.models, prices));
  return each.includes(null) ? null : each.reduce((a, b) => a + b, 0);
}
const cell = (text) => String(text).replace(/\s+/g, ' ').replace(/\|/g, '\\|');

function duration(ms) {
  const seconds = Math.round(ms / 1000);
  const [h, m, s] = [Math.floor(seconds / 3600), Math.floor((seconds % 3600) / 60), seconds % 60];
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

/** Tokens, tool calls, agent-time and cost summed over some agents, as cells. */
function figures(agents, prices) {
  const usd = costOfAgents(agents, prices);
  const counts = agents.flatMap((agent) => Object.values(agent.models));
  const sum = (tokens) => count(counts.reduce((total, t) => total + tokens(t), 0));
  return [sum((t) => t.input), sum((t) => t.cacheWrite5m + t.cacheWrite1h), sum((t) => t.cacheRead), sum((t) => t.output),
    count(agents.reduce((n, a) => n + a.toolCalls, 0)), duration(agents.reduce((n, a) => n + a.durationMs, 0)),
    usd === null ? 'no price' : money(usd)];
}

/** A pipe table with every cell padded to its column's width, numbers right-aligned: aligned in a terminal, still Markdown. */
function table(header, rows) {
  const all = [header, ...rows].map((cells) => cells.map(cell));
  const right = header.map((name) => FIGURES.includes(name) || MEMORY_FIGURES.includes(name) || name === 'Agents');
  const widths = header.map((_, i) => Math.max(3, ...all.map((cells) => cells[i].length)));
  const pad = (text, i) => (right[i] ? text.padStart(widths[i]) : text.padEnd(widths[i]));
  const rule = widths.map((width, i) => (right[i] ? `${'-'.repeat(width - 1)}:` : '-'.repeat(width)));
  return [all[0].map(pad), rule, ...all.slice(1).map((cells) => cells.map(pad))].map((cells) => `| ${cells.join(' | ')} |`);
}

/** Text cut to `width` characters with an ellipsis, by code point so no surrogate pair is split. */
const clip = (text, width) => {
  const points = Array.from(text);
  return points.length > width ? `${points.slice(0, width - 1).join('')}…` : text;
};

const UNRECORDED = 'not in transcripts';
const KINDS = ['input', 'output', 'cacheRead', 'cacheWrite'];

/** Claude Code's count minus the transcripts', per model and kind, signed; a model that matches in every kind has none. */
export function unrecorded(claudeUsage, agents) {
  // Maps, not objects: a model name is transcript text and may be `__proto__`.
  const held = new Map();
  for (const [model, t] of agents.flatMap((agent) => Object.entries(agent.models))) {
    const sum = held.get(model) ?? { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
    held.set(model, { input: sum.input + t.input, output: sum.output + t.output, cacheRead: sum.cacheRead + t.cacheRead,
      cacheWrite: sum.cacheWrite + t.cacheWrite5m + t.cacheWrite1h });
  }
  const counted = new Map(Object.entries(claudeUsage));
  const models = [...new Set([...counted.keys(), ...held.keys()])];
  return Object.fromEntries(models
    .map((model) => [model, Object.fromEntries(KINDS.map((kind) => [kind, (counted.get(model)?.[kind] ?? 0) - (held.get(model)?.[kind] ?? 0)]))])
    .filter(([, difference]) => KINDS.some((kind) => difference[kind] !== 0)));
}

/** One agent-shaped row per model of `unrecorded`, with no tool calls or time; cost-state does not split cache writes, so all are 5-minute. */
export function unrecordedAgents(run) {
  if (!run.claude) return [];
  return Object.entries(unrecorded(run.claude.usage, run.agents)).map(([model, d]) => ({
    id: UNRECORDED, role: '–', description: null, unrecorded: true, toolCalls: 0, durationMs: 0,
    models: { [model]: { input: d.input, output: d.output, cacheRead: d.cacheRead, cacheWrite5m: d.cacheWrite, cacheWrite1h: 0 } },
  }));
}

/** Figures with tool calls and duration as `–`, for usage no agent made. */
const untimed = (cells) => [...cells.slice(0, 4), '–', '–', ...cells.slice(6)];

/** Each id cut to its first 8 characters, or longer where that prefix would not tell two agents apart. */
function shortIds(ids) {
  const unique = (id, n) => n >= id.length || !ids.some((other) => other !== id && other.startsWith(id.slice(0, n)));
  return new Map(ids.map((id) => {
    let n = ID_WIDTH;
    while (!unique(id, n)) n += 1;
    return [id, id.slice(0, n)];
  }));
}

/** An agent's cells; usage no agent made names itself in the role column and has no id or slice. */
const row = (agent, { id, bucket }, prices) => {
  const cells = figures([agent], prices);
  const who = agent.unrecorded ? ['–', '–', UNRECORDED] : [id, bucket ?? '–', agent.role];
  return [...who, clip(agent.description ?? '–', DESCRIPTION_WIDTH), Object.keys(agent.models).join(', ') || '–', ...(agent.unrecorded ? untimed(cells) : cells)];
};

const sliceRows = (record) => (Array.isArray(record.slices) ? record.slices : []).filter((s) => identifierOf(s?.slice));

/** Every needle the record gives, with its bucket and rank: a slice beats design, which beats feature (A5). */
function needleTable(record) {
  const named = (...values) => values.filter((v) => typeof v === 'string' && v);
  return [
    ...sliceRows(record).flatMap((s) => named(s.branch, s.worktree).map((needle) => ({ needle, bucket: identifierOf(s.slice), rank: 0 }))),
    // Nearly every brief names `docs/design/<slug>/…`, so the design branch counts only after a delimiter.
    ...[' ', '`', '"', "'", '(', '\n'].map((p) => ({ needle: `${p}design/${record.slug}`, bucket: 'design', rank: 1 })),
    ...named(`feat/${record.slug}`, record.branch, record.worktree).map((needle) => ({ needle, bucket: 'feature', rank: 2 })),
  ];
}

/** An agent's bucket (A5): its most specific match, the longest within a rank; else its parent's; else unattributed. */
export function bucketOf(agent, byId, record, seen = new Set()) {
  if (agent.id === 'pilot') return 'pilot';
  const best = needleTable(record).filter((n) => agent.matched.includes(n.needle))
    .reduce((a, b) => (!a || b.rank < a.rank || (b.rank === a.rank && b.needle.length > a.needle.length) ? b : a), null);
  if (best) return best.bucket;
  const parent = byId.get(agent.parentId);
  if (!parent || seen.has(parent.id)) return 'unattributed';
  return bucketOf(parent, byId, record, new Set(seen).add(agent.id));
}

/** Each agent's bucket by id, or an empty map without a run record. */
function bucketsOf(run, record) {
  if (!record) return new Map();
  const byId = new Map(run.agents.map((agent) => [agent.id, agent]));
  return new Map(run.agents.map((agent) => [agent.id, bucketOf(agent, byId, record)]));
}

/** One row per bucket with its agent count, every bucket shown even when empty, the usage no transcript holds, and a total row. */
function sliceTable(run, record, prices, extra, bucketed) {
  const buckets = [...new Set([...sliceRows(record).map((s) => identifierOf(s.slice)), 'design', 'feature', 'pilot', 'unattributed'])];
  const members = (bucket) => run.agents.filter((agent) => bucketed.get(agent.id) === bucket);
  return table(SLICE_COLUMNS, [
    ...buckets.map((bucket) => [bucket, count(members(bucket).length), ...figures(members(bucket), prices)]),
    ...(extra.length ? [[UNRECORDED, '–', ...untimed(figures(extra, prices))]] : []),
    ['Total', count(run.agents.length), ...figures([...run.agents, ...extra], prices)],
  ]);
}

/** The cost footer (A2): the table's total beside Claude Code's, where each price came from, and what has none. */
function costFooter(run, prices, extra) {
  const rows = [...run.agents, ...extra];
  const used = [...new Set(rows.flatMap((agent) => Object.keys(agent.models)))];
  const total = costOfAgents(rows, prices);
  const priced = used.filter((model) => Object.hasOwn(prices.from, model));
  const unpriced = used.filter((model) => !Object.hasOwn(prices.from, model));
  return [
    `Cost is API-equivalent at the table's prices, not a bill: ${total === null ? 'no price' : money(total)} in the table` +
      (run.claude ? `, ${money(run.claude.costUSD)} by Claude Code's cost-state.` : ". Claude Code's own count is unknown for this run."),
    ...[...new Set(priced.map((model) => prices.from[model]))]
      .map((file) => `Prices for ${priced.filter((model) => prices.from[model] === file).join(', ')} from ${file}.`),
    ...(unpriced.length ? [`No price for ${unpriced.join(', ')}; add its price to ${prices.override}.`] : []),
    ...(extra.length ? [`The \`${UNRECORDED}\` rows are usage Claude Code counted that no transcript records, belonging to no agent or slice; ` +
      'cost-state does not split cache writes, so theirs are priced at the 5-minute rate.'] : []),
  ].join('\n');
}

const mib = (bytes) => `${count(Math.round(bytes / 2 ** 20))} MiB`;

/** Each deck process's peak memory inside the run's span, from every reading on this machine (L11), or one line saying there were none. */
function memoryTable(run) {
  const file = memoryLogFile();
  const peaks = readMemory(file, run.span);
  if (peaks.size === 0) return [`No memory readings in ${file}.`];
  const rows = PROCESSES.filter((name) => peaks.has(name)).map((name) => peaks.get(name))
    .map((peak) => [peak.process, mib(peak.rss), mib(peak.free), count(peak.readings)]);
  return table(['Process', ...MEMORY_FIGURES], rows);
}

/** The agent table, the slice table when the record was found, the memory table, and the footer. */
function render(slug, run, record, recordPath, prices) {
  const extra = unrecordedAgents(run);
  const bucketed = bucketsOf(run, record);
  const ids = shortIds(run.agents.map((agent) => agent.id));
  const rows = [...run.agents, ...extra].map((agent) => row(agent, { id: ids.get(agent.id), bucket: bucketed.get(agent.id) }, prices));
  return [
    `## Analytics: ${slug}`,
    '',
    ...AGENT_TABLES.flatMap((columns) => [...table(columns, rows.map((cells) => columns.map((name) => cells[COLUMNS.indexOf(name)]))), '']),
    ...(record ? [...sliceTable(run, record, prices, extra, bucketed), ''] : [`No slice table: no readable run record at ${recordPath}.`, '']),
    ...memoryTable(run),
    '',
    `Sessions ${run.sessions.join(', ')}.`,
    'Tokens count each message once.',
    `The pilot row's duration is a wall span, idle time included; skipped ${run.skippedLines} line${run.skippedLines === 1 ? '' : 's'}.`,
    '',
    costFooter(run, prices, extra),
    '',
  ].join('\n');
}

/** The run.json mirror in the cwd (A9), or null when it is missing or not a JSON object. */
function readRecord(file) {
  try {
    const record = JSON.parse(fs.readFileSync(file, 'utf8'));
    return isObject(record) ? record : null;
  } catch {
    return null;
  }
}

export function main(argv, { cwd = process.cwd(), repo = listeningRepo(cwd), projectsRoot } = {}) {
  const [slug, ...extra] = argv;
  if (!SLUG.test(slug ?? '') || extra.length > 0) {
    process.stderr.write(USAGE);
    return 1;
  }
  let prices;
  try {
    prices = loadPrices();
  } catch (error) {
    process.stderr.write(`pilot analytics: ${error.message}\n`);
    return 1;
  }
  const recordPath = path.join(cwd, 'docs', 'design', slug, 'run.json');
  const record = readRecord(recordPath);
  const run = readRun(repo, slug, { needles: record ? needleTable(record).map((n) => n.needle) : [], projectsRoot });
  if (run.sessions.length === 0) {
    process.stderr.write(`pilot analytics: no session of ${repo} called deck_status with the slug "${slug}"\n`);
    return 1;
  }
  process.stdout.write(render(slug, run, record, recordPath, prices));
  return 0;
}
