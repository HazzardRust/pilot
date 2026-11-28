/**
 * The deck's and the wrapper's own logs as archive rows (archive-page spec 3, 6, 8; A6): the newest `LOG_TAIL` lines
 * of each, one row per line. The file is read whole (A6, F7 on itm_973b6c14330a); a row holds one line, clipped, never
 * the whole log. A line's time is its leading ISO stamp where one parses, the file's mtime otherwise.
 * Credentials are withheld by `archiveRows`, on every string of every row (L5).
 */

import fs from 'node:fs';
import path from 'node:path';

export const LOG_TAIL = 2000;

const FILES = ['deck.log', 'wrapper.log', 'wrapper.log.old'];
const TITLE_CHARS = 120;
/** A row holds one line, never a whole log that has no line breaks (S9 prohibited). */
const LINE_CHARS = 4096;
const STAMP = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2}))(?=\s|$)/;

/** The newest `LOG_TAIL` non-blank lines of `file` with their 1-based numbers, or none where it cannot be read. */
function tailOf(file) {
  let text;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch (error) {
    if (error.code !== 'ENOENT') console.error(`[deck] archive log ${path.basename(file)} could not be read: ${error.message}`);
    return [];
  }
  return text
    .split('\n')
    .map((line, at) => ({ number: at + 1, text: line.replace(/\r$/, '') }))
    .filter((line) => line.text.trim())
    .slice(-LOG_TAIL);
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
