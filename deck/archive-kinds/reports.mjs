/**
 * Closing reports as archive rows (archive-page spec 3, 6; A7): every `report` item from the live store and every
 * month file, one row per id, the live copy first. A report is never resolved, so it landed when it was posted.
 */

import { localStamp } from '../archive-time.mjs';
import { KIND_REPORT, lastSaidAt } from '../items.mjs';

function rowsOf({ deck, months }) {
  const seen = new Set();
  const rows = [];
  for (const item of [...(deck.items ?? []), ...months]) {
    if (item?.kind !== KIND_REPORT || typeof item.id !== 'string' || seen.has(item.id)) continue;
    seen.add(item.id);
    const fields = [
      { label: 'Ticket', value: item.ticket },
      { label: 'Feature', value: item.feature ?? item.title },
      { label: 'Landed', value: localStamp(item.postedAt) },
      { label: 'Body', value: item.body, markdown: true },
    ];
    rows.push({ kind: 'report', id: item.id, at: lastSaidAt(item) ?? null, title: item.title, fields });
  }
  return rows;
}

export default { kind: 'report', label: 'Closing reports', files: ['deck.json', 'deck.archive-*.json'], rowsOf };
