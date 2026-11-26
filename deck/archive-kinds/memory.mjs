/**
 * Process memory samples as archive rows (archive-page spec 3, 6; A2): one row per `memory.jsonl` line, read from
 * the file alone, never through `memory.mjs`, whose writers hook the process. A torn or foreign line is skipped.
 */

import path from 'node:path';

import { localStamp } from '../archive-time.mjs';
import jsonLines from './json-lines.mjs';

const text = (value) => (value === undefined || value === null ? '' : String(value));
const MIB = 2 ** 20;

/** Bytes as whole megabytes; '' for what is not a number of bytes. */
const mb = (bytes) => (Number.isFinite(bytes) ? String(Math.round(bytes / MIB)) : '');

function rowsOf({ dir }) {
  const rows = [];
  for (const line of jsonLines(path.join(dir, 'memory.jsonl')).filter(Boolean)) {
    if (typeof line.at !== 'string') continue;
    const fields = [
      { label: 'Process', value: text(line.process) },
      { label: 'Pid', value: text(line.pid) },
      { label: 'Event', value: text(line.event) },
      { label: 'RSS (MB)', value: mb(line.rss) },
      { label: 'Free (MB)', value: mb(line.free) },
    ];
    rows.push({ kind: 'memory', id: `memory:${line.at}:${text(line.process)}:${text(line.pid)}:${text(line.event)}`, at: line.at, title: `${text(line.process)} ${text(line.event)} at ${localStamp(line.at)}`, fields });
  }
  return rows;
}

export default { kind: 'memory', label: 'Memory samples', files: ['memory.jsonl'], rowsOf };
