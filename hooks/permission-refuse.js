#!/usr/bin/env node
/**
 * A crew agent never waits on a permission prompt (spec 3; L17 as amended:
 * "A hook refuses it"). Runs on `PermissionRequest`, which fires when a call is
 * about to put a prompt in front of the user.
 *
 * The F1 probe (PR #348) showed why it exists: under an auto-mode main session,
 * an `ask` rule still prompts for a background child, the prompt lands in the
 * main terminal, and the lane waits on it. This hook answers that prompt with a
 * deny when the call comes from this plugin's own agents, and the deny message
 * is the instruction the agent acts on.
 *
 * Who is a crew agent: the payload carries `agent_id` only inside a subagent
 * (the same discriminator `stop-gate.js` and `inbox-alert.js` use), and
 * `agent_type` names it; a main session started with `--agent pilot:pilot` has
 * an `agent_type` but no `agent_id`, so its prompts stay the user's. Another
 * plugin's agent, and any payload this hook cannot read, get no output: the
 * prompt shows as it would have without the hook.
 *
 * The pilot session's own prompt is refused too, but only while a run is live in
 * its directory (gate-no-stall spec 4, L5, L10): a prompt mid-run is a terminal the
 * user is not watching, so it stalls the run the way a crew prompt stalls a lane.
 * Every refused prompt, the pilot's and a crew agent's, goes to `postBlocked` as a
 * blocked item (L9). With no live run, or a deck that does not answer, the pilot's
 * prompt is the user's: this hook never fails closed.
 *
 * The hook never approves anything: its one answer is a refusal, and a prompt
 * it does not refuse is the user's to answer.
 */

'use strict';

const { readStdin } = require('./lib/stdin.js');
const client = require('./lib/deck.js');
const { postBlocked } = require('./lib/blocked.js');
const { isPilotLane, commandOf } = require('./permission-denied.js');

const MESSAGE =
  'Refused: a crew agent never waits on a permission prompt, so this call was not run. ' +
  'Record it as a blocked step with its exact command, do not retry it and do not route around it, ' +
  'and carry on with the work that does not need it.';

const PILOT_MESSAGE =
  'Refused: while a run is live the pilot never waits on a permission prompt, so this call was not run. ' +
  'It is posted to the deck as a blocked item with its exact command; do not retry it and do not route around it, ' +
  'and carry on with the work that does not need it.';

/** How long a refusal waits on its post: the hook has 5 s, and a deck that stalls must not spend them. */
const POST_BUDGET_MS = 2000;

const REASON = 'A permission prompt in a live run, refused by the hook so the lane does not wait on it';

function denial(message) {
  return {
    hookSpecificOutput: {
      hookEventName: 'PermissionRequest',
      decision: { behavior: 'deny', message: message, interrupt: false },
    },
  };
}

/**
 * The harness's answer, or null to leave the prompt to the user. A crew agent's prompt is
 * always refused (`isPilotLane` with an `agent_id`); the pilot session's only while a run is
 * live. Each refusal is posted. `deps`: `deck` (the client), `post` (`postBlocked`), `claims`, `env`.
 */
async function decide(payload, deps) {
  if (!payload || typeof payload !== 'object' || !isPilotLane(payload)) return null;
  const deck = (deps && deps.deck) || client;
  const post = (deps && deps.post) || postBlocked;
  const repo = client.projectDir(payload, (deps && deps.env) || process.env);
  let output = payload.agent_id ? denial(MESSAGE) : null;
  if (!output) {
    try {
      if (!client.isOnDeck(await deck.runs(), repo)) return null;
    } catch (_err) {
      return null; // no deck: the prompt stays the user's
    }
    output = denial(PILOT_MESSAGE);
  }
  let timer;
  const budget = new Promise(function (resolve) { timer = setTimeout(resolve, POST_BUDGET_MS); });
  const posted = Promise.resolve()
    .then(function () {
      return post(
        {
          repo: repo,
          command: commandOf(payload),
          reason: REASON,
          agent: payload.agent_type,
          session: payload.session_id,
          source: 'refused',
        },
        // The pilot path has just found the run live: the post does not ask the deck again.
        { deck: deck, claims: deps && deps.claims, live: !payload.agent_id },
      );
    })
    .catch(function () {
      return null; // a post that failed is not a reason to let the prompt through: the refusal stands
    });
  await Promise.race([posted, budget]);
  clearTimeout(timer);
  return output;
}

async function main() {
  let output = null;
  try {
    output = await decide(JSON.parse(await readStdin()));
  } catch (_err) {
    // A payload this hook cannot read is not one it can attribute to a crew agent:
    // say nothing, and the prompt shows as it would have.
  }
  process.exitCode = 0;
  // Exit once the answer is out: a post still in flight past its budget is left to the claim's
  // window in `lib/blocked.js`, not allowed to keep the hook past its timeout.
  if (output) process.stdout.write(JSON.stringify(output), function () { process.exit(0); });
}

module.exports = { decide: decide };

if (require.main === module) {
  main();
}
