/**
 * Token-usage windows as archive rows (archive-page spec 3, 6; A2): one row per `usage.jsonl` line, read from the
 * file alone, never through `telemetry.mjs`, whose writers start timers. A torn or foreign line is skipped.
 */

import path from 'node:path';

import { localStamp } from '../archive-time.mjs';
import jsonLines from './json-lines.mjs';

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

/** The sum of one model's token counts. */
const sum = (counts) => (isObject(counts) ? Object.values(counts).reduce((n, v) => n + (Number.isFinite(v) ? v : 0), 0) : 0);

/** `name: n` pairs, comma-joined; '' for none. A value that is itself a map of counts is summed. */
const pairs = (map, valueOf) => (isObject(map) ? Object.entries(map).map(([name, value]) => `${name}: ${valueOf(value)}`).join(', ') : '');

const percent = (limit) => (isObject(limit) && Number.isFinite(limit.pct) ? String(limit.pct) : '');

function rowsOf({ dir }) {
  const rows = [];
  for (const line of jsonLines(path.join(dir, 'usage.jsonl')).filter(Boolean)) {
    const window = isObject(line.window) ? line.window : {};
    if (typeof window.to !== 'string') continue;
    const tokens = isObject(line.tokens) ? line.tokens : {};
    const snapshot = isObject(line.snapshot) ? line.snapshot : {};
    const fields = [
      { label: 'From', value: localStamp(window.from) },
      { label: 'To', value: localStamp(window.to) },
      { label: 'Session %', value: percent(snapshot.session) },
      { label: 'Weekly %', value: percent(snapshot.weekly) },
      { label: 'Tokens', value: String(sum(tokens.total)) },
      { label: 'By model', value: pairs(tokens.byModel, sum) },
      { label: 'By repo', value: pairs(tokens.byRepo, (models) => (isObject(models) ? Object.values(models).reduce((n, counts) => n + sum(counts), 0) : 0)) },
      { label: 'Error', value: line.snapshotError },
    ];
    rows.push({ kind: 'usage', id: `usage:${window.to}`, at: window.to, title: `Usage ${localStamp(window.from)} to ${localStamp(window.to)}`, fields });
  }
  return rows;
}

export default { kind: 'usage', label: 'Usage windows', files: ['usage.jsonl'], rowsOf };
