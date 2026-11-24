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
/** The bytes of one line held in memory: at least LINE_CHARS + 1 characters at four bytes each, so a cut is never at its end. */
const HEAD_BYTES = (LINE_CHARS + 1) * 4;
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
  // The current line's bytes so far, held to HEAD_BYTES: past that only its head is kept, which `clip` cuts inside.
  let pending = [];
  let held = 0;
  const hold = (bytes) => {
    const room = HEAD_BYTES - held;
    if (room <= 0) return;
    pending.push(Buffer.from(bytes.subarray(0, room)));
    held += Math.min(room, bytes.length);
  };
  const take = () => {
    number += 1;
    const text = Buffer.concat(pending).toString('utf8').replace(/\r$/, '');
    pending = [];
    held = 0;
    if (!text.trim()) return;
    kept.push({ number, text });
    if (kept.length >= 2 * LOG_TAIL) kept.splice(0, kept.length - LOG_TAIL);
  };
  try {
    const buffer = Buffer.alloc(CHUNK_BYTES);
    for (let read; (read = fs.readSync(fd, buffer, 0, CHUNK_BYTES, null)) > 0; ) {
      const chunk = buffer.subarray(0, read);
      let start = 0;
      for (let at = chunk.indexOf(NEWLINE); at !== -1; at = chunk.indexOf(NEWLINE, start)) {
        hold(chunk.subarray(start, at));
        take();
        start = at + 1;
      }
      if (start < read) hold(chunk.subarray(start));
    }
    if (held) take();
  } catch (error) {
    console.error(`[deck] archive log ${path.basename(file)} could not be read: ${error.message}`);
  } finally {
    try {
      fs.closeSync(fd);
    } catch {
      /* a close that fails leaves nothing to read differently */
    }
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
  return text.slice(0, Math.max(at, 0)).trimEnd() || null;
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
