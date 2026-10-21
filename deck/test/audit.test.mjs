/** S1 of housekeeping-audit: the audit report's module (spec 11-13; L3, L4, L6, L17, A3). */

import './no-open.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { tempDeck } from '../testUtils.mjs';
import * as audit from '../audit.mjs';
import { MAX_OPEN_ROWS, main, rankRows, renderReport, saveReport, validateReport } from '../audit.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

const aRow = (over = {}) => ({
  area: 'loops',
  finding: 'The suite takes four minutes',
  command: 'timeout 900 npm test',
  output: '241 s, exit 0\n# pass 812',
  exit: 0,
  fix: 'Add a test:changed script',
  saving: { minutes: 3, tokens: 0 },
  effort: 'S',
  spec: 'Problem: the suite is slow.\n1. `npm run test:changed` runs only touched files — evidence: under 30 s.',
  ...over,
});

const aReport = (rows = [aRow()], over = {}) => ({
  repo: 'D:/work/alpha',
  scratch: 'D:/tmp/audit-20260927',
  startedAt: '2026-09-27T10:00:00.000Z',
  minutes: 42,
  tokens: 118000,
  duringRun: false,
  unmeasured: ['preview: no area file', 'measured spend: no usage log'],
  rows,
  ...over,
});

test('a row without a command, its output or spec text, or an eleventh open row, is refused', (t) => {
  assert.deepEqual(validateReport(aReport()), []);

  for (const field of ['command', 'output', 'spec']) {
    const problems = validateReport(aReport([aRow({ [field]: '' })]));
    assert.equal(problems.length, 1, `${field}: ${problems.join('; ')}`);
    assert.match(problems[0], new RegExp(`row 1.*${field}`));
  }
  assert.ok(validateReport(aReport([aRow({ area: 'weather' })])).length > 0, 'an unknown area');
  assert.ok(validateReport(aReport([aRow({ effort: 'XL' })])).length > 0, 'an unknown effort');
  assert.ok(validateReport(null).length > 0, 'not a report at all');

  const open = Array.from({ length: MAX_OPEN_ROWS + 1 }, (_, i) => aRow({ area: 'open', finding: `Open ${i}` }));
  assert.equal(MAX_OPEN_ROWS, 10);
  const past = validateReport(aReport(open));
  assert.equal(past.length, 1, 'only the eleventh open row');
  assert.match(past[0], /row 11.*open/);
  assert.deepEqual(validateReport(aReport(open.slice(0, MAX_OPEN_ROWS))), []);

  tempDeck(t);
  assert.throws(() => saveReport('D:/work/alpha', aReport([aRow({ command: ' ' })])), /row 1.*command/);
});

test('a failed command is a valid row', () => {
  const failed = aRow({ finding: 'npm ci fails on a clean clone', exit: 1, output: '12 s, exit 1\nnpm ERR! peer dep' });
  const hung = aRow({ finding: 'The suite hangs', exit: null, output: '900 s, timed out' });
  assert.deepEqual(validateReport(aReport([failed, hung])), []);
});

test('every report-level field is refused when missing or wrong, and a row that is not an object refuses too (P8)', () => {
  const cases = [
    ['repo empty', { repo: '' }, /repo is missing/],
    ['repo blank', { repo: '   ' }, /repo is missing/],
    ['scratch empty', { scratch: '' }, /scratch is missing/],
    ['startedAt not a date', { startedAt: 'not a date' }, /startedAt is not a date/],
    ['minutes negative', { minutes: -1 }, /minutes is not a number/],
    ['minutes not a number', { minutes: 'nope' }, /minutes is not a number/],
    ['tokens neither a number nor null', { tokens: 'nope' }, /tokens is a number, or null/],
    ['unmeasured not a list', { unmeasured: 'nope' }, /unmeasured is a list/],
  ];
  for (const [label, over, pattern] of cases) {
    const problems = validateReport(aReport([aRow()], over));
    assert.ok(problems.some((problem) => pattern.test(problem)), `${label}: ${problems.join('; ') || '(no problems)'}`);
  }
  assert.deepEqual(validateReport(aReport([aRow()], { rows: 'nope' })), ['rows is not a list']);
  assert.deepEqual(validateReport(aReport(['not an object'])), ['row 1 is not an object']);
});

test('a row with a broken exit or saving is refused (P8)', () => {
  assert.ok(validateReport(aReport([aRow({ exit: 1.5 })])).length > 0, 'exit not an integer');
  assert.ok(validateReport(aReport([aRow({ exit: undefined })])).length > 0, 'exit missing entirely');
  assert.ok(validateReport(aReport([aRow({ saving: { minutes: -1, tokens: 0 } })])).length > 0, 'negative saving.minutes');
  assert.ok(validateReport(aReport([aRow({ saving: {} })])).length > 0, 'saving missing both fields');
});

test('rows rank by saving per run over effort', () => {
  const rows = [
    aRow({ finding: 'b small', saving: { minutes: 2, tokens: 0 }, effort: 'S' }), // 2
    aRow({ finding: 'large', saving: { minutes: 16, tokens: 8000 }, effort: 'L' }), // 3
    aRow({ finding: 'medium', saving: { minutes: 0, tokens: 12000 }, effort: 'M' }), // 4
    aRow({ area: 'setup', finding: 'z tie', saving: { minutes: 2, tokens: 0 }, effort: 'S' }), // 2, setup before loops
    aRow({ finding: 'a small', saving: { minutes: 1, tokens: 1000 }, effort: 'S' }), // 2
  ];
  const ranked = rankRows(rows);
  assert.deepEqual(ranked.map((row) => row.finding), ['medium', 'large', 'z tie', 'a small', 'b small']);
  assert.deepEqual(ranked.map((row) => row.id), ['F1', 'F2', 'F3', 'F4', 'F5']);
  assert.deepEqual(ranked.map((row) => row.score), [4, 3, 2, 2, 2]);
  assert.equal(rows[0].id, undefined, 'the rows given are not changed');
});

