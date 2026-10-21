/**
 * deep-modules S1 (spec 1; L2-L4): a slice file's Tests lines are seam-first. Each names
 * one Interface symbol and the observable result through it, the file carries one
 * rewrite check, and it stays at or under 60 lines. Every test here goes through
 * `checkSlice` or the `check-slices` CLI, never through its parser.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { checkSlice } from '../check-slices.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const FIXTURES = 'scripts/test/fixtures/slices';
const fixture = (name) => fs.readFileSync(path.join(ROOT, FIXTURES, name), 'utf8');
const cli = (...args) =>
  spawnSync(process.execPath, ['scripts/check-slices.mjs', ...args], { cwd: ROOT, encoding: 'utf8' });

test('a seam-first slice file has no problems', () => {
  assert.deepEqual(checkSlice(fixture('good.md')), []);
});

test('a test naming no symbol is refused', () => {
  assert.deepEqual(
    checkSlice(fixture('no-symbol.md')).map(({ line, rule }) => ({ line, rule })),
    [{ line: 20, rule: 'tests-shape' }],
  );
  const bulleted = fixture('good.md').replace('3. `an entry', '- `an entry').replace('2. `an', '2) `an');
  assert.deepEqual(
    checkSlice(bulleted).map(({ line, rule }) => ({ line, rule })),
    [{ line: 20, rule: 'tests-shape' }, { line: 21, rule: 'tests-shape' }],
    'a list item in another marker is still a Tests line',
  );
});

test('a symbol absent from the Interface block is refused', () => {
  const problems = checkSlice(fixture('missing-symbol.md'));
  assert.deepEqual(problems.map(({ line, rule }) => ({ line, rule })), [{ line: 20, rule: 'symbol-not-in-interface' }]);
  assert.match(problems[0].message, /`search`/);
});

test('a slice file without a rewrite check is refused', () => {
  assert.deepEqual(checkSlice(fixture('no-rewrite-check.md')).map(({ rule }) => rule), ['rewrite-check']);
});

test('a 61-line slice file is refused', () => {
  assert.deepEqual(
    checkSlice(fixture('too-long.md')).map(({ line, rule }) => ({ line, rule })),
    [{ line: 61, rule: 'length' }],
  );
});

const rules = (text) => checkSlice(text).map(({ line, rule }) => ({ line, rule }));

test('a fenced `## ` line inside the Interface block neither ends it nor opens a section', () => {
  assert.deepEqual(checkSlice(fixture('good.md').replace(/```\r?\nlookup\(/, '```\n## Tests\nlookup(')), []);
});

test('a symbol matches only as a whole token', () => {
  const text = fixture('missing-symbol.md').replace('lookup(word: string): Entry | null', '$&\nsearchAll(q: string): Entry[]');
  assert.deepEqual(rules(text), [{ line: 21, rule: 'symbol-not-in-interface' }], '`search` is not `searchAll`');
});

test('a slice file with no Tests section is refused', () => {
  const text = fixture('good.md').replace(/## Tests\r?\n[\s\S]*?\r?\n\r?\n(?=Rewrite check:)/, '');
  assert.deepEqual(rules(text), [{ line: 1, rule: 'tests-shape' }]);
});

test('two rewrite checks are refused at the second', () => {
  const text = `${fixture('good.md').trimEnd()}\nRewrite check: a second one.`;
  assert.deepEqual(rules(text), [{ line: 24, rule: 'rewrite-check' }]);
});

test('a slice file of exactly 60 lines passes', () => {
  const good = fixture('good.md').trimEnd().split(/\r?\n/);
  const padded = [...good.slice(0, 3), ...Array(60 - good.length).fill('Notes.'), ...good.slice(3)];
  assert.equal(padded.length, 60);
  assert.deepEqual(checkSlice(padded.join('\n')), []);
});

test('the CLI exits 2 with no path and with a path that is not there', () => {
  const none = cli();
  assert.equal(none.status, 2, none.stdout + none.stderr);
  assert.match(none.stderr, /^usage:/);
  const missing = cli(`${FIXTURES}/not-there.md`);
  assert.equal(missing.status, 2, missing.stdout + missing.stderr);
  assert.match(missing.stderr, /not-there\.md/);
});

test('the CLI exits 1 and names each problem', () => {
  const { status, stdout } = cli(FIXTURES);
  assert.equal(status, 1, stdout);
  const lines = stdout.trim().split(/\r?\n/);
  assert.equal(lines.length, 4, stdout);
  for (const [file, rule] of [
    ['missing-symbol.md:20', 'symbol-not-in-interface'],
    ['no-rewrite-check.md:', 'rewrite-check'],
    ['no-symbol.md:20', 'tests-shape'],
    ['too-long.md:61', 'length'],
  ]) {
    assert.ok(
      lines.some((line) => line.includes(file) && line.includes(` ${rule} `)),
      `no "${file} ${rule}" line in:\n${stdout}`,
    );
  }
});

test("the skill's worked example is seam-first", () => {
  const { status, stdout, stderr } = cli('skills/vertical-slicing/SKILL.md');
  assert.equal(status, 0, stdout + stderr);
  assert.match(stdout, /^1 slice file\(s\) checked/);
});

// design-docs-only S4 (spec 5, 7; L8): every blocker in the header's `after:` names what it shares.
const withAfter = (after) => fixture('good.md').replace(/after: .*/, `after: ${after}`);
const afterReason = (text) => checkSlice(text).filter(({ rule }) => rule === 'after-reason');

