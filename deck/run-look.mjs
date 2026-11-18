/**
 * The look (handoff-mod L1): one decision over the deck for one repository, answering one `Outcome`, run as a
 * CLI by the mod (`hooks/handoff-mod.mjs`) through `$.process.run`. It waits only for the lane's marker, at most
 * `SETTLE_MS`; the mod does the clearing
 * and the submitting, and this file decides whether to.
 *
 *   node <root>/deck/run-look.mjs <op> [--id itm_<hex>] [--turn-ended <ms>] [--why <text>]
 *
 * prints one JSON `Outcome` line and exits 0; a refused argument exits 2 with no line, before anything is read.
 *
 * `turn` answers `clear` only in the session that posted the newest open hand-off (A6, its
 * `claims/posted-<session pid>.stamp`) and only once, by the `wx` claim `clear-typed-<id>` (L2). `cleared`
 * answers the fresh session's first prompt once the SessionStart lane has marked it (L3), drops the posted
 * stamp, and is the one place that logs the hand-off taken (L9). `start` writes the session's reported-in stamp
 * and releases the directory's co-pilot, chaining nothing (L12, L13). `turn` also holds the clear while the directory's co-pilot is live, and a
 * clear starts the directory's 5-minute cooldown (L6). A hand-off that did not start is said aloud once per id.
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { StringDecoder } from 'node:string_decoder';
import { pathToFileURL } from 'node:url';

import { isOpen, repoKey, sameRepo } from './items.mjs';
import { landerDue } from './landing-replies.mjs';
import { claimDir, claimNameFor, laneMarked, postedFile, reportedFile, takeClaim } from './run-claim.mjs';
import { deckUrl } from './tools.mjs';
import { listeningRepo } from './wait.mjs';
import { privateDir } from '../hooks/lib/atomic-write.js';
import { bearer } from '../hooks/lib/deck-secret.js';
import { log } from '../hooks/lib/wrapper-log.js';

const OPS = ['start', 'turn', 'cleared', 'unstarted'];

/** An item id as the deck mints it; nothing else reaches a file name or the mod's argv (A4). */
const ITEM_ID = /^itm_[0-9a-f]{1,40}$/;

/** The pilot's own hand-off kind: known to the deck, never in `KINDS` (thread-types-phase L4). */
const HANDOFF_KIND = 'handoff';

/** The deck's own default window, which is also the lane's and the stop gate's. */
const MAX_ITEMS = 20;

/** A loopback socket answers in single-digit milliseconds or not at all. */
const REQUEST_TIMEOUT_MS = 1500;

/** What this is willing to read from a deck it cannot vouch for. */
const MAX_RESPONSE_CHARS = 2 * 1024 * 1024;

/** The directory's cooldown, one per repository so a restarted session keeps it (L6); its mtime is the clear. */
const cooldownFile = (repo) => path.join(claimDir(), `cleared-${crypto.createHash('sha256').update(repoKey(repo)).digest('hex').slice(0, 16)}.stamp`);

/**
 * How long after a clear no hand-off of the directory is cleared, whatever the deck says. The claim makes one
 * hand-off clear once; it is silent about a stream of fresh ids, and the deck mints one for any loopback poster.
 * A genuine hand-off takes tens of minutes of context to reach, so five costs the honest case nothing.
 */
const CLEAR_COOLDOWN_MS = 5 * 60 * 1000;

/** How long a live co-pilot holds a hand-off's clear, from the directory's first hold (held-handoff L4). */
const HOLD_BOUND_MS = 20 * 60 * 1000;

/** What `unstarted` may be told, and what `cleared` adds; nothing else reaches a log line or a reply (A4). */
const CAUSES = {
  'no marker': 'the fresh session was not handed the body (no lane marker)',
  refused: 'the first prompt was refused (a Stop hold?)',
  'no turn': 'no turn started within 60 s of the first prompt',
};
const UNSTARTED_WHY = ['refused', 'no turn'];

/**
 * The fresh session's first prompt: the fixed literal, and the lander a press queued while the old session
 * handed off, the head of `landerDue` (lander spec 5, L5), so the fresh session spawns it first.
 */
function firstPrompt(items, cwd) {
  const [lander] = landerDue(items, cwd);
  return `Pick up the hand-off on the deck.${lander ? ` Spawn pilot-lander ${lander}.` : ''}`;
}

/**
 * The one hand-off this directory should act on, or null. Newest first, and the newest is the only candidate:
 * falling back to the one below it would replay a finished run's hand-off. Openness is checked even though the
 * read asks for open threads only, so an older daemon degrades to silence.
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

/** A request's own deadline. */
const deadline = () => AbortSignal.timeout(REQUEST_TIMEOUT_MS);

