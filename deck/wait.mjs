/**
 * `pilot wait` — what wakes an idle agent when nothing else will.
 *
 * A hook fires on a tool call (`hooks/post-tool.js` → `hooks/inbox-alert.js`) or
 * when a turn ends (`hooks/stop-gate.js`); neither fires while an agent is
 * simply quiet with no tool call in flight and no turn ending. `deck_wait` is a
 * foreground MCP call: parking on it freezes the user's terminal, which the user
 * has refused, and a `SendMessage` cannot reach an agent parked inside it. This
 * is the other way to wait: a background Bash command the harness re-invokes the
 * agent over once it exits, so the agent loses nothing by starting one and
 * ending its turn (crew-waits L9).
 *
 * It is a client of the daemon's own `deck_wait` long poll (crew-waits A5, L6),
 * asked as `--as <kind>` (L14) with `untaken`: the daemon decides which replies
 * that kind hears (`ownerFilter`), runs the pilot's owner fallback (ADR 0045), and
 * marks what it returns delivered to the kind in the same call (ADR 0061). So a
 * wait takes what it prints, and a second wait of the kind never prints it again.
 * `--item <id>` narrows it to one thread (L4).
 *
 * A wait started by a session holds a leash on it (`CLAUDE_PID`, process-gc L1, L3): when the
 * session exits, the parked request is hung up, so the deck takes nothing for it, and the wait
 * says `NO SESSION: <pid> has exited` and exits 0 rather than living out its timeout.
 *
 * Never a silent hang: a deck that will not answer is one line on stderr and
 * exit 1, and a timeout with nobody replying is exit 0 with a line saying so —
 * both are answers a caller can act on, and a process that just sits there is
 * indistinguishable from one that crashed.
 */

import { execFileSync } from 'node:child_process';
import path from 'node:path';

import { bearer } from '../hooks/lib/deck-secret.js';
import { OWNER_KINDS, sameRepo } from './items.mjs';
import { BLOCKED_LIST } from './lanes.mjs';
import { holdLeash, sessionPid } from './leash.mjs';
import { startMemoryLog } from './memory.mjs';
import { MAX_POLL_MS, deckUrl } from './tools.mjs';

/** How long one `deck_wait` request parks: the daemon's own cap on one request. */
const POLL_MS = MAX_POLL_MS;

/** What the socket is given beyond the park itself before this calls the deck unreachable. */
const REQUEST_SLACK_MS = 5000;

/** What this is willing to read into memory from a deck it cannot vouch for. */
const MAX_RESPONSE_CHARS = 2 * 1024 * 1024;

/** The user's reply, clipped the way the Stop gate clips a reply. */
const MAX_REPLY_CHARS = 2000;
const MAX_TITLE_CHARS = 200;

/** Well inside Claude Code's 2-hour cap on a background command (ticket-states A10), in minutes. */
export const DEFAULT_TIMEOUT_MINUTES = 110;

const KINDS = `${OWNER_KINDS.slice(0, -1).join(', ')} or ${OWNER_KINDS.at(-1)}`;

const USAGE = `usage: pilot wait [--as ${OWNER_KINDS.join('|')}] [--item <id> (required after a crew --as)] [--timeout <minutes>]\n`;

function clip(text, limit) {
  const value = typeof text === 'string' ? text : '';
  return value.length <= limit ? value : `${value.slice(0, limit)}\n[…clipped]`;
}

/** JSON, or the one refusal every unparsable answer gets, named for what was being read. */
function parseJson(text, what) {
  try {
    return JSON.parse(text);
  } catch (err) {
    throw new Error(`the deck answered ${what} with something that is not JSON`);
  }
}

/**
 * A whole body, read and bounded. The deck is a local daemon that trusts any
 * loopback caller, so this refuses to read past what it is willing to hold,
 * the same ceiling `hooks/lib/deck.js` and `deck/run.mjs` put on the same answers.
 */
async function bodyOf(response, what) {
  const text = await response.text();
  if (text.length > MAX_RESPONSE_CHARS) throw new Error(`the deck answered ${what} with more than this will read`);
  return parseJson(text, what);
}

