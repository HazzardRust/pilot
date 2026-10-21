/**
 * Spec 1, 2 of `docs/design/fundamentalist-decisions/architecture.md` (L1-L3, A2, A3): the
 * fundamentalist attacks the big-picture decisions first. A `## The decisions pass` runs
 * before the subtraction pass, walks every L, A and S of the artefact, and gives each one
 * verdict of needed, drop or simplify argued from the built diff; Report item 1 stays
 * **The case against** and opens with that decisions table; Scope discipline reads the
 * artefact's §5, §6 and §8 beside the diff.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { flat, read, sectionOf } from './lib/area-file.mjs';

const source = read('agents/pilot-fundamentalist.md');

const decisions = () => {
  const section = sectionOf(source, 'The decisions pass');
  assert.ok(section, 'agents/pilot-fundamentalist.md has no "## The decisions pass" section');
  return flat(section);
};

test('the decisions pass comes first', () => {
  const at = source.indexOf('\n## The decisions pass\n');
  const subtraction = source.indexOf('\n## The subtraction pass');
  assert.ok(at !== -1, 'agents/pilot-fundamentalist.md has no "## The decisions pass" heading');
  assert.ok(subtraction !== -1, 'agents/pilot-fundamentalist.md has no "## The subtraction pass" heading');
  assert.ok(at < subtraction, 'the decisions pass must come before the subtraction pass');
});

test('every decision and slice gets one verdict', () => {
  const section = decisions();
  for (const id of ['L‹n›', 'A‹n›', 'S‹n›']) {
    assert.ok(section.includes(id), `the decisions pass never names ${id}`);
  }
  for (const verdict of ['needed', 'drop', 'simplify']) {
    assert.match(section, new RegExp(`\\b${verdict}\\b`), `the decisions pass never names the verdict ${verdict}`);
  }
  assert.match(section, /\bone row\b/i, 'the decisions pass never asks for one row per id');
  assert.match(section, /\bone verdict\b/i, 'the decisions pass never asks for one verdict per row');
});

test('a needed row carries evidence too', () => {
  const sentences = decisions().split(/(?<=\.)\s/);
  assert.ok(
    sentences.some((s) => /\b(drop|simplify)\b/.test(s) && /`file:line`/.test(s)),
    'no sentence asks a drop or simplify row for a file:line of the built diff',
  );
  assert.ok(
    sentences.some((s) => /\bneeded\b/.test(s) && /spec line/.test(s)),
    'no sentence asks a needed row for the spec line that fails without it',
  );
});

test('report item 1 opens with the decisions table', () => {
  const report = sectionOf(source, 'Report');
  assert.ok(report, 'agents/pilot-fundamentalist.md has no "## Report" section');
  const item = flat(report.split(/\n\s*2\.\s/)[0]);
  const table = item.indexOf('decisions table');
  assert.ok(table !== -1, 'item 1 never names the decisions table');
  assert.ok(table < item.indexOf('strongest argument'), 'item 1 must open with the decisions table, before the argument');
});

test('the scope reads the artefact', () => {
  const scope = flat(sectionOf(source, 'Scope discipline'));
  assert.ok(scope, 'agents/pilot-fundamentalist.md has no "## Scope discipline" section');
  assert.match(scope, /artefact/, 'Scope discipline never names the artefact');
  for (const part of ['§5', '§6', '§8']) {
    assert.ok(scope.includes(part), `Scope discipline never names the artefact's ${part}`);
  }
});

test('a process record is needed on "no built line", never a decision finding', () => {
  const section = decisions();
  assert.match(section, /process record/, 'the decisions pass never names a process record');
  assert.match(section, /no built line/, 'the decisions pass never gives a process record the evidence "no built line"');
});
