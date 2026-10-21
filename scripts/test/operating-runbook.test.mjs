/**
 * docs/OPERATING.md's "When the deck misbehaves" runbook (daemon-lifecycle spec 14): every
 * heading is there, each failure names its command in a code span, and every `pilot <verb>`
 * the section names is one bin/pilot.mjs dispatches.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { shippedNames } from '../check-references.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const doc = fs.readFileSync(path.join(ROOT, 'docs', 'OPERATING.md'), 'utf8');
const { commands } = shippedNames(ROOT);

// [heading, commands that heading names]. `pilot store restore` joins when store-durability
// is on pilot: uncomment its line below.
const SUBSECTIONS = [
  ['Where the deck writes', []],
  ['Is it running', ['pilot status']],
  ['A stuck deck', ['pilot ps', 'pilot gc']],
  // ['A corrupt store', ['pilot store restore']],
  ['Port 4321 is held', ['pilot doctor']],
];

function runbook() {
  const start = doc.indexOf('\n## When the deck misbehaves\n');
  assert.notEqual(start, -1, 'docs/OPERATING.md has no "## When the deck misbehaves" section');
  const rest = doc.slice(start + 1);
  const next = rest.slice(2).search(/\n## /);
  return next === -1 ? rest : rest.slice(0, next + 2);
}

function subsection(body, heading) {
  const at = body.indexOf(`\n### ${heading}\n`);
  assert.notEqual(at, -1, `no "### ${heading}" subsection`);
  const rest = body.slice(at + 1);
  const next = rest.slice(4).search(/\n### /);
  return next === -1 ? rest : rest.slice(0, next + 4);
}

test('the runbook names every heading and command', () => {
  const body = runbook();
  for (const [heading, commands] of SUBSECTIONS) {
    const text = subsection(body, heading);
    for (const command of commands) {
      assert.ok(text.includes(`\`${command}\``), `"${heading}" does not name \`${command}\` in a code span`);
    }
  }
  assert.ok(subsection(body, 'Where the deck writes').includes('deck.log'));
});

test('every command it names is a pilot verb', () => {
  const spans = [...runbook().matchAll(/`pilot ([a-z][a-z-]*)[^`]*`/g)].map((m) => m[1]);
  assert.ok(spans.length > 0);
  for (const verb of new Set(spans)) {
    assert.ok(commands.has(verb), `bin/pilot.mjs does not dispatch \`pilot ${verb}\``);
  }
});
