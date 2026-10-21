/**
 * The provenance checker is what keeps the credit from eroding (ADR 0011), so it is
 * tested in both directions: a header without a ledger row fails, and a ledger row
 * without a header fails. A file with neither is this project's own work and passes.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

import { HEADER_KEYS, checkProvenance } from '../check-provenance.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/** Builds a throwaway tree so the checker's failure paths are exercised without the real one. */
function sandbox(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'provenance-'));
  for (const [rel, body] of Object.entries(files)) {
    const full = path.join(dir, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, body);
  }
  return dir;
}

const header = (overrides = {}) => {
  const fields = {
    upstream: 'mattpocock-skills 1.2.3 - skills/productivity/grilling/SKILL.md',
    copyright: 'Copyright (c) 2026 Matt Pocock',
    licence: 'MIT - see THIRD-PARTY-NOTICES.md',
    adapted: 'verbatim',
    ledger: 'vendor/methodology.md',
    ...overrides,
  };
  const lines = Object.entries(fields)
    .filter(([, value]) => value !== null)
    .map(([key, value]) => `${key}: ${value}`);
  return `<!-- provenance\n${lines.join('\n')}\n-->\n`;
};

const ledger = (rows) =>
  [
    '## The provenance header',
    '',
    '| Field | What it holds |',
    '| --- | --- |',
    '| `upstream` | prose that is documentation, never a row |',
    '',
    '## Vendored files',
    '',
    '| File | Upstream | Adapted | What changed and why |',
    '| --- | --- | --- | --- |',
    ...rows,
  ].join('\n');

const goodRow = '| `a/SKILL.md` | `skills/productivity/grilling/SKILL.md` | verbatim | nothing |';

test('a vendored file with a matching ledger row passes', () => {
  const dir = sandbox({ 'a/SKILL.md': `${header()}# a`, 'vendor/methodology.md': ledger([goodRow]) });

  const result = checkProvenance(dir, ['a']);

  assert.deepEqual(result.failures, []);
  assert.equal(result.ok, true);
  assert.deepEqual(result.vendored, ['a/SKILL.md']);
});

test("a file with no header is this project's own work, not a failure", () => {
  const dir = sandbox({ 'a/SKILL.md': '# written here, not copied' });

  const result = checkProvenance(dir, ['a']);

  assert.equal(result.ok, true);
  assert.deepEqual(result.own, ['a/SKILL.md']);
});

test('a vendored file whose ledger row is missing fails, naming the file', () => {
  const dir = sandbox({ 'a/SKILL.md': `${header()}# a`, 'vendor/methodology.md': ledger([]) });

  const result = checkProvenance(dir, ['a']);

  assert.equal(result.ok, false);
  assert.equal(result.failures.length, 1);
  assert.match(result.failures[0], /a\/SKILL\.md/);
  assert.match(result.failures[0], /vendor\/methodology\.md/);
});

test('a ledger row whose file has lost its header fails, so a deleted header cannot hide', () => {
  const dir = sandbox({ 'a/SKILL.md': '# header deleted', 'vendor/methodology.md': ledger([goodRow]) });

  const result = checkProvenance(dir, ['a']);

  assert.equal(result.ok, false);
  assert.ok(
    result.failures.some((failure) => /a\/SKILL\.md/.test(failure) && /no provenance header/.test(failure)),
    `expected a missing-header failure, got ${JSON.stringify(result.failures)}`,
  );
});

test('a ledger row naming a file that was deleted fails', () => {
  const dir = sandbox({ 'a/other.md': '# unrelated', 'vendor/methodology.md': ledger([goodRow]) });

  const result = checkProvenance(dir, ['a']);

  assert.equal(result.ok, false);
  assert.ok(
    result.failures.some((failure) => /does not exist/.test(failure)),
    `expected a missing-file failure, got ${JSON.stringify(result.failures)}`,
  );
});