/**
 * One deck tool, called the way the stdio client calls it. Rejects on anything at all, `hangUp`
 * aborting before the deck answers included; once it has answered, the body is read whatever
 * `hangUp` does, because a reply the deck has handed over is already taken and must be printed.
 */
async function tool(name, args, timeoutMs, hangUp) {
  const auth = bearer();
  const hang = new AbortController();
  const onHangUp = () => hang.abort();
  hangUp?.addEventListener('abort', onHangUp, { once: true });
  if (hangUp?.aborted) hang.abort();
  const response = await fetch(`${deckUrl()}/api/tool`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...auth },
    body: JSON.stringify({ name, arguments: args }),
    signal: AbortSignal.any([AbortSignal.timeout(timeoutMs), hang.signal]),
  }).finally(() => hangUp?.removeEventListener('abort', onHangUp));
  if (!response.ok) throw new Error(`the deck answered ${name} with ${response.status}`);
  const text = (await bodyOf(response, name))?.content?.[0]?.text;
  if (typeof text !== 'string') throw new Error(`the deck answered ${name} with no content`);
  return parseJson(text, `${name}'s own result`);
}

/**
 * A reply's `switch` as the pilot's instruction (ticket-state-accents spec 12, 13, 17): take `to`, hand the co-pilot
 * `to` on lane `co-pilot`, or the user cancelled.
 */
function switchLine(marker) {
  if (marker === null || typeof marker !== 'object' || typeof marker.to !== 'string') return '';
  if (marker.cancelled === true) return 'SWITCH cancelled\n';
  const to = clip(marker.to, 64);
  const from = typeof marker.from === 'string' ? clip(marker.from, 64) : 'none';
  if (marker.lane === 'coPilot') return `SWITCH co-pilot ${from} -> ${to}: pause the co-pilot, then deck_ticket co-pilot ${to}\n`;
  return `SWITCH ${from} -> ${to}: stash, then deck_ticket take ${to}\n`;
}

/** One reply as printed: the thread, its title, the text, a fallback's note when there is one, and a switch's line. */
export function printed(reply) {
  const note = typeof reply.fallback === 'string' ? `${clip(reply.fallback, MAX_REPLY_CHARS)}\n` : '';
  const title = clip(reply.title, MAX_TITLE_CHARS).replace(/\s+/g, ' ');
  return `REPLY ${clip(reply.itemId, 64)} "${title}"\n${clip(reply.text, MAX_REPLY_CHARS)}\n${note}${switchLine(reply.switch)}\n`;
}

const runGit = (args, cwd) =>
  execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 5000, windowsHide: true });

/**
 * The repository a wait listens on: the main checkout `cwd` belongs to, so a wait
 * started in a worktree or a subdirectory hears what the user posts to the
 * repository (ADR 0091), else `cwd` itself outside git. Asked once per wait, never per poll.
 */
export function listeningRepo(cwd, git = runGit) {
  try {
    const common = git(['rev-parse', '--path-format=absolute', '--git-common-dir'], cwd).trim();
    // Only a checkout's own `.git` has the checkout as its parent; a bare repository's or a submodule's does not.
    if (common && path.basename(common) === '.git') return path.dirname(path.resolve(common));
  } catch {
    // Not a repository, no git, or a cwd that is not there: the cwd is all there is to listen on.
  }
  return cwd;
}

/**
 * The repository a `pilot run` session stamps its own posts with
 * (`PILOT_RUN_REPO`), trimmed, or null outside one. A wait in such a session
 * listens there, not on its shell's cwd, so it hears the threads the session
 * posted from a worktree wherever the shell has drifted (ADR 0104).
 */
function sessionRepo(env) {
  const repo = typeof env?.PILOT_RUN_REPO === 'string' ? env.PILOT_RUN_REPO.trim() : '';
  return repo || null;
}

/**
 * Whether anything can ever reach a wait on `repo`: a live run filed there, or an
 * open thread. Two reads, once per wait, never per poll (L5); rejects on any deck
 * failure. The read is asked as a kind that owns nothing, so it hands no reply
 * over and claims no owner fallback: the wait that follows still takes them.
 */
