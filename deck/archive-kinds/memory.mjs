/**
 * Process memory samples as archive rows (archive-page spec 3, 6; A2): one row per `memory.jsonl` line, read from
 * the file alone, never through `memory.mjs`, whose writers hook the process. A torn or foreign line is skipped.
 */

import fs from 'node:fs';
import path from 'node:path';

import { localStamp } from '../archive-time.mjs';

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const text = (value) => (value === undefined || value === null ? '' : String(value));
const MIB = 2 ** 20;

/** Bytes as whole megabytes; '' for what is not a number of bytes. */
const mb = (bytes) => (Number.isFinite(bytes) ? String(Math.round(bytes / MIB)) : '');

function linesOf(file) {
  let raw;
  try {
    raw = fs.readFileSync(file, 'utf8');
  } catch {
    return [];
  }
  const lines = [];
  for (const line of raw.split('\n')) {
    if (!line.trim()) continue;
    try {
      const parsed = JSON.parse(line);
      if (isObject(parsed)) lines.push(parsed);
    } catch {
      // A torn line is one the writer is still ending; it is not a row.
    }
  }
  return lines;
}

function rowsOf({ dir }) {
  const rows = [];
  for (const line of linesOf(path.join(dir, 'memory.jsonl'))) {
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
