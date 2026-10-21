/**
 * security-reviewer S1 (spec 1, 2, 7; L4, L6): a slice file's Reviewers line names who
 * reviews it, the architect writes `pilot:security-reviewer` there for any slice that hits
 * the security trigger, and the implementer spawns every reviewer the line names, adding
 * security when its own diff hits the trigger. The trigger list lives in the skill; the
 * implementer carries it verbatim, the architect names the skill it preloads, and the
 * fundamentalist, which does not preload it, names its path.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/\s+/g, ' ');

const TRIGGER =
  'auth, user input, secrets, an API boundary (a route, a hook input, a CLI argument), a process start, ' +
  'or agent configuration (`agents/`, `hooks/`, `skills/`, `settings*.json`, `.mcp.json`, `CLAUDE.md`)';

const FILES = ['skills/vertical-slicing/SKILL.md', 'agents/pilot-implementer.md'];

const architectItem8 = () => {
  const match = /8\. \*\*Slices\*\*:(.*?) 9\. /.exec(read('agents/pilot-architect.md'));
  assert.ok(match, 'agents/pilot-architect.md has no numbered item 8, "Slices"');
  return match[1];
};

const implementerReview = () => {
  const match = /(Then [^.]*fresh-context review.*?That is the whole review;)/.exec(read('agents/pilot-implementer.md'));
  assert.ok(match, 'agents/pilot-implementer.md has no fresh-context review paragraph ending "That is the whole review;"');
  return match[1];
};

test('the architect puts the security reviewer on every slice that hits the trigger', () => {
  const item = architectItem8();
  assert.match(item, /its reviewers/, 'item 8 must name a reviewers column in the slice table');
  assert.match(item, /`pilot:security-reviewer` on (any|every) slice that hits the security trigger/, 'item 8 must put security on every slice that hits the trigger');
  assert.match(item, /hits the security trigger \(`vertical-slicing`\)/, 'item 8 names the skill for the trigger');
});

test('the implementer spawns every reviewer its slice file names', () => {
  const review = implementerReview();
  assert.match(review, /every reviewer the slice file's Reviewers line names/, 'the review paragraph must spawn every named reviewer');
  assert.match(review, /`pilot:security-reviewer` if (the|your) diff hits the security trigger/, 'the own-diff clause must stay (spec 2, L6)');
  assert.ok(review.includes(TRIGGER), 'the review paragraph must carry the trigger list');
  assert.match(review, /`Verdict:` line/, "the implementer's report must carry the security verdict (spec 2)");
});

test('the trigger list is worded the same in skill and implementer', () => {
  const extracted = /security trigger: (.*?CLAUDE\.md`\))/.exec(read(FILES[0]));
  assert.ok(extracted, `${FILES[0]} defines no security trigger`);
  assert.equal(extracted[1], TRIGGER, "the skill's trigger is not the agreed list");
  for (const file of FILES) {
    assert.ok(read(file).includes(`security trigger: ${extracted[1]}`), `${file} does not carry the trigger list verbatim`);
  }
});

// S4 (spec 3, 4; A2, A4): a slice that slipped past its security reviewer is held at
// integration, and a feature whose security surface only shows whole gets the reviewer
// at step 7 on the fundamentalist's say-so, while the fundamentalist itself spawns nothing.
const pilotStep = (n) => {
  const match = new RegExp(`### ${n}\. (.*?) ### ${n + 1}\. `).exec(read('agents/pilot.md'));
  assert.ok(match, `agents/pilot.md has no step ${n}`);
  return match[1];
};

test('step 5 holds a slice named for security until its verdict is in', () => {
  const step = pilotStep(5);
  assert.match(step, /no security verdict, no integration/, 'step 5 must hold the slice without a verdict');
  // pilot-develop-line S4: no slice PR, so the verdict is read from the implementer's report and rides a trailer.
  assert.match(step, /Reviewers line names `pilot:security-reviewer` with no `Verdict:` line from it in the implementer's report waits/, 'the named slice is held');
  assert.doesNotMatch(step, /diff hits the security trigger/, 'step 5 holds on the Reviewers line alone');
  assert.match(step, /spawn `pilot:security-reviewer` on the slice branch/, 'step 5 must spawn the reviewer, not skip it');
  assert.match(step, /--trailer "Reviewed-by: <reviewer>: <verdict>"/, 'the verdict rides the merge as a trailer');
});

test('the fundamentalist says to consider calling the security reviewer', () => {
  const report = /## Report (.*?) ## Voice/.exec(read('agents/pilot-fundamentalist.md'));
  assert.ok(report, 'agents/pilot-fundamentalist.md has no Report section');
  const item4 = /4\. A findings table(.*?) 5\. /.exec(report[1]);
  assert.ok(item4, 'item 4 is the findings table');
  assert.match(item4[1], /security trigger \(read it in `\$\{CLAUDE_PLUGIN_ROOT\}\/skills\/vertical-slicing\/SKILL\.md`\)/, 'the row names the path of a skill the fundamentalist does not preload');
  assert.match(item4[1], /in files no slice whose Reviewers line names `pilot:security-reviewer` owns, a last row: `consider` \| security \| <files> \| <trigger hit> \| no slice's security verdict covers them \| spawn `pilot:security-reviewer` at step 7 \| 0/);
  assert.ok(!report[1].includes(TRIGGER), 'the trigger list is not copied');
  assert.doesNotMatch(report[1], / 7\. /, 'the separate item 7 is gone');
});

test('the fundamentalist still spawns no reviewer', () => {
  // cheaper-crew S2 (spec 4) gave it one child, the evidence runner, and no other (A2).
  const source = fs.readFileSync(path.join(ROOT, 'agents/pilot-fundamentalist.md'), 'utf8');
  const tools = /^tools: (.*)$/m.exec(source);
  assert.ok(tools, 'the fundamentalist has no tools line');
  const grants = [...tools[1].matchAll(/\bAgent\b(\([^)]*\))?/g)].map(([, list]) => list);
  assert.deepEqual(grants, ['(pilot:pilot-evidence-runner)'], 'the fundamentalist may spawn its runner only (A2)');
});

test('step 7 spawns the security reviewer on a consider row', () => {
  const step = pilotStep(7);
  assert.match(step, /`consider` row is not triaged away: spawn `pilot:security-reviewer` on its files/);
});
