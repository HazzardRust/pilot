/**
 * Friction rows as archive rows (archive-page spec 3, 6): one row per `friction[i]` of every run record, the
 * rows as stored, never re-ranked.
 */

import { localStamp } from '../archive-time.mjs';

const text = (value) => (value === undefined || value === null ? '' : String(value));

function rowsOf({ deck }) {
  const rows = [];
  for (const entry of Array.isArray(deck.records) ? deck.records : []) {
    const record = entry?.record;
    if (typeof record?.slug !== 'string' || typeof entry.repo !== 'string' || !Array.isArray(record.friction)) continue;
    record.friction.forEach((row, i) => {
      const fields = [
        { label: 'Feature', value: text(record.feature) || record.slug },
        { label: 'Agent', value: row?.kind === 'drain' ? 'drain' : text(row?.agent) },
        { label: 'What', value: text(row?.what) },
        { label: 'Evidence', value: text(row?.evidence) },
        { label: 'Size', value: text(row?.size) },
        { label: 'Updated', value: localStamp(record.updatedAt) },
      ];
      rows.push({ kind: 'friction', id: `${entry.repo}:${record.slug}:${i}`, at: record.updatedAt ?? null, title: text(row?.what), fields });
    });
  }
  return rows;
}

export default { kind: 'friction', label: 'Friction', files: ['deck.json'], rowsOf };
