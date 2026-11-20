/**
 * `pilot trace <itm_id>`: one hand-off's trace rows in time order, then what it waits on
 * (crew-handoff-trace spec 1, 2, 10). It reads `~/.claude/pilot/handoff-trace.jsonl` and its `.old`
 * (A1), never the deck, so a trace still reads when the deck is down.
 */
import fs from 'node:fs';

import { traceFile } from '../hooks/lib/wrapper-log.js';

/** The step order of each kind of hand-off (spec 1); a hand-off waits on the step after its last. */
export const STEPS = Object.freeze({
  crew: Object.freeze(['posted', 'stopped', 'released', 'granted', 'spawned', 'resolved', 'failed']),
  pilot: Object.freeze(['posted', 'handed', 'cleared', 'submitted', 'resolved', 'failed']),
});

const FINISHED = new Set(['resolved', 'failed']);
const ID = /^itm_[A-Za-z0-9]{1,40}$/;
const USAGE = 'usage: pilot trace <itm_id> [--file <path>]';

function ageOf(ms) {
  const minutes = Math.max(0, Math.round(ms / 60000));
  if (minutes < 60) return `${minutes}m`;
  return `${Math.floor(minutes / 60)}h${String(minutes % 60).padStart(2, '0')}m`;
}

/** The rows naming `id` as their item or ticket, oldest first, and the tail: `done` or `waiting: <step>, <age>`. */
export function timeline(rows, id, now) {
  const mine = rows
    .filter((row) => row && (row.item === id || row.ticket === id) && typeof row.step === 'string' && !Number.isNaN(Date.parse(row.at)))
    .sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  const last = mine.at(-1);
  if (last === undefined) return { rows: mine, tail: 'waiting: posted, 0m' };
  if (FINISHED.has(last.step)) return { rows: mine, tail: 'done' };
  const order = last.kind === 'crew-handoff' ? STEPS.crew : STEPS.pilot;
  const next = order.includes(last.step) ? order[order.indexOf(last.step) + 1] : 'unknown';
  return { rows: mine, tail: `waiting: ${next}, ${ageOf(now - Date.parse(last.at))}` };
}

function rowsOf(file) {
  let text;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }
  return text.split('\n').flatMap((line) => {
    try {
      return line.trim() ? [JSON.parse(line)] : [];
    } catch {
      return []; // a torn line from a crashed writer is skipped, not fatal
    }
  });
}

// A row's values came from a file anyone on the machine can write: no control character reaches the terminal.
const shown = (value) => String(value).replace(/[\p{Cc}\p{Zl}\p{Zp}]+/gu, ' ');

function lineOf(row) {
  const ids = ['item', 'ticket', 'agent', 'session'].filter((name) => row[name] !== undefined).map((name) => `${name}=${shown(row[name])}`);
  return [shown(row.at), shown(row.step), shown(row.kind ?? '-'), ...ids].join(' ');
}

/** `pilot trace <itm_id> [--file <path>]`: prints the rows, then the tail. Exit 0, 2 on a bad id or flag. */
export async function trace(argv, { say = (text) => process.stdout.write(text), complain = (text) => process.stderr.write(text), now = Date.now() } = {}) {
  const [id, ...rest] = argv;
  const fileFlag = rest.length === 2 && rest[0] === '--file' && rest[1] ? rest[1] : undefined;
  if (!ID.test(id ?? '') || (rest.length > 0 && fileFlag === undefined)) {
    complain(`pilot trace: ${USAGE}\n`);
    return 2;
  }
  const file = fileFlag ?? traceFile();
  let rows;
  try {
    rows = [...rowsOf(`${file}.old`), ...rowsOf(file)];
  } catch (err) {
    complain(`pilot trace: cannot read ${file}: ${err.message}\n`);
    return 1;
  }
  const seen = timeline(rows, id, now);
  say(seen.rows.length ? seen.rows.map((row) => `${lineOf(row)}\n`).join('') : `no trace rows for ${id}\n`);
  say(`${seen.tail}\n`);
  return 0;
}