test('a bare blocker is refused', () => {
  assert.deepEqual(
    afterReason(withAfter('S1')).map(({ line, rule }) => ({ line, rule })),
    [{ line: 3, rule: 'after-reason' }],
  );
  assert.deepEqual(afterReason(withAfter('S1 ()')).length, 1, 'an empty () is no reason');
});

test('a reasoned blocker passes', () => {
  assert.deepEqual(afterReason(withAfter('S1 (scripts/x.mjs), S2 (`pilotLineage`)')), []);
  assert.deepEqual(afterReason(withAfter('S1 (`app/(app)/editor`, its route)')), [], 'a reason may hold brackets and commas');
});

test('no blocker passes', () => {
  assert.deepEqual(checkSlice(withAfter('–')), []);
});

test('one bare blocker among reasoned ones is named', () => {
  const problems = afterReason(withAfter('S1 (a), S2'));
  assert.equal(problems.length, 1);
  assert.match(problems[0].message, /`S2`/);
  assert.doesNotMatch(problems[0].message, /`S1/);
});

test("the skill's worked example passes", () => {
  const { status, stdout, stderr } = cli('skills/vertical-slicing/SKILL.md');
  assert.equal(status, 0, stdout + stderr);
  const skill = fs.readFileSync(path.join(ROOT, 'skills/vertical-slicing/SKILL.md'), 'utf8');
  assert.match(skill, /^Feature `learnhub` .* · after: S1 \([^)]+\), S2 \([^)]+\)$/m, 'the example names a reason per blocker');
});

test('the skill carries the width rule', () => {
  const skill = fs.readFileSync(path.join(ROOT, 'skills/vertical-slicing/SKILL.md'), 'utf8');
  const ordering = skill.slice(skill.indexOf('## Ordering'), skill.indexOf('## The phase gate'));
  assert.match(ordering, /no line between two slices that share no file and no seam/i);
  assert.match(ordering, /`after: S1 \(<file or seam>\), S2 \(<file or seam>\)`/);
});

// red-lands-on-pilot S2 (spec 2; L6): a wait on another ticket's PR is not a blocker.
const afterRules = (text) => checkSlice(text).filter(({ rule }) => rule.startsWith('after-'));

test('a PR wait in after is refused as after-ticket', () => {
  const problems = afterRules(withAfter('S3 (x), #445 on pilot'));
  assert.deepEqual(problems.map(({ line, rule }) => ({ line, rule })), [{ line: 3, rule: 'after-ticket' }]);
  assert.match(problems[0].message, /`#445 on pilot` waits on another ticket's PR/);
});

test('a bare S<n> still reads after-reason', () => {
  assert.deepEqual(afterRules(withAfter('S3')).map(({ rule }) => rule), ['after-reason']);
});

test('a reasoned slice blocker passes', () => {
  assert.deepEqual(afterRules(withAfter('S3 (deck/store.mjs)')), []);
});

// cheaper-crew S3 (spec 6; L2): a slice header carries `Model: sonnet|opus — <reason>`.
const MODEL = /^Model: .*\r?\n/m;
const withModel = (line) => fixture('good.md').replace(MODEL, `${line}\n`);
const modelLine = (text) => checkSlice(text).filter(({ rule }) => rule === 'model-line');

test('a slice without a Model line is refused', () => {
  const problems = checkSlice(fixture('good.md').replace(MODEL, '\n'));
  assert.deepEqual(problems.map(({ rule }) => rule), ['model-line']);
  assert.match(problems[0].message, /Model: sonnet\|opus — <reason>/);
});

test('a Model line with no reason is refused', () => {
  for (const line of ['Model: sonnet', 'Model: opus —', 'Model: haiku — cheap', 'Model: Sonnet — precise', 'Model: sonnet - precise']) {
    assert.equal(modelLine(withModel(line)).length, 1, line);
  }
  const fenced = fixture('good.md').replace(MODEL, '\n').replace('```\nlookup(', '```\nModel: opus — fenced\nlookup(');
  assert.equal(modelLine(fenced).length, 1, 'a Model line inside a fence is not the header');
  const late = `${fixture('good.md').replace(MODEL, '\n').trimEnd()}\nModel: opus — below the header`;
  assert.equal(modelLine(late).length, 1, 'a Model line after ## Files owned is not the header');
});

test('sonnet and opus with reasons pass', () => {
  assert.deepEqual(modelLine(withModel('Model: sonnet — the brief leaves no choice open.')), []);
  assert.deepEqual(modelLine(withModel('Model: opus — `agents/` hits the security trigger (A2).')), []);
});

// cheaper-crew A2: a slice the security reviewer reads hits the security trigger, so it runs on Opus.
test('a security-reviewed slice on sonnet is refused', () => {
  const reviewed = (reviewers, model) =>
    fixture('good.md').replace(MODEL, `Reviewers: ${reviewers}\nModel: ${model} — a reason.\n`);
  const problems = checkSlice(reviewed('`pilot:typescript-reviewer`, `pilot:security-reviewer`', 'sonnet'));
  assert.deepEqual(problems.map(({ line, rule }) => ({ line, rule })), [{ line: 5, rule: 'model-security' }]);
  assert.match(problems[0].message, /pilot:security-reviewer/);
  assert.deepEqual(checkSlice(reviewed('`pilot:typescript-reviewer`, `pilot:security-reviewer`', 'opus')), []);
  assert.deepEqual(checkSlice(reviewed('`pilot:typescript-reviewer`', 'sonnet')), []);
});
