/**
 * Every child process the pilot starts is started hidden. A console program started
 * without `windowsHide: true` from a process with no console (the deck daemon) opens a
 * window of its own; one rule, enforced by scanning the sources, keeps a new unhidden
 * call from landing anywhere in the trees the pilot runs.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const TREES = ['scripts', 'deck', 'bin', 'hooks'];

const CHILD_PROCESS = new Set(['spawn', 'spawnSync', 'execFileSync', 'execFile', 'execSync', 'exec', 'fork']);

/**
 * Each child-process call's text, from the callee to its matching ')'. A match on a comment
 * line is prose, and a call of a `spawn*` function declared in the scanned trees (`declared`)
 * is the pilot's own code, not a child start; a child_process name is never declared away.
 */
function childStarts(source, declared = []) {
  const callee = /(?<![.\w$])(spawn\w*|execFileSync|execFile|execSync|exec|fork)\s*\(/g;
  const calls = [];
  for (const { index, 1: name } of source.matchAll(callee)) {
    const line = source.slice(source.lastIndexOf('\n', index) + 1, index);
    if (/^\s*(\/\/|\/\*|\*)/.test(line) && !line.includes('*/')) continue;
    if (declared.includes(name) && !CHILD_PROCESS.has(name)) continue;
    let depth = 0;
    for (let at = source.indexOf('(', index); at < source.length; at++) {
      if (source[at] === '(') depth++;
      if (source[at] === ')' && --depth === 0) {
        calls.push(source.slice(index, at + 1));
        break;
      }
    }
  }
  return calls;
}

const EXEMPT = [
  {
    file: 'deck/run.mjs',
    callee: 'spawn',
    inside: 'startPlain',
    why: "the user's interactive `claude`, started with inherited stdio in their own terminal (L3)",
  },
];

function scanned() {
  const files = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
      const rel = `${dir}/${entry.name}`;
      if (entry.isDirectory()) {
        if (entry.name !== 'test' && entry.name !== 'node_modules') walk(rel);
      } else if (/\.(mjs|js|cjs)$/.test(entry.name) && !/\.test\./.test(entry.name)) files.push(rel);
    }
  };
  for (const tree of TREES) walk(tree);
  return files;
}

const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

/** Every function name the sources declare: `spawnCount` counts spawns, it starts none. */
const declaredIn = (sources) => sources.flatMap((source) => [...source.matchAll(/\bfunction\s*\*?\s*([\w$]+)\s*\(/g)].map((m) => m[1]));

/** The text of a top-level function, from its declaration to its closing brace. */
function body(source, name) {
  const start = source.indexOf(`function ${name}(`);
  if (start < 0) return '';
  const end = source.indexOf('\n}\n', start);
  return source.slice(start, end < 0 ? source.length : end + 2);
}

const exempted = (file, source) =>
  EXEMPT.filter((entry) => entry.file === file).flatMap(({ callee, inside }) =>
    childStarts(body(source, inside)).filter((call) => call.startsWith(`${callee}(`)),
  );

test('childStarts finds multi-line and injected calls', () => {
  const fixture = [
    'const child = spawn(',
    "  'git',",
    "  ['status'],",
    '  { windowsHide: true },',
    ');',
    'spawnOpener(url, { windowsHide: true });',
    'function spawnChild(command) { return command; }',
    "const term = pty.spawn('claude', [], {});",
    'const hit = /a(b)/.exec(text);',
    '/**',
    ' * sync spawns (spawnSync, execSync) publish nothing',
    ' */',
    'const lines = spawnLines(count);',
    "spawn('git', ['log'], {});",
    "/* a note */ spawn('gh', []);",
  ].join('\n');

  assert.deepEqual(childStarts(fixture, ['spawnLines', 'spawnChild', 'spawn']), [
    "spawn(\n  'git',\n  ['status'],\n  { windowsHide: true },\n)",
    'spawnOpener(url, { windowsHide: true })',
    "spawn('git', ['log'], {})",
    "spawn('gh', [])",
  ]);
});

test('every child the pilot starts has its console hidden', () => {
  const files = scanned();
  // The two install scripts were the first pinned (ecebaa7b); the rule still covers them.
  assert.ok(files.includes('scripts/install-command.mjs') && files.includes('scripts/install-path.mjs'));

  const sources = new Map(files.map((file) => [file, read(file)]));
  const declared = declaredIn([...sources.values()]);
  const unhidden = [];
  for (const [file, source] of sources) {
    const exempt = exempted(file, source);
    for (const call of childStarts(source, declared)) {
      if (exempt.includes(call) || /windowsHide: true/.test(call)) continue;
      unhidden.push(`${file}: ${call.split('\n')[0]}`);
    }
  }
  assert.deepEqual(unhidden, [], `children started without windowsHide: true:\n${unhidden.join('\n')}`);
});

const MODULE = String.raw`['"](node:)?child_process['"]`;
// A CommonJS require destructured into the names themselves (`const { spawn } = require(...)`) keeps
// them visible, but only when the require is the whole right-hand side: a member call after it is not.
const IMPORTED = new RegExp(String.raw`import\s+(\*\s*as\s+)?\w+\s+from\s+${MODULE}|(?<!\{[\w\s,]*\}\s*=\s*)require\(\s*${MODULE}\s*\)|require\(\s*${MODULE}\s*\)(?=\s*\.)|import\(\s*${MODULE}\s*\)`);

test('a destructured require is seen only as the whole right-hand side', () => {
  assert.equal(IMPORTED.test("const { execFileSync } = require('child_process');"), false);
  assert.equal(IMPORTED.test("const cp = require('node:child_process');"), true);
  assert.equal(IMPORTED.test("const { stdout } = require('child_process').spawnSync('x');"), true);
});

test('no scanned file reaches child_process by a name the scan cannot see', () => {
  const imported = IMPORTED;
  const renamed = /(?<![\w$])(spawn\w*|exec\w*|fork)\s+as\s+(?!spawn)\w+/;
  const bound = /(?<![\w$])([\w$]+)\s*=\s*(?:spawn|spawnSync|execFileSync|execFile|execSync|exec|fork)\b(?!\s*\()/g;
  const callee = /^(spawn\w*|execFileSync|execFile|execSync|exec|fork)$/;
  const aliased = scanned().filter((file) => {
    const source = read(file);
    return imported.test(source) || renamed.test(source) || [...source.matchAll(bound)].some((m) => !callee.test(m[1]));
  });
  assert.deepEqual(aliased, [], `use child_process names directly, without renaming:\n${aliased.join('\n')}`);
});

test('the one exemption is the interactive session', () => {
  assert.equal(EXEMPT.length, 1);
  const [{ file, callee }] = EXEMPT;
  const calls = exempted(file, read(file));
  assert.equal(calls.length, 1, `${file} no longer starts its interactive session with ${callee}(`);
  assert.match(calls[0], /stdio: 'inherit'/);
});
