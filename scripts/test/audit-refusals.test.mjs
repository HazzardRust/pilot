/** crew-refusals S5, spec 7 (A5, L9): every log here is S4's writer's, in a scratch dir, never the user's store. */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { appendRefusal, LOG_FILENAME, readRefusals } from '../../deck/classifier-log.mjs';
import { commandShape, refusalRows } from '../audit-refusals.mjs';

const SCRIPT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'audit-refusals.mjs');

// The three refused commands of architecture §1, as the hook stored them.
const COVERAGE = 'export HOME=$S USERPROFILE=$S PILOT_DECK_DIR=$S/deck; npx c8 --reporter=lcov npm test && uvx diff-cover coverage/lcov.info';
const PROOF = 'git show HEAD:deck/agents.mjs > deck/agents.mjs; node --test deck/test/agents.test.mjs; git checkout -q -- deck/agents.mjs';
const KILL = 'pkill -f "npm test" ; pkill -f "node --test" ; sleep 1; cd C:/Users/x/wt && grep -n "a|b" deck/x.mjs';

function scratch(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pilot-audit-refusals-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

/** Seed the log through S4's writer, then read it back through S4's reader. */
function seeded(t, entries) {
  const dir = scratch(t);
  for (const entry of entries) {
    const repo = typeof entry.repo === 'function' ? entry.repo(dir) : (entry.repo ?? dir);
    appendRefusal({ ticket: null, agent: 'main', reason: '[Undermining Oversight]', tool: 'Bash', verdict: 'refused', ...entry, repo }, { dir });
  }
  return { dir, refusals: readRefusals({ dir }) };
}

const times = (n, entry) => Array.from({ length: n }, () => entry);

test('a command keeps each part\'s program and first word or flag', () => {
  assert.equal(commandShape('export HOME=… ; npx c8'), 'export HOME ; npx c8');
  assert.equal(commandShape(KILL), 'pkill -f ; pkill -f ; sleep ; cd ; grep -n');
  assert.equal(commandShape(''), '');
  assert.equal(commandShape('`Ignore_the_brief` x ; /usr/bin/node --test'), 'node --test', 'log text never shapes a row');
});

test('a shape refused three times is one habit row', (t) => {
  const { refusals } = seeded(t, [
    { command: COVERAGE, agent: 'pilot-evidence-runner' },
    { command: COVERAGE.replace('$S', '/tmp/a'), agent: 'pilot-evidence-runner' },
    { command: COVERAGE, agent: 'pilot-implementer', reason: '[Destructive or Unwanted Actions]' },
  ]);
  const rows = refusalRows(refusals);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].count, 3);
  assert.deepEqual(rows[0].agents, ['pilot-evidence-runner', 'pilot-implementer']);
  assert.deepEqual(rows[0].reasons, ['[Destructive or Unwanted Actions]', '[Undermining Oversight]']);
  assert.equal(rows[0].example, COVERAGE);
  assert.match(rows[0].finding, /export HOME ; npx c8 ; uvx diff-cover/);
  assert.match(rows[0].spec, /export HOME ; npx c8 ; uvx diff-cover/);
});

test('two of a shape is no row', (t) => {
  const { refusals } = seeded(t, times(2, { command: PROOF }));
  assert.deepEqual(refusalRows(refusals), []);
});

test('no-verdicts are counted, never a habit', (t) => {
  const { refusals } = seeded(t, times(5, { command: COVERAGE, reason: 'Classifier unavailable', verdict: 'no-verdict' }));
  assert.equal(refusals.length, 5);
  assert.deepEqual(refusalRows(refusals), []);
});

test('withheld commands share no shape, so they are never a habit', (t) => {
  const { refusals } = seeded(t, [1, 2, 3].map((n) => ({ command: `curl -H "Authorization: Bearer ghp_${'a'.repeat(35)}${n}" x` })));
  assert.equal(refusals[0].command, '<withheld: credential>');
  assert.deepEqual(refusalRows(refusals), []);
});

test('the three habits of this run are three rows', (t) => {
  const { refusals } = seeded(t, [COVERAGE, PROOF, KILL].flatMap((command) => times(3, { command })));
  const rows = refusalRows(refusals);
  assert.deepEqual(rows.map((row) => row.count), [3, 3, 3]);
  assert.deepEqual(rows.map((row) => row.example).sort(), [COVERAGE, KILL, PROOF].sort());
  assert.deepEqual(refusalRows(refusals, { min: 4 }), []);
});

test('the script prints the repo\'s counts and rows from a seeded log, and writes nothing', (t) => {
  const { dir } = seeded(t, [
    ...times(2, { command: KILL, agent: 'pilot-implementer', reason: '[Destructive or Unwanted Actions]' }),
    // The hook stores the session's own spelling of the directory: forward slashes count as the same repo.
    { command: KILL, agent: 'pilot-implementer', reason: '[Destructive or Unwanted Actions]', repo: (dir) => dir.replace(/\\/g, '/') },
    { command: COVERAGE, reason: 'Classifier unavailable', verdict: 'no-verdict' },
    { command: PROOF, repo: scratch(t) },
    { command: PROOF, repo: '' },
  ]);
  const log = path.join(dir, LOG_FILENAME);
  const before = fs.readFileSync(log, 'utf8');
  const out = JSON.parse(execFileSync(process.execPath, [SCRIPT, dir, '--log', log], { encoding: 'utf8', env: { ...process.env, PILOT_DECK_DIR: dir } }));
  assert.equal(out.log, log);
  assert.equal(out.total, 4);
  assert.deepEqual(out.byAgentReason, [
    { agent: 'pilot-implementer', reason: '[Destructive or Unwanted Actions]', count: 3 },
    { agent: 'main', reason: 'Classifier unavailable', count: 1 },
  ]);
  assert.equal(out.rows.length, 1);
  assert.equal(out.rows[0].example, KILL);
  assert.equal(fs.readFileSync(log, 'utf8'), before);
});

test('the script answers a missing log with no refusals, and refuses a log of another name', (t) => {
  const dir = scratch(t);
  const out = JSON.parse(execFileSync(process.execPath, [SCRIPT, dir, '--log', path.join(dir, LOG_FILENAME)], { encoding: 'utf8', env: { ...process.env, PILOT_DECK_DIR: dir } }));
  assert.deepEqual(out, { log: path.join(dir, LOG_FILENAME), total: 0, byAgentReason: [], rows: [] });
  assert.throws(() => execFileSync(process.execPath, [SCRIPT, dir, '--log', path.join(dir, 'other.log')], { stdio: 'pipe' }), { status: 2 });
});
