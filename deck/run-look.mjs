/**
 * The look (handoff-mod L1): one decision over the deck for one repository, answering one `Outcome`, run as a
 * CLI by the mod (`hooks/handoff-mod.mjs`) through `$.process.run`. It never waits; the mod does the clearing
 * and the submitting, and this file decides whether to.
 *
 *   node <root>/deck/run-look.mjs <op> [--repo <dir>] [--id itm_<hex>] [--turn-ended <ms>] [--why <text>]
 *
 * prints one JSON `Outcome` line and exits 0; a refused argument exits 2 with no line, before anything is read.
 *
 * `turn` answers `clear` only in the session that posted the newest open hand-off (A6, its
 * `claims/posted-<session pid>.stamp`) and only once, by the `wx` claim `clear-typed-<id>` (L2). `cleared`
 * answers the fresh session's first prompt once the SessionStart lane has marked it (L3), drops the posted
 * stamp, and is the one place that logs the hand-off taken (L9). `start` and `unstarted` are S2's.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { isOpen, sameRepo } from './items.mjs';
import { landerDue } from './landing-replies.mjs';
import { claimNameFor, laneMarked, takeClaim } from './run-claim.mjs';
import { deckUrl } from './tools.mjs';
import { listeningRepo } from './wait.mjs';
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

/** Where the hooks keep their claims, `deck/run-claim.mjs`'s spelling. Read when asked, so a test's home works. */
const claimDir = () => path.join(os.homedir(), '.claude', 'pilot-inbox', 'claims');

const postedFile = (pid) => path.join(claimDir(), `posted-${pid}.stamp`);

/**
 * The fresh session's first prompt: the fixed literal, and the lander a press queued while the old session
 * handed off, the head of `landerDue` (lander spec 5, L5), so the fresh session spawns it first.
 */
export function firstPrompt(items, cwd) {
  const [lander] = landerDue(items, cwd);
  return `Pick up the hand-off on the deck.${lander ? ` Spawn pilot-lander ${lander}.` : ''}`;
}

/**
 * The one hand-off this directory should act on, or null. Newest first, and the newest is the only candidate:
 * falling back to the one below it would replay a finished run's hand-off. Openness is checked even though the
 * read asks for open threads only, so an older daemon degrades to silence.
 */
export function pickup(items, cwd) {
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

/** The Claude Code process: `CLAUDE_PID` when it is a positive integer, else the caller's parent. */
export function sessionPid(env, ppid) {
  const pid = /^\d+$/.test(env?.CLAUDE_PID ?? '') ? Number(env.CLAUDE_PID) : 0;
  return pid > 0 ? pid : ppid;
}

/**
 * The open threads, asked for **without** a `repo`: a read naming one marks the user's replies delivered
 * (`deck/server.mjs`) and would switch off the Stop gate. The join is made on the item's own `repo`.
 */
async function openItems() {
  const response = await fetch(`${deckUrl()}/api/tool`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...bearer() },
    body: JSON.stringify({ name: 'deck_read', arguments: { open: true, limit: MAX_ITEMS, messages: 'all' } }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`the deck answered deck_read with ${response.status}`);
  const body = await response.text();
  if (body.length > MAX_RESPONSE_CHARS) throw new Error('the deck answered deck_read with more than this will read');
  const read = JSON.parse(JSON.parse(body)?.content?.[0]?.text ?? 'null');
  return Array.isArray(read?.items) ? read.items : [];
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

async function turn(repo, pid, read) {
  const posted = postedBy(pid); // asked first: a session that posted nothing reads nothing
  if (!posted) return none('this session posted no hand-off');
  const handoff = pickup(await read(), repo);
  if (!handoff) return none('no open hand-off');
  if (handoff.id !== posted) return none(`the newest hand-off ${handoff.id} is not this session's`);
  if (laneMarked(handoff.id)) return none(`${handoff.id} is already picked up`);
  if (!takeClaim(claimNameFor(handoff.id))) return none(`${handoff.id} is already cleared`);
  return { act: 'clear', id: handoff.id };
}

async function cleared(repo, pid, id, read) {
  if (postedBy(pid) === id) fs.rmSync(postedFile(pid), { force: true });
  if (!laneMarked(id)) return none(`no lane marker for ${id}`);
  log(`mod: cleared ${id}`);
  let items = [];
  try {
    items = await read(); // for a queued lander; a deck that does not answer names none
  } catch {
    items = [];
  }
  return { act: 'submit', id, prompt: firstPrompt(items, repo) };
}

/** One look. `deps` stand in for the deck, the environment and the parent pid in a test. */
export async function look(op, args = {}, deps = {}) {
  const { read = openItems, env = process.env, ppid = process.ppid } = deps;
  const repo = args.repo ?? listeningRepo(process.cwd());
  const pid = sessionPid(env, ppid);
  if (op === 'turn') return turn(repo, pid, read);
  if (op === 'cleared' && ITEM_ID.test(args.id ?? '')) return cleared(repo, pid, args.id, read);
  return none(`${op} is not built yet`);
}

const FLAGS = { '--repo': 'repo', '--id': 'id', '--turn-ended': 'turnEnded', '--why': 'why' };

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
  if (op === 'cleared' && args.id === undefined) return null;
  if (args.turnEnded !== undefined) {
    if (!/^\d+$/.test(args.turnEnded)) return null;
    args.turnEnded = Number(args.turnEnded);
  }
  return { op, args };
}

/** The CLI: one JSON `Outcome` line and 0, or 2 and no line for a refused argument. */
export async function main(argv, { out = (line) => process.stdout.write(`${line}\n`) } = {}) {
  const parsed = parse(argv);
  if (!parsed) {
    process.stderr.write('usage: run-look.mjs <start|turn|cleared|unstarted> [--repo <dir>] [--id itm_<hex>] [--turn-ended <ms>] [--why <text>]\n');
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
