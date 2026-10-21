/**
 * S2 (architect-depth spec 1 (briefs), 4, 7, 8, 9, 10): the crew stops pasting slice
 * sections and starts passing slice-file paths, the implementer's red steps are the
 * slice's named Tests, a seam change that cannot hold goes to `main` as a replacement
 * Interface block rather than being guessed at, the pilot decides it unless a spec line
 * or a locked decision moves, and the fundamentalist reports a silent divergence from an
 * Interface block as a finding (L4, A2, A4).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const section = (text, startPattern, endPattern, label) => {
  const re = new RegExp(`${startPattern}\\r?\\n([\\s\\S]*?)\\r?\\n${endPattern}`);
  const match = re.exec(text);
  assert.ok(match, label);
  return match[1];
};

// Markdown prose wraps at the author's line width, so a phrase this test
// checks for can straddle a line break the source never meant as a word
// boundary. Collapse all whitespace before matching a multi-word phrase.
const norm = (text) => text.replace(/\s+/g, ' ');

const skillStep = (skill, n, next) =>
  section(skill, `### ${n}\\.[^\\n]*`, `### ${next}\\.`, `agents/pilot.md has no "### ${n}." step`);

const implementerOpening = () => {
  const implementer = read('agents/pilot-implementer.md');
  return section(
    implementer,
    'You are the implementer for one slice[^\\n]*',
    '## Where you work',
    'agents/pilot-implementer.md has no opening paragraph before "## Where you work"',
  );
};

test("step 4 briefs the implementer with the slice file's path", () => {
  const skill = read('agents/pilot.md');
  const step4 = skillStep(skill, 4, 5);
  assert.match(step4, /docs\/design\/<slug>\/slices\/S<n>\.md/, 'step 4 must name the slices/S<n>.md path');
  assert.doesNotMatch(step4, /verbatim/, 'step 4 must not say "verbatim"');

  const opening = implementerOpening();
  assert.match(opening, /the\s+path\s+of\s+its\s+slice\s+file,\s+the\s+worktree/, "the implementer's opening must name the slice file's path, not restate its template");
  assert.doesNotMatch(opening, /verbatim/, 'the implementer\'s opening must not say "verbatim"');
});

// pilot-develop-line S4: no slice PR is opened, so the Tests names ride the report instead of a PR body.
test("the implementer's red steps are the slice's Tests, listed in the report", () => {
  const implementer = read('agents/pilot-implementer.md');
  const loop = norm(section(implementer, '## The loop', '## Commit, push, report', 'agents/pilot-implementer.md has no "## The loop" section'));
  assert.match(loop, /prohibited shortcuts are in the slice file; .+? The slice file's Tests field names the red steps, in order; write and run them in that order\./, '"The loop" must point at the slice file and run its Tests in order, once');

  const report = norm(section(
    implementer,
    '## Report',
    '## When the context notice arrives',
    'agents/pilot-implementer.md has no "## Report" section',
  ));
  assert.match(report, /Tests? name/i, 'the report must say the Tests names are listed, red then green');
  assert.match(report, /red.*green|red,? then green/i, 'the report must say red then green');
});

// co-pilot-reports S1 moved the addressee from `main` to the spawner: the co-pilot when it spawned the implementer.
test('a signature that cannot hold goes to the addressee as the replacement block', () => {
  const implementer = read('agents/pilot-implementer.md');
  const questions = norm(section(
    implementer,
    '## Questions and blockers',
    '## Report',
    'agents/pilot-implementer.md has no "## Questions and blockers" section',
  ));
  assert.match(questions, /When a signature in the Interface block cannot hold, send your addressee a seam change: .+? plus the replacement Interface block, verbatim, and carry on with the work that does not depend on it\./, '"Questions and blockers" must carry the seam-change rule');
});

test('the pilot decides a seam change unless it moves a spec line or a locked decision', () => {
  const skill = read('agents/pilot.md');
  const step6 = norm(skillStep(skill, 6, 7));
  assert.match(step6, /A seam change is the pilot's: edit the owning slice file, committed on `feat\/<slug>`; ask the user only if it moves a spec line or a locked decision, and resume the architect only if a later slice's files or tests break\./, 'step 6 must carry the seam-change rule');
});

test('the fundamentalist reports a silent divergence from an Interface block', () => {
  const fundamentalist = read('agents/pilot-fundamentalist.md');
  const judgement = norm(section(
    fundamentalist,
    '## The judgement pass: principles',
    '\\d+\\.\\s+\\*\\*Modularity',
    'agents/pilot-fundamentalist.md has no "## The judgement pass: principles" section',
  ));
  assert.match(judgement, /A divergence from an Interface block that no slice-file edit records is a finding\./, 'the judgement pass must open with the divergence sentence');
});

test('the fundamentalist and QA read slice files, not pasted sections', () => {
  const skill = read('agents/pilot.md');
  const step7 = norm(skillStep(skill, 7, 8));
  assert.match(step7, /slice file's? paths?/i, 'step 7 must say "slice file\'s path(s)", not "slice section"');
  assert.doesNotMatch(step7, /slice sections?/i, 'step 7 must not say "slice section"');

  const step8 = norm(skillStep(skill, 8, 9));
  assert.match(step8, /slice files' paths/i, "step 8 must say \"slice files' paths\", not \"slice sections\"");
  assert.doesNotMatch(step8, /slice sections?/i, 'step 8 must not say "slice sections"');

  const fundamentalist = norm(read('agents/pilot-fundamentalist.md'));
  assert.match(fundamentalist, /slice files/i, 'agents/pilot-fundamentalist.md must say "slice files"');
  assert.doesNotMatch(fundamentalist, /slice sections?/i, 'agents/pilot-fundamentalist.md must not say "slice section"');

  const qa = norm(read('agents/pilot-qa.md'));
  assert.match(qa, /slice files' paths/i, "agents/pilot-qa.md must say \"slice files' paths\"");
  assert.doesNotMatch(qa, /slice sections?/i, 'agents/pilot-qa.md must not say "slice sections"');

  for (const skill of ['skills/code-review/SKILL.md', 'skills/resolving-merge-conflicts/SKILL.md']) {
    assert.doesNotMatch(norm(read(skill)), /slice(?:'s)? (?:artefact )?section|artefact's slice section/i, `${skill} must point at the slice file`);
  }
});
