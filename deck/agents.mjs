/**
 * Who is live in each deck (spec 9; L7, L8, L9, A1, A2, ADR 0024).
 *
 * Every other thing the deck knows was declared to it: a session registers, a
 * pilot posts an item, a tool writes a table. An agent declares nothing. It is
 * spawned by another agent, it may be killed, and a killed agent cannot
 * deregister itself — so a roster built on arrivals and departures accumulates
 * ghosts of exactly the agents the user most wants to stop seeing. This one is
 * built on evidence instead: `hooks/agent-roster.js` reports a tool call, and
 * an agent is live while one of those is less than `LIVE_WINDOW_MS` old.
 *
 * It lives in memory and never in `deck.json` (L7). There is one daemon on this
 * machine (ADR 0005), so there is one roster; it means nothing across a restart,
 * because the agents it described died with the process that was watching them;
 * and a heartbeat per tool call would otherwise be a write per tool call on the
 * one file the daemon guards.
 *
 * The page is told only when *membership* changes (L9) — an agent arriving or
 * an agent going stale — and never on the heartbeats in between, which would
 * redraw every open page every few seconds for news that nothing had changed.
 * That rule is why the announcing lives here rather than at the route: both
 * halves of it are in this file, and the route only knows that it reported
 * something.
 *
 * Like `items.mjs`, `status.mjs` and `tabs.mjs` this module opens no socket, and
 * reads no file but a worktree's `.git` marker, through `repoOf`. Unlike them it
 * remembers: it is the one piece of deck state that is not the store's.
 */

import { OWNER_KINDS, authorKind } from './items.mjs';
import { repoKey, repoOf } from './runs.mjs';

/**
 * A1: a tool call inside this window means live, and nothing outside it does.
 * An agent thinking for longer than this with no tool call reads as gone and
 * comes back on its next call; shorter flickers, longer keeps ghosts.
 */
export const LIVE_WINDOW_MS = 90_000;

/**
 * An id and a type are short names, and both arrive from outside the daemon on
 * a loopback port anything on this machine may write to (A6). The type is drawn
 * on the page, so it is held to the shape an agent type actually has as well as
 * to a length — the same rule `hooks/context-size-guard.js` applies to the same
 * field for the same reason, read from the other end of the wire.
 */
const MAX_ID_CHARS = 64;
const MAX_TYPE_CHARS = 60;
const MAX_CWD_CHARS = 4096;
// One optional `:`-separated segment, so a type like `pilot:pilot-implementer`
// — a plugin's crew naming its own agent — is still a plain name.
const PLAIN_NAME = /^[A-Za-z0-9][A-Za-z0-9 _.-]*(?::[A-Za-z0-9][A-Za-z0-9 _.-]*)?$/;

/** Whether `value` has an agent type's shape and length, untrimmed: what `/api/tickets?agent=` is held to. */
export const isAgentType = (value) => typeof value === 'string' && value.length <= MAX_TYPE_CHARS && PLAIN_NAME.test(value);

/**
 * What a malformed type draws as instead of costing the agent its row. Unlike
 * `agentId` and `cwd` — load-bearing, and still refused outright — a type is
 * only ever drawn on the page (A2), so the worst a bad one can do is read
 * ugly, and it reads as this instead.
 */
const UNKNOWN_TYPE = 'an agent';

/** A heartbeat the deck will not take. `deck/server.mjs` answers it as a refusal. */
export class AgentRefusal extends Error {
  constructor(message) {
    super(message);
    this.name = 'AgentRefusal';
  }
}

/**
 * How many agents the deck will hold live at once, across every deck on the
 * machine. The window bounds this roster in ordinary use — what is in it is what
 * called a tool in the last ninety seconds, which is single figures — but the
 * window is a *rate* limit and not a size one, and anything on this machine may
 * post to the port (A6). Without a count, a local process reporting a fresh id
 * in a loop grows the map for as long as it keeps going. Everything else the
 * deck holds is capped for this reason (`MAX_RUNS`); this is the same cap in
 * the place the same argument applies.
 *
 * Refused rather than evicted, which is where it differs from the store's two:
 * an eviction would let a flood of invented ids push the agents that are really
 * working off the panel, and the panel is the whole point. A refusal costs a
 * genuinely new agent its row until the junk ages out, and it ages out by
 * itself.
 */
export const MAX_AGENTS = 200;

/**
 * The roster: one entry per deck, keyed the way every other path in the deck is
 * keyed (`repoKey`), holding one entry per agent id.
 */
