#!/usr/bin/env node
/**
 * The heartbeat behind the Agents tab: this agent is still working, and here
 * (spec 9; L7, L8, A1, ADR 0024). One of the lanes `post-tool.js` runs after
 * every tool call.
 *
 * Nothing in the deck knew a subagent existed. Rather than register a
 * `SubagentStart`/`SubagentStop` pair — which an agent that is killed never
 * fires, leaving the roster full of ghosts — the deck watches for tool calls,
 * and this is the lane that reports one. Liveness is therefore observed and
 * never declared: an agent cannot put itself on the roster and cannot take
 * itself off, and the daemon drops it when nothing has been heard for 90 s.
 *
 * It is the hottest path in the package, so most of this file is about not
 * doing things:
 *
 *   - the pilot is not an agent. A main session's payload carries no `agent_id`
 *     (it carries `agent_type` only when started with `--agent`, as
 *     `pilot:pilot`; ADR 0027), and it is a *run* on the deck already.
 *   - one heartbeat per agent per `HEARTBEAT_MS`, whatever the tool call rate.
 *     The stamp on disk is the only state a hook process has, because each one
 *     of these is a fresh process that exits when the call is over.
 *   - three fields go out and nothing else. What an agent is working on is not
 *     in the payload, and the transcript it would have to be read from is
 *     another agent's context (A2).
 *   - a deck that is not there costs the tool call nothing: the lane returns
 *     null on every path, says nothing to the agent, and never throws.
 */

'use strict';

const fs = require('fs');

const deck = require('./lib/deck.js');

/**
 * A third of the deck's 90 s liveness window, so an agent working steadily is
 * reported three times over before it would read as gone, and two heartbeats
 * can be lost without it flickering off the panel. The window is the daemon's
 * (`deck/agents.mjs`); this is the rate, and the two are deliberately not the
 * same number.
 */
const HEARTBEAT_MS = 30000;

/**
 * Whether this agent is due to be reported again. An unreadable or missing
 * stamp means yes — erring towards one heartbeat too many, which the deck reads
 * as the same agent it already has, rather than towards an agent that never
 * appears on the panel at all.
 */
function due(file, now) {
  try {
    return now - fs.statSync(file).mtimeMs >= HEARTBEAT_MS;
  } catch (err) {
    return true;
  }
}

/**
 * Record that this one has been sent, before sending it. Two of these processes
 * can be in flight at once for one agent — a turn's parallel tool calls — and
 * the worst they can do here is report the same agent twice in a window, which
 * is a heartbeat the deck discards. The exclusive-create claim idiom the other
 * lanes use is the wrong shape for this: a claim is taken once and for ever,
 * and this has to be taken again every window.
 */
function stamp(file) {
  try {
    deck.privateInbox();
    fs.writeFileSync(file, '', 'utf8');
  } catch (err) {
    // An unwritable home means every tool call reports, which the deck throttles
    // by ignoring; it must never mean a tool call that fails.
  }
}

/** The lane, as `post-tool.js` calls it: the hook payload in, and never a word out. */
async function run(input) {
  if (!input) return null;
  const agentId = typeof input.agent_id === 'string' ? input.agent_id.trim() : '';
  const agentType = typeof input.agent_type === 'string' ? input.agent_type.trim() : '';
  const cwd = typeof input.cwd === 'string' ? input.cwd.trim() : '';
  if (!agentId || !agentType || !cwd) return null;

  const file = deck.agentStampPath(agentId);
  if (!due(file, Date.now())) return null;
  stamp(file);

  try {
    await deck.agents({ agentId: agentId, agentType: agentType, cwd: cwd });
  } catch (err) {
    // No deck, or a deck that refused it. Either way the agent is told nothing
    // and the tool call carries on: the roster is the deck's convenience, not
    // this session's business (A11).
  }
  return null;
}

module.exports = {
  HEARTBEAT_MS: HEARTBEAT_MS,
  run: run,
};
