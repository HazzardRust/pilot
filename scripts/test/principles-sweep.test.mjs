/**
 * Spec line 28 (L29, L14). The principles review used to run twice: once per slice on
 * its own draft PR (Sonnet), and once more on the whole feature when the last slice
 * landed (Opus). That gave every slice a second reviewer fanned out beside its own
 * language reviewer, and the same design question got asked and re-triaged five or
 * ten times across one run. From S13 on it runs exactly once, on Opus, over the whole
 * feature, and its kept findings land before the Gate 2 sign-off; the implementer's own
 * fresh reviewer per slice is unchanged and is not what this slice touches.
 *
 * A bare `grep -c "per slice"` would pass if every mention of "per slice" were deleted,
 * including the three that describe the implementer's own reviewer and are supposed to
 * survive untouched. So this file asserts both halves by name: the old per-slice
 * scheduling of the principles review is gone, the new once-over-the-feature scheduling
 * is stated, and the three surviving "one reviewer per slice" lines about the language
 * reviewer are still there and still say that. Deleting either half fails a different
 * assertion below, so the pin cannot be satisfied by deleting both.
 *
 * L14: this pins its own new file rather than being appended to pilot-agents.test.mjs.
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
  assert.match(
    description,
    /run once, on Opus, over the whole feature/i,
    'the fundamentalist\'s description must say it runs once, on Opus, over the whole feature',
  );
  assert.match(
    description,
    /Spawned by the pilot at step 7/,
    'the fundamentalist\'s description must name the single step that spawns it',
  );

  assert.equal(fieldOf(fm, 'model'), 'opus', 'the fundamentalist runs on Opus now that there is no per-slice Sonnet pass');
});

test('the pilot\'s own description no longer promises a review of each draft PR', () => {
  const fm = frontmatterOf(read(PILOT));
  const description = fieldOf(fm, 'description');
  assert.ok(description, 'agents/pilot.md must declare a description');

  assert.doesNotMatch(
    description,
    /reviews each draft PR/i,
    'the pilot\'s description still says the fundamentalist reviews each slice\'s draft PR',
  );
  assert.match(
    description,
    /reviews the whole feature once, on Opus/i,
    'the pilot\'s description must say the fundamentalist reviews the whole feature once, on Opus',
  );
});

test('the pilot agent\'s own crew table no longer offers the fundamentalist per slice or per feature', () => {
  const pilot = read(PILOT);
  assert.doesNotMatch(
    pilot,
    /of one slice's draft PR or of the whole feature/i,
    'the pilot agent still describes the fundamentalist as reviewing a slice or the feature',
  );
  // Independence S4 deleted the crew table as a restatement of the Agent tool's own
  // list; "once, on Opus, over the whole feature" is pinned in the fundamentalist's
  // description (above) and in step 7 of the skill (below).
});

test('the skill\'s per-slice step no longer runs a principles review or a fix round', () => {
  const skill = read(PILOT);

  assert.doesNotMatch(
    skill,
    /Principles review and fix round per slice/i,
    'a step is still titled as a per-slice principles review and fix round',
  );
  assert.match(
    skill,
    /no slice was reviewed on principles on its own way in/i,
    'the skill must say plainly that no principles review runs per slice',
  );
  assert.match(
    skill,
    /### 7\. Feature-level principles review and fix round, once, AFK/,
    'the surviving principles-review step must say it runs once',
  );
  assert.match(
    skill,
    /this is the feature's only\s+principles review/i,
    'the feature-level step must say it is the feature\'s only principles review',
  );
  assert.doesNotMatch(
    skill,
    /per-slice verdicts from\s+step 5/i,
    'the feature-level step still expects per-slice verdicts to carry forward',
  );
});

test('the kept findings from the sweep are fixed before the Gate 2 sign-off', () => {
  const skill = read(PILOT);
  assert.match(
    skill,
    /before the Gate 2\s+sign-off at step 9/i,
    'the skill must say the sweep\'s kept findings are fixed before the Gate 2 sign-off',
  );

  const execution = read(EXECUTION);
  assert.match(
    execution,
    /before the feature\s+PR's Gate 2 sign-off/i,
    'the rule must say the sweep\'s kept findings land before the feature PR\'s Gate 2 sign-off',
  );
});

test('the Models table gives the fundamentalist Opus with no per-slice override', () => {
  const skill = read(PILOT);
  assert.match(
    skill,
    /\|\s*pilot-fundamentalist\s*\|\s*Opus\s*\|/,
    'the Models table must default the fundamentalist to Opus',
  );
  assert.doesNotMatch(
    skill,
    /Opus for the feature-level review at step 7, and for a slice that introduces/i,
    'the Models table still offers a Sonnet default with an Opus override per slice',
  );
});

test('vertical-execution.md rewrites the per-slice review argument rather than deleting it', () => {
  const execution = read(EXECUTION);

  assert.doesNotMatch(
    execution,
    /reviews each slice against design principles/i,
    'the rule\'s opening still says the fundamentalist reviews each slice',
  );
  assert.match(
    execution,
    /reviews the whole feature once, on Opus, after the/i,
    'the rule\'s opening must say the fundamentalist reviews the whole feature once, on Opus',
  );

  assert.doesNotMatch(
    execution,
    /each slice's draft PR also gets a \*\*principles review\*\*/i,
    'section 4 still gives every slice\'s draft PR a principles review of its own',
  );
  assert.match(
    execution,
    /run once, on Opus, when\s+the last slice is integrated, never on a slice's own branch/i,
    'section 4 must say plainly when and how often the principles review runs now',
  );

  // The argument for reviewing each slice as it landed is rewritten, not deleted (S18):
  // it must still name the real cost of running late, and still name what carries
  // review-as-it-lands in the meantime — the implementer's own per-slice reviewer.
  assert.match(
    execution,
    /cost is real/i,
    'the rewritten argument must name the cost of a late review honestly, not hide it',
  );
  assert.match(
    execution,
    /is the language reviewer above/i,
    'the rewritten argument must name what still catches a problem as it lands: the language reviewer',
  );
});

test('the three surviving "one reviewer per slice" lines, about the implementer\'s own language reviewer, are untouched', () => {
  const execution = read(EXECUTION);

  // Independence S4 deleted the skill's Concurrency and Anti-patterns sections as
  // restatements of rules/orchestration.md, where the ban now lives alone.
  assert.match(
    read('rules/orchestration.md'),
    /one reviewer per slice, chosen by language/i,
    'orchestration.md must still say fan-out over a diff is never more than one reviewer per slice',
  );
  assert.match(
    execution,
    /One reviewer per slice, matched to its language/,
    'vertical-execution.md must still give the implementer one reviewer per slice, matched to its language',
  );
});

test('a grep for "per slice" across the four files finds nothing tying the principles review to a slice', () => {
  // The evidence the slice asks for, run programmatically rather than read by eye alone:
  // every remaining "per slice" line must be about the slice loop or the language
  // reviewer, never about the fundamentalist or the principles review.
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
