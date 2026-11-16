/**
 * Whether a blocked step is posted as a blocking item (yellow-lane spec 7, L5, A1): a question
 * or walkthrough titled `Blocked:`, as gate-no-stall's `hooks/lib/blocked.js` writes it, that
 * names a ticket holds that ticket's gate2 only with `blocking: true`. Pure: the fields in, the gaps
 * out, so `postItem` refuses before it reads the store and never sets the flag itself.
 */

import { CLOSED_WITH, KIND_QUESTION, KIND_WALKTHROUGH, authorKind, messagesOf } from './items.mjs';

const CHECKED = new Set([KIND_QUESTION, KIND_WALKTHROUGH]);
const GAP = 'a blocked step is a blocking item: post it with blocking: true';

/** The gaps in a post's fields, `[]` unless it is a ticketed `Blocked:` question or walkthrough not marked blocking. */
export function blockedShapeGaps({ kind, title, ticket, blocking }) {
  if (!CHECKED.has(kind) || ticket === undefined || blocking === true) return [];
  return typeof title === 'string' && title.startsWith('Blocked:') ? [GAP] : [];
}

/**
 * The prefixes of the pilot's close of a blocking question it no longer needs (blocking-close spec 1,
 * L2, ADR 0172): `Moot: <why>` when the answer stopped mattering, `Assumed: <what>` when it went ahead on one.
 */
export const PILOT_CLOSES = Object.freeze(['Moot:', 'Assumed:']);

/** The prefix a resolution claims a pilot close with, or undefined. */
export const pilotCloseClaimed = (resolution) =>
  typeof resolution === 'string' ? PILOT_CLOSES.find((prefix) => resolution.startsWith(prefix)) : undefined;

/**
 * Whether this close of a blocking item is the pilot's to make without the user (L1, L3): a question
 * marked blocking, never a proposal (a walkthrough, signoff or gate is a press), closed by the pilot as
 * stamped (an unstamped caller is not trusted with it), with a `PILOT_CLOSES` prefix and a reason. The
 * user's reopen of such a close leaves its `Closed with:` line in the thread (`reopenItem`), and that
 * line is the veto (spec 6, L4): from then on only the user's answer clears the question.
 */
export function isPilotClose(item, resolution, author) {
  const prefix = pilotCloseClaimed(resolution);
  return item?.kind === KIND_QUESTION && item.blocking === true && item.proposal !== true
    && typeof author === 'string' && authorKind(author) === 'pilot'
    && prefix !== undefined && resolution.slice(prefix.length).trim() !== ''
    && !messagesOf(item).some((message) => typeof message?.text === 'string'
      && PILOT_CLOSES.some((vetoed) => message.text.startsWith(`${CLOSED_WITH} ${vetoed}`)));
}