test('the deck body lists rows by F-id with no table; the file carries cost, exchange rate and unmeasured', () => {
  const report = aReport([aRow(), aRow({ finding: 'No lint script', command: 'node -e "..."', exit: 1, fix: 'Add | lint' })]);
  const { table, deckBody } = renderReport(report);

  assert.match(deckBody, /^- \*\*F1\*\*/m);
  assert.match(deckBody, /^- \*\*F2\*\*/m);
  assert.doesNotMatch(deckBody, /^\s*\d+\. /m, 'no ordinal beside an F-id');
  assert.doesNotMatch(deckBody, /^\|/m, 'no table on the deck (A3)');
  assert.match(deckBody, /timeout 900 npm test/, 'each row names its command');
  assert.match(deckBody, /exit 1/);
  assert.match(deckBody, /118000 tokens/, 'the cost line');
  assert.match(deckBody, /none/, 'says how to answer');

  assert.match(table, /^\| Id \| Area \| Finding/m, 'the file is a table');
  assert.match(table, /Add \\\| lint/, 'a pipe in a cell is escaped');
  assert.match(table, /118000 tokens.*42 min/, 'cost');
  assert.match(table, /1000 tokens = 1 minute/, 'the exchange rate');
  assert.match(table, /S 1, M 3, L 8/, 'the effort weights');
  assert.match(table, /preview: no area file/, 'what went unmeasured');
  assert.match(table, /D:\/tmp\/audit-20260927/, 'the scratch path');

  const unknown = renderReport(aReport([aRow()], { tokens: null, duringRun: true }));
  assert.match(unknown.table, /tokens not measured/);
  assert.match(unknown.table, /during a piloted run/, 'timings beside a live run say so (A7)');
});

test('the saved table truncates a long output to its excerpt, prints each row\'s saving, and a spec section per row (P9)', () => {
  const longOutput = `${'x'.repeat(250)} tail`;
  const report = aReport([aRow({ output: longOutput, saving: { minutes: 5, tokens: 200 } })]);
  const { table } = renderReport(report);

  assert.match(table, new RegExp(`x{200}\u2026`), 'the output excerpt is cut at 200 characters with an ellipsis');
  assert.doesNotMatch(table, /tail/, 'nothing past the excerpt cutoff is printed');
  assert.match(table, /5 min \+ 200 tokens/, "the row's saving column");
  assert.match(
    table,
    /### F1: The suite takes four minutes\n\nProblem: the suite is slow\./,
    "the spec section carries the row's spec text",
  );
});

test('a report is saved under the deck store and never in the repository', (t) => {
  const store = tempDeck(t);
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'audit-repo-'));
  t.after(() => fs.rmSync(repo, { recursive: true, force: true }));

  const saved = saveReport(repo, aReport([aRow()], { repo }));
  for (const file of Object.values(saved)) {
    assert.ok(file.startsWith(path.join(store, 'audits') + path.sep), `${file} is in the store`);
    assert.ok(fs.existsSync(file), file);
  }
  assert.match(saved.json, /\.json$/);
  assert.match(saved.markdown, /\.md$/);
  assert.match(saved.deck, /\.deck\.md$/);
  assert.deepEqual(fs.readdirSync(repo), [], 'nothing written in the repository');

  const key = path.basename(path.dirname(saved.json));
  assert.match(key, /^[A-Za-z0-9_-]+$/, 'the repo key is a safe directory name');
  assert.equal(JSON.parse(fs.readFileSync(saved.json, 'utf8')).rows[0].id, 'F1', 'the json is ranked');
  assert.match(fs.readFileSync(saved.deck, 'utf8'), new RegExp(`Full report: .*${path.basename(saved.markdown)}`));

  const bad = path.join(store, 'bad.json');
  fs.writeFileSync(bad, JSON.stringify(aReport([aRow({ output: '' })], { repo })));
  const env = { ...process.env, PILOT_DECK_DIR: store, PILOT_DECK_NO_OPEN: '1' };
  const refused = spawnSync(process.execPath, [path.join(ROOT, 'bin', 'pilot.mjs'), 'audit', 'save', bad], { env, encoding: 'utf8' });
  assert.equal(refused.status, 1, refused.stderr);
  assert.match(refused.stderr, /row 1.*output/);

  const good = path.join(store, 'good.json');
  fs.writeFileSync(good, JSON.stringify(aReport([aRow()], { repo })));
  const accepted = spawnSync(process.execPath, [path.join(ROOT, 'bin', 'pilot.mjs'), 'audit', 'save', good], { env, encoding: 'utf8' });
  assert.equal(accepted.status, 0, accepted.stderr);
  assert.equal(accepted.stdout.trim().split('\n').length, 3, 'three paths');
});

test('a usage refusal always exits 2, in main as in the verbs (N3, N6)', () => {
  assert.equal(main(['nonsense']), 2, 'an unrecognised command');
  assert.equal(main(['save']), 2, 'save with no file');
  assert.equal(main([]), 2, 'no command at all');
});

test('EFFORT_WEIGHTS and TOKENS_PER_MINUTE have no caller outside this module, so neither is exported (N3, N6)', () => {
  assert.equal(audit.EFFORT_WEIGHTS, undefined);
  assert.equal(audit.TOKENS_PER_MINUTE, undefined);
});
