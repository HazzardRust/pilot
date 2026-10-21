/**
 * `pilot run` — a terminal that types `/clear`, and then the fresh session's
 * first prompt, when the hand-off appears.
 *
 * Line 30, as the user amended it, asks for nothing from them at all. Three of
 * the four parts were already built: the guard notices the context filling, the
 * pilot stashes its state and posts a `handoff` item (`pilot handoff`), and a `SessionStart` lane
 * (`hooks/session-handoff.js`) hands that body to the fresh session. Between
 * the third and the fourth sits one keystroke nothing can perform on the user's
 * behalf — no hook output field clears a context, the Agent SDK is API-key only
 * and would move the run onto metered credits, and patching the CLI is barred
 * outright. Typing is the only thing that clears a session, so the only open
 * question was who types it. This is the answer: a wrapper that owns a terminal,
 * runs `claude --agent pilot:pilot` inside it exactly as a hand would, and types
 * the six characters when the item it is waiting for turns up. It reads nothing
 * of the CLI and patches nothing; it owns a terminal and types into it.
 *
 * The `/clear` alone was not enough (S12): a session after it holds the lane's
 * context but starts no turn until something is typed, so a hand-off once sat
 * 23 minutes waiting for a person. The wrapper therefore types one prompt
 * straight after it, under the same claim and cooldown.
 *
 * A command typed while a turn is running is held until that turn ends, so
 * writing `/clear` the moment the item appears is safe: it queues behind
 * whatever the pilot was finishing rather than cutting it off. The prompt does
 * not queue the same way any more (independence spec 24): found live on
 * 2026-09-25, Claude Code surfaced it inside the posting session's running
 * turn, and the fresh session after the `/clear` sat idle until the user
 * typed. So the prompt waits for the one sign that the fresh session exists:
 * the claim `hooks/session-handoff.js` takes when its `SessionStart` lane hands
 * that session the body. No marker, no prompt — never a prompt on a timer,
 * because a prompt in the wrong session is worse than none. And the item is
 * the trigger, never the 30% reading — the reading fires *before* the pilot has
 * written anything down, and clearing then would throw away the context that
 * was about to write the hand-off (L34).
 *
 * `node-pty` is the package's first native dependency in a tree that has been
 * Node builtins only, and its install line falls through to `node-gyp rebuild`
 * when there is no prebuild for the platform and ABI. A plain dependency would
 * therefore fail `npm install` for the whole package, on a machine with no
 * compiler, for a convenience. It is **optional** and loaded dynamically here,
 * nowhere else: with it absent `pilot run` says one line and starts plain
 * `claude --agent pilot:pilot`, which is never worse than today, and no other
 * path in the package — `pilot deck` above all — can reach a native module.
 *
 * The claim that makes the `/clear` happen once is written out below rather
 * than imported from `hooks/lib/deck.js`: that file is CommonJS and this is
 * ESM, a seam this package has refused to cross twice (L8, L35), and the
 * precedent is `sameRepo`/`isOpen` against the hooks' `samePath`/`isClosed`
 * (L13), with `hooks/test/join.test.js` holding both. `deck/test/run.test.mjs`
 * is that test for the claim: it writes one with one half and reads it with the other.
 */

import { spawn } from 'node:child_process';
import { StringDecoder } from 'node:string_decoder';

// `./tools.mjs` and not `./server.mjs`, which re-exports the same name: the
// server loads the store, and L3's "one writer" is a property of what a module
// graph *cannot* reach rather than of what it chooses not to call.
import { deckUrl } from './tools.mjs';
import { isOpen, sameRepo } from './items.mjs';
import { landerDue } from './landing-replies.mjs';
import { readReach } from '../scripts/reach.mjs';
import { RESUME_PROMPT, claudeArgs, runEnv } from './run-env.mjs';
import { claudeBin } from '../hooks/lib/platform.js';
import { log as logLine } from '../hooks/lib/wrapper-log.js'; // ~/.claude/pilot/wrapper.log (S17), the file the lane writes too
import { bearer } from '../hooks/lib/deck-secret.js';

export { logLine };

import { claimNameFor, takeClaim, releaseClaim, laneMarked, lastTurnEnded, waitFor, pause } from './run-claim.mjs';
import { TAKEN_WAIT_MS, handPrompt } from './run-prompt.mjs';

