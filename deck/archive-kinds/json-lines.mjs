/**
 * A JSON-lines file for the archive kinds, one entry per line: its object, or null for a blank, torn or non-object
 * line; [] for a file that cannot be read. Its default export is no kind, so `archive.mjs` skips it as a helper.
 */

import fs from 'node:fs';

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

export default function jsonLines(file) {
  let raw;
  try {
    raw = fs.readFileSync(file, 'utf8');
  } catch {
    return [];
  }
  return raw.split('\n').map((line) => {
    if (!line.trim()) return null;
    try {
      const parsed = JSON.parse(line);
      return isObject(parsed) ? parsed : null;
    } catch {
      // A torn line is one the writer is still ending; it is not a row.
      return null;
    }
  });
}
