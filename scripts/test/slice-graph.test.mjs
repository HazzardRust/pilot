/**
 * slice-graph S4: the crew reads parallelism off the lanes the deck draws. The lints that
 * stay are forbidden patterns and the ADR supersession fields; the phrase pins are gone
 * (crew-tests-behaviour S10, L5): prose is not a test target.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n');
const flat = (text) => text.replace(/\s+/g, ' ');

test('the parallel relaxation is not read off a DAG edge', () => {
  // lint: pilot.md carries no "share no DAG edge" wording
  assert.doesNotMatch(flat(read('agents/pilot.md')), /share no DAG edge/);
});

test('the architect does not draw parallelism as a list of parallel slices', () => {
  // lint: pilot-architect.md carries no "slices that could run in parallel" wording
  assert.doesNotMatch(flat(read('agents/pilot-architect.md')), /slices that could run\s+in parallel/);
});

test('pilot.md no longer mirrors delivers', () => {
  // lint: pilot.md carries no `delivers` field mirror
  assert.doesNotMatch(read('agents/pilot.md'), /`delivers`/);
});

test('ADR 0101 supersedes 0014', () => {
  // lint: the supersession fields on both ADRs agree
  const file = 'docs/adr/0101-the-deck-draws-a-run-as-a-git-graph.md';
  assert.ok(fs.existsSync(path.join(ROOT, file)), 'ADR 0101 exists');
  assert.match(read(file), /^supersedes: \[0014\]$/m);
  assert.match(read('docs/adr/0014-the-deck-draws-a-run-as-a-tree.md'), /^superseded_by: \[0101\]$/m);
});
