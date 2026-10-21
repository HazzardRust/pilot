#!/usr/bin/env node
/**
 * What each recent session of a repository actually started with, read from
 * its transcripts under `~/.claude/projects/<slug>/`: the first call's
 * measured input tokens, whether the session was the pilot or plain Claude
 * Code, whether it began with `/clear` and picked up a hand-off, and how much
 * of the start each recorded source took. `audit-context.mjs` estimates what
 * the files on disk would load; this is what was loaded, as the API counted it.
 *
 * Read-only and deterministic for a given home. Source sizes are bytes / 4, an
 * estimate; `unrecorded` is the measured total less every recorded source —
 * the tool definitions and the base system prompt, which a transcript never
 * holds. Prints paths, ids and numbers only, never a transcript's content:
 * transcripts routinely carry secrets.
 *
 *   node scripts/audit-session-start.mjs <repo> [--home <dir>] [--limit <n>]
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { StringDecoder } from 'node:string_decoder';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { BYTES_PER_TOKEN } from './measure-prompt.mjs';

const DEFAULT_LIMIT = 40;
const CHUNK_BYTES = 1024 * 1024;
const MAX_SCAN_BYTES = 16 * 1024 * 1024; // the first call is near the top; past this, stop looking

/** The opening of the notice `hooks/session-handoff.js` gives a session that picks up a hand-off. */
export const PICKUP_MARK = 'SYSTEM NOTICE: you are picking up a run that was handed off to you.';

const PILOT_AGENT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'agents', 'pilot.md');

/** How a pilot's system prompt opens: the pilot agent's first line up to its colon. */
function pilotOpening() {
  const body = fs.readFileSync(PILOT_AGENT, 'utf8').replace(/\r\n/g, '\n').replace(/^---\n[\s\S]*?\n---\n/, '');
  const first = body.split('\n').find((line) => line.trim()) ?? '';
  return first.split(':')[0].trim();
}

/** Claude Code's project directory name: the absolute path, every non-alphanumeric a dash. */
export function projectSlug(repo) {
  return path.resolve(repo).replace(/[^A-Za-z0-9]/g, '-');
}

const tokensOf = (text) => Math.round(Buffer.byteLength(String(text), 'utf8') / BYTES_PER_TOKEN);
const textOf = (value) => (Array.isArray(value) ? value.join('\n') : typeof value === 'string' ? value : JSON.stringify(value ?? ''));

/** Each attachment type the transcript records before the first call, and the source it counts toward. */
const SOURCE_OF = {
  instructions: 'instructions',
  skill_listing: 'skillListing',
  agent_listing_delta: 'agentListing',
  deferred_tools_delta: 'deferredTools',
  mcp_instructions_delta: 'mcpInstructions',
  hook_additional_context: 'hookContext',
  prompt_snapshot: 'systemPrompt',
};

function sizeOf(a) {
  if (a.type === 'instructions') return (a.files ?? []).reduce((n, f) => n + tokensOf(f.content ?? ''), 0);
  if (a.type === 'prompt_snapshot') return tokensOf(textOf(a.systemPrompt));
  if (a.type === 'skill_listing' || a.type === 'hook_additional_context') return tokensOf(textOf(a.content));
  return tokensOf(JSON.stringify(a));
}

/** Calls `onEntry` with each parsed line from the top of `file` until it returns true. */
function scanLines(file, onEntry) {
  const fd = fs.openSync(file, 'r');
  try {
    const chunk = Buffer.alloc(CHUNK_BYTES);
    // A decoder, not `chunk.toString`: a character whose bytes straddle a chunk would
    // otherwise decode as two replacement characters and skew every size after it.
    const decoder = new StringDecoder('utf8');
    let rest = '';
    for (let at = 0; at < MAX_SCAN_BYTES;) {
      const read = fs.readSync(fd, chunk, 0, CHUNK_BYTES, at);
      if (read === 0) break;
      at += read;
      const lines = (rest + decoder.write(chunk.subarray(0, read))).split('\n');
      rest = lines.pop();
      for (const line of lines) {
        let entry;
        try { entry = JSON.parse(line); } catch { continue; }
        if (onEntry(entry)) return;
      }
    }
    try { onEntry(JSON.parse(rest)); } catch { /* a partial or broken last line is skipped */ }
  } finally {
    fs.closeSync(fd);
  }
}

