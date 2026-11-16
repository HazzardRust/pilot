/**
 * `pilot handoff` — the pilot's one call at the hard mark, after its one `deck_status`.
 *
 * The user's words (2026-09-28): "i dont want the step to be manual at all." The hand-off
 * had been four steps the pilot performed and a fifth the user did: commit and push the
 * run record, post a `handoff` item, and ask the user to type `/clear`. The status table
 * stays the pilot's own call, because only the pilot knows the live state; this does the
 * rest in order and answers in one line:
 *
 *   read the stored record for this directory; refuse while the deck says a user thread is
 *   `unanswered`; in its `feat/<slug>` worktree, commit the run.json the deck wrote and push
 *   (skipped when the record names no worktree); post one `handoff` item titled from the
 *   record's feature and carrying its `next` and any thread the pilot `promised`.
 *
 * Nothing is posted until the record is safely on origin, because under `pilot run` the
 * post is what types `/clear` (`deck/run.mjs`), and a `/clear` over a record that failed
 * to land is the one outcome worse than stopping to say so.
 *
 * Whether a `/clear` will be typed at all is read from `PILOT_RUN_PID`, which `pilot run`
 * sets on the session it starts, and checked against a live process: a session
 * backgrounded past its wrapper keeps the variable but has nobody typing. `PILOT_RUN_REPO`
 * is the directory that wrapper watches, and the item is posted for it rather than for
 * the shell's directory, which drifts into a worktree whenever the pilot integrates.
 */

import fs from 'node:fs';

import { deckUrl } from '../deck/tools.mjs';
import { bearer } from '../hooks/lib/deck-secret.js';
import { commitRecords, git, TRAILER } from './integrate.mjs';
import { remoteOf, runRemote } from './remotes.mjs';

/** A loopback deck answers in milliseconds or not at all. */
const DEADLINE_MS = 5000;

/** The wrapper's pid and the directory it watches, as `deck/run.mjs` sets them. */
const RUN_PID = 'PILOT_RUN_PID';
const RUN_REPO = 'PILOT_RUN_REPO';

class Refusal extends Error {}

async function ask(pathname, init = {}) {
  // Outside the try, read on every request (deck-token L6): a missing secret is named as itself, not as a deck that did not answer.
  const headers = { ...init.headers, ...bearer() };
  let response;
  try {
    response = await fetch(`${deckUrl()}${pathname}`, { ...init, headers, signal: AbortSignal.timeout(DEADLINE_MS) });
  } catch (err) {
    throw new Refusal(`the deck did not answer at ${deckUrl()} (${err.cause?.code ?? err.message})`);
  }
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Refusal(`the deck refused ${pathname}: ${body?.error ?? response.status}`);
  return body;
}

/** Whether `pilot run` is alive and typing into this session. */
function wrapperAlive(env) {
  const pid = Number(env[RUN_PID]);
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    // EPERM is a process that exists and is not ours to signal; alive all the same.
    return err.code === 'EPERM';
  }
}

/**
 * Where the record's branch is pushed: a `feat/` branch to origin, any other (a `design/`
 * branch) to the run remote, or nowhere (null) under `pilot.remote none` (pilot-fork spec 4).
 */
function recordRemote(dir) {
  try {
    return remoteOf(runRemote((args) => git(dir, ...args)), git(dir, 'rev-parse', '--abbrev-ref', 'HEAD'));
  } catch (err) {
    throw new Refusal(firstLine(err));
  }
}

/** Commit and push the record in its worktree; answers the clause for the one line. */
function landRecord(record, trailers) {
  const dir = record.worktree;
  if (typeof dir !== 'string' || dir === '') return 'no worktree in the run record, so nothing committed';
  if (!fs.existsSync(dir)) throw new Refusal(`the recorded worktree ${dir} is gone`);
  const remote = recordRemote(dir);
  let committed;
  try {
    committed = commitRecords(dir, trailers);
  } catch (err) {
    throw new Refusal(`the run record commit failed in ${dir} (${firstLine(err)})`);
  }
  if (remote === null) {
    return `record committed locally (pilot.remote none) in ${dir} at ${git(dir, 'rev-parse', '--short', 'HEAD')}`;
  }
  try {
    git(dir, 'push', '-q', remote, 'HEAD');
  } catch (err) {
    const tip = git(dir, 'rev-parse', '--short', 'HEAD');
    throw new Refusal(`push failed from ${dir} (${firstLine(err)}); the record is committed locally at ${tip}`);
  }
  const tip = git(dir, 'rev-parse', '--short', 'HEAD');
  return `${committed ? 'run record committed; ' : ''}record pushed to ${remote} from ${dir} at ${tip}`;
}

/** The yellow head's ticket id and title, or null: only these two, never its plan or record (L5). */
function yellowTicket(yellow) {
  const id = yellow?.ticket?.id;
  if (typeof id !== 'string' || !/^itm_\w{1,40}$/.test(id)) return null;
  const title = typeof yellow.ticket.title === 'string' ? yellow.ticket.title.replace(/\s+/g, ' ').trim().slice(0, 100) : '';
  return { id, title: title || id };
}