export { claimNameFor, takeClaim, RESUME_PROMPT, claudeArgs, runEnv };

/**
 * The command and the return that submits it, in one write. Proved live: the
 * slash-command menu the CLI pops up as `/` is typed does not swallow the
 * return when both arrive together.
 */
const CLEAR = '/clear\r';

/**
 * The fresh session's first prompt, typed straight after the `/clear`. A session
 * after `/clear` holds the lane's context but starts no turn until something is
 * typed, so without this the hand-off sat waiting for a person (S12). Beside the
 * body it names one thing only: the lander a press queued while the old session
 * handed off, the head of `landerDue` (lander spec 5, L5), so the fresh session
 * spawns it as its first act after the pick-up. A second write rather than part
 * of the first, typed only once the lane has marked the fresh session (spec 24).
 */
export function firstPrompt(items, cwd) {
  const [lander] = landerDue(items, cwd);
  return `Pick up the hand-off on the deck.${lander ? ` Spawn pilot-lander ${lander}.` : ''}`;
}

/** The pilot's own hand-off kind: known to the deck, never in `KINDS` (thread-types-phase L4). */
const HANDOFF_KIND = 'handoff';

/** The deck's own default window, which is also the lane's and the stop gate's. */
const MAX_ITEMS = 20;

/** A loopback socket answers in single-digit milliseconds or not at all. */
const REQUEST_TIMEOUT_MS = 1500;

/**
 * How often to look for the deck again. The wrapper starts *before* the session
 * it is wrapping, so at its first look there is usually no daemon at all: the
 * session it just spawned is what starts one. This is the retry, not a poll —
 * once the stream is open nothing is asked for on a schedule.
 */
const RETRY_MS = 2000;

/** What this is willing to read into memory from a deck it cannot vouch for. */
const MAX_RESPONSE_CHARS = 2 * 1024 * 1024;

/** A `changed` ping is nine bytes; a line far past this is not one. */
const MAX_EVENT_LINE_CHARS = 4096;

/**
 * How long after typing `/clear` the wrapper refuses to type it again, whatever
 * the deck says.
 *
 * The per-item claim makes the *same* hand-off arrive once. It cannot make a
 * *stream* of hand-offs arrive once, and the deck's HTTP port trusts any
 * loopback caller and mints a fresh id for every post (`deck/client.mjs`), so
 * without this a local process that can POST could clear the user's session on
 * every change event for as long as it kept posting — and a forged hand-off,
 * unlike a real one, has stashed nothing, so each clear would throw away work.
 * A genuine hand-off needs a session to fill a third of its context window
 * first, which is tens of minutes at the very least, so five costs the honest
 * case nothing and leaves the dishonest one no better off than typing `/clear`
 * by hand would be. It is a bound on the damage rather than a fix for the
 * trust boundary, which is the daemon's to close.
 */
const CLEAR_COOLDOWN_MS = 5 * 60 * 1000;
/** How long a live co-pilot holds a hand-off's `/clear`, from the directory's first hold (held-handoff L4). */
const HOLD_BOUND_MS = 20 * 60 * 1000;

/** How often to look for the lane's marker once the `/clear` is in. */
const LANE_POLL_MS = 250;

/**
 * How long the posting session's turn may run on before the wrapper gives up on
 * typing the `/clear` at all. A hand-off is posted near the end of a turn and the
 * Stop gate holds one for nine minutes at most, so half an hour is generous; past
 * it the claim goes back and a later look tries again.
 */
const REST_WAIT_MS = 30 * 60 * 1000;

/**
 * How long a `/clear` typed into a session at rest may take to reach the fresh
 * session's lane. It lands at once and the lane is one `SessionStart` hook, so
 * two minutes without its marker is a prompt nobody types.
 */
const LANE_WAIT_MS = 2 * 60 * 1000;

// --- the deck ---------------------------------------------------------------

/**
 * One deck tool, called the way the stdio client calls it. Rejects on anything
 * at all — a refused connection, a timeout, a body that is not JSON — because
 * the watch loop treats "the deck did not answer" the same way whatever the
 * reason was.
 */
/**
 * A request's own deadline, plus the caller's reason for giving up. Without the
 * second half a session that ends while a read is in flight would hold the
 * whole wrapper open for the rest of the timeout after the terminal has gone.
 */
