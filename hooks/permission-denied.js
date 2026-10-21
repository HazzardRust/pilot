#!/usr/bin/env node
/**
 * A call auto mode denies to a pilot lane becomes a blocked item (gate-no-stall spec 3, L1, L9).
 *
 * Runs on `PermissionDenied`, which fires on every auto-mode denial and is the only signal
 * Claude Code gives within that hook turn. A pilot lane is the pilot session (no `agent_id`,
 * `agent_type` `pilot:pilot` or `pilot`) or a crew agent (`agent_id`, `agent_type` starting
 * `pilot:`); its denial goes to `postBlocked`, which posts it on the live run's ticket.
 *
 * The hook never outputs: its only possible output is `retry`, and a denial stays a denial.
 * Another plugin's agent, a session that is not the pilot's, and any payload it cannot read
 * get nothing, and the denial reaches the model exactly as it would have without the hook.
 *
 * A refused file edit (`Edit`, `Write`, `NotebookEdit`) posts nothing either (blocked-yellow-yields A5): the user
 * cannot run it, so the agent sends `main` one question with its default instead.
 */

'use strict';

const { readStdin } = require('./lib/stdin.js');
const deck = require('./lib/deck.js');
const { postBlocked } = require('./lib/blocked.js');

const CREW_PREFIX = 'pilot:';
const PILOT_SESSION = ['pilot:pilot', 'pilot'];
/** The file tools whose denial is the agent's question to `main`, never a Blocked item (A5). */
const FILE_TOOLS = ['Edit', 'Write', 'NotebookEdit'];

/** Whether this payload is a pilot lane's: the pilot session, or one of its crew agents. */
function isPilotLane(payload) {
  const type = payload.agent_type;
  if (typeof type !== 'string') return false;
  return payload.agent_id ? type.startsWith(CREW_PREFIX) : PILOT_SESSION.indexOf(type) !== -1;
}

/** What was denied, as the item names it: a Bash call's command, else the tool's name. */
function commandOf(payload) {
  const input = payload.tool_input;
  if (payload.tool_name === 'Bash' && input && typeof input.command === 'string') return input.command;
  return typeof payload.tool_name === 'string' ? payload.tool_name : '';
}

/** Post a pilot lane's denial; always null, so the hook says nothing. `deps`: `deck`, `claims`, `env`. */
async function onDenied(payload, deps) {
  if (!payload || typeof payload !== 'object' || !isPilotLane(payload)) return null;
  if (FILE_TOOLS.includes(payload.tool_name)) return null;
  const repo = deck.projectDir(payload, (deps && deps.env) || process.env);
  await postBlocked(
    {
      repo: repo,
      command: commandOf(payload),
      reason: typeof payload.reason === 'string' ? payload.reason : '',
      agent: payload.agent_type,
      session: payload.session_id,
      source: 'denied',
    },
    deps,
  );
  return null;
}

async function main() {
  try {
    await onDenied(JSON.parse(await readStdin()));
  } catch (_err) {
    // A payload this hook cannot read is not one it can attribute to a pilot lane.
  }
  process.exitCode = 0;
}

module.exports = { onDenied: onDenied, isPilotLane: isPilotLane, commandOf: commandOf };

if (require.main === module) {
  main();
}
