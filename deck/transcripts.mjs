/**
 * The one transcript reader (ADR 0042): tokens, tool calls and time per agent for a run, from
 * its transcripts under `~/.claude/projects`. A message counts once, by `message.id` at its
 * largest output (L3); an agent is its `agentId` across sessions (L4); a run is the sessions
 * whose `deck_status` names its slug (A4); and no prompt or tool text is returned, only the
 * needles an agent's brief contains (L5), matched with a newline before the brief so a needle
 * led by a delimiter also matches at its start. The format is undocumented, so every field is
 * checked and a line that does not parse is skipped and counted.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const DECK_STATUS = '__deck_status';

const defaultRoot = () => path.join(os.homedir(), '.claude', 'projects');

const num = (value) => (Number.isFinite(value) ? value : 0);
const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const blocks = (message) => (Array.isArray(message?.content) ? message.content.filter(isObject) : []);

/** Claude Code's directory for a cwd: every non-alphanumeric character becomes `-`, matched case-insensitively. */
export function projectDir(repo, projectsRoot = defaultRoot()) {
  const want = repo.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase();
  let names;
  try {
    names = fs.readdirSync(projectsRoot);
  } catch {
    return null;
  }
  const found = names.find((name) => name.toLowerCase() === want);
  return found ? path.join(projectsRoot, found) : null;
}

/** The object a JSON text holds, or null when it holds anything else or does not parse. */
function parseObject(text) {
  try {
    const value = JSON.parse(text);
    return isObject(value) ? value : null;
  } catch {
    return null;
  }
}

/** One JSONL file's entries, its skipped lines and its first and last timestamps. */
function readTranscript(file, text = fs.readFileSync(file, 'utf8')) {
  const parsed = text.split('\n').filter((line) => line.trim()).map(parseObject);
  const entries = parsed.filter(Boolean);
  const stamps = entries.map((entry) => Date.parse(entry.timestamp)).filter(Number.isFinite);
  const first = stamps.reduce((a, b) => Math.min(a, b), Infinity);
  const last = stamps.reduce((a, b) => Math.max(a, b), -Infinity);
  return { entries, skipped: parsed.length - entries.length, first, spanMs: stamps.length ? last - first : 0 };
}

const readMeta = (file) => (fs.existsSync(file) && parseObject(fs.readFileSync(file, 'utf8'))) || {};

const namesSlug = (entry, slug) =>
  entry.type === 'assistant' &&
  blocks(entry.message).some((b) => b.type === 'tool_use' && String(b.name).endsWith(DECK_STATUS) && b.input?.slug === slug);

function tokenCounts(usage = {}) {
  const split = isObject(usage.cache_creation) ? usage.cache_creation : null;
  return {
    input: num(usage.input_tokens),
    // An entry without the 5m/1h split has all its cache write in the 5-minute bucket.
    cacheWrite5m: split ? num(split.ephemeral_5m_input_tokens) : num(usage.cache_creation_input_tokens),
    cacheWrite1h: split ? num(split.ephemeral_1h_input_tokens) : 0,
    cacheRead: num(usage.cache_read_input_tokens),
    output: num(usage.output_tokens),
  };
}

export const zeroCounts = () => ({ input: 0, cacheWrite5m: 0, cacheWrite1h: 0, cacheRead: 0, output: 0 });
export const addCounts = (a, b) => Object.fromEntries(Object.entries(a).map(([kind, n]) => [kind, n + b[kind]]));

/** An assistant entry's message: `null` for anything else. */
const assistantMessage = (entry) => {
  const message = entry.type === 'assistant' ? entry.message : null;
  return isObject(message) && typeof message.id === 'string' ? message : null;
};

/**
 * Keeps one count per `message.id`, at its largest output, in `kept`; `<synthetic>` entries are
 * Claude Code's own placeholders, not model calls. Returns the kept record, or null when the entry
 * counts nothing.
 */
function keepMessage(kept, message) {
  if (typeof message.model !== 'string' || message.model.startsWith('<')) return null;
  const counts = tokenCounts(isObject(message.usage) ? message.usage : {});
  const before = kept.get(message.id);
  if (before && counts.output <= before.counts.output) return before;
  const record = { ...before, model: message.model, counts };
  kept.set(message.id, record);
  return record;
}

