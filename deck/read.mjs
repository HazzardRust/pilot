/**
 * Which items a read returns (audit-f1-f7 L1): the one selection `deck_read` makes,
 * kept in one place so every reader of the deck picks the same items the same way.
 * Its one read past `items` is an id they lack, looked up in the archive (store-durability S5).
 */

import { isOpen, messagesOf, ownerOf, threadState } from './items.mjs';
import { DeckRefusal, archivedItem } from './store.mjs';
import { MAX_READ_ITEMS } from './tools.mjs';

/**
 * `id` names one thread: that thread alone, or a refusal naming it. Without one,
 * the newest `limit` of `items`, only the unresolved ones when `open` is set.
 * `brief` shapes each into its `briefLine`: the same items, none of their text.
 * Otherwise every item comes back as its `windowOf` `messages` (session-row spec 9).
 */
export function selectItems(items, { id, open = false, limit = MAX_READ_ITEMS, brief, messages } = {}) {
  const chosen = pick(items, id, open, limit);
  return brief ? chosen.map(briefLine) : chosen.map((item) => windowOf(item, messages));
}

/** With no `messages`, a thread shorter than this comes back whole (session-row spec 5). */
const WHOLE_UNDER = 5;
/** ...and a longer one as this many of its latest messages. */
const DEFAULT_WINDOW = 5;

/**
 * The messages of a thread a read shows (L3, L4): the post is message 1, then the replies.
 * `N` is the last N, `-N` the first N, `'all'` the whole. A window that leaves nothing out
 * is the item as it is; one that does carries `window` and drops `body` when the post is
 * outside it. Title, kind, state and owner always stay.
 */
export function windowOf(item, messages) {
  const replies = messagesOf(item);
  const total = 1 + replies.length;
  const asked = messages ?? (total < WHOLE_UNDER ? 'all' : DEFAULT_WINDOW);
  if (asked === 'all' || Math.abs(asked) >= total) return item;
  if (asked < 0) {
    return { ...item, replies: replies.slice(0, -asked - 1), window: { shown: -asked, total, left: 'latest' } };
  }
  const { body: _post, ...rest } = item;
  return { ...rest, replies: replies.slice(-asked), window: { shown: asked, total, left: 'earliest' } };
}

function pick(items, id, open, limit) {
  if (id !== undefined) {
    // An id the live store lacks may name an archived thread, read-only (store-durability spec 8, A2).
    const item = items.find((candidate) => candidate.id === id) ?? archivedItem(id);
    if (!item) throw new DeckRefusal(`no item ${id} to read`);
    return [item];
  }
  return (open ? items.filter(isOpen) : items).slice(-limit);
}

/** One item as a scan of the deck needs it (spec 2): no body and no messages, only how many. */
function briefLine(item) {
  return {
    id: item.id,
    kind: item.kind,
    state: threadState(item),
    owner: ownerOf(item),
    replies: messagesOf(item).length,
    title: item.title,
  };
}