async function isKnownRepo(repo, timeoutMs) {
  const response = await fetch(`${deckUrl()}/api/runs?live=1`, { headers: bearer(), signal: AbortSignal.timeout(timeoutMs) });
  if (!response.ok) throw new Error(`the deck answered /api/runs with ${response.status}`);
  const runs = (await bodyOf(response, '/api/runs'))?.runs;
  if (Array.isArray(runs) && runs.some((run) => sameRepo(run?.repo, repo))) return true;
  const read = await tool('deck_read', { repo, open: true, limit: 1, author: 'other' }, timeoutMs);
  return Array.isArray(read?.items) && read.items.length > 0;
}

/**
 * The refusal line of an idle main lane in `repo` (idle-main-lane spec 1, L3, L6; ADR 0123) and the co-pilot lane's
 * blocked list (blocked-yellow-yields spec 2), each a line or null: read off `/api/record`, which marks nothing
 * delivered, so the wait that follows still takes every reply. Rejects on any deck failure, which is the wait's own
 * exit 1; a deck that answers no lanes refuses nothing.
 */
async function refusalFor(repo, timeoutMs) {
  const response = await fetch(`${deckUrl()}/api/record?repo=${encodeURIComponent(repo)}`, { headers: bearer(), signal: AbortSignal.timeout(timeoutMs) });
  if (!response.ok) throw new Error(`the deck answered /api/record with ${response.status}`);
  const lanes = (await bodyOf(response, '/api/record'))?.lanes;
  // One line, bounded and free of control characters, whatever a deck it cannot vouch for sends.
  const oneLine = (text) => {
    const line = typeof text === 'string' ? text.replace(/[\s\u0000-\u001f\u007f-\u009f]+/g, ' ').trim() : '';
    return line === '' ? null : line.slice(0, MAX_TITLE_CHARS);
  };
  // The blocked list is ids only, the shape `lanesFrom` spells and the session-start hook echoes; any other text is dropped.
  const blocked = typeof lanes?.blocked === 'string' && BLOCKED_LIST.test(lanes.blocked) ? lanes.blocked : null;
  return { refusal: oneLine(lanes?.refusal), blocked };
}

const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * The subcommand: block this process (never the user's terminal — it is
 * started with `run_in_background`) until a reply `kind` owns lands for this
 * repository, the timeout passes, the deck stops answering, or the `session`
 * pid exits (null: no session, no leash). Answers the exit code.
 */
