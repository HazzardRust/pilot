/**
 * Spec line 28 (L29, L14). The principles review runs once, on Opus, over the whole
 * feature; it no longer runs per slice on a draft PR. What is kept here is the lint:
 * the old per-slice scheduling must not reappear in the pilot, the fundamentalist or
 * the rule. The phrases that state the new scheduling are not pinned.
 *
 * L14: this lints its own file rather than being appended to pilot-agents.test.mjs.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { frontmatterOf as leadingFrontmatter } from './lib/area-file.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const frontmatterOf = (source) => {
  const block = leadingFrontmatter(source);
  assert.ok(block, 'no frontmatter block found');
  return block;
};

const fieldOf = (frontmatter, name) => {
  const match = new RegExp(`^${name}:\\s*(.+)$`, 'm').exec(frontmatter);
  return match ? match[1].trim() : undefined;
};

const PILOT = 'agents/pilot.md';
const FUNDAMENTALIST = 'agents/pilot-fundamentalist.md';
const EXECUTION = 'rules/vertical-execution.md';

test('the fundamentalist\'s own description no longer schedules a per-slice pass', () => {
  const fm = frontmatterOf(read(FUNDAMENTALIST));
  const description = fieldOf(fm, 'description');
  assert.ok(description, 'agents/pilot-fundamentalist.md must declare a description');

  // lint: the fundamentalist's description must not bring back the per-slice schedule
  assert.doesNotMatch(
    description,
    /once per slice on its draft PR/i,
    'the fundamentalist\'s description still says it runs once per slice on its draft PR',
  );
  assert.doesNotMatch(
    description,
    /steps 5 and 7/,
    'the fundamentalist\'s description still points at the old two-step schedule',
  );

  // lint: the fundamentalist's model field stays opus
  assert.equal(fieldOf(fm, 'model'), 'opus', 'the fundamentalist runs on Opus now that there is no per-slice Sonnet pass');
});

test('the pilot\'s own description no longer promises a review of each draft PR', () => {
  const fm = frontmatterOf(read(PILOT));
  const description = fieldOf(fm, 'description');
  assert.ok(description, 'agents/pilot.md must declare a description');

  // lint: the pilot's description must not promise a review of each draft PR
  assert.doesNotMatch(
    description,
    /reviews each draft PR/i,
    'the pilot\'s description still says the fundamentalist reviews each slice\'s draft PR',
  );
});

test('the pilot agent\'s own crew table no longer offers the fundamentalist per slice or per feature', () => {
  const pilot = read(PILOT);
  // lint: the pilot must not offer the fundamentalist per slice or per feature
  assert.doesNotMatch(
    pilot,
    /of one slice's draft PR or of the whole feature/i,
    'the pilot agent still describes the fundamentalist as reviewing a slice or the feature',
  );
});

test('the skill\'s per-slice step no longer runs a principles review or a fix round', () => {
  const skill = read(PILOT);

  // lint: no step is titled as a per-slice principles review, and none expects per-slice verdicts
  assert.doesNotMatch(
    skill,
    /Principles review and fix round per slice/i,
    'a step is still titled as a per-slice principles review and fix round',
  );
  assert.doesNotMatch(
    skill,
    /per-slice verdicts from\s+step 5/i,
    'the feature-level step still expects per-slice verdicts to carry forward',
  );
});

test('the Models table gives the fundamentalist no per-slice override', () => {
  const skill = read(PILOT);
  // lint: the Models table must not offer a Sonnet default with an Opus override per slice
  assert.doesNotMatch(
    skill,
    /Opus for the feature-level review at step 7, and for a slice that introduces/i,
    'the Models table still offers a Sonnet default with an Opus override per slice',
  );
});

test('vertical-execution.md no longer gives each slice a principles review', () => {
  const execution = read(EXECUTION);

  // lint: the rule must not give each slice's draft PR a principles review
  assert.doesNotMatch(
    execution,
    /reviews each slice against design principles/i,
    'the rule\'s opening still says the fundamentalist reviews each slice',
  );
  assert.doesNotMatch(
    execution,
    /each slice's draft PR also gets a \*\*principles review\*\*/i,
    'section 4 still gives every slice\'s draft PR a principles review of its own',
  );
});

test('a grep for "per slice" across the four files finds nothing tying the principles review to a slice', () => {
  // lint: no "per slice" line shares a line with the principles review or the fundamentalist
  const files = [PILOT, FUNDAMENTALIST, EXECUTION];
  const offenders = [];

  for (const rel of files) {
    const lines = read(rel).split(/\r?\n/);
    for (const [i, line] of lines.entries()) {
      if (!/per slice/i.test(line)) continue;
      if (/principl|fundamentalist/i.test(line)) {
        offenders.push(`${rel}:${i + 1}: ${line.trim()}`);
      }
    }
  }

  assert.deepEqual(offenders, [], `"per slice" still shares a line with the principles review:\n${offenders.join('\n')}`);
});
