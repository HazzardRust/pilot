/**
 * crew-voice-rules S9 (spec 9, 10; L7, L16): arkts/ and react-native/ load on their own
 * marker files, not on every TypeScript file. Each test asks which rules directories
 * reading one sample file would load, through S8's glob reading.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { listOf, split } from '../measure-prompt.mjs';
import { globToRegExp } from '../audit-context.mjs';

const RULES = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'rules');

/** The rules directories whose `paths:` match `sample`, a path relative to a project. */
function loadedBy(sample) {
  const dirs = new Set();
  for (const rel of fs.readdirSync(RULES, { recursive: true })) {
    if (!rel.endsWith('.md')) continue;
    const globs = listOf(split(fs.readFileSync(path.join(RULES, rel), 'utf8')).front, 'paths')
      .map((glob) => glob.replace(/^["']|["']$/g, ''));
    if (globs.some((glob) => globToRegExp(glob).test(sample))) dirs.add(rel.split(path.sep)[0]);
  }
  return [...dirs].sort();
}

test('only typescript\'s globs match a plain .ts file', () => {
  assert.deepEqual(loadedBy('src/a.ts'), ['typescript']);
  assert.deepEqual(loadedBy('src/a.tsx'), ['react', 'typescript', 'web']);
});

test('vue still loads on a composable', () => {
  assert.ok(loadedBy('src/composables/x.ts').includes('vue'));
});

test('arkts still loads on an .ets file', () => {
  assert.ok(loadedBy('entry/src/main/ets/a.ets').includes('arkts'));
});

test('react-native still loads on a metro config', () => {
  assert.ok(loadedBy('metro.config.js').includes('react-native'));
  assert.ok(loadedBy('src/App.native.tsx').includes('react-native'));
});