function measureOne(file, opening) {
  const sources = { instructions: 0, skillListing: 0, agentListing: 0, deferredTools: 0, mcpInstructions: 0, hookContext: 0, systemPrompt: 0, messages: 0, other: 0 };
  const s = { id: path.basename(file, '.jsonl'), startedAt: null, model: null, role: 'unknown', unreadable: false, byClear: false, pickup: false, firstCallTokens: null, sources, instructions: [] };

  try {
    scanLines(file, (entry) => {
      s.startedAt ??= entry.timestamp ?? null;
      const usage = entry.message?.usage;
      if (usage) {
        s.model = entry.message.model ?? null;
        s.firstCallTokens = (usage.input_tokens ?? 0) + (usage.cache_creation_input_tokens ?? 0) + (usage.cache_read_input_tokens ?? 0);
        return true;
      }
      if (entry.type === 'user') {
        const content = textOf(entry.message?.content);
        if (content.includes('<command-name>/clear</command-name>')) s.byClear = true;
        sources.messages += tokensOf(content);
      }
      const a = entry.attachment;
      if (!a) return false;
      if (a.type === 'hook_additional_context' && textOf(a.content).includes(PICKUP_MARK)) s.pickup = true;
      if (a.type === 'hook_success' && String(a.hookName ?? '').endsWith(':clear')) s.byClear = true;
      if (a.type === 'prompt_snapshot') s.role = textOf(a.systemPrompt).trimStart().startsWith(opening) ? 'pilot' : 'plain';
      if (a.type === 'instructions') {
        for (const f of a.files ?? []) s.instructions.push({ path: f.path, tokens: tokensOf(f.content ?? '') });
      }
      sources[SOURCE_OF[a.type] ?? 'other'] += sizeOf(a);
      return false;
    });
  } catch {
    s.unreadable = true; // deleted since it was listed, or not a readable file: this one session, never the report
  }

  const recorded = Object.values(sources).reduce((n, v) => n + v, 0);
  sources.unrecorded = s.firstCallTokens === null ? null : s.firstCallTokens - recorded;
  return s;
}

function spread(sessions) {
  const totals = sessions.map((s) => s.firstCallTokens).filter((n) => n !== null).sort((a, b) => a - b);
  if (totals.length === 0) return { sessions: 0, min: null, median: null, max: null };
  return { sessions: totals.length, min: totals[0], median: totals[Math.floor((totals.length - 1) / 2)], max: totals.at(-1) };
}

/** The newest `limit` top-level transcripts of `repo`, newest first, with a summary per role. */
export async function measureSessionStarts({ repo, home = os.homedir(), limit = DEFAULT_LIMIT } = {}) {
  const dir = path.join(home, '.claude', 'projects', projectSlug(repo));
  let files = [];
  try {
    files = fs.readdirSync(dir).filter((name) => name.endsWith('.jsonl')).map((name) => path.join(dir, name));
  } catch { /* no transcripts for this repository */ }
  const mtimeOf = (file) => {
    try { return fs.statSync(file).mtimeMs; } catch { return null; } // gone since the listing
  };
  files = files
    .map((file) => ({ file, mtime: mtimeOf(file) }))
    .filter(({ mtime }) => mtime !== null)
    .sort((a, b) => b.mtime - a.mtime)
    .slice(0, limit)
    .map(({ file }) => file);

  const opening = pilotOpening();
  const sessions = files.map((file) => measureOne(file, opening));
  return {
    repo,
    transcripts: dir,
    sessions: sessions.map(({ instructions, ...rest }) => rest),
    summary: {
      pilot: spread(sessions.filter((s) => s.role === 'pilot')),
      plain: spread(sessions.filter((s) => s.role === 'plain')),
      pickupsWithoutPilot: sessions.filter((s) => s.pickup && s.role !== 'pilot').map((s) => s.id),
      // Per file once, from the newest session that loaded any: the files rarely differ between
      // sessions, and forty copies of the list would cost the reader more than the finding is worth.
      instructions: sessions.find((s) => s.instructions.length)?.instructions ?? [],
    },
  };
}

async function main(argv) {
  const [repo, ...rest] = argv;
  const flag = (name) => (rest.includes(name) ? rest[rest.indexOf(name) + 1] : undefined);
  const limit = flag('--limit') === undefined ? DEFAULT_LIMIT : Number(flag('--limit'));
  if (!repo || !Number.isInteger(limit) || limit < 1) {
    process.stderr.write('usage: node scripts/audit-session-start.mjs <repo> [--home <dir>] [--limit <n>]\n');
    return 2;
  }
  const result = await measureSessionStarts({ repo, home: flag('--home') ?? os.homedir(), limit });
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).then((code) => { process.exitCode = code; }, (err) => {
    process.stderr.write(`audit-session-start: ${err.message}\n`);
    process.exitCode = 1;
  });
}
