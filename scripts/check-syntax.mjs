/**
 * The gate's syntax check (audit-f6 spec 1-6; L1-L5, A1-A3). `syntaxErrors(cwd)` starts one child,
 * `node --experimental-vm-modules --disable-warning=ExperimentalWarning <this file> <cwd>`, which
 * parses every checked file with V8 in process, runs none of them, and prints one JSON line
 * `{ files, ms, errors }`. Checked files are `git ls-files -co --exclude-standard -- '*.mjs' '*.js'`,
 * paths deleted from disk skipped. Detection matches `node --check`: a `.mjs` file is ESM only; a
 * `.js` file is ESM when it parses as one, else CJS. A fault is `{ file, line, message }`, `file`
 * relative to `cwd` with forward slashes. The child needs the flag because `vm.SourceTextModule`
 * is undefined without it (A1); a child that cannot start or prints no result throws (L4).
 */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const SELF = fileURLToPath(import.meta.url);
/** The CJS wrapper's parameters, so a top-level `return` parses as it does under `require`. */
const CJS_PARAMS = ['exports', 'require', 'module', '__filename', '__dirname'];
const firstLine = (text) => String(text ?? '').split('\n').find((line) => line.trim()) ?? '';

/**
 * `{ files, ms, errors }` for the checked files under `cwd`, from one child; `ms` is the wall time
 * of that child. Throws when the child cannot start or prints no result, so the check never passes by not running.
 */
export function syntaxErrors(cwd, { spawn = spawnSync } = {}) {
  const started = Date.now();
  const child = spawn(process.execPath, ['--experimental-vm-modules', '--disable-warning=ExperimentalWarning', SELF, cwd], {
    encoding: 'utf8',
    windowsHide: true,
    maxBuffer: 64 * 1024 * 1024,
  });
  if (child.error) throw child.error;
  let result;
  try {
    result = JSON.parse(String(child.stdout ?? '').trim().split('\n').at(-1));
  } catch {
    // Not JSON: fall through to the throw below.
  }
  if (!Array.isArray(result?.errors) || !Number.isInteger(result?.files)) {
    throw new Error(`no result from the child (exit ${child.status ?? child.signal}): ${firstLine(child.stderr) || 'no output'}`);
  }
  return { files: result.files, ms: Date.now() - started, errors: result.errors };
}

/** The checked files under `cwd`, relative with forward slashes, sorted, each present on disk. */
function checkedFiles(cwd) {
  const listed = spawnSync('git', ['ls-files', '-co', '--exclude-standard', '-z', '--', '*.mjs', '*.js'], {
    cwd,
    encoding: 'utf8',
    windowsHide: true,
    maxBuffer: 64 * 1024 * 1024,
  });
  if (listed.error) throw listed.error;
  if (listed.status !== 0) throw new Error(`git ls-files exited ${listed.status}: ${firstLine(listed.stderr)}`);
  const files = new Set(listed.stdout.split('\0').filter(Boolean));
  return [...files].filter((file) => fs.existsSync(`${cwd}/${file}`)).sort();
}

/** The SyntaxError `compile` throws, or undefined when it parses; any other error is rethrown. */
function parseError(compile) {
  try {
    compile();
    return undefined;
  } catch (err) {
    if (err instanceof SyntaxError || err?.name === 'SyntaxError') return err;
    throw err;
  }
}

const moduleError = (source) => parseError(() => new vm.SourceTextModule(source, { identifier: 'check' }));

/**
 * The line of `err`, the ESM parse error of `source`. `vm.SourceTextModule` gives no location, so
 * it is the shortest run of leading lines that fails with the same message, found by halving:
 * V8 stops at the first bad token, and a shorter run either parses or ends early. An
 * `Unexpected end of input` is at the last line, where V8 places it.
 */
function moduleLine(source, err) {
  const lines = source.split('\n');
  if (/^Unexpected end of input$/.test(err.message)) return lines.length;
  let [low, high] = [1, lines.length];
  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    if (moduleError(lines.slice(0, mid).join('\n'))?.message === err.message) high = mid;
    else low = mid + 1;
  }
  return low;
}

/** The line of `err`, raised compiling `file` as CJS: from its stack's `<file>:<line>` head, 0 when it has none. */
function scriptLine(err, file) {
  const head = String(err.stack ?? '').split('\n')[0];
  const line = head.startsWith(`${file}:`) ? Number(head.slice(file.length + 1)) : NaN;
  return Number.isInteger(line) ? line : 0;
}

/** The fault in `file` under `cwd`, or undefined when it parses as Node would load it. */
function faultIn(cwd, file) {
  // Node strips a byte-order mark; a hashbang becomes a comment so the line numbers stay.
  const source = fs.readFileSync(`${cwd}/${file}`, 'utf8').replace(/^﻿/, '').replace(/^#!/, '//');
  const esm = moduleError(source);
  const asModule = () => ({ file, line: moduleLine(source, esm), message: `SyntaxError: ${esm.message}` });
  if (!esm) return undefined;
  if (file.endsWith('.mjs')) return asModule();
  const cjs = parseError(() => vm.compileFunction(source, CJS_PARAMS, { filename: file }));
  if (!cjs) return undefined;
  // A CJS error that names module syntax is how Node detects ESM, so the ESM error is the one Node would throw at load.
  // `node --check` stops there and passes such a file (Node 26.1); the gate does not.
  if (/\b(import|export|await)\b/.test(cjs.message)) return asModule();
  return { file, line: scriptLine(cjs, file), message: `SyntaxError: ${cjs.message}` };
}

/** The CLI the child runs: one JSON line for `cwd`. */
function main(cwd) {
  const started = Date.now();
  const files = checkedFiles(cwd);
  const errors = files.map((file) => faultIn(cwd, file)).filter(Boolean);
  process.stdout.write(`${JSON.stringify({ files: files.length, ms: Date.now() - started, errors })}\n`);
}

if (process.argv[1] && fs.realpathSync(process.argv[1]) === fs.realpathSync(SELF)) {
  if (typeof vm.SourceTextModule !== 'function') {
    process.stderr.write('check-syntax: vm.SourceTextModule is undefined; run node with --experimental-vm-modules\n');
    process.exitCode = 1;
  } else if (!process.argv[2]) {
    process.stderr.write('check-syntax: usage: node --experimental-vm-modules scripts/check-syntax.mjs <cwd>\n');
    process.exitCode = 1;
  } else {
    main(process.argv[2]);
  }
}
