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
import { behavioursOf, checkSlice } from '../check-slices.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const FIXTURES = 'scripts/test/fixtures/slices';
const fixture = (name) => fs.readFileSync(path.join(ROOT, FIXTURES, name), 'utf8');
const cli = (...args) =>
  spawnSync(process.execPath, ['scripts/check-slices.mjs', ...args], { cwd: ROOT, encoding: 'utf8' });

test('the old shape still passes', () => {
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
  assert.deepEqual(rules(text), [{ line: 25, rule: 'rewrite-check' }]);
});

// crew-tests-behaviour S2 (spec 3, 5, 7; A1): a slice file names what its tests miss.
const MISSES = /^Misses:.*\r?\n/m;

test('a slice file without Misses is refused', () => {
  assert.deepEqual(rules(fixture('good.md').replace(MISSES, '')), [{ line: 17, rule: 'misses' }], 'at the Tests heading');
});

test('two Misses lines are refused', () => {
  const text = `${fixture('good.md').trimEnd()}\nMisses: a second one.`;
  assert.deepEqual(rules(text), [{ line: 25, rule: 'misses' }]);
});

test('a fenced Misses does not count', () => {
  const text = fixture('good.md').replace(MISSES, '').replace(/```\r?\nlookup\(/, '```\nMisses: fenced.\nlookup(');
  assert.deepEqual(rules(text).map(({ rule }) => rule), ['misses']);
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
  assert.equal(lines.length, 6, stdout);
  for (const [file, rule] of [
    ['missing-symbol.md:20', 'symbol-not-in-interface'],
    ['no-kind.md:19', 'behaviour-kind'],
    ['no-rewrite-check.md:', 'rewrite-check'],
    ['test-no-symbol.md:18', 'behaviour-symbol'],
    ['no-symbol.md:20', 'tests-shape'],
    ['too-long.md:61', 'length'],
  ]) {
    assert.ok(
      lines.some((line) => line.includes(file) && line.includes(` ${rule} `)),
      `no "${file} ${rule}" line in:\n${stdout}`,
    );
  }
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
  assert.match(stdout, /^1 slice file\(s\) checked/);
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

// spec-first S1 (spec 3, 8; L1, L5): a slice file lists behaviours, each with the kind of evidence it takes.
const TEST_LINE = /^1\. .*\(test\).*\r?\n/m;

test('a behaviours slice passes', () => {
  assert.deepEqual(checkSlice(fixture('behaviours.md')), []);
});

test('a behaviour with no kind is refused', () => {
  const problems = checkSlice(fixture('no-kind.md'));
  assert.deepEqual(problems.map(({ line, rule }) => ({ line, rule })), [{ line: 19, rule: 'behaviour-kind' }]);
  const unknown = fixture('behaviours.md').replace('(look)', '(screenshot)');
  assert.deepEqual(rules(unknown), [{ line: 19, rule: 'behaviour-kind' }], 'a kind outside test, run, look, read');
  const empty = fixture('behaviours.md').replace(/^\d\. .*\r?\n/gm, '');
  assert.deepEqual(rules(empty), [{ line: 16, rule: 'behaviour-kind' }], 'a Behaviours section with no lines');
});

test('a test behaviour names an Interface symbol', () => {
  assert.deepEqual(rules(fixture('test-no-symbol.md')), [{ line: 18, rule: 'behaviour-symbol' }]);
  const absent = fixture('behaviours.md').replace('(test): `lookup`', '(test): `search`');
  assert.deepEqual(rules(absent), [{ line: 18, rule: 'symbol-not-in-interface' }], 'the symbol must stand in the Interface block');
});

test('a Rewrite check is needed only beside a test behaviour', () => {
  const REWRITE = /^Rewrite check:.*\r?\n/m;
  assert.deepEqual(rules(fixture('behaviours.md').replace(TEST_LINE, '').replace(REWRITE, '')), []);
  assert.deepEqual(rules(fixture('behaviours.md').replace(REWRITE, '')).map(({ rule }) => rule), ['rewrite-check']);
  assert.deepEqual(rules(fixture('behaviours.md').replace(MISSES, '')).map(({ rule }) => rule), ['misses'], 'Misses stays on every slice');
});

test('behaviours are read in order with their kind', () => {
  assert.deepEqual(
    behavioursOf(fixture('behaviours.md')).map(({ n, kind, symbol, line }) => ({ n, kind, symbol, line })),
    [
      { n: 1, kind: 'test', symbol: 'lookup', line: 18 },
      { n: 2, kind: 'look', symbol: undefined, line: 19 },
      { n: 3, kind: 'run', symbol: undefined, line: 20 },
      { n: 4, kind: 'read', symbol: undefined, line: 21 },
    ],
  );
  assert.equal(behavioursOf(fixture('behaviours.md'))[0].name, 'a known word returns its entry');
  assert.deepEqual(behavioursOf(fixture('good.md')), [], 'the old shape has no behaviours');
  assert.deepEqual(behavioursOf(''), []);
});