test('a header missing a required key fails, naming the key', () => {
  const dir = sandbox({
    'a/SKILL.md': `${header({ copyright: null })}# a`,
    'vendor/methodology.md': ledger([goodRow]),
  });

  const result = checkProvenance(dir, ['a']);

  assert.equal(result.ok, false);
  assert.ok(
    result.failures.some((failure) => failure.includes('copyright')),
    `expected the missing key to be named, got ${JSON.stringify(result.failures)}`,
  );
});

test("a ledger row's upstream must match the header's, so a row cannot drift from its file", () => {
  const dir = sandbox({
    'a/SKILL.md': `${header()}# a`,
    'vendor/methodology.md': ledger(['| `a/SKILL.md` | `skills/engineering/tdd/SKILL.md` | verbatim | nothing |']),
  });

  const result = checkProvenance(dir, ['a']);

  assert.equal(result.ok, false);
  assert.ok(
    result.failures.some((failure) => /upstream/.test(failure)),
    `expected an upstream mismatch, got ${JSON.stringify(result.failures)}`,
  );
});

test('a header naming a ledger that does not exist fails', () => {
  const dir = sandbox({ 'a/SKILL.md': `${header({ ledger: 'vendor/nowhere.md' })}# a` });

  const result = checkProvenance(dir, ['a']);

  assert.equal(result.ok, false);
  assert.match(result.failures[0], /vendor\/nowhere\.md/);
});

test('an upstream name in a path fails, because L13 keeps brands out of the tree', () => {
  const dir = sandbox({
    'a/mattpocock-notes.md': `${header()}# a`,
    'vendor/methodology.md': ledger([
      '| `a/mattpocock-notes.md` | `skills/productivity/grilling/SKILL.md` | verbatim | nothing |',
    ]),
  });

  const result = checkProvenance(dir, ['a']);

  assert.equal(result.ok, false);
  assert.ok(
    result.failures.some((failure) => /mattpocock/.test(failure)),
    `expected an L13 path failure, got ${JSON.stringify(result.failures)}`,
  );
});

test('a directory that does not exist fails rather than passing silently', () => {
  const result = checkProvenance(sandbox({ 'a/SKILL.md': '# a' }), ['nowhere']);

  assert.equal(result.ok, false);
  assert.match(result.failures[0], /nowhere/);
});

test('a trailing slash on a scanned directory is accepted, as the verification command writes it', () => {
  const dir = sandbox({ 'a/SKILL.md': `${header()}# a`, 'vendor/methodology.md': ledger([goodRow]) });

  assert.equal(checkProvenance(dir, ['a/']).ok, true);
});

test('the CLI exits 0 on a clean tree and prints the summary line', () => {
  const dir = sandbox({ 'a/SKILL.md': `${header()}# a`, 'vendor/methodology.md': ledger([goodRow]) });
  const script = path.join(ROOT, 'scripts', 'check-provenance.mjs');

  const result = spawnSync(process.execPath, [script, 'a'], { cwd: dir, encoding: 'utf8' });

  assert.equal(result.status, 0);
  assert.match(result.stdout, /1 vendored file\(s\)/);
});

test('the CLI exits 1 and prints a FAIL line when a ledger row is missing', () => {
  const dir = sandbox({ 'a/SKILL.md': `${header()}# a`, 'vendor/methodology.md': ledger([]) });
  const script = path.join(ROOT, 'scripts', 'check-provenance.mjs');

  const result = spawnSync(process.execPath, [script, 'a'], { cwd: dir, encoding: 'utf8' });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /FAIL a\/SKILL\.md/);
});

test('every header key the checker requires is documented at the top of the ledger', () => {
  const methodology = fs.readFileSync(path.join(ROOT, 'vendor', 'methodology.md'), 'utf8');

  for (const key of HEADER_KEYS) {
    assert.match(methodology, new RegExp(`\`${key}\``), `vendor/methodology.md must document the \`${key}\` field`);
  }
});
