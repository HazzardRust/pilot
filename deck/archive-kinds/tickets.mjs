/**
 * Closed tickets as archive rows (archive-page spec 2): settled `ticket` items from the live store and every
 * month file, one row per id, the live copy first where a failed archive pass left one in both.
 */

import { localStamp } from '../archive-time.mjs';
import { KIND_TICKET, isOpen, lastSaidAt } from '../items.mjs';

const text = (value) => (value === undefined || value === null ? '' : String(value));

function rowsOf({ deck, months }) {
  const seen = new Set();
  const rows = [];
  for (const item of [...(deck.items ?? []), ...months]) {
    if (item?.kind !== KIND_TICKET || isOpen(item) || typeof item.id !== 'string' || seen.has(item.id)) continue;
    seen.add(item.id);
    const fields = [
      { label: 'Repository', value: text(item.repo) },
      { label: 'State', value: text(item.state) },
      { label: 'Closed', value: localStamp(item.resolvedAt) },
    ];
    rows.push({ kind: 'tickets', id: item.id, at: lastSaidAt(item) ?? null, title: text(item.title), fields });
  }
  return rows;
}

export default { kind: 'tickets', label: 'Closed tickets', files: ['deck.json', 'deck.archive-*.json'], rowsOf };
