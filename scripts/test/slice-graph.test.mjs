/**
 * slice-graph S4: the crew reads parallelism off the lanes the deck draws. These pin the
 * wording in the pilot's and the architect's definitions and ADR 0101.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n');
const flat = (text) => text.replace(/\s+/g, ' ');

test("the pipeline relaxation names the lane", () => {
  assert.match(flat(read('agents/pilot.md')), /next slice on N's lane/);
});

test('the parallel relaxation is read off the lanes', () => {
  const pilot = flat(read('agents/pilot.md'));
  assert.match(pilot, /Parallel lanes\.\*\* Slices no line joins/);
  assert.doesNotMatch(pilot, /share no DAG edge/);
});

test('the architect lists blockers and names lanes', () => {
  const architect = flat(read('agents/pilot-architect.md'));
  assert.match(architect, /slices on side-by-side lanes/);
  assert.match(architect, /the blockers \(the slices it comes after/);
  assert.doesNotMatch(architect, /slices that could run\s+in parallel/);
});

test('pilot.md no longer mirrors delivers', () => {
  assert.doesNotMatch(read('agents/pilot.md'), /`delivers`/);
});

test('ADR 0101 supersedes 0014', () => {
  const file = 'docs/adr/0101-the-deck-draws-a-run-as-a-git-graph.md';
  assert.ok(fs.existsSync(path.join(ROOT, file)), 'ADR 0101 exists');
  const adr = read(file);
  assert.match(adr, /^supersedes: \[0014\]$/m);
  assert.match(adr, /graphOf/);
  assert.match(adr, /The lane rule is git's/);
  assert.match(adr, /`after` becomes a list/);
  assert.match(read('docs/adr/0014-the-deck-draws-a-run-as-a-tree.md'), /^superseded_by: \[0101\]$/m);
});

// design-docs-only S5: the architect cuts for width and the gate1 names the cut's shape.
const section = (text, start, end) => {
  const from = text.indexOf(start);
  const to = text.indexOf(end, from);
  assert.ok(from >= 0 && to > from, `${start} ... ${end} is in the file`);
  return flat(text.slice(from, to));
};
const itemEight = () => section(read('agents/pilot-architect.md'), '8. **Slices**', '9. **Acceptance');

test('the architect cuts for width', () => {
  const eight = itemEight();
  assert.match(eight, /share no owned file and no seam get no `after`/);
  assert.match(eight, /a stem is as long as its shared files make it/);
});

test('every after carries its reason', () => {
  assert.match(itemEight(), /`S<n> \(<shared file or seam>\)`/);
});

test('the artefact states its width', () => {
  assert.match(itemEight(), /`Width <n>; longest stem <m>` above the table/);
  const report = section(read('agents/pilot-architect.md'), '## Report', '\n## When');
  assert.match(report, /slice count, width and longest stem/);
});

test("the gate1 names the cut's shape", () => {
  const gate = section(read('agents/pilot.md'), '**Gate 1** is', 'Sign off and Not yet');
  assert.match(gate, /width and longest stem/);
});
