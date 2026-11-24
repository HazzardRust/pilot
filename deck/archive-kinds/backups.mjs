/**
 * Upgrade backups as archive rows (archive-page spec 3, 6; L9): one row per `deck.v<version>-<day>.json` and
 * `deck.v<version>-<day>-<n>.json`, the copies `backUp` in `store-core.mjs` keeps before a store upgrade. The item
 * count is read as the month-file kind reads it, from the file's `items` list; a file that is not a store copy (a
 * truncated one, a foreign one) is no row.
 */

import fs from 'node:fs';
import path from 'node:path';

const NAME = /^deck\.v(\d+)-(\d{4}-\d{2}-\d{2})(?:-\d+)?\.json$/;

function rowOf(dir, name) {
  const match = NAME.exec(name);
  if (match === null) return null;
  let items;
  try {
    items = JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8'))?.items;
  } catch {
    return null;
  }
  if (!Array.isArray(items)) return null;
  const [, version, day] = match;
  const at = new Date(`${day}T00:00:00`);
  return {
    kind: 'backup',
    id: `backup:${name}`,
    at: Number.isNaN(at.getTime()) ? null : at.toISOString(),
    title: name,
    fields: [
      { label: 'File', value: name },
      { label: 'Version', value: version },
      { label: 'Day', value: day },
      { label: 'Items', value: String(items.length) },
    ],
  };
}

function rowsOf({ dir }) {
  let names;
  try {
    names = fs.readdirSync(dir);
  } catch {
    return [];
  }
  return names
    .sort()
    .map((name) => rowOf(dir, name))
    .filter((row) => row !== null);
}

export default { kind: 'backup', label: 'Upgrade backups', files: ['deck.v*-*.json'], rowsOf };
