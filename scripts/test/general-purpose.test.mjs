/**
 * The pilot is a tool for any programming, with web development one instance of it,
 * not the frame (user, 2026-09-28). The wording that walks a feature through Gate 2
 * and the live-verification gate is not pinned; the standing QA question must not
 * presume a database.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n');

test('the standing QA question does not presume a database', () => {
  // lint: the pilot's standing QA question never asks which database migrations run against
  assert.doesNotMatch(read('agents/pilot.md'), /which database do\s+migrations run against/, 'the standing question still presumes a database');
});
