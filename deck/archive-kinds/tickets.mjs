/**
 * Closed tickets as archive rows (archive-page spec 2): settled `ticket` items from the live store and every
 * month file, one row per id, the live copy first where a failed archive pass left one in both.
 */

import { localStamp } from '../archive-time.mjs';
import { KIND_TICKET, lastSaidAt } from '../items.mjs';

function rowsOf({ settled }) {
  const rows = [];
  for (const item of settled) {
    if (item.kind !== KIND_TICKET) continue;
    const fields = [
      { label: 'Repository', value: item.repo },
      { label: 'State', value: item.state },
      { label: 'Closed', value: localStamp(item.resolvedAt) },
    ];
    rows.push({ kind: 'tickets', id: item.id, at: lastSaidAt(item) ?? null, title: item.title, fields });
  }
  return rows;
}

export default { kind: 'tickets', label: 'Closed tickets', files: ['deck.json', 'deck.archive-*.json'], rowsOf };