const deadline = (signal) =>
  (signal ? AbortSignal.any([signal, AbortSignal.timeout(REQUEST_TIMEOUT_MS)]) : AbortSignal.timeout(REQUEST_TIMEOUT_MS));

/**
 * A whole body, or a refusal. `response.json()` would read whatever arrives;
 * the deck is a local daemon on a port that trusts any loopback caller, and
 * `hooks/lib/deck.js` puts the same ceiling on the same answers.
 */
async function bodyOf(response, what) {
  const decoder = new StringDecoder('utf8');
  let text = '';
  for await (const chunk of response.body ?? []) {
    text += decoder.write(chunk);
    if (text.length > MAX_RESPONSE_CHARS) throw new Error(`the deck answered ${what} with more than this will read`);
  }
  return JSON.parse(text);
}

/**
 * One request to the deck, the secret read first and each time (deck-token L6), so a secret replaced while the
 * wrapper runs is taken and a missing file throws its own message before any request is made.
 */
function deckFetch(route, { headers, ...init }) {
  const authorization = bearer();
  return fetch(`${deckUrl()}${route}`, { ...init, headers: { ...headers, ...authorization } });
}

async function tool(name, args, signal) {
  const response = await deckFetch('/api/tool', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name, arguments: args }),
    signal: deadline(signal),
  });
  if (!response.ok) throw new Error(`the deck answered ${name} with ${response.status}`);
  const text = (await bodyOf(response, name))?.content?.[0]?.text;
  if (typeof text !== 'string') throw new Error(`the deck answered ${name} with no content`);
  return JSON.parse(text);
}

/**
 * The open threads, asked for **without** a `repo`.
 *
 * `deck/server.mjs` hands every reply on the items a read returns over to the
 * pilot when the call named a repository, so a wrapper that asked that way
 * would mark the user's unanswered replies "read" on every change event and
 * quietly switch off the Stop gate that holds a turn open for them. The
 * repository join is made against the item's own `repo` instead, as S20's lane
 * and the stop gate both do.
 */
const openItems = async (signal) => {
  const read = await tool('deck_read', { open: true, limit: MAX_ITEMS, messages: 'all' }, signal);
  return Array.isArray(read?.items) ? read.items : [];
};

/**
 * The one hand-off this directory should act on, or null. Newest first, and the
 * newest is the only candidate: falling back to the one below it would replay a
 * finished run's hand-off, which is the loop the claim exists to prevent.
 *
 * Openness is checked even though the read asks for open threads only, so a
 * daemon older than that argument degrades to silence rather than to clearing a
 * session over a hand-off the user has already dismissed.
 */
function pickup(items, cwd) {
  for (let i = items.length - 1; i >= 0; i -= 1) {
    const candidate = items[i];
    if (!candidate || candidate.kind !== HANDOFF_KIND) continue;
    if (!sameRepo(candidate.repo, cwd)) continue;
    if (!isOpen(candidate)) continue;
    if (typeof candidate.id !== 'string' || candidate.id === '') continue;
    return candidate;
  }
  return null;
}

/**
 * Whether this look may type the `/clear` past this directory's co-pilot, and the moment a turn end must follow.
 * Handoff failed on any open hand-off of the directory re-arms it, whatever the co-pilot says (held-handoff L3),
 * and the `/clear` then waits for a turn end after the press, never mid-turn; an unreadable press time reads as
 * `now`. Otherwise a live co-pilot holds it `until` 20 minutes past the directory's earliest `hold.at`, read
 * from the items so a restarted wrapper keeps the same clock; a hold not yet written counts from `now` (L4).
 * Either way a released co-pilot's `/clear` waits for the turn after its release, since that release's
 * hand-back turn may still be running.
 */
