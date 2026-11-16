/**
 * S9 of one-integration-line (spec 6; A1, A2, A4): the crew and the rules name one integration line.
 * Only forbidden commands and claims are tested, no phrase is required.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const flat = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/\s+/g, ' ');
const markdownUnder = (dir) => fs.readdirSync(path.join(ROOT, dir)).filter((name) => name.endsWith('.md')).map((name) => `${dir}/${name}`);

test('no prompt names the main merge', () => {
  // lint: no agent or rule names the main merge commands
  for (const rel of [...markdownUnder('agents'), ...markdownUnder('rules')]) {
    const text = flat(rel);
    for (const phrase of ['integrate --default', 'merge first', 'pr ready']) {
      assert.ok(!text.includes(phrase), `${rel} names "${phrase}"`);
    }
  }
});

test('no feature PR targets the default branch', () => {
  // lint: the pilot never opens a feature PR against the default branch
  assert.ok(!/feature PR[^.]*against the default branch/.test(flat('agents/pilot.md')), 'no feature PR against the default branch');
});
