/**
 * Closing reports as archive rows (archive-page spec 3, 6; A7): settled `report` items from the live store and every
 * month file, one row per id, the live copy first.
 */

import { localStamp } from '../archive-time.mjs';
import { KIND_REPORT, isOpen, lastSaidAt } from '../items.mjs';

const text = (value) => (value === undefined || value === null ? '' : String(value));

function rowsOf({ deck, months }) {
  const seen = new Set();
  const rows = [];
  for (const item of [...(deck.items ?? []), ...months]) {
    if (item?.kind !== KIND_REPORT || isOpen(item) || typeof item.id !== 'string' || seen.has(item.id)) continue;
    seen.add(item.id);
    const fields = [
      { label: 'Ticket', value: text(item.ticket) },
      { label: 'Feature', value: text(item.feature ?? item.title) },
      { label: 'Landed', value: localStamp(item.resolvedAt) },
      { label: 'Posted', value: localStamp(item.postedAt) },
      { label: 'Body', value: text(item.body), markdown: true },
    ];
    rows.push({ kind: 'report', id: item.id, at: lastSaidAt(item) ?? null, title: text(item.title), fields });
  }
  return rows;
}

export default { kind: 'report', label: 'Closing reports', files: ['deck.json', 'deck.archive-*.json'], rowsOf };
