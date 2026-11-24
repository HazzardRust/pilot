/**
 * Hand-offs as archive rows (archive-page spec 3, 6; A7): settled `handoff` and `crew-handoff` items, one kind, one
 * row per id from the live store and every month file.
 */

import { localStamp } from '../archive-time.mjs';
import { KIND_CREW_HANDOFF, KIND_HANDOFF, isOpen, lastSaidAt } from '../items.mjs';

const text = (value) => (value === undefined || value === null ? '' : String(value));

function rowsOf({ deck, months }) {
  const seen = new Set();
  const rows = [];
  for (const item of [...(deck.items ?? []), ...months]) {
    if ((item?.kind !== KIND_HANDOFF && item?.kind !== KIND_CREW_HANDOFF) || isOpen(item) || typeof item.id !== 'string' || seen.has(item.id)) continue;
    seen.add(item.id);
    const fields = [
      { label: 'Kind', value: item.kind },
      { label: 'Next ticket', value: text(item.next) },
      { label: 'Resolution', value: text(item.resolution) },
      { label: 'Posted', value: localStamp(item.postedAt) },
      { label: 'Closed', value: localStamp(item.resolvedAt) },
      { label: 'Body', value: text(item.body), markdown: true },
    ];
    rows.push({ kind: 'handoff', id: item.id, at: lastSaidAt(item) ?? null, title: text(item.title), fields });
  }
  return rows;
}

export default { kind: 'handoff', label: 'Hand-offs', files: ['deck.json', 'deck.archive-*.json'], rowsOf };
