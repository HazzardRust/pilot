/**
 * The deck's and the wrapper's own logs as archive rows (archive-page spec 3, 6, 8; A6): the newest `LOG_TAIL` lines
 * of each, one row per line. The file is read in chunks and only the tail's lines are kept, so a long log never sits
 * whole in memory or in a row. A line's time is its leading ISO stamp where one parses, the file's mtime otherwise.
 * Credentials are withheld by `archiveRows`, on every string of every row (L5).
 */

import fs from 'node:fs';
import path from 'node:path';

export const LOG_TAIL = 2000;

const FILES = ['deck.log', 'wrapper.log', 'wrapper.log.old'];
const TITLE_CHARS = 120;
/** A row holds one line, never a whole log that has no line breaks (S9 prohibited). */
const LINE_CHARS = 4096;
const CHUNK_BYTES = 64 * 1024;
const NEWLINE = 0x0a;
const STAMP = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2}))(?=\s|$)/;

/** The newest `LOG_TAIL` non-blank lines of `file` with their 1-based numbers, or none where it cannot be read. */
function tailOf(file) {
  let fd;
  try {
    fd = fs.openSync(file, 'r');
  } catch (error) {
    if (error.code !== 'ENOENT') console.error(`[deck] archive log ${path.basename(file)} could not be read: ${error.message}`);
    return [];
  }
  const kept = [];
  let number = 0;
  let pending = [];
  const take = (bytes) => {
    number += 1;
    const text = bytes.toString('utf8').replace(/\r$/, '');
    if (!text.trim()) return;
    kept.push({ number, text });
    if (kept.length >= 2 * LOG_TAIL) kept.splice(0, kept.length - LOG_TAIL);
  };
  try {
    const buffer = Buffer.alloc(CHUNK_BYTES);
    for (let read; (read = fs.readSync(fd, buffer, 0, CHUNK_BYTES, null)) > 0; ) {
      let start = 0;
      for (let at = buffer.indexOf(NEWLINE, 0); at !== -1 && at < read; at = buffer.indexOf(NEWLINE, at + 1)) {
        take(Buffer.concat([...pending, buffer.subarray(start, at)]));
        pending = [];
        start = at + 1;
      }
      if (start < read) pending.push(Buffer.from(buffer.subarray(start, read)));
    }
    if (pending.length) take(Buffer.concat(pending));
  } catch (error) {
    console.error(`[deck] archive log ${path.basename(file)} could not be read: ${error.message}`);
  } finally {
    fs.closeSync(fd);
  }
  return kept.slice(-LOG_TAIL);
}

/**
 * `text` cut to at most `limit` characters at a whitespace, or null where its first word alone is longer. A cut is
 * never inside a word, so it never leaves the head of a token whose tail `findCredential` would have needed (L5).
 */
function clip(text, limit) {
  if (text.length <= limit) return text;
  const at = text.slice(0, limit + 1).search(/\s\S*$/);
  return at > 0 ? text.slice(0, at).trimEnd() : null;
}

/** The line's own leading stamp, or `fallback`. */
function stampOf(text, fallback) {
  const stamp = STAMP.exec(text)?.[1];
  const ms = stamp ? Date.parse(stamp) : NaN;
  return Number.isNaN(ms) ? fallback : new Date(ms).toISOString();
}

function rowsOf({ dir }) {
  return FILES.flatMap((name) => {
    const file = path.join(dir, name);
    const lines = tailOf(file);
    if (!lines.length) return [];
    const mtime = fs.statSync(file, { throwIfNoEntry: false })?.mtime?.toISOString() ?? null;
    return lines.map(({ number, text }) => ({
      kind: 'log',
      id: `${name}:${number}`,
      at: stampOf(text, mtime),
      title: clip(text, TITLE_CHARS) ?? `${name}:${number}`,
      fields: [
        { label: 'File', value: name },
        { label: 'Line', value: clip(text, LINE_CHARS) ?? `(a line of ${text.length} characters with no break in its first ${LINE_CHARS})` },
      ],
    }));
  });
}

export default { kind: 'log', label: 'Logs', files: FILES, rowsOf };
