/**
 * Nothing weakened (test-body-git S1, spec 3): tests and asserts per file, at a ref against the worktree.
 *
 *     node docs/design/test-body-git/assert-count.mjs <ref> <files...>
 *
 * Counts in the source text: a test is a `test(`, `it(` or `t.test(` call; a skipped one is any of those
 * with `.skip`, `.todo`, or a `skip` / `todo` option; an assert is an `assert(` or `assert.<name>(` call.
 * A comment line (`//`, `*`) is not counted. A count is of call sites, so an assert in a loop is one.
 * Prints one row per file and exits 1 when any file has fewer tests or asserts, or more skipped, than at `<ref>`.
 */

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const TEST = /(?<![\w$.])(?:t\.)?(?:test|it)(?:\.(?:only|skip|todo))?\s*\(/g;
const SKIPPED = /(?<![\w$.])(?:t\.)?(?:test|it)\.(?:skip|todo)\s*\(|[{,]\s*(?:skip|todo)\s*:\s*(?!false\b)/g;
const ASSERT = /(?<![\w$.])assert(?:\.\w+)?\s*\(/g;

/** `{ tests, skipped, asserts }` in `text`, comment lines aside. */
export function count(text) {
  const code = text.split('\n').filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line)).join('\n');
  const n = (re) => code.match(re)?.length ?? 0;
  return { tests: n(TEST), skipped: n(SKIPPED), asserts: n(ASSERT) };
}

function atRef(ref, file) {
  try {
    return execFileSync('git', ['show', `${ref}:${file}`], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 1 << 26 });
  } catch {
    return ''; // a file new since `ref`
  }
}

function main([ref, ...files]) {
  if (!ref || ref.startsWith('-') || files.length === 0) {
    process.stderr.write('usage: assert-count.mjs <ref> <files...>\n');
    return 2;
  }
  const rows = [['file', 'tests before', 'tests after', 'skipped before', 'skipped after', 'asserts before', 'asserts after']];
  let lower = 0;
  for (const file of files.map((f) => f.replaceAll('\\', '/'))) {
    const before = count(atRef(ref, file));
    const after = count(fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '');
    if (after.tests < before.tests || after.asserts < before.asserts || after.skipped > before.skipped) lower++;
    rows.push([file, before.tests, after.tests, before.skipped, after.skipped, before.asserts, after.asserts]);
  }
  rows.splice(1, 0, rows[0].map(() => '---'));
  process.stdout.write(`${rows.map((row) => `| ${row.join(' | ')} |`).join('\n')}\n${lower} files lower\n`);
  return lower === 0 ? 0 : 1;
}

if (path.resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) process.exitCode = main(process.argv.slice(2));
