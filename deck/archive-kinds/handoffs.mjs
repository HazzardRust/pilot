/**
 * Hand-offs as archive rows (archive-page spec 3, 6; A7): settled `handoff` and `crew-handoff` items, one kind, one
 * row per id from the live store and every month file.
 */

import { localStamp } from '../archive-time.mjs';
import { KIND_CREW_HANDOFF, KIND_HANDOFF, lastSaidAt } from '../items.mjs';

function rowsOf({ settled }) {
  const rows = [];
  for (const item of settled) {
    if (item.kind !== KIND_HANDOFF && item.kind !== KIND_CREW_HANDOFF) continue;
    const fields = [
      { label: 'Kind', value: item.kind },
      { label: 'Next ticket', value: item.next },
      { label: 'Resolution', value: item.resolution },
      { label: 'Posted', value: localStamp(item.postedAt) },
      { label: 'Closed', value: localStamp(item.resolvedAt) },
      { label: 'Body', value: item.body, markdown: true },
    ];
    rows.push({ kind: 'handoff', id: item.id, at: lastSaidAt(item) ?? null, title: item.title, fields });
  }
  return rows;
}

export default { kind: 'handoff', label: 'Hand-offs', files: ['deck.json', 'deck.archive-*.json'], rowsOf };
