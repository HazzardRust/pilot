/**
 * Pins for the lander's ADR record (lander S11): the three superseded
 * decisions are amended, not rewritten, and each names the new ADR.
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
  for (const name of AMENDED) {
    const text = read(name);
    assert.match(text, /^status: amended$/m, name);
    assert.match(text, /^Amended 2026-10-\d\d[^\n]*0161/m, `${name} names the ADR that amends it`);
  }
});

test('the lander ADR has its four sections', () => {
  const text = read(NEW);
  for (let n = 2; n <= 10; n++) assert.ok(text.includes(`**L${n} `), `L${n}`);
  for (const h of ['## Context', '## Decision', '## Rejected', '## Consequences']) assert.ok(text.includes(h), h);
});

test('0154 says its L6 is reversed', () => {
  assert.match(read(AMENDED[2]), /L6[^\n]*is reversed/);
});

// one-integration-line S10: ADR 0167 amends both again; the lines above stand.
test('0154 says its L4 retry is gone and 0161 its L3 is --trial', () => {
  assert.match(read(AMENDED[2]), /^Amended[^\n]*0167[^\n]*L4's ready retry[^\n]*is gone/m);
  assert.match(read(NEW), /^Amended[^\n]*0167[^\n]*L3's `pilot integrate --default` is `pilot integrate --trial`/m);
});

test('0111 no longer offers a second Sign off', () => {
  assert.doesNotMatch(read(AMENDED[0]), /offers Sign off again/);
});