export function holdFor(items, cwd, coPilot, now) {
  const open = items.filter((item) => item?.kind === HANDOFF_KIND && sameRepo(item.repo, cwd) && isOpen(item));
  const from = coPilot?.live === true ? Date.parse(coPilot.at) || 0 : 0; // a hold or press from before this co-pilot went live is not its own
  const presses = open.filter((item) => item.hold?.rearmedAt).map((item) => Date.parse(item.hold.rearmedAt) || now).filter((time) => time >= from);
  const released = coPilot?.live === true ? 0 : Date.parse(coPilot?.at) || 0;
  if (presses.length > 0) return { clear: true, why: 'rearmed', since: Math.max(...presses, released) };
  if (coPilot?.live !== true) return { clear: true, why: 'free', since: released };
  // A hold from before the go-live counts from the go-live, never dropped: dropped, `until` would slide with `now` (QA F4).
  const until = Math.min(now, ...open.map((item) => Date.parse(item.hold?.at)).filter(Number.isFinite).map((time) => Math.max(time, from))) + HOLD_BOUND_MS;
  return now >= until ? { clear: true, why: 'bound', since: released } : { clear: false, ticket: coPilot.ticket, until };
}

/**
 * Look once, and if this is the moment type `/clear` and then the fresh session's
 * first prompt. Answers whether it typed.
 *
 * The claim is taken *before* the write, because that is the only order in
 * which two wrappers watching one directory cannot both type — and given back
 * if the write then fails, because the claim's whole meaning is that the six
 * characters went in. A terminal that has just closed under a change event
 * already in flight is the way that happens.
 *
 * The `/clear` goes in only once the session has ended a turn since the hand-off
 * was posted. Mid-turn it would queue behind the turn, unless a permission prompt
 * is open: then the prompt takes the keys and its return answers it, which is
 * how a hand-off failed to clear on 2026-09-29.
 *
 * The prompt goes in only once the lane has marked the fresh session (spec 24).
 * A lane that never marks is a `/clear` with no prompt after it, and the claim
 * is kept: one hand-off never clears a session twice. A marker already there
 * means some session holds the body, and the lane never fires twice for one
 * hand-off, so clearing now would throw it away: nothing is typed.
 *
 * Throws when the deck does not answer: the caller is the watch loop below, and
 * being quiet about a deck that is not there is the loop's job, not this one's.
 */
export async function clearOnce({
  cwd,
  type,
  read = openItems,
  signal = new AbortController().signal,
  pollMs = LANE_POLL_MS,
  waitMs = LANE_WAIT_MS,
  restWaitMs = REST_WAIT_MS,
  settleMs,
  takenWaitMs = TAKEN_WAIT_MS,
  coPilot = () => coPilotAt(cwd, signal),
  now = Date.now,
  wake = () => {},
}) {
  const handoff = pickup(await read(), cwd);
  if (!handoff || laneMarked(handoff.id)) return false;

  const name = claimNameFor(handoff.id);
  if (!takeClaim(name)) return false;
  // A turn end after the post, and after any release, so the `/clear` never lands inside the hand-back turn (L5).
  let posted = Date.parse(handoff.postedAt) || Date.now();
  // The last look's items, which the first prompt reads for a queued lander.
  let items = [];
  let hold = null;
  let live = null;
  for (;;) {
    if (!(await waitFor(() => lastTurnEnded() >= posted, { signal, pollMs, waitMs: restWaitMs }))) {
      releaseClaim(name);
      return false;
    }
    // Looked at again now the turn is over (S17): the turn that posted it may have
    // closed it, as run 1's pilot did to itm_3b422012fde0, and a `/clear` then throws
    // the session away for a hand-off the lane will rightly find closed.
    try {
      items = await read();
      const still = pickup(items, cwd);
      if (still?.id !== handoff.id) {
        releaseClaim(name);
        logLine(`run: no /clear for ${handoff.id} (${still ? `superseded by ${still.id}` : 'closed before the turn ended'})`);
        return false;
      }
      // Any hand-off, chain or context, is held while this directory's co-pilot is live (clear-waits-co-pilot L5, L11):
      // the release is a deck write, and its change event is the next look; the bound is the watch's timer (L4).
      live = await coPilot();
      hold = holdFor(items, cwd, live, now());
      if (!hold.clear) {
        releaseClaim(name);
        wake(hold.until);
        await sayHeld(handoff, live, signal);
        return false;
      }
      // One set and released while the turn ran, or a re-arm pressed after the turn ended: the change event found
      // this claim taken, so this look waits for the turn after it rather than leave nothing to try again.
      if (lastTurnEnded() < hold.since) {
        posted = hold.since;
        continue;
      }
      type(CLEAR);
      break;
    } catch (err) {
      releaseClaim(name);
      throw err;
    }
  }
  logLine(hold.why === 'bound'
    ? `run: hold on ${handoff.id} past 20 min, typed /clear with the co-pilot on ${live.ticket} live`
    : `run: ${hold.why === 'rearmed' ? 're-armed by the user, ' : ''}typed /clear for ${handoff.id}`);
  // The claim stays from here on, marker or none: it says the `/clear` was typed,
  // and a lane that is silent may be a fresh session that could not reach the deck.
  if (!(await waitFor(() => laneMarked(handoff.id), { signal, pollMs, waitMs }))) {
    if (!signal.aborted) {
      logLine(`run: no marker for ${handoff.id} after ${waitMs}`);
      const text = `no fresh session marked for ${handoff.id} within ${Math.ceil(waitMs / 60000)} min; type /clear yourself`;
      await sayAloud(handoff, cwd, read, text, signal, { both: true });
    }
    return true;
  }
  // Read again: a lander may have claimed its gate2 while the lane started. A deck that does not answer names none.
  try {
    items = await read();
  } catch {
    items = [];
  }
  logLine(`run: marker for ${handoff.id}, typed the prompt`);
  // Pasted, then Enter alone after a settle (handoff-prompt L1), then checked as taken. Awaited, like the lane
  // wait: the watch's cooldown keeps change events from typing meanwhile (L5).
  if ((await handPrompt(firstPrompt(items, cwd), { id: handoff.id, type, signal, settleMs, pollMs, takenWaitMs })) === 'not started') {
    const text = `hand-off ${handoff.id} not started: no tool call within ${Math.ceil(takenWaitMs / 60000)} min of its prompt or of a second Enter; look at the terminal`;
    await sayAloud(handoff, cwd, read, text, signal);
  }
  return true;
}

