#!/usr/bin/env node
/**
 * Who wrote a deck message, stamped by the harness rather than claimed by the
 * agent (spec 2; L1, L2, L16, ADR 0027). Runs before every `deck_post`,
 * `deck_reply`, `deck_resolve`, `deck_read`, `deck_wait` and `deck_ticket`: the
 * read and the wait so the daemon hands a reply only to its thread's owner kind
 * (ADR 0041), and the ticket so only the pilot moves one (three-lanes spec 14).
 *
 * The stdio client serves every agent of a session through one process, so it
 * cannot tell a QA agent's call from the pilot's. This hook can: its payload
 * carries `agent_type` for a subagent (and for a main session started with
 * `--agent`), and nothing for a main session started any other way. It hands
 * the call back with that raw value as `author`, `""` when there is none, and
 * the daemon maps it to a kind (`authorKind` in `deck/items.mjs`, L3). The kind
 * set lives on that side of the L35 line and not here, so this file stays dumb.
 *
 * `author` is always written, so a value the agent put there itself never
 * survives. It is a declared property of the six tools' schemas because
 * Claude Code validates `updatedInput` against them (L2). No
 * `permissionDecision` is returned: the probe of 2026-09-23 showed
 * `updatedInput` reaches an MCP tool without one, so this hook answers no
 * permission question on the user's behalf.
 */

'use strict';

const { readStdin } = require('./lib/stdin.js');

/**
 * The harness's answer for one payload, or null when there is no tool input to
 * hand back. Pure, so the test reads exactly what the harness would.
 */
function stampAuthor(payload) {
  const input = payload && payload.tool_input;
  if (!input || typeof input !== 'object') return null;
  const author = typeof payload.agent_type === 'string' ? payload.agent_type : '';
  return {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      updatedInput: { ...input, author },
    },
  };
}

async function main() {
  let output = null;
  try {
    output = stampAuthor(JSON.parse(await readStdin()));
  } catch (_err) {
    // A payload this hook cannot read is the harness's to judge, not a reason to
    // fail the call: say nothing, and the message goes out unstamped.
  }
  if (output) process.stdout.write(JSON.stringify(output));
  process.exitCode = 0;
}

module.exports = { stampAuthor: stampAuthor };

if (require.main === module) {
  main();
}
