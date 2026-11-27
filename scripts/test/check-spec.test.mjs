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
// pr-overview S3: every artefact needs a plain `## Overview`; appended last, so the fixtures' line numbers hold.
const OVERVIEW = ['', '## Overview', '', '- **What changes**: the deck pauses a ticket that waits too long.'];
const fixture = (name) => `${fs.readFileSync(path.join(FIXTURES, name), 'utf8').replace(/\s+$/, '')}\n${OVERVIEW.join('\n')}\n`;
const MARKERS = ['practitioner: an on-call engineer', '', '## 6. Assumed decisions', '', 'red team: none found.', ''];
const bare = (...lines) => ['# t', '', '## 2. Spec', '', ...lines, '', ...MARKERS].join('\n');
const spec = (...lines) => [bare(...lines), ...OVERVIEW].join('\n');
const refusals = (markdown) => checkSpec(markdown).map(({ line, rule }) => ({ line, rule }));
const withOverview = (...body) => ['# t', '', '## Overview', '', ...body, '', bare('1. A ticket pauses after 20 minutes.').slice('# t\n\n'.length)].join('\n');

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

test('a missing overview is refused', () => {
  assert.deepEqual(refusals(bare('1. A ticket pauses after 20 minutes.')), [{ line: 1, rule: 'overview-plain' }]);
  assert.deepEqual(refusals(withOverview()), [{ line: 1, rule: 'overview-plain' }], 'an empty overview is a missing one');
});

test('an id in the overview is refused', () => {
  const markdown = withOverview('- **What changes**: the deck pauses a ticket.', '- **Why**: S2 left it waiting.');
  assert.deepEqual(refusals(markdown), [{ line: 6, rule: 'overview-plain' }]);
  assert.match(checkSpec(markdown)[0].message, /S2/);
});

test('a long overview is refused', () => {
  const sentence = 'The deck shows a short plain line above each table.';
  const at150 = ['- **What changes**: the deck shows a line above each table.', ...Array(14).fill(sentence)].join(' ');
  assert.deepEqual(checkSpec(withOverview(at150)), []);
  assert.deepEqual(refusals(withOverview(`${at150} Done.`)), [{ line: 3, rule: 'overview-plain' }]);
});

test('an overview with no What changes label is refused', () => {
  assert.deepEqual(refusals(withOverview('- **What change**: the deck pauses a ticket.')), [{ line: 3, rule: 'overview-plain' }]);
});

test('an overview whose sentences run long is refused', () => {
  const long = 'The deck now shows a plain line above every table so that anyone opening the pull request can see at a glance what the change does for them.';
  const markdown = withOverview(`- **What changes**: ${long} ${long}`);
  assert.deepEqual(refusals(markdown), [{ line: 3, rule: 'overview-plain' }]);
  assert.match(checkSpec(markdown)[0].message, /sentences average/);
});

test('the CLI routes architecture.md to the spec check', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'check-spec-'));
  try {
    const cli = (name) => {
      fs.mkdirSync(path.join(dir, name));
      const file = path.join(dir, name, 'architecture.md');
      fs.writeFileSync(file, fixture(`${name}.md`));
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