const decks = new Map();

/** How many the roster is holding, swept or not — what `MAX_AGENTS` bounds. */
function rosterSize() {
  let count = 0;
  for (const agents of decks.values()) count += agents.size;
  return count;
}

/** Who to tell when membership changes. The daemon sets this; a test may too. */
let announce = () => {};

/** The one pending departure, or null. Departures are a clock, not an event. */
let sweeping = null;

/**
 * What the daemon does when the roster changes: announce it to the pages, the
 * same way it announces a write. A listener rather than an import of
 * `server.mjs`, which imports this.
 */
export function watchAgents(listener) {
  announce = listener;
}

const isLive = (agent, now) => now - agent.lastSeen < LIVE_WINDOW_MS;

function plainName(value, limit, what) {
  const name = typeof value === 'string' ? value.trim() : '';
  // Shape first, length second: clipping before the test would cut a hostile
  // value down to a well-formed-looking prefix and put *that* on the page.
  if (name === '' || !PLAIN_NAME.test(name) || name.length > limit) {
    throw new AgentRefusal(`${what} must be a name of up to ${limit} plain characters`);
  }
  return name;
}

function directory(value) {
  const cwd = typeof value === 'string' ? value.trim() : '';
  if (cwd === '' || cwd.length > MAX_CWD_CHARS) {
    throw new AgentRefusal('cwd must be the directory the agent is working in');
  }
  return cwd;
}

/** A type that fails the shape check does not cost the agent its heartbeat. */
function agentTypeOf(value) {
  try {
    return plainName(value, MAX_TYPE_CHARS, 'agentType');
  } catch (err) {
    return UNKNOWN_TYPE;
  }
}

/**
 * One heartbeat. Answers whether it changed who is live — an agent arriving, or
 * one coming back after it had gone stale — which is the only thing the page is
 * told about (L9).
 *
 * `since` is when the agent joined and does not move while it stays, because
 * what the panel says is how long it has been live and not how recently it
 * called a tool (A2). An agent that goes stale and returns is a new arrival and
 * says so: its previous span ended when the deck stopped seeing it.
 *
 * The type comes off whichever heartbeat is in hand, arrival or not, because an
 * agent's type does not change under its id — keeping the first one and
 * comparing would be code for a case that cannot arise.
 */
export function noteAgent(heartbeat, now = Date.now()) {
  const agentId = plainName(heartbeat.agentId, MAX_ID_CHARS, 'agentId');
  const agentType = agentTypeOf(heartbeat.agentType);
  const key = repoKey(directory(heartbeat.cwd));

  const agents = decks.get(key) ?? new Map();
  const held = agents.get(agentId);
  // A heartbeat from somebody the roster already holds costs it no room, so the
  // cap is asked about strangers only: a real agent reporting every thirty
  // seconds is never turned away by a flood it is not part of.
  if (held === undefined && rosterSize() >= MAX_AGENTS) {
    throw new AgentRefusal(`the deck holds ${MAX_AGENTS} live agents at once and no more`);
  }
  const joined = held === undefined || !isLive(held, now);
  agents.set(agentId, { agentType, since: joined ? now : held.since, lastSeen: now });
  decks.set(key, agents);

  // Activity counts for the repository a worktree belongs to, which is where its threads are.
  noteActive({ cwd: repoOf(key) ?? key, kind: authorKind(heartbeat.agentType) }, now);
  if (joined) announce();
  schedule(now);
  return joined;
}

/**
 * When each owner kind last showed activity, per repository (A7): a roster
 * heartbeat, or the park or return of one of its waits. In memory like the roster,
 * and for the same reason never persisted. Only owner kinds are kept, and no more
 * repositories than `MAX_AGENTS`, since a wait's `repo` comes off the loopback port.
 */
const activity = new Map();

/** When this daemon started, which is what an unseen kind counts from (never from zero). */
let startedAt = Date.now();

export function noteActive({ cwd, kind }, now = Date.now()) {
  if (!OWNER_KINDS.includes(kind)) return;
  const key = repoKey(cwd);
  if (!activity.has(key) && activity.size >= MAX_AGENTS) return;
  activity.set(key, { ...activity.get(key), [kind]: now });
}

export function lastActive(repo, kind) {
  return activity.get(repoKey(repo))?.[kind] ?? startedAt;
}

