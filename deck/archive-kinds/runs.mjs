/**
 * Run records as archive rows (archive-page spec 3, 6; A7): one row per `deck.records[]` entry, read off the
 * live store, never through `readDeck`.
 */

import { localStamp } from '../archive-time.mjs';

const text = (value) => (value === undefined || value === null ? '' : String(value));

/** `2: S1 merged, S2 building`: how many slices, then each one's name and state. */
function slicesOf(slices) {
  const list = Array.isArray(slices) ? slices : [];
  const each = list.map((cells) => [text(cells?.slice), text(cells?.state)].filter(Boolean).join(' ')).filter(Boolean);
  return each.length === 0 ? String(list.length) : `${list.length}: ${each.join(', ')}`;
}

function rowsOf({ deck }) {
  const rows = [];
  for (const entry of Array.isArray(deck.records) ? deck.records : []) {
    const record = entry?.record;
    if (typeof record?.slug !== 'string' || typeof entry.repo !== 'string') continue;
    const fields = [
      { label: 'Feature', value: text(record.feature) },
      { label: 'Ticket', value: text(record.ticket) },
      { label: 'Branch', value: text(record.branch) },
      { label: 'Base', value: text(record.base) },
      { label: 'Artefact', value: text(record.artefact) },
      { label: 'Slices', value: slicesOf(record.slices) },
      { label: 'Next', value: text(record.next) },
      { label: 'Finished', value: localStamp(record.finishedAt) },
      { label: 'Updated', value: localStamp(record.updatedAt) },
    ];
    rows.push({ kind: 'run', id: `${entry.repo}:${record.slug}`, at: record.updatedAt ?? record.finishedAt ?? null, title: text(record.feature) || record.slug, fields });
  }
  return rows;
}

export default { kind: 'run', label: 'Run records', files: ['deck.json'], rowsOf };