/** Tokens per model with each message once, unique tool calls and summed spans over some files. */
function usageOf(files) {
  const kept = new Map();
  const tools = new Set();
  for (const { entries } of files) {
    for (const entry of entries) {
      const message = assistantMessage(entry);
      if (!message) continue;
      for (const b of blocks(message)) if (b.type === 'tool_use' && typeof b.id === 'string') tools.add(b.id);
      keepMessage(kept, message);
    }
  }
  const models = {};
  for (const { model, counts } of kept.values()) models[model] = addCounts(models[model] ?? zeroCounts(), counts);
  return { models, toolCalls: tools.size, durationMs: files.reduce((total, f) => total + f.spanMs, 0) };
}

/** Every `.jsonl` under the projects root modified at or after `fromMs`: mtime is the filter (L4). */
async function filesModifiedSince(projectsRoot, fromMs) {
  let names;
  try {
    names = await fs.promises.readdir(projectsRoot, { recursive: true });
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }
  const files = [];
  for (const name of names.filter((n) => n.endsWith('.jsonl'))) {
    const file = path.join(projectsRoot, name);
    const stat = await fs.promises.stat(file).catch(() => null);
    if (stat?.isFile() && stat.mtimeMs >= fromMs) files.push(file);
  }
  return files;
}

/**
 * The five kinds of tokens spent in `[fromMs, toMs)` across every transcript under the projects
 * root, subagents included: in total, per model, and per model under each entry's `cwd`
 * (`unknown` for an entry without one); numbers, model names and paths only (ADR 0042). A message counts once, at its largest output, in the window its first
 * entry's timestamp falls in (L4). Files are read one per event-loop turn, never synchronously (L5).
 */
export async function readWindow(fromMs, toMs, { projectsRoot = defaultRoot() } = {}) {
  const kept = new Map();
  let skippedLines = 0;
  for (const file of await filesModifiedSince(projectsRoot, fromMs)) {
    let text;
    try {
      text = await fs.promises.readFile(file, 'utf8');
    } catch (err) {
      if (err.code === 'ENOENT') continue; // removed since it was listed
      throw err;
    }
    const { entries, skipped } = readTranscript(file, text);
    skippedLines += skipped;
    for (const entry of entries) {
      const message = assistantMessage(entry);
      const at = Date.parse(entry.timestamp);
      if (!message || !Number.isFinite(at)) continue;
      const record = keepMessage(kept, message);
      // The message's directory is its first entry's, as its window is.
      if (record && !(record.first <= at)) Object.assign(record, { first: at, cwd: typeof entry.cwd === 'string' ? entry.cwd : 'unknown' });
    }
  }
  let total = zeroCounts();
  const byModel = new Map();
  const byCwd = new Map();
  const add = (map, key, counts) => map.set(key, addCounts(map.get(key) ?? zeroCounts(), counts));
  for (const { first, model, cwd, counts } of kept.values()) {
    if (!(first >= fromMs && first < toMs)) continue;
    total = addCounts(total, counts);
    add(byModel, model, counts);
    if (!byCwd.has(cwd)) byCwd.set(cwd, new Map());
    add(byCwd.get(cwd), model, counts);
  }
  // Built from entries, so a key such as `__proto__` is an own property like any other.
  const byCwdObject = Object.fromEntries([...byCwd].map(([cwd, models]) => [cwd, Object.fromEntries(models)]));
  return { total, byModel: Object.fromEntries(byModel), byCwd: byCwdObject, skippedLines };
}

const textOf = ({ message }) =>
  typeof message?.content === 'string' ? message.content : blocks(message).filter((b) => b.type === 'text').map((b) => String(b.text)).join('\n');

/** The text of the first user turn that is not Claude Code's own: the brief an agent was spawned with. */
function briefOf(entries) {
  for (const entry of entries) if (entry.type === 'user' && !entry.isMeta && textOf(entry)) return textOf(entry);
  return '';
}

/** A path or branch as compared: back-slashes are forward, and case is folded, as Windows paths are. */
const fold = (text) => text.replace(/\\+/g, '/').toLowerCase();

/** One agent from its transcript files, which come in the order of the run's sessions, earliest first. */
function agentUsage(id, files, needles) {
  const meta = files.find((f) => typeof f.meta.description === 'string')?.meta ?? files[0].meta;
  // Led by a newline, so a needle that must follow a delimiter also matches at the brief's start.
  const brief = `\n${fold(briefOf(files[0].entries))}`;
  return {
    id,
    role: typeof meta.agentType === 'string' ? meta.agentType.replace(/^pilot:/, '') : 'unknown',
    description: typeof meta.description === 'string' ? meta.description : null,
    parentId: typeof meta.parentAgentId === 'string' ? meta.parentAgentId : null,
    ...usageOf(files),
    matched: needles.filter((needle) => brief.includes(fold(needle))),
  };
}

