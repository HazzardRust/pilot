/**
 * docs/OPERATING.md's "When the deck misbehaves" runbook (daemon-lifecycle spec 14): every `pilot <verb>`
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

function runbook() {
  const start = doc.indexOf('\n## When the deck misbehaves\n');
  assert.notEqual(start, -1, 'docs/OPERATING.md has no "## When the deck misbehaves" section');
  const rest = doc.slice(start + 1);
  const next = rest.slice(2).search(/\n## /);
  return next === -1 ? rest : rest.slice(0, next + 2);
}

// lint: every `pilot <verb>` the runbook names is one bin/pilot.mjs dispatches
test('every command it names is a pilot verb', () => {
  const spans = [...runbook().matchAll(/`pilot ([a-z][a-z-]*)[^`]*`/g)].map((m) => m[1]);
  assert.ok(spans.length > 0);
  for (const verb of new Set(spans)) {
    assert.ok(commands.has(verb), `bin/pilot.mjs does not dispatch \`pilot ${verb}\``);
  }
});