/**
 * This directory's co-pilot, `{ ticket, live, at }` or null, from `GET /api/record?repo=` (clear-waits-co-pilot L7):
 * a read that marks nothing delivered, never `deck_read` with a `repo`. A daemon older than the field answers null.
 */
async function coPilotAt(cwd, signal) {
  const response = await deckFetch(`/api/record?repo=${encodeURIComponent(cwd)}`, { signal: deadline(signal) });
  if (!response.ok) throw new Error(`the deck answered /api/record with ${response.status}`);
  return (await bodyOf(response, '/api/record'))?.coPilot ?? null;
}

/**
 * A held hand-off is marked held on the item, never by a reply, so nothing takes the hold for a pick-up
 * (held-handoff L2, A1). Every look marks it; the deck keeps the first and answers `held` only then, which is
 * when the line is logged. A deck that will not take the hold is logged and left.
 */
async function sayHeld(handoff, coPilot, signal) {
  try {
    const response = await deckFetch('/api/hold', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: handoff.id, ticket: coPilot.ticket }),
      signal: deadline(signal),
    });
    if (!response.ok) {
      await response.body?.cancel();
      throw new Error(`the deck answered /api/hold with ${response.status}`);
    }
    if ((await bodyOf(response, '/api/hold'))?.held === true) {
      logLine(`run: held ${handoff.id} for the co-pilot on ${coPilot.ticket}`);
    }
  } catch (err) {
    logLine(`run: could not post the hold on ${handoff.id} (${err?.message ?? err})`);
  }
}

/**
 * A hand-off that went wrong, told to the user rather than left as an idle session: a
 * reply on the hand-off's thread, and a line in this directory's chat when the thread
 * refuses it, as a closed one does (handoff-prompt spec 3), or always when `both`, as
 * for a `/clear` no lane answered (S17, A8 option B). Never a prompt: nothing says
 * which session it would land in. A deck that will not take a reply is logged and left;
 * the claim stays either way.
 */
async function sayAloud(handoff, cwd, read, text, signal, { both = false } = {}) {
  // Each post on its own: a thread the user closed during the wait refuses its reply, and
  // the chat line is then the only notice left.
  const say = async (where, post) => {
    try {
      await post();
      return true;
    } catch (err) {
      logLine(`run: could not post the notice for ${handoff.id} on the ${where} (${err?.message ?? err})`);
      return false;
    }
  };
  if ((await say('thread', () => reply(handoff.id, text, signal))) && !both) return;
  await say('chat', async () => {
    const chat = (await read()).find((i) => i?.kind === 'chat' && sameRepo(i.repo, cwd) && typeof i.id === 'string');
    if (chat) await reply(chat.id, text, signal);
  });
}

