/**
 * project-glossary S1 (spec 3, 7; L2, L4-L6): the root glossary is `GLOSSARY.md`, an entry
 * defines a word and never names a path, and the gate goes red the day one does. Every test
 * goes through `parseGlossary`, `lintGlossary` or the `glossary.mjs check` CLI.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { lintGlossary, parseGlossary } from '../glossary.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const FIXTURE = 'scripts/test/fixtures/glossary/path-entry.md';
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const cli = (...args) =>
  spawnSync(process.execPath, ['scripts/glossary.mjs', ...args], { cwd: ROOT, encoding: 'utf8' });

test('an entry naming a path fails the check', () => {
  assert.deepEqual(lintGlossary(read(FIXTURE)), [
    { term: 'Pathy term', line: 12, problem: 'path', token: 'scripts/glossary.mjs' },
  ]);
  const run = cli('check', FIXTURE);
  assert.equal(run.status, 1);
  assert.equal(run.stdout, '12 Pathy term: names a path scripts/glossary.mjs\n');
});

test('a branch pattern and an agent name pass', () => {
  const text = '**Branch**:\nCut as `feat/<slug>` and read by `pilot-auditor`, red/green, e.g. on `message.id`.\n';
  assert.deepEqual(lintGlossary(text), []);
});

test('each path shape is named, and the Avoid line is not linted', () => {
  const entry = (definition) => `**T**:\n${definition}\n_Avoid_: docs/x.md\n`;
  const tokens = (definition) => lintGlossary(entry(definition)).map(({ token }) => token);
  assert.deepEqual(tokens('Under `~/.claude/pilot/`.'), ['~/.claude/pilot/']);
  assert.deepEqual(tokens('Run ./gate here.'), ['./gate']);
  assert.deepEqual(tokens('A file in `skills/audit/areas/`;'), ['skills/audit/areas/']);
  assert.deepEqual(tokens('See (docs/adr.md).'), ['docs/adr.md']);
  assert.deepEqual(tokens('A row in `VENDOR.md`, and `.gitlab-ci.yml`.'), ['VENDOR.md', '.gitlab-ci.yml']);
  assert.deepEqual(tokens('A word with no path.'), []);
});

test('a long adversarial token is linted in linear time', { timeout: 5000 }, () => {
  const long = 'a'.repeat(200_000);
  assert.deepEqual(lintGlossary(`**T**:\n${'.'.repeat(200_000)}a ${long} ${long}/b/c.md\n`), [
    { term: 'T', line: 2, problem: 'path', token: `${long}/b/c.md` },
  ]);
});

test('the parser keeps terms, multi-line definitions and Avoid lists, and skips headings', () => {
  const text = '# Head\n\n### Group\n\n**One**:\nFirst line\nsecond line.\n_Avoid_: A, b c\n\n**Two**:\nOnly.\n';
  assert.deepEqual(parseGlossary(text), [
    { term: 'One', definition: 'First line\nsecond line.', avoid: ['A', 'b c'], line: 5 },
    { term: 'Two', definition: 'Only.', avoid: [], line: 10 },
  ]);
  assert.deepEqual(parseGlossary(text.replace(/\n/g, '\r\n')), parseGlossary(text));
});

test("the repository's glossary is clean", () => {
  const text = read('GLOSSARY.md');
  assert.equal(parseGlossary(text).length, 86);
  assert.deepEqual(lintGlossary(text), []);
  const run = cli('check', 'GLOSSARY.md');
  assert.equal(run.status, 0, run.stdout + run.stderr);
});

test('an unreadable file or a bad command exits 2', () => {
  const missing = cli('check', 'scripts/test/fixtures/glossary/no-such-file.md');
  assert.equal(missing.status, 2);
  assert.match(missing.stderr, /no-such-file\.md/);
  assert.equal(cli('check').status, 2);
  assert.equal(cli('lint', 'GLOSSARY.md').status, 2);
});