export async function wait({
  cwd = process.cwd(),
  env = process.env,
  repo = sessionRepo(env) ?? listeningRepo(cwd),
  kind = 'pilot',
  item,
  timeoutMinutes = DEFAULT_TIMEOUT_MINUTES,
  pollMs = POLL_MS,
  session = null,
  alive,
  say = (line) => process.stdout.write(line),
  warn = (line) => process.stderr.write(line),
} = {}) {
  // First, before anything can fail: a wait on the wrong repository shows at a glance.
  say(`listening on ${repo}\n`);
  // Read once, outside the loop: `deckUrl()` itself throws on a mistyped
  // `PILOT_DECK_PORT`, which is exactly the failure `unreachable` exists to
  // report, and calling it again inside that helper would throw a second
  // time while building the very message meant to explain the first.
  const url = (() => {
    try {
      return deckUrl();
    } catch (err) {
      return `the configured port (${err.message})`;
    }
  })();
  const unreachable = (err) => {
    warn(`pilot wait: the deck at ${url} is not answering (${err.message})\n`);
    return 1;
  };

  // Line 2, and only for a directory nobody posts to; the wait goes on regardless (L7).
  try {
    if (!(await isKnownRepo(repo, REQUEST_SLACK_MS))) {
      say(`NO DECK for ${repo}: no run and no open thread is filed here, so nothing reaches this wait until a session registers it\n`);
    }
  } catch (err) {
    return unreachable(err);
  }

  // Only the pilot holds the main lane (L4): an idle one ends its wait, read before the park and after each empty poll (L5).
  // Beside it, a co-pilot lane whose every yellow ticket is blocked says which, once per change, and the wait goes on.
  let saidBlocked = null;
  const refused = async () => {
    if (kind !== 'pilot') return false;
    const { refusal, blocked } = await refusalFor(repo, REQUEST_SLACK_MS);
    if (blocked !== null && blocked !== saidBlocked) say(`co-pilot lane blocked: ${blocked}\n`);
    saidBlocked = blocked;
    if (refusal !== null) say(`${refusal}\n`);
    return refusal !== null;
  };

  // The session's leash (L1, L3): its pid exiting hangs up the parked request, so the deck takes nothing for it.
  const gone = new AbortController();
  const letGo = session === null ? () => {} : holdLeash({ pid: session, paths: [] }, () => gone.abort(), { alive });
  const noSession = () => {
    say(`NO SESSION: ${session} has exited\n`);
    return 0;
  };
  try {
    const deadline = Date.now() + timeoutMinutes * 60 * 1000;
    for (;;) {
      if (gone.signal.aborted) return noSession();
      try {
        if (await refused()) return 0;
      } catch (err) {
        return unreachable(err);
      }
      const left = deadline - Date.now();
      if (left <= 0) {
        say(`NO REPLY after ${timeoutMinutes} minutes\n`);
        return 0;
      }
      const timeout = Math.max(1, Math.ceil(Math.min(pollMs, left)));
      const args = { untaken: true, timeout, repo, author: kind, ...(item === undefined ? {} : { item }) };
      let waited;
      try {
        waited = await tool('deck_wait', args, timeout + REQUEST_SLACK_MS, gone.signal);
      } catch (err) {
        return gone.signal.aborted ? noSession() : unreachable(err);
      }
      const replies = Array.isArray(waited?.replies) ? waited.replies : [];
      for (const reply of replies) say(printed(reply));
      if (replies.length) return 0;
      // A wait the deck answered early with nothing (its socket closed) is asked again, not spun on.
      if (Date.now() < deadline) await pause(Math.min(10, Math.max(0, deadline - Date.now())));
    }
  } finally {
    letGo();
  }
}

/** `--as`, `--item` and `--timeout` parsed out of argv, or `{ error }` naming what was wrong. Exported for its own test. */
export function parseArgs(argv) {
  const parsed = { timeoutMinutes: DEFAULT_TIMEOUT_MINUTES, kind: 'pilot' };
  for (let i = 0; i < argv.length; i += 1) {
    const value = argv[i + 1];
    if (argv[i] === '--timeout') {
      const minutes = Number(value);
      if (!Number.isFinite(minutes) || minutes <= 0) {
        return { error: `--timeout wants a number of minutes greater than zero, not ${JSON.stringify(value)}` };
      }
      parsed.timeoutMinutes = minutes;
    } else if (argv[i] === '--as') {
      if (!OWNER_KINDS.includes(value)) return { error: `there is no ${JSON.stringify(value)} kind to wait as; --as wants ${KINDS}` };
      parsed.kind = value;
    } else if (argv[i] === '--item') {
      if (typeof value !== 'string' || value.trim() === '') return { error: '--item wants an item id' };
      parsed.item = value;
    } else {
      return { error: `there is no "${argv[i]}" option` };
    }
    i += 1;
  }
  if (parsed.kind !== 'pilot' && parsed.item === undefined) {
    return { error: `--as ${parsed.kind} wants --item <id>: a crew wait takes only its own thread` };
  }
  return parsed;
}

/**
 * `pilot wait`'s entry point from `bin/pilot.mjs`. Answers the exit code. A test passes its own
 * `env` and `alive` probe; the leash is on `CLAUDE_PID` when it is a pid, and there is none otherwise.
 */
export async function main(argv, { env = process.env, alive } = {}) {
  const parsed = parseArgs(argv);
  if (parsed.error) {
    process.stderr.write(`pilot wait: ${parsed.error}\n${USAGE}`);
    return 1;
  }
  // Here and not in `wait()`, which the suite calls: a test wait writes no reading (L10).
  startMemoryLog('wait');
  return wait({ ...parsed, env, session: sessionPid(env), alive });
}
