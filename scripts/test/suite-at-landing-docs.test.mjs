// suite-at-landing S9 (spec 6): the runbook and `pilot help` say that every step before the landing
// tests the selection and that the full suite runs once, at `pilot land`; ADR 0166 records why.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (...p) => fs.readFileSync(path.join(ROOT, ...p), 'utf8');

const help = () => {
  const r = spawnSync(process.execPath, [path.join(ROOT, 'bin', 'pilot.mjs'), 'help'], { encoding: 'utf8', timeout: 10000 });
  assert.equal(r.status, 0, r.stderr);
  return r.stdout;
};

// One help entry: the `  pilot <name>` line and the indented lines under it.
const entry = (text, name) => {
  const m = text.match(new RegExp(String.raw`^ {2}pilot ${name}\b[^\n]*\n(?: {10,}[^\n]*\n?)*`, 'm'));
  assert.ok(m, `pilot help lists ${name}`);
  return m[0];
};

test('the runbook names each step\'s scope', () => {
  const body = read('docs', 'OPERATING.md').split(/^## Which tests run when\s*$/m)[1];
  assert.ok(body, 'OPERATING.md has `## Which tests run when`');
  const section = body.split(/^## /m)[0];
  assert.match(section, /test:changed/);
  assert.match(section, /pilot land/);
  assert.match(section, /full suite/);
});

test('the help names the scope', () => {
  const text = help();
  assert.match(entry(text, 'integrate'), /test the selection/);
  assert.match(entry(text, 'sync'), /test the selection/);
  assert.match(entry(text, 'land'), /run the full suite/);
});

test('the ADR is indexed', () => {
  const adr = read('docs', 'adr', '0166-the-full-suite-runs-at-the-landing.md');
  for (const p of ['scripts/select-tests.mjs', 'scripts/gate.mjs', 'scripts/integrate.mjs', 'scripts/sync.mjs', 'scripts/land.mjs']) {
    assert.ok(adr.match(/^paths: \[(.*)\]$/m)[1].split(', ').includes(p), `paths names ${p}`);
  }
  assert.match(read('docs', 'adr', 'README.md'), /^\| 0166 \| \[[^\]]+\]\(0166-the-full-suite-runs-at-the-landing\.md\) \| [a-z]+ \|/m);
  const r = spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'adr-index.mjs'), '--check'], { encoding: 'utf8', cwd: ROOT });
  assert.equal(r.status, 0, r.stdout + r.stderr);
});
