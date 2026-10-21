/**
 * The chain step (run-chaining spec 3, L3-L5): when a run finishes cleanly and a
 * ticket is open in its directory, the daemon hands the head ticket to the session
 * after it. One deep function, so the rule is got right or wrong in one place.
 *
 * The hand-off carries the ticket's spec as its body, and the ticket is taken live in the
 * same tick (L4, as ticket-states L16 amends it: taken, not resolved; it stays open
 * until its run closes it): a ticket is started exactly once, and a `/clear` that never came
 * leaves the spec in an open hand-off rather than nowhere. `pilot run` types the
 * `/clear`; `hooks/session-handoff.js` gives the fresh session the next-run frame
 * and resolves the hand-off. Store calls are synchronous and the daemon is one
 * process, so nothing can land between the checks and the writes.
 */

import { createRequire } from 'node:module';

import { CLOSED, CLOSED_WITH, KIND_HANDOFF, REOPENED, isChainHandoff, isOpen, nextTicketOf, repoKey } from './items.mjs';
import { laneOf } from './lanes.mjs';
import { FINISHED_CLEAN } from './runs.mjs';
import { DeckRefusal, MAX_TEXT_BYTES, deckLanes, listItems, postItem, recordFor, releaseCoPilot, resumableRecordFor, takeTicket } from './store.mjs';

// The guard owns the mark (handoff-over-mark L3): asked, never copied into deck/.
const { pastAdvisoryAt } = createRequire(import.meta.url)('../hooks/context-size-guard.js');

/** A reply somebody said, as against the deck's own close and reopen markers (items.mjs). */
const isComment = ({ text }) => text !== CLOSED && text !== REOPENED && !text.startsWith(CLOSED_WITH);

const COMMENTS_HEADER = '\n\n## Comments on this ticket\n\n';

/** The stage lanes in the order the chain fills them (three-lanes A4). */
const STAGE_LANES = ['concluding', 'planning'];

/**
 * The ticket's body, then its comments in the order they were said, each labelled by
 * who said it (spec 9, L4), so the chained session starts from everything the ticket
 * gathered. A ticket nobody commented on hands over its body byte for byte.
 *
 * The body plus its comments can pass the store's MAX_TEXT_BYTES, and `postItem`
 * would then refuse it before the ticket is taken, blocking the whole queue behind
 * it (F1). So comments are added in order only while the whole hand-off, including
 * a closing pointer line, stays at or under that limit; whatever does not fit is
 * left for the ticket itself. `tail`, the line naming the other tickets taken with it
 * (three-lanes A4), ends every hand-off that has room for it and is budgeted first.
 */
function handoffBody(ticket, tail = '') {
  const { body } = ticket;
  const fits = (text) => Buffer.byteLength(text, 'utf8') <= MAX_TEXT_BYTES;
  const comments = (ticket.replies ?? []).filter(isComment);
  if (comments.length === 0) return fits(`${body}${tail}`) ? `${body}${tail}` : body;

  const said = comments.map((reply) => `**${reply.author ?? reply.from}** (${reply.repliedAt}): ${reply.text}`);
  const full = `${body}${COMMENTS_HEADER}${said.join('\n\n')}${tail}`;
  if (fits(full)) return full;

  const closing = `Further comments are on ${ticket.id}.`;
  const included = [];
  for (const line of said) {
    if (!fits(`${body}${COMMENTS_HEADER}${[...included, line].join('\n\n')}\n\n${closing}${tail}`)) break;
    included.push(line);
  }
  if (included.length > 0) return `${body}${COMMENTS_HEADER}${included.join('\n\n')}\n\n${closing}${tail}`;
  // Even the closing line alone can pass the limit when the body itself is stored
  // right up against it (the store's own bound on `body`, not this function's to
  // relax): fall back to the body untouched, which is already known to fit.
  return [`${body}\n\n${closing}${tail}`, `${body}\n\n${closing}`].find(fits) ?? body;
}

/**
 * Take the head of each of this directory's empty stage lanes and post one chain hand-off naming them, or say why
 * not; `taken` lists every ticket taken, in the order taken.
 * Only a clean finish chains (L3): `needed` does not (overview-one-ticket L18, A4), since the pilot takes
 * the next ticket itself and a chain too would `/clear` it mid-start; abandoned, stopped or crashed never
 * does (spec 5), and no run finishes `blocked` (L19).
 * `atStart` is `pilot run` starting (A5): no record, or any finish, is no unfinished run to talk over.
 * `pastMark` reads the context guard's own advisory mark for `repo`; tests inject it.
 */
