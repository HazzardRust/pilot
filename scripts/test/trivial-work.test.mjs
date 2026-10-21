/**
 * main-never-red S4 (spec 3; L6): the pilot's trivial work gates in full once and stays a draft
 * until the user's Sign off, so a ready PR with no gate (#685) cannot open by its hand. A
 * rewording keeps its pin while the four facts survive: trivial work, the full gate on the final
 * state, `--draft`, and the Sign off.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { read, sectionOf, flat } from './lib/area-file.mjs';

const ROOT = path.resolve(import.meta.dirname, '..', '..');

test('the pilot gates trivial work in full once and opens it as a draft', () => {
  const shape = flat(sectionOf(read('agents/pilot.md'), 'The shape of a run'));
  assert.notEqual(shape, '', 'agents/pilot.md has no "## The shape of a run"');
  const sentence = shape.split(/(?<=\.)\s+/).find((s) => /\btrivial work\b/i.test(s)) ?? '';
  assert.notEqual(sentence, '', 'the shape of a run names no trivial work');
  assert.match(sentence, /\bfull gate\b[^.]*\bonce\b[^.]*\bfinal state\b/, 'trivial work is not gated in full once on its final state');
  assert.match(sentence, /`--draft`/, 'trivial work is not opened `--draft`');
  assert.match(sentence, /\bready only on the user's Sign off\b/, 'trivial work is not marked ready only on the Sign off');
});

test('the ADR main-never-goes-red exists', () => {
  const dir = path.join(ROOT, 'docs', 'adr');
  const file = fs.readdirSync(dir).find((name) => /^\d{4}-main-never-goes-red\.md$/.test(name));
  assert.ok(file, 'no ADR "Main never goes red" in docs/adr/');
});
