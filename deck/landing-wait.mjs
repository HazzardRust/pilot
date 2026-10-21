/**
 * `pilot landing <gate2>` — how the pilot hears a landing the deck ran (gate2-lands spec 2; L7, L8,
 * L14; ADR 0111). The Sign off press of a gate2 already wakes the pilot, and the daemon lands the
 * feature itself (`deck/landing.mjs`); what the pilot still needs is the outcome. So this polls
 * `GET /api/landing` every few seconds until the landing settles, prints its line, and exits:
 * 0 landed, 1 NOT landed or still unsettled at the timeout, 2 a deck that will not answer or an
 * id that is no gate2. Read-only: it never calls `deck_read`, which marks replies delivered.
 */

import { bearer } from '../hooks/lib/deck-secret.js';
import { deckUrl } from './tools.mjs';

/** How often the landing is asked after, in milliseconds (L8). */
const POLL_MS = 3000;

/** How long one ask may take before it counts as a miss. */
const REQUEST_MS = 10_000;

/** Misses in a row that mean the deck will not answer: one restart or one stall is ridden out. */
const MAX_MISSES = 3;

/** Long enough for a full `pilot land`, suite included (L8), in minutes. */
const DEFAULT_TIMEOUT_MINUTES = 40;

const USAGE = 'usage: pilot landing <gate2-id>\n';

/** A refusal no retry changes: no such gate2, or an answer that is no landing. */
const fatal = (message) => Object.assign(new Error(message), { fatal: true });

/** One read of the landing: `{ state, line? }`, or a throw naming why not. */
async function read(url, id) {
  // Outside the try: a missing secret file names itself, not a deck that is not answering.
  const headers = bearer();
  let response;
  try {
    response = await fetch(`${url}/api/landing?id=${encodeURIComponent(id)}`, { headers, signal: AbortSignal.timeout(REQUEST_MS) });
  } catch (err) {
    throw new Error(`the deck at ${url} is not answering (${err.cause?.code ?? err.message})`);
  }
  if (response.status === 404) throw fatal(`${id} is no gate2 on this deck`);
  if (!response.ok) throw new Error(`the deck answered /api/landing with ${response.status}`);
  let answer;
  try {
    answer = await response.json();
  } catch {
    throw new Error('the deck answered /api/landing with something that is not JSON');
  }
  if (typeof answer?.state !== 'string') throw fatal('the deck answered /api/landing with something that is no landing');
  return answer;
}

/** Wait for the landing of `id` to settle and print its line. Answers the exit code. */
export async function landing(id, {
  timeoutMinutes = DEFAULT_TIMEOUT_MINUTES,
  pollMs = POLL_MS,
  say = (line) => process.stdout.write(line),
  warn = (line) => process.stderr.write(line),
} = {}) {
  const deadline = Date.now() + timeoutMinutes * 60_000;
  try {
    const url = deckUrl();
    for (let misses = 0; ; ) {
      let answer;
      try {
        answer = await read(url, id);
        misses = 0;
      } catch (err) {
        misses += 1;
        if (err.fatal || misses >= MAX_MISSES) throw err;
      }
      const { state = 'unanswered', line } = answer ?? {};
      if (state === 'landed' || state === 'refused') {
        say(`${line ?? state}\n`);
        return state === 'landed' ? 0 : 1;
      }
      if (Date.now() >= deadline) {
        say(`NOT settled: the landing of ${id} is still ${state} after ${timeoutMinutes} minutes; the deck carries on with it\n`);
        return 1;
      }
      await new Promise((resolve) => setTimeout(resolve, pollMs));
    }
  } catch (err) {
    // `deckUrl()` throws on a mistyped `PILOT_DECK_PORT`: that deck will not answer either.
    warn(`pilot landing: ${err.message}\n`);
    return 2;
  }
}

/** `pilot landing`'s entry point from `bin/pilot.mjs`: one gate2 id, and no option. */
export async function main(argv, io = {}) {
  const warn = io.warn ?? ((line) => process.stderr.write(line));
  const option = argv.find((arg) => arg.startsWith('--'));
  if (option) {
    warn(`pilot landing: there is no "${option}" option\n${USAGE}`);
    return 2;
  }
  if (argv.length !== 1 || argv[0].trim() === '') {
    warn(`pilot landing: name exactly one gate2\n${USAGE}`);
    return 2;
  }
  return landing(argv[0], io);
}