/** One `deck_reply`, whose answer is prose rather than JSON, so `tool` cannot read it. */
async function reply(id, text, signal) {
  const response = await deckFetch('/api/tool', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'deck_reply', arguments: { id, text } }),
    signal: deadline(signal),
  });
  await response.body?.cancel();
  if (!response.ok) throw new Error(`the deck answered deck_reply with ${response.status}`);
}

/**
 * Whether this directory is a run the deck knows about.
 *
 * This is the wrapper's cue to subscribe, and the reason it waits for one at
 * all is a side effect worth avoiding: the daemon opens the deck in a browser
 * when a session registers and nobody is already reading `/events`
 * (`deck/server.mjs`). A wrapper that subscribed first would count as that
 * somebody and silently cost the user the page A2 promises them. Waiting until
 * the run is registered puts the subscription strictly after the open.
 */
async function registered(cwd, signal) {
  const response = await deckFetch('/api/runs?live=1', { signal: deadline(signal) });
  if (!response.ok) throw new Error(`the deck answered /api/runs with ${response.status}`);
  const listed = await bodyOf(response, '/api/runs');
  return (listed?.runs ?? []).some((run) => sameRepo(run?.repo, cwd));
}

/**
 * Ask the deck to start this directory's head ticket (run-chaining A5, L7): the one
 * call `pilot run` adds. Answers the chain's answer: a hand-off, which the watch loop
 * then clears into exactly as it would on a change event.
 */
async function chainAtStart(cwd, signal) {
  const response = await deckFetch('/api/chain', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ repo: cwd }),
    signal: deadline(signal),
  });
  if (!response.ok) throw new Error(`the deck answered /api/chain with ${response.status}`);
  return (await bodyOf(response, '/api/chain')) ?? {};
}

/**
 * The daemon's own change stream, the one the deck's page reads. Yields the
 * name of each `changed` or `end` event and ends when the stream does.
 */
async function* changes(cwd, signal) {
  const response = await deckFetch(`/events?wrapper=${encodeURIComponent(cwd)}`, {
    headers: { accept: 'text/event-stream' },
    signal,
  });
  if (!response.ok || !response.body) throw new Error(`the deck answered /events with ${response.status}`);

  const decoder = new StringDecoder('utf8');
  let buffered = '';
  for await (const chunk of response.body) {
    buffered += decoder.write(chunk);
    const lines = buffered.split('\n');
    buffered = lines.pop() ?? '';
    // A stream is the one read with no deadline on it, so the only thing
    // stopping an endless line from growing without bound is this.
    if (buffered.length > MAX_EVENT_LINE_CHARS) throw new Error('the deck is streaming something that is not events');
    for (const line of lines) {
      const event = /^event: (changed|end)$/.exec(line.trim())?.[1];
      if (event) yield event;
    }
  }
}

/**
 * Watch until the session ends. Answers whether the deck was ever reached, which
 * is what the one line at the end of a run is written from.
 *
 * Every failure is a wait and another look. The deck may not be up yet (the
 * session this wrapper just started is what starts it), may be restarted under
 * it, or may never appear at all — and in every one of those cases the right
 * behaviour is the same: the pilot runs, nothing is typed, and the user types
 * `/clear` themselves as they always have.
 *
 * The cooldown is the second half of "once", and the half the per-item claim
 * cannot give: a claim keyed on the item is silent about a stream of new items.
 *
 * An `end` event is End pressed on this directory's tab (start-end-session L1):
 * `end` is called once and the watch is over, because the daemon kills nothing and
 * the session this wrapper owns is the one thing it asks to stop.
 */
