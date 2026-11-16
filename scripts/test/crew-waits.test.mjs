/**
 * crew-waits spec 5, L5, L9: a crew agent waits by starting `pilot wait --as <kind>`
 * with `run_in_background`; it never parks inside `deck_wait`, which leaves its
 * frontmatter. Lints and tool lists only; the prose that says how is not pinned.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const toolsOf = (source) => /^tools:(.*)$/m.exec(source)?.[1] ?? '';

test('no crew agent file tells its agent to wait inside deck_wait', () => {
  const crew = fs.readdirSync(path.join(ROOT, 'agents')).filter((f) => /^pilot-.+\.md$/.test(f));
  assert.ok(crew.length >= 7, `the crew files are found (${crew.length})`);
  for (const file of crew) {
    const source = read(`agents/${file}`);
    // lint: no crew file lists or names deck_wait (L5)
    assert.doesNotMatch(toolsOf(source), /deck_wait/, `${file} lists no deck_wait (L5)`);
    assert.doesNotMatch(source, /deck_wait/, `${file} names no deck_wait in its prose`);
  }
});

test("the teacher's tools: Bash for the wait, still no Write or Edit", () => {
  const teacher = read('agents/pilot-teacher.md');
  assert.match(toolsOf(teacher), /\bBash\b/, 'the teacher has Bash for the wait (L12)');
  // lint: the teacher never gains Write or Edit
  assert.doesNotMatch(toolsOf(teacher), /\b(Write|Edit)\b/, 'and still no Write or Edit');
  // lint: the old "no Bash" line stays gone
  assert.doesNotMatch(teacher, /no Bash/, 'the old "no Bash" line is gone');
});

/** Prose with every run of whitespace as one space, so a re-wrap breaks no lint. */
const flat = (text) => text.replace(/\s+/g, ' ');

/** The text from a `### ` or `## ` heading line to the next heading of that level or higher, flattened. */
const section = (source, heading) => {
  const start = source.split(/\r?\n/).findIndex((line) => line === heading);
  assert.ok(start >= 0, `the section "${heading}" is found`);
  const lines = source.split(/\r?\n/).slice(start);
  const level = /^#+/.exec(heading)[0].length;
  const end = lines.findIndex((line, i) => i > 0 && new RegExp(`^#{1,${level}} `).test(line));
  return flat((end < 0 ? lines : lines.slice(0, end)).join('\n'));
};

test('pilot.md step 9: the landing flips the PR and QA tears down on the press', () => {
  // crew-waits spec 1, L10; gate-no-stall L6: `pilot land` is the only ready press, never the pilot's.
  const step9 = section(read('agents/pilot.md'), '### 9. Gate 2 and ready');
  // lint: step 9 never has the pilot send QA to tear down or flip the PR
  assert.doesNotMatch(step9, /(send|tells?) (the )?QA\b/,'QA tears down on the press itself (gate2-frees-lane S9)');
  assert.doesNotMatch(step9, /QA[^.]*(flip|gh pr ready)/, 'QA neither flips it nor is told to run the flip');
});

test('pilot-qa.md never runs gh pr ready', () => {
  // lint: the ready flip is the pilot's, never QA's
  assert.doesNotMatch(read('agents/pilot-qa.md'), /gh pr ready/, 'the ready flip is the pilot\'s');
});

test('pilot.md lists no deck_wait', () => {
  const pilot = read('agents/pilot.md');
  // lint: the pilot lists and names no deck_wait (L5)
  assert.doesNotMatch(toolsOf(pilot), /deck_wait/, 'deck_wait is out of the pilot frontmatter (L5)');
  assert.doesNotMatch(pilot, /deck_wait/, 'and its prose names none');
});

test('grilling, wizard and diagnosing-bugs keep their provenance header', () => {
  for (const skill of ['grilling', 'wizard', 'diagnosing-bugs']) {
    // lint: the skill's provenance header exists
    assert.match(read(`skills/${skill}/SKILL.md`), /^<!-- provenance/m, `${skill} keeps its provenance header`);
  }
});

const ONE_LINE_FIRST = /A user's reply is answered first with one line on its thread saying what happens next, before any other work\./;

test('the teacher has no one-line-first answer before its one message', () => {
  // lint: the teacher's lesson reply is one message, with no one-line-first answer before it
  assert.doesNotMatch(flat(read('agents/pilot-teacher.md')), ONE_LINE_FIRST);
});
