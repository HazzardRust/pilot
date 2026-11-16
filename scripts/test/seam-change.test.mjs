/**
 * S2 (architect-depth): the crew passes slice-file paths, not pasted slice sections. Only
 * forbidden-pattern lints stay (crew-tests-behaviour S10, L5): prose is not a test target.
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

/** The implementer's body before its first heading, `## Where you work`. */
const implementerOpening = () => {
  const body = read('agents/pilot-implementer.md').replace(/\r\n/g, '\n').split('\n---\n').slice(1).join('\n---\n');
  const end = body.indexOf('\n## Where you work');
  assert.ok(end >= 0, 'agents/pilot-implementer.md has no "## Where you work" heading');
  return body.slice(0, end);
};

test('step 4 and the implementer opening do not paste a slice verbatim', () => {
  const skill = read('agents/pilot.md');
  const step4 = skillStep(skill, 4, 5);
  // lint: step 4 and the implementer's opening do not say "verbatim"
  assert.doesNotMatch(step4, /verbatim/, 'step 4 must not say "verbatim"');

  const opening = implementerOpening();
  assert.doesNotMatch(opening, /verbatim/, 'the implementer\'s opening must not say "verbatim"');
});

test('the crew reads slice files, not pasted sections', () => {
  // lint: no "slice section" wording in the crew files that read slice files
  const skill = read('agents/pilot.md');
  const step7 = norm(skillStep(skill, 7, 8));
  assert.doesNotMatch(step7, /slice sections?/i, 'step 7 must not say "slice section"');

  const step8 = norm(skillStep(skill, 8, 9));
  assert.doesNotMatch(step8, /slice sections?/i, 'step 8 must not say "slice sections"');

  const fundamentalist = norm(read('agents/pilot-fundamentalist.md'));
  assert.doesNotMatch(fundamentalist, /slice sections?/i, 'agents/pilot-fundamentalist.md must not say "slice section"');

  const qa = norm(read('agents/pilot-qa.md'));
  assert.doesNotMatch(qa, /slice sections?/i, 'agents/pilot-qa.md must not say "slice sections"');

  for (const skill of ['skills/code-review/SKILL.md', 'skills/resolving-merge-conflicts/SKILL.md']) {
    assert.doesNotMatch(norm(read(skill)), /slice(?:'s)? (?:artefact )?section|artefact's slice section/i, `${skill} must point at the slice file`);
  }
});
