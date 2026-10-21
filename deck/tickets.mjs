/**
 * `pilot tickets` — the red queue a merge is judged from (merge-first spec 8-10; L5, L11).
 *
 * The architect's first act is to read its repository's queue and name the tickets that
 * share the live ticket's surface. It reads it here, not through `deck_read`: this is a
 * read and nothing more, so it marks no reply delivered and holds no tool the architect
 * would otherwise need. `queueView` is the daemon's half (`GET /api/tickets`), `tickets` the
 * printing half; the merge decision is derived on read by `mergeDecisionOf`, so a
 * re-spawned architect sees the step already ran (A9).
 *
 * A deck that will not answer is one line on stderr and exit 1, never an empty queue:
 * "no other red ticket" is an answer the architect acts on.
 */

import { execFileSync } from 'node:child_process';

import { bearer } from '../hooks/lib/deck-secret.js';
import { defaultBranch } from '../scripts/pilot-branch.mjs';
import { liveTicketOf, mergeDecisionOf, messagesOf, ticketQueueOf } from './items.mjs';
import { laneTicketOf } from './lane-ticket.mjs';
import { deckUrl } from './tools.mjs';

/** The real `gh`, run without a shell in `cwd`. */
const ghIn = (cwd) => (args) => execFileSync('gh', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });

/**
 * The records of one directory whose `feat/` branch has an open PR of this repository that the account `gh` is
 * signed in as authored (runs-build-on-each-other spec 5, L13), as `{ branch, pr, updatedAt }`. One `gh pr list`
 * for all of them; a branch name never reaches `gh`.
 */
export function openRuns(records, { gh }) {
  const candidates = records.filter((r) => String(r?.branch ?? '').startsWith('feat/') && !/^abandoned/.test(r.finished ?? ''));
  if (candidates.length === 0) return [];
  const login = gh(['api', 'user', '--jq', '.login']).trim();
  const prs = JSON.parse(gh(['pr', 'list', '--state', 'open', '--author', '@me', '--json', 'number,headRefName,state,isCrossRepository,author', '--limit', '100']));
  const ours = (p) => p.state === 'OPEN' && p.isCrossRepository === false && p.author?.login === login;
  return candidates.flatMap((r) => {
    const pr = prs.find((p) => ours(p) && p.headRefName === r.branch);
    return pr ? [{ branch: r.branch, pr: pr.number, updatedAt: r.updatedAt }] : [];
  });
}

/** How long the deck has to answer one read before this calls it down. */
const TIMEOUT_MS = 5000;

const asTicket = (item) => ({
  id: item.id,
  title: item.title,
  // Its size in slices (slice-estimates L13); a stored minute estimate was dropped on read (L11).
  sliceCount: item.sliceCount ?? null,
  body: item.body,
  // An agent's message is stored from the pilot with its byline (`bylineOf`): the byline names who wrote it.
  comments: messagesOf(item).map(({ from, author, text }) => ({ from: author ?? from, text })),
});

/**
 * A repository's red queue as `/api/tickets` answers it: the live planning ticket (three-lanes spec 6), the other open red tickets in deck order,
 * its merge decision, and the directory's run records, which `pilot tickets --open` reads its open runs from (runs-build-on-each-other L3).
 * With `open`, also every open ticket in any state, for ticket-making's check (runs-build-on-each-other spec 10).
 * With `agent`, also `filed`: the ticket that agent type's Blocked item is filed under, `{ id }` or null, by
 * `laneTicketOf` with `coPilot` (blocked-yellow-yields spec 7); `live` stays the red queue's either way.
 */
export function queueView(items, repo, records = [], { open = false, agent, coPilot = null } = {}) {
  const live = liveTicketOf(items, repo, 'red') ?? null;
  const decided = live && mergeDecisionOf(items, live.id);
  const filed = agent === undefined ? undefined : laneTicketOf(items, repo, agent, coPilot) ?? null;
  return {
    live: live && asTicket(live),
    red: ticketQueueOf(items, repo).filter((item) => item !== live).map(asTicket),
    decision: decided ? { id: decided.id, resolution: decided.resolution } : null,
    records: records.map(({ slug, branch, finished, updatedAt }) => ({ slug, branch, finished, updatedAt })),
    ...(open && {
      open: ['red', 'yellow', 'green'].flatMap((state) =>
        ticketQueueOf(items, repo, state).map(({ id, title, body }) => ({ id, title, state, body })),
      ),
    }),
    ...(filed !== undefined && { filed: filed ? { id: filed.id } : null }),
  };
}

