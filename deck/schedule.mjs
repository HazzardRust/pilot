/**
 * The co-pilot's scheduler (co-pilot-successor spec 6, 7, 8; L8, L9, L12): which slices of a run's record the
 * graph lets start now, and from which tip. It reads the rows the graph draws, with the graph's own reading
 * of `after` (`blockersOf`, an entry by full name else by `S<n>`) and of a state (`phaseOf`), so the order
 * the co-pilot follows and the picture the user watches cannot disagree. `pilot ready` prints it; it writes
 * nothing to the deck.
 */

import { bearer } from '../hooks/lib/deck-secret.js';
import { blockersOf, identifierOf, phaseOf, resolverOf } from './status.mjs';
import { deckUrl } from './tools.mjs';
import { listeningRepo } from './wait.mjs';

/** A planned row: its state says so, or it has none yet. */
const isPlanned = (row) => !row.state || phaseOf(row.state) === 'planned';

/** A blocker whose branch is pushed (`draft` in an older record), which a single-blocker slice may branch from (L12). */
const isPushed = (row) => /^(?:pushed|draft)\b/i.test(row.state) && Boolean(row.branch);

/**
 * The slices that may start now, at most `slots`, each `{ slice, from }`: `from` is `'feat'` (the
 * `feat/<slug>` tip) when every blocker is done, or the one blocker's branch when that blocker is pushed
 * (the pipeline, L12); a join waits for all its blockers done. Never row order: a slice's `S<n>` number,
 * then its name. The rows are as `deck_status` stored them, so every `after` names one row, once, and no
 * chain closes on itself (`requireGraph`).
 */
export function startable(rows, slots) {
  const resolve = resolverOf(rows);
  const number = (row) => Number(identifierOf(row.slice)?.slice(1) ?? Infinity);

  const starts = rows.flatMap((row) => {
    if (!isPlanned(row)) return [];
    const before = blockersOf(row).map(resolve);
    if (before.every((from) => phaseOf(from.state) === 'done')) return [{ row, from: 'feat' }];
    if (before.length === 1 && isPushed(before[0])) return [{ row, from: before[0].branch }];
    return [];
  });
  // Two rows without a number subtract to NaN, which is falsy, so their names decide.
  starts.sort((a, b) => number(a.row) - number(b.row) || a.row.slice.localeCompare(b.row.slice));
  return starts.slice(0, Math.max(0, slots)).map(({ row, from }) => ({ slice: row.slice, from }));
}

const USAGE = 'usage: pilot ready --ticket <id> --slots <n>';

/** How long the deck has to answer before this calls it down. */
const TIMEOUT_MS = 5000;

function parseFlags(argv) {
  const flags = {};
  for (let at = 0; at < argv.length; at += 2) {
    const field = { '--ticket': 'ticket', '--slots': 'slots' }[argv[at]];
    const value = argv[at + 1];
    if (!field || value === undefined || value.startsWith('--') || field in flags) throw new Error(USAGE);
    flags[field] = value;
  }
  if (flags.ticket === undefined || flags.slots === undefined) throw new Error(USAGE);
  if (!/^\d+$/.test(flags.slots)) throw new Error(`slots must be a whole number, not ${flags.slots}`);
  return { ...flags, slots: Number(flags.slots) };
}

/**
 * `pilot ready --ticket <id> --slots <n>`: one line per start, `S<n> from <feat|branch>`, or
 * `none`. Asks for the record of the main checkout `cwd` belongs to, so a worktree finds its run. Answers the exit code: 0 printed, 1 the deck is down or the ticket has no record, 2 a malformed flag.
 */
export async function ready(argv, { cwd = process.cwd(), url, say = (text) => process.stdout.write(text), complain = (text) => process.stderr.write(text) } = {}) {
  if (argv.length === 1 && ['--help', '-h'].includes(argv[0])) {
    say(`${USAGE}\n`);
    return 0;
  }
  let flags;
  try {
    flags = parseFlags(argv);
  } catch (err) {
    complain(`pilot ready: ${err.message}\n`);
    return 2;
  }
  let answer;
  let where = url ?? 'the deck';
  try {
    where = url ?? deckUrl();
    const query = new URLSearchParams({ repo: listeningRepo(cwd), ticket: flags.ticket });
    const response = await fetch(`${where}/api/record?${query}`, { headers: bearer(), signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!response.ok) {
      const refusal = await response.json().catch(() => ({}));
      complain(`pilot ready: ${refusal.error ?? `the deck answered ${response.status}`}\n`);
      return 1;
    }
    answer = await response.json();
  } catch (err) {
    complain(`pilot ready: ${where} did not answer: ${err.message}\n`);
    return 1;
  }
  if (!answer?.record) {
    complain(`pilot ready: ticket ${flags.ticket} has no record\n`);
    return 1;
  }
  const starts = startable(answer.record.slices ?? [], flags.slots);
  say(starts.length ? starts.map(({ slice, from }) => `${identifierOf(slice) ?? slice} from ${from}\n`).join('') : 'none\n');
  return 0;
}
