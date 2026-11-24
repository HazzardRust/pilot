/**
 * Every other settled thread as archive rows (archive-page spec 3, 6; A7): each item kind the tickets, reports and
 * hand-offs modules do not claim (question, walkthrough, signoff, gates, chat, user, audit, lesson), so each stored
 * item is one row under one kind. One row per id from the live store and every month file.
 */

import { localStamp } from '../archive-time.mjs';
import { KIND_CREW_HANDOFF, KIND_HANDOFF, KIND_REPORT, KIND_TICKET, isOpen, lastSaidAt, messagesOf } from '../items.mjs';

const CLAIMED = new Set([KIND_TICKET, KIND_REPORT, KIND_HANDOFF, KIND_CREW_HANDOFF]);

const text = (value) => (value === undefined || value === null ? '' : String(value));

function rowsOf({ deck, months }) {
  const seen = new Set();
  const rows = [];
  for (const item of [...(deck.items ?? []), ...months]) {
    if (typeof item?.kind !== 'string' || CLAIMED.has(item.kind) || isOpen(item) || typeof item.id !== 'string' || seen.has(item.id)) continue;
    seen.add(item.id);
    const fields = [
      { label: 'Kind', value: item.kind },
      { label: 'Ticket', value: text(item.ticket) },
      { label: 'Resolution', value: text(item.resolution) },
      { label: 'Replies', value: String(messagesOf(item).length) },
      { label: 'Posted', value: localStamp(item.postedAt) },
      { label: 'Closed', value: localStamp(item.resolvedAt) },
      { label: 'Body', value: text(item.body), markdown: true },
    ];
    rows.push({ kind: 'thread', id: item.id, at: lastSaidAt(item) ?? null, title: text(item.title), fields });
  }
  return rows;
}

export default { kind: 'thread', label: 'Settled threads', files: ['deck.json', 'deck.archive-*.json'], rowsOf };