function subagentFiles(sessionDir) {
  const dir = path.join(sessionDir, 'subagents');
  const names = fs.existsSync(dir) ? fs.readdirSync(dir) : [];
  return names.map((name) => /^agent-(.+)\.jsonl$/.exec(name)).filter(Boolean)
    .map(([name, id]) => ({ id, ...readTranscript(path.join(dir, name)), meta: readMeta(path.join(dir, `agent-${id}.meta.json`)) }));
}

const USAGE_FIELDS = { input: 'inputTokens', output: 'outputTokens', cacheRead: 'cacheReadInputTokens', cacheWrite: 'cacheCreationInputTokens' };

/**
 * Claude Code's own tokens per model from a `cost-state` entry, numbers and model names only (ADR 0042); null without them.
 * A trailing `[…]`, as in `claude-opus-5-5[1m]`, is dropped so the key names the transcripts' model, and the two are summed.
 */
function stateUsage(state) {
  if (!isObject(state?.modelUsage)) return null;
  return Object.entries(state.modelUsage).filter(([, usage]) => isObject(usage))
    .map(([model, usage]) => ({ [model.replace(/\[[^\]]*\]$/, '')]:
      Object.fromEntries(Object.entries(USAGE_FIELDS).map(([kind, field]) => [kind, num(usage[field])])) }))
    .reduce((sum, one) => addUsage(sum, one), {});
}

/** Per-model counts summed over some records of them. */
const addUsage = (a, b) => Object.fromEntries([...new Set([...Object.keys(a), ...Object.keys(b)])].map((model) =>
  [model, Object.fromEntries(Object.keys(USAGE_FIELDS).map((kind) => [kind, (a[model]?.[kind] ?? 0) + (b[model]?.[kind] ?? 0)]))]));

/**
 * Claude Code's own dollars and tokens for some sessions, from each one's last cost-state, or null
 * unless every one of them has a cost-state with its dollars and its `modelUsage`: never a part of the run.
 */
function claudeCount(mains) {
  let count = { costUSD: 0, usage: {} };
  for (const { entries } of mains) {
    const state = entries.filter((e) => e.type === 'cost-state' && Number.isFinite(e.totalCostUSD)).at(-1);
    const usage = stateUsage(state);
    if (!usage) return null;
    count = { costUSD: count.costUSD + state.totalCostUSD, usage: addUsage(count.usage, usage) };
  }
  return count;
}

/** The main sessions of the run named by `slug` under a project directory, earliest first, and each agent's subagent files. */
function runFiles(dir, slug) {
  const mains = [];
  for (const name of fs.readdirSync(dir).filter((n) => n.endsWith('.jsonl'))) {
    const file = path.join(dir, name);
    // A cheap substring test first: most sessions never called deck_status at all.
    const text = fs.readFileSync(file, 'utf8');
    if (!text.includes(DECK_STATUS)) continue;
    const transcript = readTranscript(file, text);
    if (transcript.entries.some((entry) => namesSlug(entry, slug))) mains.push({ session: name.slice(0, -'.jsonl'.length), ...transcript });
  }
  mains.sort((a, b) => a.first - b.first);
  const byAgent = new Map();
  for (const main of mains) {
    for (const file of subagentFiles(path.join(dir, main.session))) byAgent.set(file.id, [...(byAgent.get(file.id) ?? []), file]);
  }
  return { mains, byAgent };
}

const roleOf = (files) => {
  const type = files.map((f) => f.meta.agentType).find((t) => typeof t === 'string');
  return type ? type.replace(/^pilot:/, '') : 'unknown';
};

/**
 * Every agent of the run named by `slug` in `repo`'s transcripts, with the pilot's own sessions as one `pilot` agent,
 * and the run's `span`: its files' earliest first entry to their latest last one, null with no session.
 */
