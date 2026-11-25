// pr-overview S1: the overview's parse, its rules and the built line (pure functions, no host, no git).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { builtLine, crewRoles, overviewBlock, overviewOf, overviewProblems as allProblems, whatChangesOf } from '../pr-overview.mjs';

// The token and length pins below speak of the other rules; the label rule has its own test.
const overviewProblems = (text, roles) => allProblems(text, roles).filter((p) => p.rule !== 'overview-label');
const ROLES = ['architect', 'implementer', 'qa'];
const states = (...list) => ({ slices: list.map((state, at) => ({ slice: `S${at + 1}`, state })) });

test('overviewOf reads the section to the next heading outside a fence, or null', () => {
  const md = ['# T', '', '## Overview', '', 'Plain text.', '', '```', '## not a heading', '```', '', '## 1. Problem', 'Other.'].join('\n');
  assert.equal(overviewOf(md), 'Plain text.\n\n```\n## not a heading\n```');
  assert.equal(overviewOf('# T\n\n## 1. Problem\n\nNo overview.\n'), null);
  assert.equal(overviewOf('## Overview\n\n## 1. Problem\n'), null);
});

test('overviewBlock is null without an overview, else heading, text, built line', () => {
  assert.equal(overviewBlock('## 1. Problem\n', states('integrated')), null);
  assert.equal(overviewBlock('## Overview\n\nText.\n\n## 1. P\n', states('integrated', 'planned', 'planned')), '## Overview\n\nText.\n\nBuilt so far: 1 of 3 parts.');
});

test('the built line follows the record', () => {
  assert.equal(builtLine(states('integrated', 'pushed', 'planned')), 'Built so far: 1 of 3 parts.');
  assert.equal(builtLine(states('integrated', 'integrated (S2)', 'planned')), 'Built so far: 2 of 3 parts.');
  const rows = [...states('integrated', 'integrated', 'integrated').slices, { slice: 'feature', state: 'pushed' }, { slice: 'pr-overview', state: 'planned' }];
  assert.equal(builtLine({ slices: rows }), 'Built so far: 3 of 3 parts.', 'the feature row is no part');
  assert.equal(builtLine({}), 'Built so far: 0 of 0 parts.');
});

test('ids are refused, one problem each', () => {
  for (const token of ['S2', 'itm_ab12', 'A3', 'L1', 'ADR 0190', 'implementer']) {
    const found = overviewProblems(`This change touches ${token} today.`, ROLES);
    assert.deepEqual(found.map((p) => [p.line, p.rule]), [[1, 'overview-token']], token);
  }
  assert.deepEqual(overviewProblems('The pilot opens a PR.', ROLES), []);
  assert.deepEqual(overviewProblems('The change is `S2` here.', ROLES).map((p) => p.rule), ['overview-token']);
  assert.equal(overviewProblems('ok\nthen S1 and L2', ROLES).filter((p) => p.line === 2).length, 2);
});

test('length rules: over 150 words, or sentences averaging over 20 words', () => {
  const words = (n) => Array(n).fill('word').join(' ');
  assert.deepEqual(overviewProblems(`${words(10)}. `.repeat(15).trim(), ROLES), []);
  assert.deepEqual(overviewProblems(`${words(10)}. `.repeat(16).trim(), ROLES).map((p) => p.rule), ['overview-long']);
  assert.deepEqual(overviewProblems(`${words(10)}. `.repeat(14) + words(10), ROLES), [], 'exactly 150 words is allowed');
  assert.deepEqual(overviewProblems(`${words(10)}. `.repeat(14) + words(11), ROLES).map((p) => p.rule), ['overview-long']);
  assert.deepEqual(overviewProblems('The Implementer and QA.', []), [], 'no roles, no role rule');
  assert.equal(overviewProblems('The Implementer and QA.', ROLES).length, 2, 'role words match any case');
  assert.deepEqual(overviewProblems(`${words(21)}.`, ROLES).map((p) => p.rule), ['overview-sentences']);
  assert.deepEqual(overviewProblems(`${words(20)}.`, ROLES), []);
});

test('a What changes label is read, and its absence is a problem', () => {
  assert.equal(whatChangesOf('- **Why**: x.\n- **What changes**: the deck is faster.  '), 'the deck is faster.');
  assert.equal(whatChangesOf('- **What change**: the deck is faster.'), null);
  assert.equal(whatChangesOf('- **What changes**:\n- **Why**: x.'), null, 'an empty label does not borrow the next line');
  assert.deepEqual(allProblems('- **What change**: the deck is faster.', ROLES).map((p) => [p.line, p.rule]), [[1, 'overview-label']]);
  assert.deepEqual(allProblems('- **What changes**: the deck is faster.', ROLES), []);
});

test('crewRoles lists agents/pilot-*.md minus the prefix', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'roles-'));
  try {
    for (const name of ['pilot.md', 'pilot-qa.md', 'pilot-co-pilot.md', 'go-reviewer.md']) fs.writeFileSync(path.join(dir, name), '');
    assert.deepEqual(crewRoles(dir), ['co-pilot', 'qa']);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
