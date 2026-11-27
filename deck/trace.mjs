/**
 * `pilot trace <itm_id>`: one hand-off's trace rows in time order, then what it waits on
 * (crew-handoff-trace spec 1, 2, 10). It reads `~/.claude/pilot/handoff-trace.jsonl` and its `.old`
 * (A1), never the deck, so a trace still reads when the deck is down.
 */
import fs from 'node:fs';

import { traceFile } from '../hooks/lib/wrapper-log.js';

/** The step order of each kind of hand-off, as the writers append them (L3: the grant writes resolved, the spawn hook spawned after); a hand-off waits on the step after its last. */
const STEPS = Object.freeze({
  crew: Object.freeze(['posted', 'stopped', 'released', 'granted', 'resolved', 'spawned', 'failed']),
  pilot: Object.freeze(['posted', 'handed', 'cleared', 'submitted', 'resolved', 'failed']),
});

/** The step that ends each kind: a crew hand-off is done once spawned, a pilot one once resolved. */
const FINISHED = Object.freeze({ crew: new Set(['spawned', 'failed']), pilot: new Set(['resolved', 'failed']) });
const ID = /^itm_[A-Za-z0-9]{1,40}$/;
const USAGE = 'usage: pilot trace <itm_id>';

function ageOf(ms) {
  const minutes = Math.max(0, Math.round(ms / 60000));
  if (minutes < 60) return `${minutes}m`;
  return `${Math.floor(minutes / 60)}h${String(minutes % 60).padStart(2, '0')}m`;
}

/** The rows naming `id` as their item or ticket, oldest first, and the tail: `done` or `waiting: <step>, <age>`. */
export function timeline(rows, id, now) {
  const valid = rows.filter((row) => row && typeof row.step === 'string' && !Number.isNaN(Date.parse(row.at)));
  // The stopped, released, granted and spawned rows carry the ticket, never the item: an item's timeline
  // also takes its ticket's rows from the item's posted row on.
  const posted = valid.find((row) => row.item === id && row.step === 'posted' && row.ticket !== undefined);
  // ...and stops where another hand-off of that ticket is posted.
  const from = posted && Date.parse(posted.at);
  const until = posted
    ? Math.min(Infinity, ...valid.filter((row) => row.ticket === posted.ticket && row.step === 'posted' && row.item !== id && Date.parse(row.at) > from).map((row) => Date.parse(row.at)))
    : 0;
  const mine = valid
    .filter((row) => row.item === id || row.ticket === id || (posted !== undefined && row.ticket === posted.ticket && Date.parse(row.at) >= from && Date.parse(row.at) < until))
    .sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  const last = mine.at(-1);
  if (last === undefined) return { rows: mine, tail: 'no hand-off' };
  const kind = last.kind === 'crew-handoff' ? 'crew' : 'pilot';
  // The deck's own close of a crew-handoff whose ticket moved on (handoff-self-close spec 4) has no successor to spawn.
  if (FINISHED[kind].has(last.step) || (last.step === 'resolved' && last.agent === 'deck')) return { rows: mine, tail: 'done' };
  const order = STEPS[kind];
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

/** `pilot trace <itm_id>`: prints the rows, then the tail. Exit 0, 2 on a bad id or extra argument. */
export async function trace(argv, { say = (text) => process.stdout.write(text), complain = (text) => process.stderr.write(text), now = Date.now() } = {}) {
  const [id, ...rest] = argv;
  if (!ID.test(id ?? '') || rest.length > 0) {
    complain(`pilot trace: ${USAGE}\n`);
    return 2;
  }
  const file = traceFile();
  let rows;
  try {
    rows = [...rowsOf(`${file}.old`), ...rowsOf(file)];
  } catch (err) {
    complain(`pilot trace: cannot read ${file}: ${err.message}\n`);
    return 1;
  }
  const seen = timeline(rows, id, now);
  // The newest deck start first (spec 9): which code took the steps below.
  const started = rows.filter((row) => row?.step === 'deck started' && !Number.isNaN(Date.parse(row.at))).sort((a, b) => Date.parse(a.at) - Date.parse(b.at)).at(-1);
  if (started) say(`deck: ${shown(started.root ?? '-')} ${shown(started.version ?? '-')} since ${shown(started.at)}\n`);
  say(seen.rows.length ? seen.rows.map((row) => `${lineOf(row)}\n`).join('') : `no trace rows for ${id}\n`);
  say(`${seen.tail}\n`);
  return 0;
}
