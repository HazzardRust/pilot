/**
 * S1 of teacher-method: a lesson too large for the deck leaves as one md report, shape-checked by
 * `pilot lesson-report <lesson id>` and written to `<store>/lessons/<id>.md` (spec 4, 5, 8; L1, L2).
 * Every write goes to a temp store; nothing here touches the real home or the live deck.
 */

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { reportProblems, writeLessonReport } from '../lesson-report.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const PILOT = path.join(ROOT, 'bin/pilot.mjs');
const ID = 'itm_0123456789ab';

const WHOLE = [
  '# Lesson: which store holds the report',
  '',
  '## Goals',
  '',
  '- You can say why the report lives in the store, checked by naming the two places it could not go.',
  '- You can pick between the options, checked by explaining what each trades away.',
  '',
  '## Your level',
  '',
  '> I know git worktrees but not what the deck store is.',
  '',
  '## Dot points',
  '',
  '- What the deck store is',
  '- Why the shared checkout is off limits',
  '- How a store path is built from an id',
  '',
  '## Background',
  '',
  'From the artefact: "The report lives in the store, `<store>/lessons/<lesson id>.md`." See https://example.com/adr.',
  '',
  '## Research while planning',
  '',
  'Look up how Node resolves the home directory on Windows before planning step 2.',
  '',
  '## The decision to come back to',
  '',
  'Where should the report live? Options: the store; the repo.',
  '',
].join('\n');

/** A temp store, removed when the test ends. */
function tempStore(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lesson-report-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

/** Every file under `dir`, relative, however deep. */
const filesUnder = (dir) =>
  fs.readdirSync(dir, { recursive: true, withFileTypes: true }).filter((entry) => entry.isFile());

const rulesOf = (markdown) => reportProblems(markdown).map((problem) => problem.rule);

test('a whole report passes and lands in the store', (t) => {
  const store = tempStore(t);
  assert.deepEqual(reportProblems(WHOLE), [], 'the whole report has no problem');
  const written = writeLessonReport(ID, WHOLE, { store });
  assert.equal(written, path.join(store, 'lessons', `${ID}.md`));
  assert.equal(fs.readFileSync(written, 'utf8'), WHOLE, 'the bytes given, unchanged');
});

test('a report without its research section is refused', () => {
  const without = WHOLE.replace(/## Research while planning\n\n[^\n]*\n\n/, '');
  const problems = reportProblems(without);
  assert.deepEqual(problems.map((problem) => problem.rule), ['heading']);
  assert.match(problems[0].message, /Research while planning/);
  const empty = WHOLE.replace(/(## Research while planning\n)\n[^\n]*\n/, '$1\n');
  assert.deepEqual(rulesOf(empty), ['heading'], 'a research heading with nothing under it is no research section');
});

test('each shape rule refuses its case', () => {
  const cases = {
    'dot-points': WHOLE.replace('- How a store path is built from an id\n', ''),
    'goal-check': WHOLE.replace(', checked by naming the two places it could not go', ''),
    'local-link': WHOLE.replace('See https://example.com/adr.', 'See [the ADR](../docs/adr/0053-lesson.md).'),
    credential: WHOLE.replace('## Background\n', '## Background\n\nsk-abcdefghijklmnopqrstuv\n'),
    size: WHOLE.replace('## Background\n', `## Background\n\n${'x'.repeat(60_001)}\n`),
  };
  for (const [rule, markdown] of Object.entries(cases)) {
    assert.deepEqual(rulesOf(markdown), [rule], `the ${rule} case is refused by its rule alone`);
  }
});

test('a bad id writes nothing', (t) => {
  const store = tempStore(t);
  for (const id of ['../x', 'itm_1']) {
    assert.throws(() => writeLessonReport(id, WHOLE, { store }), /itm_/, `${id} is refused`);
  }
  assert.equal(filesUnder(store).length, 0, '0 files in the store');
  assert.throws(() => writeLessonReport(ID, WHOLE.replace(/## Goals[\s\S]*?## Your level/, '## Your level'), { store }), /Goals/);
  assert.equal(filesUnder(store).length, 0, 'a bad report writes nothing either');
});

test('the verb pipes stdin and prints the path', (t) => {
  const store = tempStore(t);
  const env = { ...process.env, PILOT_DECK_DIR: store, PILOT_DECK_NO_OPEN: '1', PILOT_DECK_NO_START: '1', PILOT_DECK_PORT: '1' };
  const run = (input, id = ID) => spawnSync(process.execPath, [PILOT, 'lesson-report', id], { input, encoding: 'utf8', env });

  const good = run(WHOLE);
  assert.equal(good.status, 0, good.stderr);
  const printed = good.stdout.trim();
  assert.equal(printed, path.join(store, 'lessons', `${ID}.md`));
  assert.equal(fs.readFileSync(printed, 'utf8'), WHOLE);

  const bad = run(WHOLE.replace('- How a store path is built from an id\n', ''), 'itm_ba0000000000');
  assert.equal(bad.status, 1);
  assert.match(bad.stderr, /dot-points/);
  assert.equal(fs.existsSync(path.join(store, 'lessons', 'itm_ba0000000000.md')), false);

  const badId = run(WHOLE, '../escape');
  assert.equal(badId.status, 1);
  assert.equal(filesUnder(store).length, 1, 'only the good report is in the store');
});
