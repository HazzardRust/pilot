/**
 * The threads the pilot still owes a directory (yellow-lane spec 11; L6, A2, A3): an open chat or
 * user thread whose last message is the user's (`unanswered`), or a pilot reply sent with
 * `promise: true` (`promised`, discharged by the pilot's next reply). The promise is the stored
 * flag, never a phrase in the text. Computed here once and served on `GET /api/record`, because
 * the hooks are CommonJS and cannot import it.
 */

import { KIND_CHAT, KIND_USER, isOpen, sameRepo } from './items.mjs';

const LINE_CHARS = 120;

/** A message as one line of at most 120 characters. */
const oneLine = (text) => {
  const line = [...String(text ?? '').replace(/\s+/g, ' ').trim()];
  return line.length > LINE_CHARS ? `${line.slice(0, LINE_CHARS - 1).join('')}…` : line.join('');
};

/** `repo`'s owed threads, `[{ id, line, why }]` in store order, pure. */
export function owedThreadsOf(items, repo) {
  return items.flatMap((item) => {
    if ((item?.kind !== KIND_CHAT && item?.kind !== KIND_USER) || !isOpen(item) || !sameRepo(item.repo, repo)) return [];
    const last = Array.isArray(item.replies) ? item.replies.at(-1) : undefined;
    const why = last?.from === 'user' ? 'unanswered' : last?.from === 'pilot' && last.promise === true ? 'promised' : null;
    return why ? [{ id: item.id, line: oneLine(last.text), why }] : [];
  });
}
