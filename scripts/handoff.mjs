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
 * Nothing is posted until the record is safely on origin, because the post is what the
 * hand-off mod clears the session on, and a `/clear` over a record that failed
 * to land is the one outcome worse than stopping to say so.
 *
 * Whether a `/clear` will come at all is read from the session's reported-in stamp, which the
 * hand-off mod writes when it starts (handoff-mod spec 8, A2): with none, the line says why
 * (an old Claude Code, or a mod that never ran) and has the user type `/clear`. The item is posted
 * for the main checkout (`listeningRepo`, handoff-mod L11) rather than for the shell's
 * directory, which drifts into a worktree whenever the pilot integrates, and the session
 * that posted it is stamped so its mod clears it (A6).
 */

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';

import { OWED_WHY } from '../deck/owed.mjs';
import { notePosted, reportedFile, sessionPid } from '../deck/run-claim.mjs';
import { deckUrl } from '../deck/tools.mjs';
import { isOlder, isVersion } from '../deck/version.mjs';
import { listeningRepo } from '../deck/wait.mjs';
import { bearer } from '../hooks/lib/deck-secret.js';
import { commitRecords, git, TRAILER } from './integrate.mjs';
import { remoteOf, runRemote } from './remotes.mjs';

/** A loopback deck answers in milliseconds or not at all. */
const DEADLINE_MS = 5000;

/** The first Claude Code that runs a mod (handoff-mod A2, assumed). */
export const MIN_MODS_VERSION = '2.1.325';

/**
 * `claude --version`'s x.y.z, or null when it gives none. By argv array, never a shell, and never
 * `~/.claude.json`, which holds secrets. On Windows the bare name is safe from a command planted
 * in the cwd only because bin/pilot.mjs runs `searchPathOnly()` first; a caller importing this
 * module directly must do the same. `run` is injected by `pilot doctor`'s tests.
 */
export function claudeVersion(run = (cmd, args) => execFileSync(cmd, args, { encoding: 'utf8', windowsHide: true, timeout: 15000, killSignal: 'SIGKILL', stdio: ['ignore', 'pipe', 'ignore'] })) {
  try {
    const found = /^\s*(\d+\.\d+\.\d+)\b/.exec(String(run('claude', ['--version'])))?.[1];
    return isVersion(found) ? found : null;
  } catch {
    return null;
  }
}

/**
 * Whether this session's hand-off mod reported in: S2's `claims/mod-<session pid>.stamp`, whose existence is
 * what counts. Not a heartbeat: a mod that started and then died still reads as in. `why` names an old Claude
 * Code when `version` is readable and below the minimum, else that the mod never reported in.
 */
export function reportedIn(env, { version } = {}) {
  if (fs.existsSync(reportedFile(sessionPid(env, process.ppid)))) return { in: true };
  if (isVersion(version) && isOlder(version, MIN_MODS_VERSION)) return { in: false, why: `Claude Code ${version} is below ${MIN_MODS_VERSION}` };
  return { in: false, why: 'not reported in' };
}

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
 * `/api/record` `owed`: whatever the deck's rule, an `unanswered` one refuses the hand-off and every
 * other reason (`OWED_WHY`) rides the item. A deck that sends no `owed` (one older than yellow-lane) owes
 * nothing; one that sends a list this cannot read refuses, so no thread slips through unread.
 */
const readable = (thread) =>
  typeof thread?.id === 'string' && /^itm_\w{1,40}$/.test(thread.id) && typeof thread.line === 'string' &&
  OWED_WHY.includes(thread.why);

function owedOf(owed) {
  if (owed === undefined) return [];
  if (!Array.isArray(owed) || !owed.every(readable)) throw new Refusal('the deck sent an owed list this handoff cannot read');
  return owed;
}

const owedAs = (owed, why) => owed.filter((thread) => thread.why === why);

const firstLine = (err) => (err.stderr?.toString().trim() || err.message).split('\n')[0];

/** The mod's state; `claude --version` runs only for a session that did not report in and was given no version. */
function modState(env, version) {
  const mod = reportedIn(env, { version });
  return mod.in || version !== undefined ? mod : reportedIn(env, { version: claudeVersion() });
}

/**
 * Hand off. `env` is where the session's pid is read, `trailers` are `Key: value` lines for the
 * record's commit, `version` stands in for `claude --version`. Answers `{ ok, line }`; never throws.
 */
export async function handoff({ cwd = process.cwd(), env = process.env, trailers = [], version } = {}) {
  // A trailer reaches `git commit --trailer`: one with a newline would forge a second line.
  const forged = trailers.find((trailer) => !TRAILER.test(String(trailer)));
  if (forged !== undefined) return { ok: false, line: `NOT handed off: trailer ${JSON.stringify(String(forged))} is not one "Key: value" line; no handoff item posted` };
  // The main checkout, so a hand-off from a worktree is the one the session's look reads (handoff-mod L11).
  const repo = listeningRepo(cwd);
  let landed = null;
  try {
    const { record, yellow, lanes, owed: served } = await ask(`/api/record?repo=${encodeURIComponent(repo)}`);
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
    for (const thread of owed.filter(({ why }) => why !== 'unanswered')) item.body += `\nOwed: ${thread.id} ${thread.why}: ${thread.line}`;
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
    notePosted(sessionPid(env, process.ppid), id);
    // A live co-pilot survives the clear and is sent nothing (handoff-no-wait L2). The hand-off is posted
    // either way; only who clears differs (spec 8: no refusal to hand off).
    const mod = modState(env, version);
    const then = mod.in
      ? 'the hand-off mod clears this session and submits the first prompt; stop here'
      : `the hand-off mod has not reported in (${mod.why}): tell the user to type /clear, and stop`;
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
