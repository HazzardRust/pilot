/**
 * The classifier log: one JSON line per auto-mode denial on this machine, in every session
 * (crew-refusals spec 6, A4, A5). Its one writer is `appendRefusal`, called by the
 * `PermissionDenied` hook; its one reader is `readRefusals`, for the closing report and the audit.
 *
 * A record, never a permission (L9): nothing reads it to approve, retry, skip or pre-clear a call.
 * The deck's own credential check runs on every command and reason before it is written, and a
 * hit withholds the field; when that check cannot load, this module does not load, so nothing
 * is written raw. The newest 10,000 lines are kept, trimmed on append.
 */

import fs from 'node:fs';
import path from 'node:path';

import { deckDir } from '../hooks/lib/deck-secret.js';
import { findCredential } from './store-core.mjs';

export const LOG_FILENAME = 'classifier.log';
const MAX_LINES = 10000;
const FIELD_MOST = 300;
/** How a text field that held a credential is stored. */
export const WITHHELD = '<withheld: credential>';
/** The shortest line the writer can make (every field empty); below this many bytes the log cannot be over its cap. */
const SHORTEST_LINE = 110;
const VERDICTS = ['refused', 'no-verdict'];
const TEXT_FIELDS = ['when', 'repo', 'agent', 'reason', 'tool', 'command'];

/** A text field as it may be stored: a credential withheld whole, else clipped. */
function stored(value) {
  const text = typeof value === 'string' ? value : '';
  return findCredential(text) ? WITHHELD : text.slice(0, FIELD_MOST);
}

/** Keep the newest `MAX_LINES` of the log, written whole beside it and renamed over it. */
function trim(file) {
  if (fs.statSync(file).size < (MAX_LINES + 1) * SHORTEST_LINE) return;
  const lines = fs.readFileSync(file, 'utf8').split('\n').filter((line) => line !== '');
  if (lines.length <= MAX_LINES) return;
  const next = file + '.' + process.pid + '.tmp';
  fs.rmSync(next, { force: true }); // a leftover of a killed trim, never written through
  try {
    fs.writeFileSync(next, lines.slice(-MAX_LINES).join('\n') + '\n', { mode: 0o600, flag: 'wx' });
    fs.renameSync(next, file);
  } catch (err) {
    fs.rmSync(next, { force: true });
    throw err;
  }
}

/**
 * Append one denial to `<dir ?? deckDir()>/classifier.log`. Never throws: a log that cannot be
 * written changes nothing else the caller does.
 */
export function appendRefusal(entry, opts) {
  try {
    const dir = (opts && opts.dir) || deckDir();
    const now = (opts && opts.now) || (() => new Date());
    const line = {
      when: now().toISOString(),
      repo: stored(entry.repo),
      ticket: typeof entry.ticket === 'string' ? entry.ticket.slice(0, FIELD_MOST) : null,
      agent: stored(entry.agent),
      reason: stored(entry.reason),
      tool: stored(entry.tool),
      command: stored(entry.command),
      verdict: entry.verdict === 'no-verdict' ? 'no-verdict' : 'refused',
    };
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, LOG_FILENAME);
    fs.appendFileSync(file, JSON.stringify(line) + '\n', { mode: 0o600 });
    trim(file);
  } catch (_err) {
    // Fails open: the log is a record, and the denial it records has already happened.
  }
}

/** Whether a parsed line is a refusal this writer made. */
function isRefusal(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  if (!TEXT_FIELDS.every((field) => typeof value[field] === 'string')) return false;
  if (value.ticket !== null && typeof value.ticket !== 'string') return false;
  return VERDICTS.includes(value.verdict);
}

/**
 * The logged refusals, oldest first, those of `filter.ticket` only when it is given; a torn or
 * foreign line is skipped, and no log yet reads as none. A log that exists and cannot be read throws.
 */
export function readRefusals(filter) {
  const dir = (filter && filter.dir) || deckDir();
  let text;
  try {
    text = fs.readFileSync(path.join(dir, LOG_FILENAME), 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }
  const refusals = [];
  for (const line of text.split('\n')) {
    let value;
    try {
      value = JSON.parse(line);
    } catch (_err) {
      continue;
    }
    if (!isRefusal(value)) continue;
    if (filter && typeof filter.ticket === 'string' && value.ticket !== filter.ticket) continue;
    refusals.push(value);
  }
  return refusals;
}
