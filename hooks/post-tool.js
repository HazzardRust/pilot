#!/usr/bin/env node
/**
 * The one PostToolUse process. It runs after every single tool call, which is
 * why there is one of it: a second registration would double the process spawns
 * on the hottest path in the harness, and the harness merges nothing for us —
 * one hook, one JSON payload.
 *
 * So the lanes are modules rather than hooks, named here up front:
 *
 *   inbox-alert.js          slice 5   a reply from the deck, delivered unasked
 *   context-usage-alert.js  slice 9   a plan limit about to be spent
 *   context-size-guard.js   slice 12  an agent filling its context window
 *   agent-roster.js         S5        this agent is still working, and here
 *   PLAIN_PICKUP (below)    audit S5  a hand-off taken by a session not the pilot
 *
 * Each is loaded and called inside its own try/catch, so a lane that is not
 * installed yet, or throws, is a no-op and the others are untouched. That is
 * what keeps the slices independent: slice 12 added a file and changed nothing
 * here, S5 the same, and a bug in one lane cannot take the others down with it.
 *
 * A lane says `{ systemMessage?, additionalContext?, commit?, rollback? }` or
 * null. `commit` is called once the harness has actually received the payload
 * and `rollback` when the write failed, because a lane that has recorded
 * something as delivered must be able to take that back — otherwise a broken
 * pipe silently swallows the thing it was trying to say.
 */

'use strict';

/**
 * Slice 9's alert predates this contract and is slice 9's file to change, so the
 * shim is here: it answers `{ claimed, payload }`, taking its claims before it
 * returns and giving them back if the write fails. Giving one back is slice 9's
 * own `unclaim`, not a filename rebuilt here out of its `CLAIM_DIR` — where the
 * claims live is that lane's business, and a shim that knew would have to be
 * changed whenever it moved them.
 */
function adaptUsageAlert(module, input) {
  const result = module.run(
    input && input.session_id,
    input && input.agent_id,
    input && input.hook_event_name
  );
  if (!result) return null;
  return {
    systemMessage: result.payload.systemMessage,
    additionalContext: result.payload.hookSpecificOutput.additionalContext,
    rollback: function () {
      for (const name of result.claimed || []) {
        try { module.unclaim(name); } catch (err) { /* it warns twice rather than never */ }
      }
    },
  };
}

/** The pilot's own agent types; a main session started as anything else is plain (audit-fixes S5). */
const PILOT_AGENT_TYPES = ['pilot:pilot', 'pilot'];

/**
 * A plain pickup (audit-fixes S5, L3, ADR 0080). `session-handoff.js` leaves a
 * marker when it delivers a hand-off, because SessionStart cannot say who took
 * it; the session's first tool call can, from `agent_type`. The marker is read
 * and deleted once, so the judgement is once; a subagent shares its main
 * session's id and is never the one judged. A plain session gets the warning
 * and the claim back to the deck, so `pilot run` is handed the same item.
 */
function plainPickup(input) {
  if (!input || input.agent_id || typeof input.session_id !== 'string' || input.session_id === '') return null;
  const fs = require('node:fs');
  const deck = require('./lib/deck.js');
  const marker = deck.pickupPath(input.session_id);
  let raw;
  try {
    raw = fs.readFileSync(marker, 'utf8');
    fs.unlinkSync(marker); // the one call that deletes it is the one that judges
  } catch (err) {
    return null;
  }
  if (PILOT_AGENT_TYPES.indexOf(input.agent_type) !== -1) return null;

  let saved = {};
  try { saved = JSON.parse(raw) || {}; } catch (err) { /* still warn; nothing to release */ }
  deck.release(saved.claim);
  deck.dropHeldHandoff(input.session_id); // released, so no longer this session's to resolve (L5)
  const item = typeof saved.item === 'string' && /^itm_\w{1,40}$/.test(saved.item) ? ' (' + saved.item + ')' : '';
  return {
    systemMessage: 'This session is not the pilot, so the hand-off it was given' + item + ' is ' +
      'released back to the deck. Quit and run `pilot run` in this directory to pick the run up.',
    additionalContext: 'You are not the pilot session the hand-off' + item + ' was meant for. Do not ' +
      'act on it, reply on it or resolve it: it has been released for `pilot run`. Tell the user so.',
  };
}

const PLAIN_PICKUP = { file: 'plain-pickup', load: function () { return { run: plainPickup }; } };

const MODULES = [
  { file: './inbox-alert.js' },
  { file: './context-usage-alert.js', call: adaptUsageAlert },
  { file: './context-size-guard.js' },
  { file: './agent-roster.js' },
  PLAIN_PICKUP,
];

const nonEmpty = function (text) { return typeof text === 'string' && text.trim() !== ''; };

/** One lane. Absent, malformed, throwing or answering nothing all mean the same thing. */
async function runModule(entry, input) {
  let module;
  try {
    module = entry.load ? entry.load(entry.file) : require(entry.file);
  } catch (err) {
    return null; // a lane that is not installed is a no-op, not a failure
  }
  if (!module || typeof module.run !== 'function') return null;

  try {
    return (await (entry.call ? entry.call(module, input) : module.run(input))) || null;
  } catch (err) {
    return null; // and neither is a lane that throws
  }
}

function merge(results) {
  const messages = results.map(function (r) { return r.systemMessage; }).filter(nonEmpty);
  const contexts = results.map(function (r) { return r.additionalContext; }).filter(nonEmpty);

  const each = function (name) {
    return function () {
      for (const result of results) {
        if (typeof result[name] === 'function') {
          try { result[name](); } catch (err) { /* one lane's bookkeeping is not another's */ }
        }
      }
    };
  };

  if (messages.length === 0 && contexts.length === 0) {
    // Nothing will be written, so nothing was delivered: give back anything a
    // lane claimed on its way to saying nothing.
    each('rollback')();
    return null;
  }

  const payload = { hookSpecificOutput: { hookEventName: 'PostToolUse' } };
  if (messages.length) payload.systemMessage = messages.join('\n');
  if (contexts.length) payload.hookSpecificOutput.additionalContext = contexts.join('\n\n');

  return { payload: payload, commit: each('commit'), rollback: each('rollback') };
}

/** Every lane, at once, and one payload out of whatever they said. */
async function runModules(input, table) {
  const results = await Promise.all(
    (table || MODULES).map(function (entry) { return runModule(entry, input); })
  );
  return merge(results.filter(Boolean));
}

function main() {
  let raw = '';
  let started = false;

  function start() {
    if (started) return;
    started = true;

    let input;
    try {
      input = JSON.parse(raw);
    } catch (err) {
      input = {}; // a truncated payload is not a reason to fail a tool call
    }

    runModules(input).then(function (merged) {
      if (!merged) return;
      try {
        process.stdout.write(JSON.stringify(merged.payload), function (err) {
          if (err) merged.rollback();
          else merged.commit();
        });
      } catch (err) {
        merged.rollback(); // EPIPE: the harness stopped reading
      }
    }, function () { /* never block a tool call over this */ });
  }

  // Without these listeners a broken pipe is rethrown as an uncaught exception,
  // and this runs after every single tool call.
  process.stdout.on('error', function () { /* handled by the write callback */ });
  process.stdin.on('error', start);
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', function (chunk) { raw += chunk; });
  process.stdin.on('end', start);
}

module.exports = {
  MODULES: MODULES,
  PLAIN_PICKUP: PLAIN_PICKUP,
  adaptUsageAlert: adaptUsageAlert,
  merge: merge,
  runModules: runModules,
};

if (require.main === module) main();
