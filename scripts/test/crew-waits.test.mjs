/**
 * crew-waits spec 5, L5, L9: a crew agent waits by starting `pilot wait --as <kind>`
 * with `run_in_background` and ending its turn, so a `SendMessage` resumes it at
 * once; it never parks inside `deck_wait`, which leaves its frontmatter.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const toolsOf = (source) => /^tools:(.*)$/m.exec(source)?.[1] ?? '';

test('pilot-qa.md starts pilot wait --as qa in the background, ends its turn, and lists no deck_wait', () => {
  const qa = read('agents/pilot-qa.md');
  assert.match(qa, /`pilot wait --as qa --item <id>`/);
  assert.match(qa, /pilot wait --as qa[^.]*run_in_background[^.]*end your turn/s);
});

test('no crew agent file tells its agent to wait inside deck_wait', () => {
  const crew = fs.readdirSync(path.join(ROOT, 'agents')).filter((f) => /^pilot-.+\.md$/.test(f));
  assert.ok(crew.length >= 7, `the crew files are found (${crew.length})`);
  for (const file of crew) {
    const source = read(`agents/${file}`);
    assert.doesNotMatch(toolsOf(source), /deck_wait/, `${file} lists no deck_wait (L5)`);
    assert.doesNotMatch(source, /deck_wait/, `${file} names no deck_wait in its prose`);
  }
});

test('the teacher waits on its lesson with pilot wait --as teacher --item, in the background', () => {
  const teacher = read('agents/pilot-teacher.md');
  assert.match(toolsOf(teacher), /\bBash\b/, 'the teacher has Bash for the wait (L12)');
  assert.doesNotMatch(toolsOf(teacher), /\b(Write|Edit)\b/, 'and still no Write or Edit');
  assert.match(teacher, /`pilot wait --as teacher --item <lesson id>`/);
  assert.match(teacher, /pilot wait --as teacher[^.]*run_in_background[^.]*end your turn/s);
});

test('the auditor waits on its audit item with pilot wait --as auditor --item, restarted while open', () => {
  const auditor = read('agents/pilot-auditor.md');
  assert.match(auditor, /`pilot wait --as auditor --item <audit id>`/);
  assert.match(auditor, /pilot wait --as auditor[^.]*run_in_background[^.]*end your turn/s);
  assert.match(auditor, /item\s+is\s+open,\s+restart\s+it\s+on\s+each\s+exit/);
});

test("the teacher's Bash is limited to pilot wait in its prose", () => {
  const teacher = read('agents/pilot-teacher.md');
  assert.match(teacher, /Bash is for\s+`pilot wait`\s+and nothing else/);
  assert.doesNotMatch(teacher, /no Bash/, 'the old "no Bash" line is gone');
});

/** Prose with every run of whitespace as one space, so a re-wrap breaks no pin. */
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
  assert.doesNotMatch(step9, /(send|tells?) (the )?QA\b/,'QA tears down on the press itself (gate2-frees-lane S9)');
  assert.doesNotMatch(step9, /QA[^.]*(flip|gh pr ready)/, 'QA neither flips it nor is told to run the flip');
});

test('pilot.md names both SendMessage result texts and treats queued as undelivered', () => {
  // crew-waits spec 2: a queued message is not a delivered one; the pilot checks the effect itself.
  const pilot = flat(read('agents/pilot.md'));
  assert.match(pilot, /`Resuming agent <id>`[^.]*delivered/);
  assert.match(pilot, /`Message queued for delivery to <id> at its next tool round`[^.]*undelivered/);
  assert.match(pilot, /undelivered[^.]*\.[^.]*expected effect[^.]*\.[^.]*stop the agent and do the step yourself or re-brief it/);
});

test('pilot-qa.md completes its QA comment at the Sign off and never runs gh pr ready', () => {
  const qa = read('agents/pilot-qa.md');
  assert.match(flat(read('agents/pilot.md')), /QA closes that thread and edits its QA comment/, 'the pilot says QA edits, not posts, at Sign off');
  const satisfied = section(qa, '## When the user signs off');
  assert.match(satisfied, /Sign off/, 'the finishing steps start at the walkthrough Sign off');
  assert.match(satisfied, /one QA comment on it/, 'the QA comment stays (prohibited to drop)');
  // co-pilot-reports S2: after the hand-back QA's addressee is `main` (L3), so the same rule reads "your addressee".
  assert.match(satisfied, /report and end your turn; a message from your addressee resumes you/, 'its walkthrough is closed, so QA holds no wait for the tear down');
  assert.match(satisfied, /"tear down"[^.]*step 5 only/);
  assert.doesNotMatch(qa, /gh pr ready/, 'the ready flip is the pilot\'s');
});

test('pilot-qa.md: after a sign-off, only the named actions, with no browser and no re-probe', () => {
  // crew-waits spec 3.
  const satisfied = section(read('agents/pilot-qa.md'), '## When the user signs off');
  assert.match(satisfied, /only the actions named here: no browser, no re-probe/);
});

test('pilot.md lists no deck_wait', () => {
  const pilot = read('agents/pilot.md');
  assert.doesNotMatch(toolsOf(pilot), /deck_wait/, 'deck_wait is out of the pilot frontmatter (L5)');
  assert.doesNotMatch(pilot, /deck_wait/, 'and its prose names none');
});

test('grilling, wizard and diagnosing-bugs name the crew\'s background wait', () => {
  for (const skill of ['grilling', 'wizard', 'diagnosing-bugs']) {
    const source = read(`skills/${skill}/SKILL.md`);
    assert.match(source, /the pilot and the crew keep a background `pilot wait --as <kind>(?: --item <id>)?`[^;]*; any other agent parks once on `mcp__plugin_pilot_deck__deck_wait`/, skill);
    assert.match(source, /^<!-- provenance/m, `${skill} keeps its provenance header`);
  }
});

const ONE_LINE_FIRST = /A user's reply is answered first with one line on its thread saying what happens next, before any other work\./;

test('each of pilot, pilot-qa and pilot-auditor says a reply\'s first answer is one line on its thread', () => {
  // crew-waits spec 8: the one line says what happens next, before any other work.
  for (const file of ['pilot', 'pilot-qa', 'pilot-auditor']) {
    assert.match(flat(read(`agents/${file}.md`)), ONE_LINE_FIRST, `${file}.md`);
  }
});

test('the teacher writes exactly one message per reply, with no one-line-first answer before it', () => {
  // Assumed for the user (deck itm_e215a0a33e4a): a lesson's one message is its answer.
  const teacher = flat(read('agents/pilot-teacher.md'));
  assert.doesNotMatch(teacher, ONE_LINE_FIRST);
  assert.match(teacher, /exactly one message with `mcp__plugin_pilot_deck__deck_reply` per reply, never two/);
});