/** A whole JSON body, or a refusal past `MAX_RESPONSE_CHARS`: the deck's port trusts any loopback caller. */
async function bodyOf(response, what) {
  const decoder = new StringDecoder('utf8');
  let text = '';
  for await (const chunk of response.body ?? []) {
    text += decoder.write(chunk);
    if (text.length > MAX_RESPONSE_CHARS) throw new Error(`the deck answered ${what} with more than this will read`);
  }
  return JSON.parse(text);
}

/** One request to the deck, the secret read first and each time (deck-token L6). */
function deckFetch(route, { headers, ...init }) {
  const authorization = bearer();
  return fetch(`${deckUrl()}${route}`, { ...init, headers: { ...headers, ...authorization } });
}

/**
 * The open threads, asked for **without** a `repo`: a read naming one marks the user's replies delivered
 * (`deck/server.mjs`) and would switch off the Stop gate. The join is made on the item's own `repo`.
 */
async function openItems() {
  const response = await deckFetch('/api/tool', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'deck_read', arguments: { open: true, limit: MAX_ITEMS, messages: 'all' } }),
    signal: deadline(),
  });
  if (!response.ok) throw new Error(`the deck answered deck_read with ${response.status}`);
  const read = JSON.parse((await bodyOf(response, 'deck_read'))?.content?.[0]?.text ?? 'null');
  return Array.isArray(read?.items) ? read.items : [];
}

/**
 * Whether this look may clear past this directory's co-pilot, and the moment a turn end must follow.
 * Handoff failed on any open hand-off of the directory re-arms it, whatever the co-pilot says (held-handoff L3),
 * and the clear then waits for a turn end after the press, never mid-turn; an unreadable press time reads as
 * `now`. Otherwise a live co-pilot holds it `until` 20 minutes past the directory's earliest `hold.at`, read
 * from the items so a restarted session keeps the same clock; a hold not yet written counts from `now` (L4).
 * Either way a released co-pilot's clear waits for the turn after its release, since that release's
 * hand-back turn may still be running.
 */
function holdFor(items, cwd, coPilot, now) {
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
 * This directory's co-pilot, `{ ticket, live, at }` or null, from `GET /api/record?repo=` (clear-waits-co-pilot L7):
 * a read that marks nothing delivered, never `deck_read` with a `repo`. A daemon older than the field answers null.
 */
async function coPilotAt(cwd) {
  const response = await deckFetch(`/api/record?repo=${encodeURIComponent(cwd)}`, { signal: deadline() });
  if (!response.ok) throw new Error(`the deck answered /api/record with ${response.status}`);
  return (await bodyOf(response, '/api/record'))?.coPilot ?? null;
}

/**
 * A held hand-off is marked held on the item, never by a reply, so nothing takes the hold for a pick-up
 * (held-handoff L2, A1). Every look marks it; the deck keeps the first and answers `held` only then, which is
 * when the line is logged. A deck that will not take the hold is logged and left.
 */
async function sayHeld(handoff, coPilot) {
  try {
    const response = await deckFetch('/api/hold', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: handoff.id, ticket: coPilot.ticket }),
      signal: deadline(),
    });
    if (!response.ok) {
      await response.body?.cancel();
      throw new Error(`the deck answered /api/hold with ${response.status}`);
    }
    if ((await bodyOf(response, '/api/hold'))?.held === true) {
      log(`mod: held ${handoff.id} for the co-pilot on ${coPilot.ticket}`);
    }
  } catch (err) {
    log(`mod: could not post the hold on ${handoff.id} (${err?.message ?? err})`);
  }
}

/**
 * A hand-off that went wrong, told to the user rather than left as an idle session: a reply on the hand-off's
 * thread, and a line in this directory's chat when the thread refuses it, as a closed one does (handoff-prompt
 * spec 3), or always when `both`. Never a prompt: nothing says which session it would land in. A deck that will
 * not take a reply is logged and left.
 */
async function sayAloud(handoff, cwd, read, text, { both = false } = {}) {
  // Each post on its own: a thread the user closed during the wait refuses its reply, and
  // the chat line is then the only notice left.
  const say = async (where, post) => {
    try {
      await post();
      return true;
    } catch (err) {
      log(`mod: could not post the notice for ${handoff.id} on the ${where} (${err?.message ?? err})`);
      return false;
    }
  };
  if ((await say('thread', () => reply(handoff.id, text))) && !both) return;
  await say('chat', async () => {
    const chat = (await read()).find((i) => i?.kind === 'chat' && sameRepo(i.repo, cwd) && typeof i.id === 'string');
    if (chat) await reply(chat.id, text);
  });
}

