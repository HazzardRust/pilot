/**
 * S6: QA needs its own deck to QA a change to the deck itself, because ADR 0005
 * allows only one deck process per machine on a fixed port and the machine's own
 * deck is in use for the run doing the QA-ing. This package has no database and
 * no migration, so the usual "stand up a preview, apply the migrations" pass has
 * nothing to apply — the deck instance is the whole of the live gate here.
 *
 * A second incident (2026-09-21): S12's implementer tore its browser down with
 * an image-wide kill (`taskkill /IM chrome.exe`) and closed the user's own
 * Chrome along with the one it had opened. The fix is a standing rule, not a
 * one-off correction, so it is pinned in both agents that drive a browser.
 *
 * A unit test cannot drive the live deck this describes (that is QA's read-only
 * pass, done once by hand); it can prove the instruction text a QA agent reads
 * actually names the scratch variables and the port rule, and that both
 * browser-driving agents carry the teardown sentence.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { flat } from './lib/area-file.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const section = (source, heading, name) => {
  const re = new RegExp(`## ${heading}\\r?\\n([\\s\\S]*?)(\\r?\\n## |\\r?\\n?$)`);
  const match = re.exec(source);
  assert.ok(match, `${name}: no "## ${heading}" section found`);
  return match[1];
};

// implementer-gate-steps L1: the sentence is copied verbatim into the implementer and QA.
test('QA carries the edit rule', () => {
  const s = flat(section(read('agents/pilot-qa.md'), 'Where you work', 'agents/pilot-qa.md'));
  assert.ok(
    s.includes("Change a file with the Edit or Write tool, never a heredoc, `sed -i` or Python's text mode: on Windows those mangle escapes and write CRLF."),
    'QA\'s "Where you work" lacks L1\'s edit rule, so it may edit with a heredoc and write CRLF',
  );
});

// implementer-gate-steps spec 5b (A2): the suite runs about 280 s, past the Bash default of 120 s.
test('QA gates the suite past the 120 s default', () => {
  const s = flat(section(read('agents/pilot-qa.md'), 'The read-only pass', 'agents/pilot-qa.md'));
  assert.match(s, /`run_in_background`/, 'the gate must name run_in_background');
  assert.match(s, /`timeout` of 600000 ms/, 'the gate must name a 600000 ms timeout');
  assert.match(s, /log read to the pass and fail counts/, 'the gate must read the log to its counts');
});

test('pilot-qa stands up its own deck beside the machine\'s one', () => {
  const s = section(read('agents/pilot-qa.md'), 'The read-only pass', 'agents/pilot-qa.md');
  assert.match(s, /PILOT_DECK_DIR/, 'must name PILOT_DECK_DIR');
  assert.match(s, /PILOT_DECK_PORT/, 'must name PILOT_DECK_PORT');
  assert.match(s, /PILOT_DECK_NO_OPEN=1/, 'must name PILOT_DECK_NO_OPEN=1');
  assert.match(s, /npm\s+ci/, 'must say npm ci in a fresh worktree before npm test');
  assert.match(s, /no\s+database/i, 'must say this package has no database');
  assert.match(s, /no\s+migration/i, 'must say this package has no migration');
});

test('an agent driving a browser closes only the process it started, never image-wide', () => {
  const sections = [
    ['agents/pilot-qa.md', section(read('agents/pilot-qa.md'), 'The read-only pass', 'agents/pilot-qa.md')],
    ['agents/pilot-implementer.md', section(read('agents/pilot-implementer.md'), 'The loop', 'agents/pilot-implementer.md')],
  ];
  for (const [name, s] of sections) {
    assert.match(s, /taskkill\s+\/IM\s+chrome\.exe/, `${name}: must name the image-wide kill it forbids`);
    assert.match(s, /pkill\s+chrome/, `${name}: must name the image-wide kill it forbids`);
    assert.match(s, /2026-09-21/, `${name}: must date the incident this rule came from`);
  }
});

/**
 * S11 (independence L11, L12; spec 12 to 14). QA judges taste at one desktop width
 * from a checklist adapted from a vetted published review, drops the checks this
 * repository never needed unless the spec names them, and times itself so the next
 * run can be compared against this one.
 */
