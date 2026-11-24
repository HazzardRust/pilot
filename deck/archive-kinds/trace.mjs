/**
 * Hand-off trace steps as archive rows (archive-page spec 3, 6): one row per line of `handoff-trace.jsonl` and its
 * `.old`, read from the store directory the source gives. A torn line is skipped; no file is no rows.
 */

import fs from 'node:fs';
import path from 'node:path';

import { localStamp } from '../archive-time.mjs';

const FILES = ['handoff-trace.jsonl', 'handoff-trace.jsonl.old'];

const text = (value) => (typeof value === 'string' ? value : '');

function linesOf(file) {
  try {
    return fs.readFileSync(file, 'utf8').split('\n');
  } catch {
    return [];
  }
}

function rowsOf({ dir }) {
  const rows = [];
  for (const name of FILES) {
    linesOf(path.join(dir, name)).forEach((raw, index) => {
      if (raw.trim() === '') return;
      let entry;
      try {
        entry = JSON.parse(raw);
      } catch {
        return;
      }
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return;
      const kind = entry.kind === 'crew-handoff' ? 'crew' : entry.kind === 'handoff' ? 'pilot' : text(entry.kind);
      const at = typeof entry.at === 'string' && !Number.isNaN(Date.parse(entry.at)) ? entry.at : null;
      rows.push({
        kind: 'trace',
        id: `trace:${name}:${index + 1}`,
        at,
        title: [kind, text(entry.step)].filter(Boolean).join(' ') + (text(entry.item) ? `: ${text(entry.item)}` : ''),
        fields: [
          { label: 'Kind', value: kind },
          { label: 'Step', value: text(entry.step) },
          { label: 'Item', value: text(entry.item) },
          { label: 'Ticket', value: text(entry.ticket) },
          { label: 'Agent', value: text(entry.agent) },
          { label: 'Time', value: at === null ? '' : localStamp(at) },
        ],
      });
    });
  }
  return rows;
}

export default { kind: 'trace', label: 'Hand-off trace', files: FILES, rowsOf };