export async function watch({ cwd, type, signal, end = () => {}, say = writeLine, retryMs = RETRY_MS, cooldownMs = CLEAR_COOLDOWN_MS }) {
  let reached = false;
  let toldNoSecret = false;
  let asked = false;
  let typedAt = -Infinity;
  const typeThenWait = (text) => { type(text); typedAt = Date.now(); };
  // A change inside the cooldown is looked at once when it ends, not dropped: a co-pilot's release is
  // the hold's only retry (clear-waits-co-pilot L5; QA F1). A hold's bound is a look at its `until` (held-handoff L4).
  // One timer at a time, at the earliest look asked for, and never a look inside the cooldown.
  let cool = null;
  let coolAt = Infinity;
  const lookAt = (at) => {
    if (signal.aborted || (cool && coolAt <= at)) return; // a look in flight at the abort arms nothing
    clearTimeout(cool);
    coolAt = at;
    cool = setTimeout(() => {
      cool = null;
      coolAt = Infinity;
      if (signal.aborted) return;
      if (Date.now() - typedAt < cooldownMs) lookAt(typedAt + cooldownMs);
      else clear().catch(() => {});
    }, Math.max(0, at - Date.now()));
  };
  const lookWhenCool = () => lookAt(typedAt + cooldownMs);
  const clear = () => clearOnce({ cwd, type: typeThenWait, read: () => openItems(signal), signal, wake: lookAt });
  signal.addEventListener('abort', () => clearTimeout(cool), { once: true });

  while (!signal.aborted) {
    try {
      if (await registered(cwd, signal)) {
        reached = true;
        // Once per wrapper once the deck has answered; a throw leaves it to the next look,
        // and a second ask is harmless because the daemon will not chain over an open hand-off.
        if (!asked) {
          const chained = await chainAtStart(cwd, signal);
          asked = true;
          if (chained.handoff) await clear();
        }
        for await (const event of changes(cwd, signal)) {
          if (event === 'end') {
            end();
            return reached;
          }
          if (Date.now() - typedAt < cooldownMs) {
            lookWhenCool();
            continue;
          }
          await clear();
        }
      }
    } catch (err) {
      // Named for the reader, acted on by nobody: see above. A missing secret is the one failure said aloud,
      // once, in the file's own words, because waiting never mends it.
      if (err?.code === 'NO_DECK_SECRET' && !toldNoSecret) {
        toldNoSecret = true;
        say(`pilot run: ${err.message}\n`);
      }
    }
    if (!signal.aborted) await pause(retryMs, signal);
  }
  return reached;
}

// --- the terminal -----------------------------------------------------------

/** The optional dependency, and the only place in the package that names it. */
export async function loadPty() {
  try {
    return await import('node-pty');
  } catch (err) {
    return null;
  }
}

const writeLine = (line) => process.stderr.write(line);

/**
 * `claude --agent pilot:pilot`, started the ordinary way, with this process's
 * own streams. What the user gets when there is no pty to be had: exactly what
 * they get today, with the `/clear` theirs to type.
 */
export function startPlain(command, args, say = writeLine, { cwd, env = runEnv(readReach()) } = {}) {
  return new Promise((resolve) => {
    const child = spawn(command, args, { stdio: 'inherit', cwd, env });
    child.on('error', (err) => {
      say(`pilot run: could not start ${command}: ${err.message}\n`);
      resolve(127);
    });
    child.on('exit', (code, signal) => resolve(signal ? 1 : code ?? 0));
  });
}

/**
 * `claude --agent pilot:pilot` inside a terminal this process owns.
 *
 * Raw stdin and raw stdout both ways, and resizes forwarded, so the session
 * looks and behaves exactly as the one started by hand: the CLI is drawing a
 * full-screen interface and anything less than raw would show. The terminal is
 * put back the way it was found whichever way the child leaves, because a shell
 * left in raw mode is a shell the user has to close.
 *
 * Answers the child, a promise of its exit code, and `kill`, rather than taking a
 * callback: the caller needs the child in its hand *before* anything that can
 * throw, or a terminal that half-started is a process nobody holds a reference
 * to and nobody can stop. Everything after the spawn is therefore wound back
 * here on the way out — `setRawMode` can fail on a terminal that claims to be
 * one — and only the spawn itself throws with nothing to clean up.
 */