/** One `deck_reply`, whose answer is prose rather than JSON. */
async function reply(id, text) {
  const response = await deckFetch('/api/tool', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'deck_reply', arguments: { id, text } }),
    signal: deadline(),
  });
  await response.body?.cancel();
  if (!response.ok) throw new Error(`the deck answered deck_reply with ${response.status}`);
}

/** The id this session's `pilot handoff` posted, or null. */
function postedBy(pid) {
  try {
    const id = fs.readFileSync(postedFile(pid), 'utf8').trim();
    return ITEM_ID.test(id) ? id : null;
  } catch {
    return null;
  }
}

const none = (why) => ({ act: 'none', why });

/** When this directory last cleared: -Infinity for never, +Infinity (held) for a stamp that cannot be read. */
function clearedAt(repo) {
  try {
    return fs.statSync(cooldownFile(repo)).mtimeMs;
  } catch (err) {
    return err?.code === 'ENOENT' ? -Infinity : Infinity;
  }
}

/** The cooldown starts at `now`; a stamp that cannot be written costs the bound, never the clear. */
function stampCleared(repo, now) {
  try {
    fs.writeFileSync(cooldownFile(repo), '');
    fs.utimesSync(cooldownFile(repo), new Date(now), new Date(now));
  } catch (err) {
    log(`mod: could not stamp the cooldown (${err?.message ?? err})`);
  }
}

async function turn(repo, pid, turnEndedAt, { read, coPilot, now }) {
  const posted = postedBy(pid); // asked first: a session that posted nothing reads nothing
  if (!posted) return none('this session posted no hand-off');
  const at = now();
  if (at - clearedAt(repo) < CLEAR_COOLDOWN_MS) return none('cleared less than 5 minutes ago'); // asked before the deck
  const items = await read();
  const handoff = pickup(items, repo);
  if (!handoff) return none(`${posted} was closed before the turn ended`);
  if (handoff.id !== posted) return none(`${posted} is superseded`); // the newer id is deck text, never echoed
  if (laneMarked(handoff.id)) return none(`${handoff.id} is already picked up`);
  const live = await coPilot(repo);
  const hold = holdFor(items, repo, live, at);
  if (!hold.clear) {
    await sayHeld(handoff, live);
    return { act: 'held', id: handoff.id, until: hold.until };
  }
  // A re-arm or a release while the turn ran: the clear waits for a turn end after it, never mid-turn.
  if (turnEndedAt < hold.since) return none(`${handoff.id} waits for a turn end after ${new Date(hold.since).toISOString()}`);
  if (!takeClaim(claimNameFor(handoff.id))) return none(`${handoff.id} is already cleared`);
  stampCleared(repo, at);
  if (hold.why === 'bound') log(`mod: hold on ${handoff.id} past 20 min, clearing with the co-pilot on ${live.ticket} live`);
  return { act: 'clear', id: handoff.id };
}

/**
 * Says once per id, whatever the cause, that a hand-off did not start: a reply on its thread (and the chat when
 * `both`, or when the thread refuses) and one log line. The `wx` claim `said-<id>` is the once.
 */
async function unstarted(repo, id, why, read, { both = false } = {}) {
  if (takeClaim(`said-${id}`)) {
    log(`mod: not started ${id} (${why})`);
    await sayAloud({ id }, repo, read, `hand-off ${id} not started: ${CAUSES[why]}; look at the terminal`, { both });
  }
  return { act: 'said', id, why };
}

/**
 * How long `cleared` waits for the lane's marker. The host's `$.command.run` only queues the clear, so the mod's
 * `cleared` starts beside the SessionStart lane, not after it (live: 5 ms early); the lane's own timeout is 5 s.
 */
const SETTLE_MS = 3000;
const MARKER_POLL_MS = 50;

/** Whether the lane has marked `id`, polled until `settleMs` has passed. */
async function markedWithin(id, settleMs) {
  for (const end = Date.now() + settleMs; !laneMarked(id); ) {
    if (Date.now() >= end) return false;
    await new Promise((resolve) => setTimeout(resolve, MARKER_POLL_MS));
  }
  return true;
}

