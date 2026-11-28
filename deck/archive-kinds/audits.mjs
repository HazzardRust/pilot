/**
 * Audit files as archive rows (archive-page spec 3, 6): each `audits/<repo>/<stamp>.json` report is one row, and each
 * `record.json` is one row. The `.md` renderings repeat the JSON and are not read. Read-only; an unreadable file is
 * skipped, never fatal.
 */

import fs from 'node:fs';
import path from 'node:path';

import { localStamp } from '../archive-time.mjs';

const TOP_ROWS = 5;

const text = (value) => (value === undefined || value === null ? '' : String(value));

const readJson = (file) => {
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    return parsed !== null && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
};

const mtimeIso = (file) => {
  try {
    return fs.statSync(file).mtime.toISOString();
  } catch {
    return null;
  }
};

const entries = (dir) => {
  try {
    return fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
};

/** `finding — effort` for one report row; the effort (S, M, L) is the size the report gives it. */
const topLine = (row) => `${text(row?.finding)} — ${text(row?.effort)}`;

function reportRow(file, folder, json) {
  const rows = Array.isArray(json.rows) ? json.rows : [];
  const startedAt = typeof json.startedAt === 'string' && !Number.isNaN(Date.parse(json.startedAt)) ? json.startedAt : null;
  const name = path.basename(file);
  return {
    kind: 'audit-file',
    id: `audits/${folder}/${name}`,
    at: startedAt ?? mtimeIso(file),
    title: `Audit report ${name}`,
    fields: [
      { label: 'Repo', value: text(json.repo) || folder },
      { label: 'Started', value: localStamp(json.startedAt) },
      { label: 'Rows', value: String(rows.length) },
      ...rows.slice(0, TOP_ROWS).map((row) => ({ label: 'Top rows', value: topLine(row) })),
    ],
  };
}

function recordRow(file, folder, json, repo) {
  return {
    kind: 'audit-file',
    id: `audits/${folder}/record.json`,
    at: mtimeIso(file),
    title: 'Audit record',
    fields: [
      { label: 'Repo', value: repo || folder },
      { label: 'Offers', value: String(Array.isArray(json.offers) ? json.offers.length : 0) },
      { label: 'Hand-offs', value: String(Array.isArray(json.handoffs) ? json.handoffs.length : 0) },
    ],
  };
}

function rowsOf({ dir }) {
  const rows = [];
  for (const folder of entries(path.join(dir, 'audits'))) {
    if (!folder.isDirectory()) continue;
    const base = path.join(dir, 'audits', folder.name);
    const reports = [];
    let record = null;
    for (const entry of entries(base).filter((e) => e.isFile() && e.name.endsWith('.json')).sort((a, b) => a.name.localeCompare(b.name))) {
      const file = path.join(base, entry.name);
      const json = readJson(file);
      if (json === null) continue;
      if (entry.name === 'record.json') record = { file, json };
      else reports.push({ file, json });
    }
    for (const { file, json } of reports) rows.push(reportRow(file, folder.name, json));
    // The record carries no repo of its own: it reads as the repo its folder's reports name.
    if (record) rows.push(recordRow(record.file, folder.name, record.json, text(reports.find((r) => r.json.repo)?.json.repo)));
  }
  return rows;
}

export default { kind: 'audit-file', label: 'Audit reports', files: ['audits/*/*.json'], rowsOf };
