/**
 * The switch files as archive rows (archive-page spec 3, 6): `alerts.json`, `usage-log.json`,
 * `start-settings.json` and the `defender-advised.json` marker, one row each, one field per top-level key. A
 * missing or unreadable file is no row.
 */

import fs from 'node:fs';
import path from 'node:path';

const FILES = ['alerts.json', 'usage-log.json', 'start-settings.json', 'defender-advised.json'];

const label = (key) => key.charAt(0).toUpperCase() + key.slice(1);

/** A value as display text: a scalar as is, an object as `key: value` lines, never raw JSON. */
function shown(value, indent = '') {
  if (value === null || typeof value !== 'object') return String(value);
  if (Array.isArray(value)) return value.map((item) => shown(item, indent)).join(', ');
  return Object.entries(value)
    .map(([key, inner]) =>
      inner !== null && typeof inner === 'object' && !Array.isArray(inner)
        ? `${indent}${key}:\n${shown(inner, `${indent}  `)}`
        : `${indent}${key}: ${shown(inner, indent)}`,
    )
    .join('\n');
}

function rowOf(dir, name) {
  const file = path.join(dir, name);
  let json;
  let stat;
  try {
    stat = fs.statSync(file);
    json = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
  if (json === null || typeof json !== 'object' || Array.isArray(json)) return null;
  return {
    kind: 'switch',
    id: name,
    at: stat.mtime.toISOString(),
    title: name,
    fields: Object.entries(json).map(([key, value]) => ({ label: label(key), value: shown(value) })),
  };
}

function rowsOf({ dir }) {
  return FILES.map((name) => rowOf(dir, name)).filter((row) => row !== null);
}

export default { kind: 'switch', label: 'Switch files', files: FILES, rowsOf };
