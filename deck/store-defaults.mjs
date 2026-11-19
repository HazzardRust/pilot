/**
 * A plain question's default, taken by the deck (never-stuck S10, spec 10, A2). Beside `deck/store-items.mjs`,
 * which re-exports every name here, because that file is at the deck's size bar.
 */

import { CLOSED_WITH, KIND_QUESTION, isBlocking, isOpen, messagesOf } from './items.mjs';
import { DeckRefusal, readDeck, seqOf, writeDeck } from './store-core.mjs';

/** How long a plain question waits on the user before the deck takes its default (never-stuck spec 10). */
export const DEFAULT_MS = 20 * 60_000;

/** A message that says the question was decided already: the user's, a default taken, or a close the user reopened. */
const decided = (message) => message?.from === 'user' || message?.default === true || (message?.from === 'pilot' && String(message.text).startsWith(CLOSED_WITH));

/**
 * The defaults due by `now` (never-stuck spec 10, A2), pure: an open question that does not block, with a
 * `recommended` option, no message from the user, never closed before, no proposal flag and not titled
 * `Merging tickets` (a merge is irreversible), `DEFAULT_MS` past its `postedAt`. Each is `{ id, dueAt }`; the timer
 * passes `Infinity` to arm every one ahead. A reopened question has lost its clock, so it waits on the user.
 */
export function defaultsDue(items, now) {
  return items
    .filter((item) => item?.kind === KIND_QUESTION && isOpen(item) && !isBlocking(item) && typeof item.recommended === 'string')
    .filter((item) => item.proposal !== true && item.title !== 'Merging tickets' && !messagesOf(item).some(decided))
    .map((item) => ({ id: item.id, dueAt: Date.parse(item.postedAt) + DEFAULT_MS }))
    .filter(({ dueAt }) => dueAt <= now);
}

/**
 * The deck answers a due question with its default (spec 10): the `recommended` text as the user's press of
 * `ASSUME_DEFAULT` would give it, but `from: 'deck'` and tagged `default`, so its owner's wait takes it and it
 * never reads as the user; then closed `Assumed:`, with a notice, in the same write. Refused once not due.
 * `touchRuns` is not called: the deck's clock is not a session working, as the user's press is not.
 */
export function takeDefault(id) {
  const deck = readDeck();
  const item = deck.items.find((candidate) => candidate.id === id);
  if (!item || !defaultsDue([item], Date.now()).length) throw new DeckRefusal(`item ${id} has no default due`);
  const at = new Date().toISOString();
  item.replies = [...messagesOf(item), { from: 'deck', author: 'deck', text: item.recommended, repliedAt: at, seq: (deck.seq = seqOf(deck) + 1), default: true }];
  item.resolution = `Assumed: ${item.recommended} (no answer ${DEFAULT_MS / 60_000} min)`;
  item.resolvedAt = at;
  item.resolvedBy = 'deck';
  item.notice = true;
  writeDeck(deck);
  return item;
}
