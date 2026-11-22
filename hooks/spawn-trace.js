/**
 * A PostToolUse lane (crew-handoff-trace S3, spec 1; L1, L4): the main session's `Agent` call for a
 * co-pilot writes `spawned` to the hand-off trace. A subagent's call carries `agent_id` and is not the
 * pilot spawning a successor, so it is skipped. Of the call it reads only `subagent_type`; the ticket
 * is the deck's co-pilot record for this directory, never the prompt (L4), and absent when the deck
 * does not answer. Says nothing, so the merged PostToolUse payload is never changed by it.
 */

'use strict';

const deck = require('./lib/deck.js');
const { step } = require('./lib/wrapper-log.js');
const { coPilotTicketOf } = require('./lib/guard-advice.js');

const CO_PILOT_TYPE = 'pilot:pilot-co-pilot';

/**
 * One crew-handoff row for this directory's co-pilot, with the deck's ticket when it names one.
 * `deck.projectDir` is the directory the hooks key on (L3), so a cwd drifted into a worktree still finds it.
 */
async function traceCoPilot(input, fields) {
  const row = Object.assign({ kind: 'crew-handoff' }, fields);
  const dir = deck.projectDir(input, process.env);
  const ticket = typeof dir === 'string' && dir !== '' ? await coPilotTicketOf(dir) : null;
  if (ticket) row[deck.STORED.field] = ticket;
  step(row);
}

async function run(input) {
  if (!input || input.tool_name !== 'Agent' || input.agent_id) return null;
  if (!input.tool_input || input.tool_input.subagent_type !== CO_PILOT_TYPE) return null;
  await traceCoPilot(input, { step: 'spawned', session: input.session_id });
  return null;
}

module.exports = { CO_PILOT_TYPE: CO_PILOT_TYPE, run: run, traceCoPilot: traceCoPilot };
