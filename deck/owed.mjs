/**
 * The threads the pilot still owes a directory (yellow-lane spec 11; L6, A2, A3): an open chat or
 * user thread whose last message is the user's (`unanswered`), or a pilot reply sent with
 * `promise: true` (`promised`, discharged by the pilot's next reply); and a ticket owed its closing
 * report (`report owed`) or an architect (`architect owed`), never-stuck spec 1, 2. The promise is the stored
 * flag, never a phrase in the text. Computed here once and served on `GET /api/record`, because
 * the hooks are CommonJS and cannot import it.
 */

import { successorOwedOf } from './crew-handoff.mjs';
import { KIND_CHAT, KIND_GATE1, KIND_GATE2, KIND_REPORT, KIND_TICKET, KIND_USER, isOpen, liveTicketOf, sameRepo } from './items.mjs';

const LINE_CHARS = 120;

/** Every reason `owedThreadsOf` gives, fixed words, the only ones `pilot wait` echoes. */
export const OWED_WHY = ['unanswered', 'promised', 'report owed', 'architect owed', 'successor owed'];

/** A message as one line of at most 120 characters. */
const oneLine = (text) => {
  const line = [...String(text ?? '').replace(/\s+/g, ' ').trim()];
  return line.length > LINE_CHARS ? `${line.slice(0, LINE_CHARS - 1).join('')}…` : line.join('');
};

/** An open ticket whose gate2 landed (never-stuck spec 1) and no report names yet (human-steps L6): its closing report is owed. */
export function isReportOwed(ticket, items) {
  return ticket?.kind === KIND_TICKET && isOpen(ticket) &&
    items.some((item) => item?.kind === KIND_GATE2 && item.ticket === ticket.id && item.landing?.state === 'landed') &&
    !items.some((item) => item?.kind === KIND_REPORT && item.ticket === ticket.id);
}

/** The live red ticket with no gate1 open on it (never-stuck spec 2): an architect is owed. Read off the items, never a guess at agents. */
const isArchitectOwed = (ticket, items) =>
  ticket === liveTicketOf(items, ticket.repo, 'red') &&
  !items.some((item) => item?.kind === KIND_GATE1 && isOpen(item) && item.ticket === ticket.id);

/**
 * `repo`'s owed threads, `[{ id, line, why }]` in store order, pure; a ticket's line is its title. Then, last, each
 * crew-handoff owed a successor (`successorOwedOf`, `coPilot` as `coPilotFor` gives it), its line the ticket id.
 */
export function owedThreadsOf(items, repo, coPilot = null) {
  const successors = successorOwedOf(items, repo, coPilot).map((item) => ({ id: item.id, line: item.ticket, why: 'successor owed' }));
  return items.flatMap((item) => {
    if (item?.kind === KIND_TICKET && sameRepo(item.repo, repo)) {
      const why = isReportOwed(item, items) ? 'report owed' : isArchitectOwed(item, items) ? 'architect owed' : null;
      return why ? [{ id: item.id, line: oneLine(item.title), why }] : [];
    }
    if ((item?.kind !== KIND_CHAT && item?.kind !== KIND_USER) || !isOpen(item) || !sameRepo(item.repo, repo)) return [];
    const last = Array.isArray(item.replies) ? item.replies.at(-1) : undefined;
    const why = last?.from === 'user' ? 'unanswered' : last?.from === 'pilot' && last.promise === true ? 'promised' : null;
    return why ? [{ id: item.id, line: oneLine(last.text), why }] : [];
  }).concat(successors);
}
