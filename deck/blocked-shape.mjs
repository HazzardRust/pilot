/**
 * Whether a blocked step is posted as a blocking item (yellow-lane spec 7, L5, A1): a question
 * or walkthrough titled `Blocked:`, as gate-no-stall's `hooks/lib/blocked.js` writes it, that
 * names a ticket holds that ticket's gate2 only with `blocking: true`. Pure: the fields in, the gaps
 * out, so `postItem` refuses before it reads the store and never sets the flag itself.
 */

import { KIND_QUESTION, KIND_WALKTHROUGH, authorKind } from './items.mjs';

const CHECKED = new Set([KIND_QUESTION, KIND_WALKTHROUGH]);
const GAP = 'a blocked step is a blocking item: post it with blocking: true';

/** The gaps in a post's fields, `[]` unless it is a ticketed `Blocked:` question or walkthrough not marked blocking. */
export function blockedShapeGaps({ kind, title, ticket, blocking }) {
  if (!CHECKED.has(kind) || ticket === undefined || blocking === true) return [];
  return typeof title === 'string' && title.startsWith('Blocked:') ? [GAP] : [];
}

/** The prefix of the pilot's close of a `Blocked:` item whose step no longer matters (blocked-yellow-yields spec 6, A4). */
export const MOOT = 'Moot:';

/**
 * Whether this close of a blocking item is the pilot's to make without the user (A4): a question
 * titled `Blocked:`, closed by the pilot as stamped (an unstamped caller is not trusted with it),
 * with a resolution of `Moot:` and a reason. A design question marked blocking still needs the user.
 */
export function isMoot(item, resolution, author) {
  return item?.kind === KIND_QUESTION
    && typeof item.title === 'string' && item.title.startsWith('Blocked:')
    && typeof author === 'string' && authorKind(author) === 'pilot'
    && typeof resolution === 'string' && resolution.startsWith(MOOT) && resolution.slice(MOOT.length).trim() !== '';
}
