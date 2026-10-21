/**
 * run-chaining S5 (spec 1, 3 via A4, 10): a DAG over the one-run bound comes back from
 * the architect as runs, the pilot asks the split once and only then, and a later run of
 * a split is stored as a ticket whose body the next run's first turn can start from.
 *
 * These pin the instruction text that steers the behaviour; a unit test cannot drive the
 * live model. The pilot share's own pin (<= 10336.75 tokens) is the existing one in
 * measure-prompt.test.mjs.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n');

const between = (source, start, end, what) => {
  const from = source.indexOf(start);
  assert.ok(from >= 0, `${what}: "${start}" not found`);
  const to = source.indexOf(end, from + start.length);
  return source.slice(from, to < 0 ? undefined : to);
};

const oneLine = (text) => text.replace(/\s+/g, ' ');

// bigger-jobs S3 (spec 3): 20 slices is an aim, not a refusal; past it is one run unless the user asks.
test('past 20 slices the architect cuts one run unless the user asks for a split', () => {
  const slices = oneLine(between(read('agents/pilot-architect.md'), '8. **Slices**', '9. **Acceptance', 'artefact §8'));
  assert.match(slices, /20 slices is the aim/i, 'the aim is not stated');
  assert.doesNotMatch(slices, /runs of at most 20/i, 'past 20 is still a forced split');
  assert.match(slices, /one run unless the user asks for a split/i, 'past the aim is not one run');
  assert.match(slices, /own Gate 2/, 'a run is not its own feature PR with its own Gate 2');
  assert.match(slices, /\*\*Runs\*\* table: run, slices, spec lines, after/, 'no Runs table with its columns');
  assert.match(slices, /stashed decision/, 'the split is not sent to main as a stashed decision');
});

test('a run has no slice ceiling', () => {
  const slices = oneLine(between(read('agents/pilot-architect.md'), '8. **Slices**', '9. **Acceptance', 'artefact §8'));
  assert.doesNotMatch(slices, /reach 22/i, 'a 22-slice ceiling is still stated');
});

// ticket-states S11 (A6): the skill's Size section became Estimates, so the pointer moves with it.
test("the architect points at the skill's Estimates section and does not restate a figure", () => {
  const slices = oneLine(between(read('agents/pilot-architect.md'), '8. **Slices**', '9. **Acceptance', 'artefact §8'));
  assert.match(
    slices,
    /\$\{CLAUDE_PLUGIN_ROOT\}\/skills\/ticket-making\/SKILL\.md.*"Estimates"/,
    "the architect does not point at the skill's Estimates section",
  );
  assert.doesNotMatch(slices, /"Size"/, 'the architect still points at the retired Size section');
  assert.doesNotMatch(
    slices,
    /\d+ ?min|minutes per slice|\d+ ?h(ours?)?\b|5 to 7 hours/i,
    'the architect restates an Estimates figure instead of referring to it',
  );
});

test('the pilot asks the split once, and only over the bound', () => {
  const step3 = oneLine(between(read('agents/pilot.md'), '### 3. Grilling', '## Phase B', 'step 3'));
  assert.match(step3, /Runs table[^.]*one `question`/, 'the split is not one question on the Runs table');
  assert.match(step3, /"One run"/, 'the one-run option is missing');
  assert.match(step3, /"In sequence on this deck" \(recommended\)/, 'in sequence on this deck is not the recommendation');
  assert.match(step3, /"In parallel on separate decks"/, 'the parallel option is missing');
  assert.match(step3, /within the bound, ask nothing/i, 'a run within the bound is still asked the split');
  assert.match(step3, /after Gate 1[^.]*one `ticket` per later run, in order/, 'sequence does not store the later runs as tickets');
});

test("a later run's ticket names the artefact, its slices and spec lines", () => {
  const skill = oneLine(read('agents/pilot.md'));
  assert.ok(
    skill.includes('`Run <n> of <feature>: docs/design/<slug>/architecture.md approved at Gate 1 (<PR>); slices <S…>; spec lines <…>`'),
    "the ticket body form for a later run is missing",
  );
});