/**
 * The threads the deck says are owed (yellow-lane spec 9, 10; A3), read exactly as served on
 * `/api/record` `owed`: whatever the deck's rule, an `unanswered` one refuses the hand-off and a
 * `promised` one rides the item. A deck that sends no `owed` (one older than yellow-lane) owes
 * nothing; one that sends a list this cannot read refuses, so no thread slips through unread.
 */
const readable = (thread) =>
  typeof thread?.id === 'string' && /^itm_\w{1,40}$/.test(thread.id) && typeof thread.line === 'string' &&
  (thread.why === 'unanswered' || thread.why === 'promised');

function owedOf(owed) {
  if (owed === undefined) return [];
  if (!Array.isArray(owed) || !owed.every(readable)) throw new Refusal('the deck sent an owed list this handoff cannot read');
  return owed;
}

const owedAs = (owed, why) => owed.filter((thread) => thread.why === why);

const firstLine = (err) => (err.stderr?.toString().trim() || err.message).split('\n')[0];

/**
 * Hand off. `env` is where the wrapper's variables are read, `trailers` are `Key: value`
 * lines for the record's commit. Answers `{ ok, line }`; never throws.
 */
export async function handoff({ cwd = process.cwd(), env = process.env, trailers = [] } = {}) {
  // A trailer reaches `git commit --trailer`: one with a newline would forge a second line.
  const forged = trailers.find((trailer) => !TRAILER.test(String(trailer)));
  if (forged !== undefined) return { ok: false, line: `NOT handed off: trailer ${JSON.stringify(String(forged))} is not one "Key: value" line; no handoff item posted` };
  const typed = wrapperAlive(env);
  const repo = typed && env[RUN_REPO] ? env[RUN_REPO] : cwd;
  let landed = null;
  try {
    const { record, yellow, coPilot, lanes, owed: served } = await ask(`/api/record?repo=${encodeURIComponent(repo)}`);
    // Refused before anything lands: a hand-off never leaves the user's question behind (spec 9).
    const owed = owedOf(served);
    const unanswered = owedAs(owed, 'unanswered');
    if (unanswered.length > 0) {
      throw new Refusal(`user thread(s) unanswered: ${unanswered.map((thread) => thread.id).join(', ')}; reply first`);
    }
    const ticket = record ? null : yellowTicket(yellow);
    if (!record && !ticket) throw new Refusal(`no run record for ${repo}; call deck_status first`);
    // A main session holding only a co-pilot has no run of its own to land: the yellow ticket's record
    // is the co-pilot's (yellow-agent S6), and the fresh session's SessionStart lane re-briefs it.
    landed = record ? landRecord(record, trailers) : "no run of this session's own, so nothing committed";
    const item = record
      ? { title: `Handoff: ${record.feature || record.slug || 'the run'}`, body: record.next || 'Resume from the run record.' }
      : {
          title: `Handoff: co-pilot on ${ticket.title}`,
          body: `The main session holds no run of its own. A co-pilot may be live on ticket ${ticket.id}.`,
        };
    for (const thread of owedAs(owed, 'promised')) item.body += `\nOwed: ${thread.id} promised: ${thread.line}`;
    // The deck spells the lanes (idle-main-lane L2); a deck that sends none leaves the body as it was.
    const lines = [lanes?.planning, lanes?.concluding, lanes?.coPilot];
    if (lines.every((line) => typeof line === 'string')) item.body += `\n${lines.join('\n')}`;
    const posted = await ask('/api/tool', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'deck_post', arguments: { kind: 'handoff', ...item, repo } }),
    });
    const id = /\bitm_[0-9a-f]+\b/.exec(posted?.content?.[0]?.text ?? '')?.[0];
    if (!id) throw new Refusal('the deck took the handoff item but named no id');
    // A live co-pilot holds the /clear until its release (clear-waits-co-pilot spec 6, A3): the line repeats the pause.
    const paused = coPilot?.live === true && /^itm_[0-9a-f]+$/.test(coPilot.ticket)
      ? `the co-pilot on ${coPilot.ticket} is live: send it the pause, deck_ticket release it on its hand-back; `
      : '';
    const then = typed
      ? `${paused}\`pilot run\` types \`/clear\` ${paused ? 'after that' : 'and the first prompt now'}; stop here`
      : `${paused}not under \`pilot run\`, so nothing will type it: ${paused ? 'after that ' : ''}tell the user to type \`/clear\`, and stop`;
    return { ok: true, line: `handed off: ${landed}; posted ${id}; ${then}` };
  } catch (err) {
    const why = err instanceof Refusal ? err.message : firstLine(err);
    // A record that landed before the post failed is said, so a retry is known to be safe.
    const already = landed ? `; already ${landed}` : '';
    return { ok: false, line: `NOT handed off: ${why}${already}; no handoff item posted` };
  }
}

/** `pilot handoff [--trailer "<line>"]...` */
export async function main(argv) {
  const trailers = [];
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--trailer' && typeof argv[i + 1] === 'string') trailers.push(argv[++i]);
    else {
      process.stderr.write('usage: pilot handoff [--trailer "<line>"]...\n');
      return 1;
    }
  }
  const result = await handoff({ trailers });
  process.stdout.write(`${result.line}\n`);
  return result.ok ? 0 : 1;
}
