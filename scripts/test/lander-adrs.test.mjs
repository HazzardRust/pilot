/**
 * Lints for the lander's ADR record (lander S11): the three superseded decisions
 * carry the amended status, and the lander ADR keeps its sections.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ADR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'docs', 'adr');
const NEW = '0161-the-lander-owns-every-merge.md';
const AMENDED = [
  '0111-a-signed-gate2-lands-from-the-deck.md',
  '0116-a-finished-feature-lands-on-pilot-before-its-gate-2.md',
  '0154-gate2-frees-the-lane.md',
];
const read = (name) => fs.readFileSync(path.join(ADR, name), 'utf8').replace(/\r\n/g, '\n');

test('the amended ADRs say so', () => {
  // lint: the status field
  for (const name of AMENDED) assert.match(read(name), /^status: amended$/m, name);
});

test('the lander ADR has its four sections', () => {
  // lint: its decision labels and headings exist
  const text = read(NEW);
  for (let n = 2; n <= 10; n++) assert.ok(text.includes(`**L${n} `), `L${n}`);
  for (const h of ['## Context', '## Decision', '## Rejected', '## Consequences']) assert.ok(text.includes(h), h);
});

test('0111 no longer offers a second Sign off', () => {
  // lint: forbidden pattern
  assert.doesNotMatch(read(AMENDED[0]), /offers Sign off again/);
});
