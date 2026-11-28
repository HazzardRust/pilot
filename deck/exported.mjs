/**
 * The exporting deck warns its queue may live elsewhere (portable-store spec 10, A3, L7). `pilot store export` writes
 * `exported.json` beside the store (S4); this reads it and never writes it. The deck's start posts one notice per
 * export, remembered in its own machine-only `exported-noticed.json`, and `pilot doctor` names the export in a row.
 * Neither refuses anything: a store that left is told about, never locked (A3).
 */

import fs from 'node:fs';
import path from 'node:path';

import { atomicWriteFileSync } from '../hooks/lib/atomic-write.js';

const MARK_FILE = 'exported.json';
const NOTICED_FILE = 'exported-noticed.json';
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;

const isTime = (at) => typeof at === 'string' && ISO.test(at) && !Number.isNaN(Date.parse(at));

/** The `at` field of `<dir>/<name>` when it is an ISO time, with the rest of the object; null when absent or not one. */
function readStamped(dir, name) {
  try {
    const value = JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8'));
    return isTime(value?.at) ? value : null;
  } catch {
    return null;
  }
}

/** The export mark S4 writes, or null when there is none or it is not one. */
export function exportedMark(dir) {
  const mark = readStamped(dir, MARK_FILE);
  return mark && typeof mark.file === 'string' ? { at: mark.at, file: mark.file } : null;
}

/** The notice for `mark`, or null when there is no mark or the last notice was for it or a later one. */
export function exportedNotice(mark, lastNoticeAt) {
  if (!mark) return null;
  if (isTime(lastNoticeAt) && Date.parse(mark.at) <= Date.parse(lastNoticeAt)) return null;
  return {
    title: 'This store was exported',
    body:
      `\`pilot store export\` wrote ${mark.file} at ${mark.at}. If it was imported on another machine, this queue ` +
      'may now be owned there: work each ticket on one machine only, and export from there to bring it back.',
  };
}

/** The deck start's one notice per export: posted with `post({ kind, title, body, options })` and remembered. */
export function noticeExported(dir, post) {
  const mark = exportedMark(dir);
  const notice = exportedNotice(mark, readStamped(dir, NOTICED_FILE)?.at ?? null);
  if (!notice) return null;
  // Posted before it is remembered: a write that fails repeats the notice at the next start, never loses it.
  const item = post({ kind: 'question', ...notice, options: ['Seen'] });
  atomicWriteFileSync(path.join(dir, NOTICED_FILE), `${JSON.stringify({ at: mark.at, item: item.id })}\n`);
  return item;
}

/** `pilot doctor`'s `exported` row as a list: one `warn` row naming the mark's time, none without a mark. */
export function exportedRows(dir) {
  const mark = exportedMark(dir);
  if (!mark) return [];
  return [{ name: 'exported', verdict: 'warn', detail: `exported at ${mark.at} to ${mark.file}; the queue may now be owned where it was imported` }];
}