async function cleared(repo, pid, id, read, settleMs) {
  if (postedBy(pid) === id) fs.rmSync(postedFile(pid), { force: true });
  // A clear no lane answered is said in the chat too (S17, A8 option B): the thread may be the body nobody got.
  if (!(await markedWithin(id, settleMs))) return unstarted(repo, id, 'no marker', read, { both: true });
  log(`mod: cleared ${id}`);
  let items = [];
  try {
    items = await read(); // for a queued lander; a deck that does not answer names none
  } catch {
    items = [];
  }
  log(`mod: submitted ${id}`);
  return { act: 'submit', id, prompt: firstPrompt(items, repo) };
}

/**
 * Reported in: the stamp `pilot handoff` reads, written first. Then one `POST /api/started`, which releases the
 * directory's co-pilot, whose session is gone (L13), and chains nothing (L12). A deck that does not answer is
 * logged and costs the release only.
 */
async function start(repo, pid) {
  try {
    privateDir(path.dirname(claimDir()));
    privateDir(claimDir());
    fs.writeFileSync(reportedFile(pid), new Date().toISOString());
  } catch (err) {
    return none(`could not report in (${err?.message ?? err})`);
  }
  try {
    const response = await deckFetch('/api/started', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ repo }),
      signal: deadline(),
    });
    if (!response.ok) {
      await response.body?.cancel();
      throw new Error(`the deck answered /api/started with ${response.status}`);
    }
    if ((await bodyOf(response, '/api/started'))?.released === true) return none('released');
  } catch (err) {
    log(`mod: could not release the co-pilot at start (${err?.cause?.code ?? err?.message ?? err})`);
  }
  return none('reported in');
}

/**
 * One look. `deps` stand in for the deck read, the co-pilot read, the clock, the parent pid and the marker wait in
 * a test. The session is the look's parent, the Claude Code process whose mod ran it, never `CLAUDE_PID`: the host
 * does not set it for a mod's process, so there it is only ever inherited from an outer session (F15).
 */
export async function look(op, args = {}, deps = {}) {
  const { read = openItems, coPilot = coPilotAt, now = Date.now, ppid = process.ppid, settleMs = SETTLE_MS } = deps;
  const repo = args.repo ?? listeningRepo(process.cwd());
  const pid = ppid;
  if (op === 'start') return start(repo, pid);
  if (op === 'turn') return turn(repo, pid, Number.isFinite(args.turnEndedAt) ? args.turnEndedAt : 0, { read, coPilot, now });
  if (!ITEM_ID.test(args.id ?? '')) return none(`${op} needs an item id`);
  if (op === 'cleared') return cleared(repo, pid, args.id, read, settleMs);
  if (op === 'unstarted' && UNSTARTED_WHY.includes(args.why)) return unstarted(repo, args.id, args.why, read);
  return none(`${op} is not a look`);
}

const FLAGS = { '--id': 'id', '--turn-ended': 'turnEndedAt', '--why': 'why' };

/** The op and its arguments, or null for anything refused. */
function parse(argv) {
  const [op, ...rest] = argv;
  if (!OPS.includes(op)) return null;
  const args = {};
  for (let i = 0; i < rest.length; i += 2) {
    const name = Object.hasOwn(FLAGS, rest[i]) ? FLAGS[rest[i]] : undefined;
    const value = rest[i + 1];
    if (!name || typeof value !== 'string' || value === '' || name in args) return null;
    args[name] = value;
  }
  if (args.id !== undefined && !ITEM_ID.test(args.id)) return null;
  if ((op === 'cleared' || op === 'unstarted') && args.id === undefined) return null;
  if (args.why !== undefined ? op !== 'unstarted' || !UNSTARTED_WHY.includes(args.why) : op === 'unstarted') return null;
  if (args.turnEndedAt !== undefined) {
    if (!/^\d{1,16}$/.test(args.turnEndedAt)) return null;
    args.turnEndedAt = Number(args.turnEndedAt);
  }
  return { op, args };
}

/** The CLI: one JSON `Outcome` line and 0, or 2 and no line for a refused argument. */
export async function main(argv, { out = (line) => process.stdout.write(`${line}\n`) } = {}) {
  const parsed = parse(argv);
  if (!parsed) {
    process.stderr.write('usage: run-look.mjs <start|turn|cleared|unstarted> [--id itm_<hex>] [--turn-ended <ms>] [--why <text>]\n');
    return 2;
  }
  let outcome;
  try {
    outcome = await look(parsed.op, parsed.args);
  } catch (err) {
    outcome = none(`the deck did not answer (${err.cause?.code ?? err.message})`);
  }
  out(JSON.stringify(outcome));
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await main(process.argv.slice(2));
}