/**
 * The waits each owner kind holds right now, per repository: a kind holding one is at
 * work for as long as it holds it (L6), which a note at each end alone would not show
 * once a wait outlasts `LIVE_WINDOW_MS`. Each entry is `{ count, since }`, `since` being
 * when the first of its holds began, which the state line reads as `listening` (L5).
 * Returns the release, called as the wait returns.
 *
 * The pages are told on the first hold and the last release of a kind in a repository,
 * the only moments `heldWaits` can change; a hold or release in between says nothing.
 */
const held = new Map();
const heldKey = (repo, kind) => `${kind} ${repoKey(repo)}`;

export function holdWait(repo, kind) {
  const key = heldKey(repo, kind);
  const was = held.get(key);
  held.set(key, { count: (was?.count ?? 0) + 1, since: was?.since ?? Date.now() });
  if (was === undefined) announce();
  return () => {
    const now = held.get(key);
    if (now === undefined) return;
    if (now.count > 1) return held.set(key, { ...now, count: now.count - 1 });
    held.delete(key);
    announce();
  };
}

/** Every repository holding a wait, by `repoKey`: the earliest `since` across its kinds, as ms. */
export function heldWaits() {
  const waits = {};
  for (const [key, { since }] of held) {
    const repo = key.slice(key.indexOf(' ') + 1);
    waits[repo] = Math.min(waits[repo] ?? since, since);
  }
  return waits;
}

/** When `kind` counts as quiet in `repo` (L6, L7): a live window after its last activity. */
export function quietAt(repo, kind, now = Date.now()) {
  return (held.has(heldKey(repo, kind)) ? now : lastActive(repo, kind)) + LIVE_WINDOW_MS;
}

/**
 * Everyone whose last tool call has fallen out of the window, taken off and
 * announced. Answers whether it took anybody, which is what the timer below and
 * the staleness test both ask.
 *
 * The sweep is the whole of departure (ADR 0024): a `SubagentStop` hook would
 * miss every agent that was killed, so the roster would need this anyway, and
 * this alone is the cheaper half.
 */
export function sweepAgents(now = Date.now()) {
  let left = false;
  for (const [key, agents] of decks) {
    for (const [agentId, agent] of agents) {
      if (isLive(agent, now)) continue;
      agents.delete(agentId);
      left = true;
    }
    if (agents.size === 0) decks.delete(key);
  }
  if (left) announce();
  return left;
}

/**
 * The next departure, timed rather than polled: nothing is scheduled while the
 * roster is empty, and one timer at a time waits for the oldest heartbeat to
 * fall out of the window. It is unreferenced, so it is the daemon's own server
 * that keeps the process up and a test that leaves an agent on the roster does
 * not leave the suite hanging on this.
 */
function schedule(now) {
  if (sweeping) clearTimeout(sweeping);
  sweeping = null;

  let oldest = null;
  for (const agents of decks.values()) {
    for (const agent of agents.values()) {
      if (oldest === null || agent.lastSeen < oldest) oldest = agent.lastSeen;
    }
  }
  if (oldest === null) return;

  sweeping = setTimeout(
    () => {
      sweeping = null;
      sweepAgents(Date.now());
      schedule(Date.now());
    },
    Math.max(oldest + LIVE_WINDOW_MS - now, 0) + 1,
  );
  sweeping.unref();
}

/**
 * Who is live, by deck: what the page is rendered from, and the one shape the
 * rest of the package sees. Keyed by `repoKey` the way `listDeckNumbers` is, so
 * a tab finds its own agents however the path that reported them was spelled.
 *
 * Staleness is applied here as well as in the sweep, because a page served in
 * the moment between an agent's window closing and the timer coming round must
 * not draw it: the window is what "live" means, and the sweep is only what tells
 * the pages about it.
 */
export function listAgents(now = Date.now()) {
  const roster = {};
  for (const [key, agents] of decks) {
    const live = [...agents.values()]
      .filter((agent) => isLive(agent, now))
      .sort((left, right) => left.since - right.since)
      .map((agent) => ({ agentType: agent.agentType, since: new Date(agent.since).toISOString() }));
    if (live.length) roster[key] = live;
  }
  return roster;
}

/**
 * Empty the roster. The daemon never does this — its roster is as long-lived as
 * it is — but a test's is not, and a module that remembers between tests is a
 * test that only passes first. Activity goes with it and the start moves to now,
 * which is what a restarted daemon sees.
 */
export function forgetAgents() {
  decks.clear();
  activity.clear();
  held.clear();
  startedAt = Date.now();
  if (sweeping) clearTimeout(sweeping);
  sweeping = null;
}