const frontmatterSkills = (source) => {
  const front = /^---\r?\n([\s\S]*?)\r?\n---/.exec(source)?.[1] ?? '';
  return /^skills:\s*\[?([^\]\r\n]*)\]?/m.exec(front)?.[1] ?? '';
};

test('QA preloads neither browser checklist, and the taste checklist carries its provenance', () => {
  const preloaded = frontmatterSkills(read('agents/pilot-qa.md'));
  assert.match(read('agents/pilot-qa.md'), /^skills:\s*\[\s*\]\s*$/m, 'pilot-qa skills: is not an empty list');
  assert.doesNotMatch(preloaded, /browser-qa/, 'pilot-qa still preloads browser-qa');
  assert.doesNotMatch(preloaded, /design-review/, 'pilot-qa still preloads design-review');
  const skill = read('skills/design-review/SKILL.md');
  assert.match(skill, /upstream: claude-code-workflows [0-9a-f]{7} - design-review\/design-review-agent\.md/);
  assert.match(skill, /licence: MIT - see THIRD-PARTY-NOTICES\.md/);
  assert.doesNotMatch(skill, /playwright/i, 'L12: prompt content only, never its Playwright tool config');
});

test('QA loads both checklists with the Skill tool when the feature has a GUI or web surface', () => {
  const qa = read('agents/pilot-qa.md');
  assert.match(qa, /GUI or web surface[^.]*Skill tool[^.]*`pilot:browser-qa`[^.]*`pilot:design-review`[^.]*otherwise load neither/s, 'no sentence has QA load both checklists for a GUI only');
  assert.doesNotMatch(qa, /preloaded `(browser-qa|design-review)`/, 'a sentence still calls a checklist preloaded');
});

