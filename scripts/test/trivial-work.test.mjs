/**
 * main-never-red S4 (spec 3; L6): the ADR behind the pilot's trivial-work gate exists. The
 * phrase pin on the pilot's wording is gone (crew-tests-behaviour S10, L5).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..', '..');

test('the ADR main-never-goes-red exists', () => {
  // lint: the ADR file exists
  const dir = path.join(ROOT, 'docs', 'adr');
  const file = fs.readdirSync(dir).find((name) => /^\d{4}-main-never-goes-red\.md$/.test(name));
  assert.ok(file, 'no ADR "Main never goes red" in docs/adr/');
});