function startUnderPty(pty, cwd, claude, reach) {
  const { stdin, stdout } = process;
  const child = pty.spawn(claude, claudeArgs(reach), {
    name: process.env.TERM || 'xterm-256color',
    cols: stdout.columns || 80,
    rows: stdout.rows || 24,
    cwd,
    // The pseudoconsole node-pty ships rather than the one built into Windows: on Windows 11
    // 22631 the built-in one let the CLI's drawing drift until a resize repainted it
    // (2026-09-28). It does nothing elsewhere, and a spawn that throws still starts plainly.
    useConptyDll: true,
    // What `pilot handoff` reads to know a `/clear` will be typed, and for which directory.
    env: { ...runEnv(reach), PILOT_RUN_PID: String(process.pid), PILOT_RUN_REPO: cwd },
  });

  const decoder = new StringDecoder('utf8');
  const onInput = (chunk) => child.write(decoder.write(chunk));
  const onResize = () => child.resize(stdout.columns || 80, stdout.rows || 24);
  const raw = Boolean(stdin.isTTY);
  let echo = null;

  const restore = () => {
    echo?.dispose();
    stdin.off('data', onInput);
    stdout.off('resize', onResize);
    if (raw) stdin.setRawMode(false);
    stdin.pause();
  };

  try {
    if (raw) stdin.setRawMode(true);
    stdin.on('data', onInput);
    stdout.on('resize', onResize);
    echo = child.onData((data) => stdout.write(data));
    stdin.resume();
  } catch (err) {
    restore();
    try { child.kill(); } catch { /* already gone */ }
    throw err;
  }

  let settle;
  const done = new Promise((resolve) => {
    settle = (code) => {
      settle = null;
      restore();
      resolve(code);
    };
  });
  child.onExit(({ exitCode, signal }) => settle?.(signal && !exitCode ? 1 : exitCode ?? 0));

  // Killed from this side, the session is over whether or not its exit ever arrives: a
  // ConPTY killed through node-pty's own DLL need never fire one (seen on the live gate,
  // 2026-09-30), and a wrapper still waiting on it holds its window open. Answers as a
  // signal does.
  const kill = () => {
    try { child.kill(); } catch { /* already gone */ }
    settle?.(1);
  };

  return { child, done, kill };
}

/**
 * The subcommand. Answers the child's exit code, which is the wrapper's.
 *
 * The three seams are the three things a test cannot have: a machine without
 * `node-pty`, a `claude` on the PATH, and this process's own stderr.
 */
export async function run({ load = loadPty, plain = startPlain, say = writeLine, cwd = process.cwd() } = {}) {
  const claude = claudeBin();
  if (claude === null) {
    // Never the bare name: with the unstripped environment it could be found in the repository.
    say(`pilot run: could not start claude: no absolute PATH entry has it
`);
    return 127;
  }
  const reach = readReach();
  const startPlainly = () => plain(claude, claudeArgs(reach), say, { cwd, env: runEnv(reach) });

  const pty = await load();
  if (!pty) {
    say(
      'pilot run: node-pty is not installed or would not build here, so this session ' +
        'cannot be typed into — starting the pilot as usual, with `/clear` yours to type ' +
        'when the hand-off appears.\n',
    );
    return startPlainly();
  }

  const stopping = new AbortController();

  let session = null;
  try {
    session = startUnderPty(pty, cwd, claude, reach);
  } catch (err) {
    // A `claude` ConPTY cannot start is the same outcome as no `node-pty`: the
    // user gets their pilot, and types the `/clear` themselves. `startUnderPty`
    // has already killed anything it managed to spawn.
    say(`pilot run: could not start ${claude} under a terminal (${err.message}) — starting it plainly.\n`);
    return startPlainly();
  }

  // Ctrl-C reaches the child as raw bytes and never as a signal, but a wrapper
  // whose stdin is not a terminal gets the real thing — and Node's default
  // handler would exit without taking the pty with it.
  const stop = () => { stopping.abort(); session.kill(); };
  process.once('SIGTERM', stop);
  process.once('SIGINT', stop);

  // Started only now, so the terminal to type into exists before anything can
  // decide to type into it.
  // `watch` says one thing aloud: the missing-secret message, which is then the closing word.
  let toldNoSecret = false;
  const sayWatched = (line) => { toldNoSecret = true; say(line); };
  const watching = watch({ cwd, type: (text) => session.child.write(text), signal: stopping.signal, end: stop, say: sayWatched });

  const code = await session.done;
  stopping.abort();
  process.off('SIGTERM', stop);
  process.off('SIGINT', stop);
  try { session.child.kill(); } catch { /* it exited, which is why we are here */ }

  if (!(await watching) && !toldNoSecret) {
    say('pilot run: the deck never answered, so no `/clear` was typed for you this session.\n');
  }
  return code;
}