test('verification-loop names Cargo, Make, Terraform and CMake beside npm', () => {
  const skill = read('skills/verification-loop/SKILL.md');
  for (const row of ['Cargo: cargo build', 'Make: make', 'CMake: cmake --build', 'Terraform: terraform validate', 'Cargo: cargo clippy', 'Make: make test']) assert.ok(skill.includes(row), `verification-loop has no row ${row}`);
  assert.match(skill, /project's own commands/i);
  const adapted = /^adapted:.*$/m.exec(skill)?.[0] ?? '';
  assert.match(adapted, /Cargo/, 'the provenance adapted: line does not say the commands were widened');
});

test('INSTALL names the chrome-devtools and Supabase MCP servers optional per project', () => {
  const install = read('docs/INSTALL.md');
  assert.match(install, /`chrome-devtools` and Supabase MCP servers are optional per project/);
  assert.match(install, /chrome-devtools[\s\S]{0,400}optional per project|optional per project[\s\S]{0,400}chrome-devtools/i);
  assert.match(install, /supabase[\s\S]{0,400}optional per project|optional per project[\s\S]{0,400}supabase/i);
});

test('the taste pass covers what the user named: unnecessary information, feedback, polish, each with a screenshot', () => {
  const skill = read('skills/design-review/SKILL.md');
  assert.match(skill, /unnecessary/i);
  assert.match(skill, /feedback/i);
  assert.match(skill, /polish/i);
  assert.match(skill, /screenshot/i);
  assert.match(skill, /1440/, 'L11: one desktop width');
  assert.match(skill, /Blocker[\s\S]*Nit/, 'L11: a triage column');
});

test('browser QA drops Core Web Vitals, dark mode and the breakpoint sweep unless the spec names them', () => {
  const browser = read('skills/browser-qa/SKILL.md');
  assert.doesNotMatch(browser, /LCP|INP|CLS/, 'Core Web Vitals thresholds are still a standing check');
  assert.doesNotMatch(browser, /375px, 768px/, 'the three-breakpoint sweep is still a standing check');
  assert.match(browser, /unless the spec names/i, 'the dropped checks must say when they come back');
});

test('the QA Report format is back as the frame, with design-review\'s table as its findings section', () => {
  const browser = read('skills/browser-qa/SKILL.md');
  assert.match(browser, /## QA Report — \[URL\] — \[timestamp\]/, 'the fenced QA Report block did not come back');
  assert.match(browser, /### Verdict/, 'the report frame lost its verdict section');
  assert.match(browser, /design-review['’]s table[\s\S]{0,120}findings section/i, 'no sentence ties the design-review table into the QA Report frame as its findings section');
  assert.doesNotMatch(browser, /LCP|INP|CLS/, 'the restored block reintroduced a Web Vitals standing check');
  assert.doesNotMatch(browser, /375px, 768px/, 'the restored block reintroduced the three-breakpoint sweep');
});

test('QA times itself from spawn to walkthrough and reports it', () => {
  const report = section(read('agents/pilot-qa.md'), 'Report', 'agents/pilot-qa.md');
  assert.match(report, /spawn/i);
  assert.match(report, /walkthrough/i);
  assert.match(report, /timestamp/i);
  assert.match(read('agents/pilot-qa.md'), /`date -u`/, 'nothing tells QA to take the time when it starts, so it would guess');
});

// lander S5 (spec 2, 3; L6): integrate's lander line goes to main, and the gate2 waits on the lander; since one-integration-line S9 the line is `--trial`'s.
test('QA posts no gate2 over a lander line', () => {
  const s = flat(section(read('agents/pilot-qa.md'), 'Concluding', 'agents/pilot-qa.md'));
  // Its addressee, `main` by then: a bare `main` is pinned out of QA's prompt (pilot-agents.test.mjs).
  assert.match(s, /lander line[^.]*your addressee/, 'QA does not send the lander line up');
  assert.match(s, /the lander/);
  assert.match(s, /`clean at <sha>`/, 'QA does not wait on the lander\'s clean at');
  assert.match(s, /never resolve a hunk/i);
});

// research-first S2 raised QA's from 4357.25 to the measured 4403.75 (L5): the research clause in "## The procedure" and `pilot:pilot-explorer` in the child list cost 48.25 (4355.5 to 4403.75).
// The research-first fix round raised it to the measured 4414 (L5): naming the research list's file, `skills/grilling/SKILL.md`'s *Finding facts* paragraph, instead of "the grilling skill's research list" cost 10.25 (4403.75 to 4414).
// short-by-default S3 raised it to the measured 4513.25 (L9): the QA comment posted before the walkthrough with `--body-file` and no credential value, the summary body, the `--edit-last` sign-off step and the Voice's content and general-answer sentences cost 99.25 (4414 to 4513.25).
// short-by-default fix raised it to the measured 4542.25 (L9): the comment's id recorded when posted and the sign-off's `gh api -X PATCH` by that id, never `--edit-last`, and the security review's "never a credential's value" on that edit cost 29 (4513.25 to 4542.25).
// short-by-default QA fix raised it to the measured 4583.5 (L9): the walkthrough rule's `longer` sentence and deck_post's `longer` field, the body cap's backdoor (itm_03d153719048), cost 41.25 (4542.25 to 4583.5).
// bigger-jobs S4 raised it to the measured 4610 (L5): the read-only pass names grilling's build-now rule for a found issue, and children go from two to three at once, 26.5 (4583.5 to 4610).
// session-row S2 (2026-10-12) raised it to the measured 4631.5 (A3): deck_read's `messages` property, the read window, 21.5 (4610 to 4631.5).
// session-row S4 (2026-10-12) raised it to the measured 4647.25 (A3): the walkthrough read names a `messages` window, 15.75 (4631.5 to 4647.25).
// session-row fix (2026-10-12) lowered it to the measured 4638.75 (A3): the walkthrough read drops "the replies since your last read", -8.5 (4647.25 to 4638.75).
// three-lanes S8 (2026-10-15) raised it to the measured 4818 (spec 8, 11; L6, L12): `## Concluding` carries the ticket from the pilot's `need` to the Gate 2 press, one QA per ticket, with `pilot integrate --default`, the gate2's run-report body and `signed <id>` to its addressee, 181 (4637 to 4818).
// co-pilot-tickets S3 (2026-10-16) raised it from 4818 to the measured 4820 (spec 1, 6; L5, L7): the rename to co-pilot, three letters longer, across QA's prompt, 2.
// co-pilot-tickets S4 (2026-10-16) raised it from 4820 to the measured 4826.5 (spec 2, 6; L5, L7): the rename to ticket, two letters longer, across QA's prompt and its deck tool schemas, 6.5.
// co-pilot-tickets S5 (2026-10-17) raised it from 4826.5 to the measured 4830 (spec 3; L6, L9): the stored spellings flip, the `ticket` field in QA's prompt and the deck_post schema, 3.5.
// blocked-yellow-yields S7 (2026-10-17) raised it from 4830 to the measured 4844.75 (spec 8; A5, the slice's security review): Blockers sends a refused file edit up as one question with its default, 14.75.
// implementer-gate-steps S3 (2026-10-18) raised it from 4844.75 to the measured 4899.25 (spec 1, 5b, 9; L1, L7): L1's edit rule in "Where you work" and the suite gate's `run_in_background` or 600000 ms timeout, its log read to the counts, 54.5.
// lander S5 (2026-10-18) raised it from 4899.25 to the measured 4939.5 (spec 2, 3; L6): `## Concluding` sends integrate --default's lander line to its addressee and posts the gate2 only on the lander's `clean at <sha>`, 40.25.
// lander principles fix (2026-10-19) raised it from 4939.5 to the measured 4945 (8b, L12): on the press the deck lands it and the lander posts the report the deck fills, 5.5.
// prose-concision S1 (2026-10-19) lowered it from 4945 to the measured 4942.25 (spec 1, 5; L1, L2, A2): the concision sentence lands in `## Voice` and the line-5 cuts pay for it, net of the state parenthetical, "Deck posts" and the per-agent objects, 2.75.
// prose-concision principles fix (2026-10-19) raised it from 4942.25 to the measured 4944 (L1): "a gap against Gate 1" for "a Gate 1 walk" in the longer-is-right sentence, 1.75.
// landing-keeps-worktrees S3 (2026-10-19) raised it from 4944 to the measured 4992.25 (spec 4; L5): the cd shape in Bash, `git -C <dir>` or `cd <dir> && { …; }` and never `cd <dir>; …`, 48.25.
// one-integration-line S9 (2026-10-19) lowered it from 4992.25 to the measured 4992 (spec 6; A1, A2): `## Concluding` runs `pilot integrate --trial` for `--default`, and the landing, not the pilot, merges the feature PR, 0.25.
// short-path S3 (2026-10-20) raised it from 4992.25 to the measured 5004.75 (spec 2; A2): deck_post's `surface: { type: 'boolean', description: 'gate1 only' }`, 12.5.
// Merge origin/pilot into feat/short-path (2026-10-20) set it to the measured 5006: both sides' changes to QA's prompt and tools, measured together.
// audit-f2-f3 S1 (2026-10-21) raised it from 5006 to the measured 5022.25 (spec 4): the read-only pass's "Probe a PR command under `eval "$(pilot gh-stub)"`, never real GitHub.", 17.75.
// audit-f2-f3 S2 (2026-10-21) raised it from 5022.25 to the measured 5083.5 (spec 2; L5): the read-only pass reruns a red alone once with `node --test <file>` and calls it `flake` or `regression` in the PR comment, 61.25.
test('QA\'s own share of its prompt stays at or under 5083.5 tokens, with the checklists loaded on demand', async (t) => {
  const { measure } = await import('../measure-prompt.mjs');
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-share-'));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  const rows = await measure({ root: ROOT, home });
  const qa = rows.find((row) => row.agent === 'pilot-qa');
  const own = (qa.definition + qa.skills + qa.tools) / 4;
  assert.ok(own <= 5083.5, `pilot-qa's own share is ${own} tokens`);
});
