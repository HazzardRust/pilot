/**
 * project-glossary S6 (spec 10, 11; L12): `GLOSSARY-LOG.md` is a stored, bounded log of glossary
 * changes, one row per change naming its run in words. Every test goes through `appendLog`,
 * `readLog`, `checkLog`, `queryLog` or the `glossary-log.mjs` CLI; each log is built by
 * `appendLog`, the program that writes the real one.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { appendLog, checkLog, queryLog, readLog } from '../glossary-log.mjs';
import { parseGlossary } from '../glossary.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SCRIPT = path.join(ROOT, 'scripts', 'glossary-log.mjs');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const row = (change, term, run = 'some-run', date = '2026-11-21') => ({ date, run, change, term });
const logOf = (...rows) => rows.reduce((text, r) => appendLog(text, r), '');
const glossaryOf = (...terms) => terms.map((t) => `**${t}**:\nA definition.\n`).join('\n');
const cli = (cwd, ...args) => spawnSync(process.execPath, [SCRIPT, ...args], { cwd, encoding: 'utf8' });

test('three appends are three rows naming their run', () => {
  const text = logOf(row('added', 'Widget', 'run-one'), row('changed', 'Widget', 'run-two'), row('removed', 'Widget', 'run-three'));
  assert.deepEqual(readLog(text), [
    { date: '2026-11-21', run: 'run-one', change: 'added', term: 'Widget' },
    { date: '2026-11-21', run: 'run-two', change: 'changed', term: 'Widget' },
    { date: '2026-11-21', run: 'run-three', change: 'removed', term: 'Widget' },
  ]);
  assert.doesNotMatch(text, /\b[0-9a-f]{7,40}\b/);
});

test('the log is capped', () => {
  let text = '';
  for (let i = 1; i <= 201; i += 1) text = appendLog(text, row('added', `Term ${i}`));
  const rows = readLog(text);
  assert.equal(rows.length, 200);
  assert.equal(rows[0].term, 'Term 2');
  assert.equal(rows[199].term, 'Term 201');
});

test('a date that is not on the calendar is refused', () => {
  assert.throws(() => appendLog('', row('added', 'Widget', 'r', '2026-02-31')), /date/);
  assert.throws(() => appendLog('', row('added', 'Widget', 'r', '2025-02-29')), /date/);
  assert.equal(readLog(appendLog('', row('added', 'Widget', 'r', '2024-02-29')))[0].date, '2024-02-29');
});

test('an append keeps a CRLF log CRLF', () => {
  const crlf = logOf(row('added', 'A')).replace(/\n/g, '\r\n');
  const next = appendLog(crlf, row('added', 'B'));
  assert.equal(next, logOf(row('added', 'A'), row('added', 'B')).replace(/\n/g, '\r\n'));
});

test('a malformed row or argument is refused', () => {
  assert.throws(() => appendLog('', row('added', 'Pipe | term')), /term/);
  assert.throws(() => appendLog('', row('added', 'Widget', 'abc def')), /run/);
  assert.throws(() => appendLog('', row('renamed', 'Widget')), /change/);
  assert.throws(() => appendLog('', row('added', 'Widget', 'r', '21-11-2026')), /date/);
  const text = logOf(row('added', 'Widget'));
  assert.throws(() => readLog(`${text}| 2026-11-21 | r | added |\n`), /line 8/);
});

test('a disagreement fails the check', () => {
  const log = logOf(row('added', 'Ghost'), row('added', 'Kept'), row('removed', 'Kept'));
  const problems = checkLog(log, glossaryOf('Kept'));
  assert.equal(problems.length, 2);
  assert.match(problems[0].problem, /Ghost/);
  assert.match(problems[1].problem, /Kept/);
  assert.equal(problems[0].line, 7);
  assert.equal(problems[1].line, 9);
});

test('a row without a run and an over-cap log fail the check', () => {
  const log = logOf(row('added', 'Kept')).replace('some-run', '');
  assert.deepEqual(checkLog(log, glossaryOf('Kept')).map(({ line }) => line), [7]);
  // past the cap only by hand: appendLog never writes 201 rows.
  const one = logOf(row('added', 'Kept'));
  const rowLine = one.trimEnd().split('\n').at(-1);
  const big = `${one}${`${rowLine}\n`.repeat(200)}`;
  assert.equal(readLog(big).length, 201);
  assert.equal(checkLog(big, glossaryOf('Kept')).length, 1);
});

test('a term with no row passes', () => {
  const log = logOf(row('added', 'Logged'));
  const glossary = glossaryOf('Logged', 'Dropped by the cap');
  assert.deepEqual(parseGlossary(glossary).map(({ term }) => term), ['Logged', 'Dropped by the cap']);
  assert.deepEqual(checkLog(log, glossary), []);
});

test('read in part', () => {
  let text = logOf(row('added', 'Glossary', 'first'));
  for (let i = 1; i <= 30; i += 1) text = appendLog(text, row('added', `Other ${i}`));
  text = appendLog(text, row('changed', 'Glossary', 'second'));
  const rows = readLog(text);
  assert.deepEqual(queryLog(rows, { term: 'Glossary' }).map((r) => r.run), ['second', 'first']);
  const newest = queryLog(rows);
  assert.equal(newest.length, 20);
  assert.equal(newest[0].term, 'Glossary');
  assert.equal(newest[1].term, 'Other 30');
  assert.equal(queryLog(rows, { limit: 3 }).length, 3);
});

test("the repository's log agrees", () => {
  assert.deepEqual(checkLog(read('GLOSSARY-LOG.md'), read('GLOSSARY.md')), []);
  const run = cli(ROOT, 'check');
  assert.equal(run.stdout, '');
  assert.equal(run.status, 0);
});

test('the CLI appends, shows and checks a log in a directory of its own', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'glossary-log-'));
  try {
    fs.writeFileSync(path.join(dir, 'GLOSSARY.md'), glossaryOf('Widget'));
    assert.equal(cli(dir, 'append', 'added', 'Widget', '--run', 'cli-run', '--date', '2026-11-20').status, 0);
    assert.equal(cli(dir, 'append', 'added', 'Gone', '--run', 'cli-run').status, 0);
    const shown = cli(dir, 'show', '--term', 'Widget');
    assert.equal(shown.status, 0);
    assert.match(shown.stdout, /\| 2026-11-20 \| cli-run \| added \| Widget \|/);
    assert.doesNotMatch(shown.stdout, /Gone/);
    const checked = cli(dir, 'check');
    assert.equal(checked.status, 1);
    assert.match(checked.stdout, /^8 Gone: /);
    assert.equal(cli(dir, 'append', 'added', 'X', '--run', 'r', '--log', 'other.md').status, 2);
    assert.equal(fs.existsSync(path.join(dir, 'other.md')), false);
    assert.equal(cli(dir, 'append', 'added', 'X|Y', '--run', 'r').status, 2);
    assert.equal(cli(dir, 'show', '--limit', '0').status, 2);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
