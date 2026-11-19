/**
 * The lesson report (teacher-method spec 4, 5, 8; L1, L2): one self-contained md file a teach-me
 * session takes as-is, shape-checked here and written to `<store>/lessons/<lesson id>.md`. The
 * check is a line scan, pure; the write is the one place a path is built, after the id check.
 */

import path from 'node:path';

import { atomicWriteFileSync, privateDir } from '../hooks/lib/atomic-write.js';
import { findCredential } from '../deck/store-core.mjs';
import { storeDir } from '../deck/store-dir.mjs';

export const REPORT_HEADINGS = Object.freeze([
  'Goals',
  'Your level',
  'Dot points',
  'Background',
  'Research while planning',
  'The decision to come back to',
]);

const LESSON_ID = /^itm_[0-9a-f]{12}$/;
const MAX_BYTES = 60_000;
const MIN_DOT_POINTS = 3;
const LIST_ITEM = /^\s*(?:[-*+]|\d+[.)])\s+\S/;
const HTTP = /^https?:\/\//i;
/** Link targets: inline `[t](x)` and `![t](x)`, a reference definition `[t]: x`, an autolink `<scheme:x>`. */
const LINK_TARGETS = [/\]\(\s*<?([^)\s>]*)/g, /^\s{0,3}\[[^\]]+\]:\s*<?([^\s>]+)/gm, /<([a-z][a-z0-9+.-]*:[^>\s]*)>/gi];

/** Each `## ` section's body lines by its heading text; a `# ` or `## ` heading ends a section. */
function sections(lines) {
  const out = new Map();
  let current = null;
  for (const line of lines) {
    const heading = /^##\s+(.+?)\s*#*\s*$/.exec(line);
    if (heading) {
      current = [];
      if (!out.has(heading[1])) out.set(heading[1], current);
    } else if (/^#\s/.test(line)) {
      current = null;
    } else if (current) {
      current.push(line);
    }
  }
  return out;
}

const filled = (body) => body !== undefined && body.some((line) => line.trim() !== '');

/** A section's list items, each joined with its indented continuation lines. */
function listItems(body) {
  const items = [];
  for (const line of body) {
    if (LIST_ITEM.test(line)) items.push(line.trim());
    else if (items.length > 0 && /^\s+\S/.test(line)) items[items.length - 1] += ` ${line.trim()}`;
  }
  return items;
}

/** Up to 80 characters of `text` for a refusal, withheld when it holds a credential shape. */
const shown = (text) => (findCredential(text) ? '(withheld: a credential shape)' : text.slice(0, 80) || '(empty)');

/** What is wrong with the report, one `{ rule, message }` per problem; none for a whole report. */
export function reportProblems(markdown) {
  const text = String(markdown);
  const problems = [];
  const found = sections(text.split(/\r?\n/));

  for (const heading of REPORT_HEADINGS) {
    if (!filled(found.get(heading))) {
      problems.push({ rule: 'heading', message: `no "## ${heading}" section with a line under it` });
    }
  }

  const dots = found.get('Dot points');
  if (filled(dots)) {
    const count = listItems(dots).length;
    if (count < MIN_DOT_POINTS) {
      problems.push({ rule: 'dot-points', message: `${count} dot points; at least ${MIN_DOT_POINTS}` });
    }
  }

  const goals = found.get('Goals');
  if (filled(goals)) {
    const items = listItems(goals);
    if (items.length === 0) problems.push({ rule: 'goal-check', message: 'Goals lists no goal' });
    for (const item of items) {
      if (!/checked by/i.test(item)) {
        problems.push({ rule: 'goal-check', message: `a goal without "checked by": ${shown(item)}` });
      }
    }
  }

  for (const pattern of LINK_TARGETS) {
    for (const [, target] of text.matchAll(pattern)) {
      if (!HTTP.test(target)) {
        problems.push({ rule: 'local-link', message: `a link to a non-http target: ${shown(target)}` });
      }
    }
  }

  const credential = findCredential(text);
  if (credential) {
    problems.push({ rule: 'credential', message: `it contains what looks like ${credential}; name the credential, never its value` });
  }

  const bytes = Buffer.byteLength(text, 'utf8');
  if (bytes > MAX_BYTES) problems.push({ rule: 'size', message: `${bytes} bytes; at most ${MAX_BYTES}` });

  return problems;
}

/**
 * Writes the report to `<store>/lessons/<id>.md` and returns that path. Throws on an id not shaped
 * `itm_<12 hex>` or on any problem, naming each, and writes nothing then.
 */
export function writeLessonReport(id, markdown, { store = storeDir() } = {}) {
  if (typeof id !== 'string' || !LESSON_ID.test(id)) {
    throw new Error(`a lesson id is itm_ and 12 hex digits, not ${JSON.stringify(String(id).slice(0, 40))}`);
  }
  const problems = reportProblems(markdown);
  if (problems.length > 0) {
    throw new Error(problems.map(({ rule, message }) => `${rule}: ${message}`).join('\n'));
  }
  const file = path.join(privateDir(path.join(store, 'lessons')), `${id}.md`);
  atomicWriteFileSync(file, String(markdown));
  return file;
}
