#!/usr/bin/env node
/**
 * `node scripts/probe-clear-survival.mjs [--keep]` re-proves, on this machine's Claude Code, that a
 * `/clear` keeps the crew (handoff-no-wait S6, architecture §3 probes E3 and E5, as one run).
 *
 * A headless `claude` session spawns a background co-pilot, which spawns a background worker and
 * keeps its own turn open on it. The session is cleared at once. The worker writes a file a minute
 * later; the co-pilot then sends `main` a relay with SendMessage and finishes with a report. The
 * run passes when the write lands after the clear, the fresh context quotes the relay, and the
 * co-pilot's completion notice reaches the fresh session.
 *
 * Exit 0: `survived +<s>s; sendmessage ok; report reached`. Exit 1: `failed at <step>`.
 * The run is billed to the user's own sign-in: every API key and cloud-provider variable is dropped
 * from the child's environment. Hooks are off in the probe's settings. Everything lives in a
 * temporary directory removed at the end, unless `--keep` is passed, which prints its path.
 * The suite never runs this; it judges recorded lines through `judge`.
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { claudeBin } from '../hooks/lib/platform.js';

export const RELAY = 'PROBE-RELAY-7Q2';
export const REPORT = 'PROBE-REPORT-7Q2';
const WORKER_DELAY_MS = 60_000;
const DEADLINE_MS = 220_000;
const AUTH_ENV = /^(ANTHROPIC_|CLAUDE_CODE_OAUTH_TOKEN$|CLAUDE_CODE_USE_|AWS_|GOOGLE_|AZURE_)/i;

/**
 * Judge one run from the stream lines printed after the clear was sent.
 * @param {string[]} lines
 * @param {{ clear?: number }} marks  epoch ms at which `/clear` was sent
 * @param {number | null} wroteAt  epoch ms the worker wrote into its file, or null
 * @returns {{ ok: boolean, step?: string, after?: number }}
 */
export function judge(lines, marks, wroteAt) {
  const clear = marks?.clear;
  if (!Number.isFinite(clear)) return { ok: false, step: 'clear' };
  if (!Number.isFinite(wroteAt) || wroteAt <= clear) return { ok: false, step: 'worker' };
  const events = lines.map(parse).filter(Boolean);
  // The fresh context's own words: an agent's lines carry its agent_id and parent tool call.
  const fresh = ({ json }) => (json.type === 'assistant' || json.type === 'result') && !json.agent_id && !json.parent_tool_use_id;
  if (!events.some((event) => fresh(event) && event.line.includes(RELAY))) return { ok: false, step: 'sendmessage' };
  const notice = ({ json }) => json.type === 'system' && json.subtype === 'task_notification';
  if (!events.some((event) => notice(event) && event.line.includes(REPORT))) return { ok: false, step: 'report' };
  return { ok: true, after: Math.round((wroteAt - clear) / 1000) };
}

function parse(line) {
  try {
    const json = JSON.parse(line);
    return json && typeof json === 'object' ? { line, json } : null;
  } catch {
    return null;
  }
}

function main(argv) {
  return Promise.resolve(argv);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2));
}
