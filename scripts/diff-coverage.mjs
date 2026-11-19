/**
 * Diff coverage from Node's own raw V8 coverage (coverage-cell S1; spec 3, 4; A1, A6). Run from
 * the worktree under review:
 *
 *   node scripts/diff-coverage.mjs <v8-dir> <base>
 *
 * reads every JSON file Node wrote into <v8-dir> (NODE_V8_COVERAGE) and `git diff -U0 <base>...HEAD`,
 * and prints the changed lines no process ran, by file, then `Diff coverage: <n>% (...)`. A changed
 * line is an added line of a .js .mjs .cjs file, blank and comment-only lines aside; it is covered
 * when the innermost V8 range spanning it ran in any coverage file. Exit 2 on a bad base or an
 * unreadable <v8-dir>; nothing is fetched and nothing is written.
 */

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const BASE = /^[A-Za-z0-9._/][A-Za-z0-9._/-]*$/;
const MEASURED = /\.(js|mjs|cjs)$/;
const NOT_MEASURED = /\.(ts|tsx|mts|cts|jsx)$/;
const UNCOUNTED = /^(\/\/|\/\*|\*\/|\*(\s|$))/;

class Usage extends Error {}

/** A path as one key across `file:///C:/…`, `C:\…` and git's `c:/…`. */
const key = (p) => {
  const abs = path.resolve(p).replaceAll('\\', '/');
  return process.platform === 'win32' ? abs.toLowerCase() : abs;
};

/** The changed, counted lines per file of `git diff -U0 base...HEAD`, and the unmeasured files. */
function changedLines(cwd, base) {
  const git = (args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 1 << 30, windowsHide: true });
  const root = git(['rev-parse', '--show-toplevel']).trim();
  const diff = git(['-c', 'core.quotePath=false', 'diff', '-U0', '--no-color', '--no-ext-diff', '--no-textconv',
    '--src-prefix=a/', '--dst-prefix=b/', `${base}...HEAD`, '--']);
  const files = new Map();
  const notMeasured = [];
  let lines = null;
  let next = 0;
  let left = 0; // added lines still due in this hunk, so a `+++`-led added line is not a header
  for (const line of diff.split('\n')) {
    if (left > 0 && line.startsWith('+')) {
      left--;
      const text = line.slice(1).trim();
      if (lines && text && !UNCOUNTED.test(text)) lines.push(next);
      next++;
    } else if (line.startsWith('+++ ')) {
      // Git ends a name holding a space with a tab, and C-quotes one holding `"` or `\`.
      const raw = line.slice(4).replace(/\t$/, '');
      const name = (raw.startsWith('"') ? JSON.parse(raw) : raw).replace(/^b\//, '');
      lines = null;
      if (name === '/dev/null') continue;
      if (MEASURED.test(name)) files.set(name, lines = []);
      else if (NOT_MEASURED.test(name)) notMeasured.push(name);
    } else if (line.startsWith('@@ ')) {
      const [, start, count] = /^@@ -\S+ \+(\d+)(?:,(\d+))? @@/.exec(line);
      next = Number(start);
      left = count === undefined ? 1 : Number(count);
    }
  }
  return { root, files, notMeasured };
}

/** Every block range Node recorded per script, keyed by path, across all coverage files. */
function readCoverage(v8Dir, wanted) {
  const runs = new Map();
  for (const name of fs.readdirSync(v8Dir).filter((n) => n.endsWith('.json')).sort()) {
    const { result = [] } = JSON.parse(fs.readFileSync(path.join(v8Dir, name), 'utf8'));
    for (const script of result) {
      if (!script.url?.startsWith('file:')) continue;
      const k = key(fileURLToPath(script.url));
      if (!wanted.has(k)) continue;
      const ranges = script.functions.flatMap((f) => f.ranges)
        .sort((a, b) => a.startOffset - b.startOffset || b.endOffset - a.endOffset);
      if (!runs.has(k)) runs.set(k, []);
      runs.get(k).push(ranges);
    }
  }
  return runs;
}

/** True when, in one process, the innermost range spanning [start, end) ran. */
const ran = (ranges, start, end) => {
  let count = 0;
  for (const r of ranges) if (r.startOffset <= start && r.endOffset >= end) count = r.count;
  return count > 0;
};

export function diffCoverage({ cwd, v8Dir, base }) {
  if (typeof base !== 'string' || !BASE.test(base)) throw new Usage(`diff-coverage: base ${JSON.stringify(base)} is not a ref`);
  try {
    if (!fs.statSync(v8Dir).isDirectory()) throw new Error('not a directory');
  } catch (error) {
    throw new Usage(`diff-coverage: cannot read ${v8Dir}: ${error.message}`);
  }
  const { root, files: changed, notMeasured } = changedLines(cwd, base);
  const paths = new Map([...changed.keys()].map((file) => [key(path.join(root, file)), file]));
  const runs = readCoverage(v8Dir, new Set(paths.keys()));
  const files = [];
  for (const [k, file] of paths) {
    const counted = changed.get(file);
    // A symlinked source could point outside the worktree; it is not read.
    if (!counted.length || fs.lstatSync(path.join(root, file)).isSymbolicLink()) continue;
    const source = fs.readFileSync(path.join(root, file), 'utf8');
    const starts = [0];
    for (let i = source.indexOf('\n'); i !== -1; i = source.indexOf('\n', i + 1)) starts.push(i + 1);
    const uncovered = counted.filter((n) => {
      const text = source.slice(starts[n - 1], n < starts.length ? starts[n] : source.length);
      const start = starts[n - 1] + (text.length - text.trimStart().length);
      const end = starts[n - 1] + text.trimEnd().length;
      return !(runs.get(k) ?? []).some((ranges) => ran(ranges, start, end));
    });
    files.push({ file, covered: counted.length - uncovered.length, total: counted.length, uncovered });
  }
  const total = files.reduce((n, f) => n + f.total, 0);
  return { covered: files.reduce((n, f) => n + f.covered, 0), total, files, notMeasured };
}

export function formatDiffCoverage({ covered, total, files, notMeasured }) {
  const out = files.filter((f) => f.uncovered.length)
    .map((f) => `${f.file}: ${f.covered} of ${f.total} covered, uncovered lines ${f.uncovered.join(', ')}`);
  if (notMeasured.length) out.push(`Not measured (no V8 line coverage): ${notMeasured.join(', ')}`);
  out.push(total ? `Diff coverage: ${Math.floor((covered / total) * 100)}% (${covered} of ${total} changed lines)`
    : 'Diff coverage: no changed lines to count');
  return out.join('\n');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [v8Dir, base] = process.argv.slice(2);
  try {
    if (!v8Dir) throw new Usage('usage: node scripts/diff-coverage.mjs <v8-dir> <base>');
    console.log(formatDiffCoverage(diffCoverage({ cwd: process.cwd(), v8Dir, base })));
  } catch (error) {
    console.error(error.message);
    process.exitCode = error instanceof Usage ? 2 : 1;
  }
}
