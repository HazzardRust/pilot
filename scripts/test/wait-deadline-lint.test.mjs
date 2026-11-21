/**
 * S2 of wait-deadlines: no command the crew reads under agents/ skills/ rules/ scripts/ shows an unbounded wait
 * (spec 2). Every fenced block and inline code span of each Markdown file goes through the hook's own recogniser.
 */

import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { unboundedWaits } = require('../../hooks/shell-write-guard.js');

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const DIRS = ['agents', 'skills', 'rules', 'scripts'];

function markdownFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return e.name === 'node_modules' ? [] : markdownFiles(p);
    return e.name.endsWith('.md') ? [p] : [];
  });
}

/** Each fenced block's body, then each inline code span of the text outside the fences. */
function codeOf(text) {
  const blocks = [];
  const prose = text.replace(/^ {0,3}(`{3,}|~{3,})[^\n]*\n([\s\S]*?)^ {0,3}\1[ \t]*$/gm, (_m, _f, body) => {
    blocks.push(body);
    return '';
  });
  for (const m of prose.matchAll(/(`+)([^`][\s\S]*?)\1(?!`)/g)) blocks.push(m[2]);
  return blocks;
}

test('the repository shows no unbounded wait', () => {
  const files = DIRS.flatMap((d) => markdownFiles(path.join(ROOT, d)));
  assert.ok(files.length > 50, `the walk found ${files.length} files`);
  const hits = [];
  for (const file of files) {
    for (const code of codeOf(fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n'))) {
      for (const w of unboundedWaits(code)) hits.push(`${path.relative(ROOT, file)}: ${w.form} ${w.marker || ''}`);
    }
  }
  assert.deepStrictEqual(hits, []);
});