export function chainNext(repo, { atStart = false, pastMark = pastAdvisoryAt } = {}) {
  // `recordFor` throws its own refusal, worded for `GET /api/record` (QA F5): "the
  // directory whose record you want" reads as a lookup gone wrong on `/api/chain`,
  // which is `pilot run` asking to start, not to read a record. Worded here instead.
  if (typeof repo !== 'string' || repo.trim() === '') {
    throw new DeckRefusal('repo must be the path of the repository whose next ticket should chain');
  }
  // A co-pilot does not outlive the wrapper that started its session (clear-waits-co-pilot spec 5, L8).
  if (atStart) releaseCoPilot(repo);
  // At start, a yellow ticket's run is not the main session's own to talk over (ADR 0087): the red head chains.
  const record = atStart ? resumableRecordFor(repo) : recordFor(repo);
  const mayChain = atStart ? record === null || typeof record.finished === 'string' : record?.finished === FINISHED_CLEAN;
  if (!mayChain) return { handoff: null, reason: atStart ? 'a run is unfinished' : 'not finished cleanly' };
  const items = listItems();
  if (!['red', 'green'].some((state) => nextTicketOf(items, repo, state))) return { handoff: null, reason: 'no ticket' };
  if (items.some((item) => isChainHandoff(item, repo) && isOpen(item))) return { handoff: null, reason: 'hand-off open' };
  // Each stage lane is filled from its own head, concluding first (three-lanes spec 7, A4); a lane whose ticket is
  // live has not put it down (ticket-states L9), so only a `queued` lane, one with no live ticket, is filled.
  // Mid-switch a lane's take is refused (ticket-state-accents spec 14): the pilot's own take of `to` ends it first.
  // The other lane is no bar (three-lanes L4).
  const switching = deckLanes().switches[repoKey(repo)];
  const lanes = STAGE_LANES.map((lane) => laneOf(items, repo, lane, { switching }));
  const heads = lanes.filter(({ state }) => state === 'queued').map(({ next }) => next);
  if (heads.length === 0) return { handoff: null, reason: lanes.some(({ state }) => state === 'switching') ? 'switch pending' : 'ticket live' };
  const taken = heads.map(({ id }) => id);
  // Under the guard's advisory mark the finishing session has room for the heads, so they are taken in place and
  // nothing is posted for `pilot run` to /clear on (handoff-over-mark L1, ADR 0117). Only `false` is under:
  // no reading hands off as before (L9). A starting session has no context to measure (L5).
  if (!atStart && pastMark(repo) === false) return { handoff: null, reason: 'under the mark', taken: fillLanes(repo) };

  // One hand-off (A4): the first head's spec, naming every other ticket it took. A body with no room left to name
  // them takes the first head alone, and the rest stay queued rather than live and unnamed.
  const [head, ...also] = heads;
  const named = also.length ? `\n\nAlso taken live for this run: ${also.map(({ id }) => id).join(', ')}.` : '';
  const body = handoffBody(head, named);
  const handed = body.endsWith(named) ? taken : [head.id];
  const others = handed.slice(1);
  const handoff = postItem({ kind: KIND_HANDOFF, repo, title: `Next run: ${head.title}`, body, next: head.id, also: others.length ? others : undefined });
  for (const id of handed) takeTicket(id);
  return { handoff, taken: handed };
}

/**
 * Take the head of each of this directory's queued stage lanes in place, concluding first, and post nothing
 * (gate2-frees-lane spec 1, L2): the Sign off press and `chainNext` under the mark share it. A held or switching lane
 * is left alone. Answers the ids taken, in the order taken.
 */
export function fillLanes(repo) {
  const items = listItems();
  const switching = deckLanes().switches[repoKey(repo)];
  const taken = STAGE_LANES.map((lane) => laneOf(items, repo, lane, { switching }))
    .filter(({ state }) => state === 'queued')
    .map(({ next }) => next.id);
  for (const id of taken) takeTicket(id);
  return taken;
}

/**
 * Whether a resolved chain hand-off posted at or after this finish has superseded
 * it (L5): the session `/clear` made is the same run, and the finish is not its own.
 */
export function isSuperseded(record, items, repo) {
  const saidAt = record?.finishedAt ?? record?.updatedAt;
  if (typeof saidAt !== 'string') return false;
  return items.some((item) => isChainHandoff(item, repo) && !isOpen(item) && item.postedAt >= saidAt);
}