const section = (heading, ticket) => {
  const comments = ticket.comments.map((comment) => `- ${comment.from}: ${comment.text}`);
  return [
    `## ${heading}${ticket.id} — ${ticket.title}${ticket.sliceCount === null ? '' : ` (${ticket.sliceCount} slice${ticket.sliceCount === 1 ? '' : 's'})`}`,
    ticket.body ?? '',
    ...(comments.length ? ['Comments:', comments.join('\n')] : []),
  ].join('\n\n');
};

/** The view as Markdown: the live ticket first, then each red ticket, or the line saying there is none. */
function formatQueue({ live, red, decision }) {
  const parts = [live ? section('Live: ', live) : 'No ticket is live in this directory.'];
  if (decision) parts.push(`merge decided: ${decision.id} — ${decision.resolution}`);
  parts.push(...(red.length ? red.map((ticket) => section('', ticket)) : ['no other red ticket']));
  return `${parts.join('\n\n')}\n`;
}

/** Every open ticket with its state and body, or the line saying there is none. */
const formatOpen = (open) =>
  open.length ? open.map((ticket) => `## ${ticket.id} — ${ticket.title} (${ticket.state})\n\n${ticket.body ?? ''}`).join('\n\n') : 'no open ticket';

/**
 * Each open run's PR with the files its feature branch changes against the default branch, or the line
 * saying there is none (runs-build-on-each-other spec 10). `gh` and `git` take argv arrays, never a shell string (L10).
 */
function formatRuns(records, { gh, git }) {
  const runs = openRuns(records, { gh });
  if (runs.length === 0) return 'no open run';
  git(['fetch', '-q', 'origin']);
  const main = `origin/${defaultBranch(git)}`;
  return runs
    .map((run) => {
      const files = git(['diff', '--name-only', `${main}...origin/${run.branch}`]).split('\n').filter(Boolean);
      return `## #${run.pr} ${run.branch}\n\n${files.length ? files.map((file) => `- ${file}`).join('\n') : 'no changed file'}`;
    })
    .join('\n\n');
}

const gitIn = (cwd) => (args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });

/** The subcommand's work: ask the deck, print the queue, or with `open` every open ticket and run. Answers the exit code. */
export async function tickets({ cwd = process.cwd(), say = (text) => process.stdout.write(text), open = false, gh = ghIn(cwd), git = gitIn(cwd) } = {}) {
  let view;
  let url = 'the deck';
  let headers;
  try {
    // Before the request's try: a missing secret file names itself, not a deck that did not answer.
    headers = bearer();
  } catch (err) {
    process.stderr.write(`pilot tickets: ${err.message}\n`);
    return 1;
  }
  try {
    // Inside the try: `deckUrl()` throws on a mistyped `PILOT_DECK_PORT`, and that is exit 1 too.
    url = deckUrl();
    const query = `repo=${encodeURIComponent(cwd)}${open ? '&open=1' : ''}`;
    const response = await fetch(`${url}/api/tickets?${query}`, { headers, signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!response.ok) throw new Error(`it answered ${response.status}`);
    view = await response.json();
  } catch (err) {
    process.stderr.write(`pilot tickets: ${url} did not answer: ${err.message}\n`);
    return 1;
  }
  if (!open) {
    say(formatQueue(view));
    return 0;
  }
  say(`${formatOpen(view.open ?? [])}\n\n`);
  try {
    say(`${formatRuns(view.records ?? [], { gh, git })}\n`);
  } catch (err) {
    // Never "no open run" when it could not tell: that is an answer ticket-making acts on.
    process.stderr.write(`pilot tickets: open runs unknown: ${String(err.stderr?.trim() || err.message).split('\n')[0]}\n`);
    return 1;
  }
  return 0;
}

/** `pilot tickets`'s entry point from `bin/pilot.mjs`. Answers the exit code. */
export async function main(argv) {
  const open = argv.length === 1 && argv[0] === '--open';
  if (argv.length && !open) {
    process.stderr.write('usage: pilot tickets [--open]\n');
    return 2;
  }
  return tickets({ open });
}