export function readRun(repo, slug, { needles = [], projectsRoot = defaultRoot() } = {}) {
  const run = { sessions: [], agents: [], skippedLines: 0, claude: null, span: null };
  const dir = projectDir(repo, projectsRoot);
  if (!dir) return run;
  const { mains, byAgent } = runFiles(dir, slug);
  if (mains.length === 0) return run;
  run.sessions = mains.map((main) => main.session);
  const files = [...mains, ...[...byAgent.values()].flat()];
  run.skippedLines = files.reduce((total, f) => total + f.skipped, 0);
  const dated = files.filter((f) => Number.isFinite(f.first));
  if (dated.length) run.span = { from: Math.min(...dated.map((f) => f.first)), to: Math.max(...dated.map((f) => f.first + f.spanMs)) };

  const pilot = { id: 'pilot', role: 'pilot', description: null, parentId: null, ...usageOf(mains), matched: [] };
  const agents = [...byAgent].map(([id, files]) => agentUsage(id, files, needles));
  const firstOf = (agent) => Math.min(...byAgent.get(agent.id).map((f) => f.first));
  agents.sort((a, b) => firstOf(a) - firstOf(b));
  return { ...run, claude: claudeCount(mains), agents: [pilot, ...agents] };
}

const median = (values) => {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
};
const bytesOf = (value) => Buffer.byteLength(String(value ?? ''), 'utf8');
/** A deck kind as reported: the kinds are short lower-case words, so anything else is `other`, never echoed. */
const kindOf = (kind) => (typeof kind === 'string' && /^[a-z_-]{1,20}$/.test(kind) ? kind : 'other');

/**
 * Sizes, never text (L11): per agent role, model calls, turns (messages with a text block),
 * the median text bytes of a turn (thinking never counted) and the median output tokens of a call
 * (thinking included, as the transcripts redact it) over the calls recorded with a stop_reason,
 * null when none was; per deck kind, the count and median bytes of `deck_post` bodies, with
 * `deck_reply` texts as `reply`. A message is one `message.id`: its entries
 * each carry a block and sum, and an entry seen twice (one `uuid`) counts once, at its largest.
 * A tool call counts once by its id. The run is `readRun`'s.
 */
export function voiceOf(repo, slug, { projectsRoot = defaultRoot() } = {}) {
  const dir = projectDir(repo, projectsRoot);
  if (!dir) return { agents: [], deck: [] };
  const { mains, byAgent } = runFiles(dir, slug);
  if (mains.length === 0) return { agents: [], deck: [] };
  const roles = new Map();
  const deck = new Map();
  for (const [role, files] of [['pilot', mains], ...[...byAgent.values()].map((files) => [roleOf(files), files])]) {
    const messages = roles.get(role) ?? new Map();
    roles.set(role, messages);
    for (const { entries } of files) {
      for (const entry of entries) {
        const message = assistantMessage(entry);
        if (!message || typeof message.model !== 'string' || message.model.startsWith('<')) continue;
        const kept = messages.get(message.id) ?? { output: null, text: new Map() };
        messages.set(message.id, kept);
        // An entry written as the call began carries no stop_reason and its first few tokens only.
        if (message.stop_reason) kept.output = Math.max(kept.output ?? 0, tokenCounts(isObject(message.usage) ? message.usage : {}).output);
        const texts = blocks(message).filter((b) => b.type === 'text');
        if (texts.length) {
          const key = typeof entry.uuid === 'string' ? entry.uuid : `#${kept.text.size}`;
          kept.text.set(key, Math.max(kept.text.get(key) ?? 0, texts.reduce((n, b) => n + bytesOf(b.text), 0)));
        }
        for (const b of blocks(message)) {
          const name = b.type === 'tool_use' && typeof b.id === 'string' ? String(b.name) : '';
          const kind = name.endsWith('__deck_reply') ? 'reply' : name.endsWith('__deck_post') ? kindOf(b.input?.kind) : null;
          const bytes = bytesOf(kind === 'reply' ? b.input?.text : b.input?.body);
          if (kind) deck.set(b.id, { kind, bytes: Math.max(deck.get(b.id)?.bytes ?? 0, bytes) });
        }
      }
    }
  }
  const agents = [...roles].map(([agent, messages]) => {
    const all = [...messages.values()];
    const turns = all.filter((m) => m.text.size).map((m) => [...m.text.values()].reduce((a, b) => a + b, 0));
    const counted = all.filter((m) => m.output !== null).map((m) => m.output);
    return { agent, calls: all.length, turns: turns.length, textBytesMedian: median(turns),
      outputCounted: counted.length, outputTokensMedian: counted.length ? median(counted) : null };
  });
  const kinds = new Map();
  for (const { kind, bytes } of deck.values()) kinds.set(kind, [...(kinds.get(kind) ?? []), bytes]);
  const deckRows = [...kinds].sort(([a], [b]) => a.localeCompare(b))
    .map(([kind, sizes]) => ({ kind, count: sizes.length, bodyBytesMedian: median(sizes) }));
  return { agents, deck: deckRows };
}
