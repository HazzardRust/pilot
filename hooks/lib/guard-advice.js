/**
 * The advice text `context-size-guard.js` gives at its marks, in a co-pilot's
 * `crew-handoff` and on the pilot's work lane. Moved out of the guard verbatim
 * (blocked-steps S10); the guard requires it back and re-exports
 * `WORK_CEILING` and `workAdvice`. Neither module required here requires
 * this one or the guard at load, so there is no cycle.
 */

'use strict';

const deck = require('./deck.js');
const { tokens } = require('./guard-status.js');

/** How much of the window is gone, said the one way every message says it now (2026-09-28). */
function howFull(seen) {
  return tokens(seen.used) + ' tokens';
}

/** What the hard text will ask for, named at the advisory so it can be prepared for. */
function whatComesNext(isPilot, onDeck) {
  if (!onDeck) return 'wrap up and hand over what you are doing';
  return isPilot ? 'bring the status table current and run `pilot handoff`' : 'stash and hand off';
}

/**
 * Between tickets the hand-off costs the least it ever will, so the pilot on the
 * deck is told at the advisory not to spend the tokens before the hard mark
 * waiting for it. Only the pilot: a `handoff` item is the pilot's kind. A live
 * co-pilot holds the hand-off's /clear, so it is paused now, while the buffer to
 * the hard mark is whole (clear-waits-co-pilot spec 6, A3). A pause that only
 * queued is released at once, the bound as backstop (never-stuck S19, A7).
 */
function handoffNowIfIdle(isPilot, onDeck) {
  if (!isPilot || !onDeck) return '';
  return ' If nothing is in flight — no live agent, no open run — the cheapest move is the ' +
    'handoff now: one `deck_status` call, then run `pilot handoff`. If your co-pilot is live, ' +
    'send it the pause now: it integrates the slice in flight and hands back `paused`; ' +
    '`deck_ticket release` it then; if SendMessage answers queued, `deck_ticket release` it at once.';
}

/**
 * This directory's co-pilot's ticket, from `GET /api/record?repo=` (F14): a read that
 * marks nothing delivered. Null on any failure. The ticket is
 * the deck's own id, written by `deck_ticket co-pilot`.
 */
async function coPilotTicketOf(repo) {
  let found;
  try {
    found = await deck.record(repo);
  } catch (err) {
    return null;
  }
  const { coPilot: coPilotKey } = deck.STORED;
  const coPilot = found && found[coPilotKey];
  return (coPilot && coPilot[deck.STORED.field]) || null;
}

/** The `crew-handoff` a pausing co-pilot's successor is briefed with (spec 4, L1). */
async function coPilotItem(seen, repo) {
  const ticket = await coPilotTicketOf(repo);
  const record = ticket
    ? '`GET /api/record?ticket=' + ticket + '&repo=' + encodeURIComponent(repo) + '`'
    : 'unknown: the deck named no co-pilot ticket for this directory';
  return {
    kind: 'crew-handoff',
    title: 'Handoff: pilot-co-pilot on ' + (ticket || 'ticket unknown') + ' paused itself at ' +
      tokens(seen.used) + ' tokens',
    body:
      'Ticket: ' + (ticket || 'ticket unknown') + '.\n' +
      'Reason: self-pause at the advisory (' + howFull(seen) + ').\n' +
      'Record: ' + record + '.\n' +
      "On `paused`, the main session spawns its successor with this item's id. " +
      'Handoff failed: spawn a fresh co-pilot from the plan.',
    repo: repo,
  };
}

/**
 * A5 (yellow-lane spec 16-19): at this many signed gates since the pilot's last
 * hand-off (each gate1 a design, each gate2 a landing), it is told to hand off
 * before the token mark. The deck counts them (`deck/work.mjs`) and serves them
 * as `work` on `GET /api/record`.
 */
const WORK_CEILING = 2;

function workAdvice(work) {
  const plural = function (n, noun) { return n + ' ' + noun + (n === 1 ? '' : 's'); };
  return plural(work.landings, 'landing') + ', ' + plural(work.designs, 'design') +
    ' since the last hand-off: hand off now if idle (pilot handoff)';
}

module.exports = {
  coPilotItem: coPilotItem,
  coPilotTicketOf: coPilotTicketOf,
  handoffNowIfIdle: handoffNowIfIdle,
  howFull: howFull,
  whatComesNext: whatComesNext,
  WORK_CEILING: WORK_CEILING,
  workAdvice: workAdvice,
};
