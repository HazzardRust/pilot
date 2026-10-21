/**
 * Reading helpers shared by every area-file test (`scripts/test/audit-{agent,setup,open,
 * navigability,context}.test.mjs`, housekeeping-audit review P6): each one read a repo file
 * to text, pulled its frontmatter, found one field or one `## heading` section, and
 * flattened prose to a single line for a wrapped-phrase match. Copied five times, the same
 * five functions; this is the one copy.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { split } from '../../measure-prompt.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

/** Reads a file relative to the repository root, with line endings normalized to `\n`. */
export function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n');
}

/** The frontmatter block's lines joined by `\n`, or `''` when there is none; LF or CRLF. */
export function frontmatterOf(source) {
  return split(source).front.join('\n');
}

/** The text after the leading frontmatter block, or the whole text when there is none. */
export function bodyOf(source) {
  return split(source).body;
}

/** One frontmatter field's value, trimmed. */
export function fieldOf(source, name) {
  return new RegExp(`^${name}: (.*)$`, 'm').exec(frontmatterOf(source))?.[1]?.trim();
}

/** The text under one `## heading`, up to the next `## heading` or the end of the file. */
export function sectionOf(source, heading) {
  const start = source.indexOf(`\n## ${heading}\n`);
  if (start === -1) return '';
  const next = source.indexOf('\n## ', start + 1);
  return source.slice(start, next === -1 ? undefined : next);
}

/** Prose as one line, so a pinned phrase may wrap across source lines. */
export function flat(source) {
  return source.replace(/\s+/g, ' ');
}
