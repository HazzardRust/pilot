/**
 * architect-deeper S1 (spec 3; L2-L4): given an `architecture.md`, check-slices refuses each
 * §2 spec line that carries no bar, at its line; S3 (spec 4, A1) refuses a §2 with no
 * `practitioner:` tag and a §6 and §8 with no `red team:` line. Every test here goes through `checkSpec` or
 * the `check-slices` CLI, never through the bar grammar behind it.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { checkSpec } from '../check-slices.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const FIXTURES = path.join(ROOT, 'scripts/test/fixtures/spec');
const fixture = (name) => fs.readFileSync(path.join(FIXTURES, name), 'utf8');
const MARKERS = ['practitioner: an on-call engineer', '', '## 6. Assumed decisions', '', 'red team: none found.', ''];
const spec = (...lines) => ['# t', '', '## 2. Spec', '', ...lines, '', ...MARKERS].join('\n');
const refusals = (markdown) => checkSpec(markdown).map(({ line, rule }) => ({ line, rule }));

test('a list line with a numeral passes', () => {
  assert.deepEqual(checkSpec(spec('1. A ticket pauses after 20 minutes.')), []);
  assert.deepEqual(checkSpec(fixture('good.md')), []);
  assert.deepEqual(checkSpec(spec('1. A ticket pauses', '   after 20 minutes.')), [], 'a bar on the continuation line counts');
});

test('a line that only says it works is refused', () => {
  assert.deepEqual(refusals(spec('1. A ticket pauses after 20 minutes.', '2. It works.')), [{ line: 6, rule: 'spec-bar' }]);
  assert.deepEqual(refusals(fixture('no-bar.md')), [{ line: 8, rule: 'spec-bar' }]);
});

test('a table row whose only digits are its # and ticket cells is refused', () => {
  assert.deepEqual(refusals(fixture('table-ids-only.md')), [{ line: 8, rule: 'spec-bar' }]);
});

test('identifier digits are not a bar', () => {
  const line = '1. Follows S2 per ADR 0142, reads x.mjs:12 and delivers spec 3.';
  assert.deepEqual(refusals(spec(line)), [{ line: 5, rule: 'spec-bar' }]);
  assert.deepEqual(refusals(spec('1. Follows S2 per ADR 0142, reads `x.mjs:12` and `20 minutes`.')), [
    { line: 5, rule: 'spec-bar' },
  ], 'a numeral inside a code span is not a bar');
});

test('a number word or bound phrase is a bar', () => {
  assert.deepEqual(checkSpec(spec('1. The lane holds two tickets.')), []);
  assert.deepEqual(checkSpec(spec('1. The deck retries at most once.')), []);
});

test('an artefact with no practitioner tag is refused once', () => {
  assert.deepEqual(refusals(fixture('no-practitioner.md')), [{ line: 3, rule: 'spec-practitioner' }]);
});

test('an artefact with no red-team line is refused once', () => {
  assert.deepEqual(refusals(fixture('no-red-team.md')), [{ line: 9, rule: 'spec-red-team' }]);
});

test('the CLI routes architecture.md to the spec check', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'check-spec-'));
  try {
    const cli = (name) => {
      fs.mkdirSync(path.join(dir, name));
      const file = path.join(dir, name, 'architecture.md');
      fs.copyFileSync(path.join(FIXTURES, `${name}.md`), file);
      return { file, run: spawnSync(process.execPath, ['scripts/check-slices.mjs', file], { cwd: ROOT, encoding: 'utf8' }) };
    };
    const bad = cli('no-bar');
    assert.equal(bad.run.status, 1, bad.run.stderr);
    assert.deepEqual(bad.run.stdout.trim().split('\n').map((l) => l.split(' ').slice(0, 2).join(' ')), [`${bad.file}:8 spec-bar`]);
    const good = cli('good');
    assert.equal(good.run.status, 0, good.run.stdout + good.run.stderr);
    assert.match(good.run.stdout, /^1 file\(s\) checked/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
