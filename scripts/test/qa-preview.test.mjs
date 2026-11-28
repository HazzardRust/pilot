/**
 * QA's prompt: lints that stay (QA preloads neither browser checklist, browser QA
 * drops the standing Web Vitals and breakpoint checks) and the measured share of
 * QA's own prompt. The sentences QA's prompt carries are not pinned here.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const frontmatterSkills = (source) => {
  const front = /^---\r?\n([\s\S]*?)\r?\n---/.exec(source)?.[1] ?? '';
  return /^skills:\s*\[?([^\]\r\n]*)\]?/m.exec(front)?.[1] ?? '';
};

test('QA preloads neither browser checklist, and the taste checklist carries no Playwright config', () => {
  const preloaded = frontmatterSkills(read('agents/pilot-qa.md'));
  // lint: pilot-qa's skills: field is an empty list
  assert.match(read('agents/pilot-qa.md'), /^skills:\s*\[\s*\]\s*$/m, 'pilot-qa skills: is not an empty list');
  assert.doesNotMatch(preloaded, /browser-qa/, 'pilot-qa still preloads browser-qa');
  assert.doesNotMatch(preloaded, /design-review/, 'pilot-qa still preloads design-review');
  // lint: design-review carries prompt content only, never Playwright tool config (L12)
  assert.doesNotMatch(read('skills/design-review/SKILL.md'), /playwright/i, 'L12: prompt content only, never its Playwright tool config');
});

test('QA never calls a checklist preloaded', () => {
  // lint: no sentence in QA's prompt calls browser-qa or design-review preloaded
  assert.doesNotMatch(read('agents/pilot-qa.md'), /preloaded `(browser-qa|design-review)`/, 'a sentence still calls a checklist preloaded');
});

test('browser QA drops Core Web Vitals and the breakpoint sweep as standing checks', () => {
  const browser = read('skills/browser-qa/SKILL.md');
  // lint: browser-qa carries no Web Vitals threshold and no three-breakpoint sweep
  assert.doesNotMatch(browser, /LCP|INP|CLS/, 'Core Web Vitals thresholds are still a standing check');
  assert.doesNotMatch(browser, /375px, 768px/, 'the three-breakpoint sweep is still a standing check');
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
// walkthrough-surface S5 (2026-11-16) raised it from 5083.5 to the measured 5106.25 (spec 8): deck_post's `shell: { type: 'string', description }`, 22.75.
// deck-writes-github S3 (2026-11-16) raised it from 5106.25 to the measured 5113.25 (spec 3): deck_post's bare `comment: { type: 'string' }`, 7.
// crew-refusals S2 (2026-11-19) raised it from 5113.25 to the measured 5121.75 (spec 3, 4; L4, L5): the two SHELL_RULES sentences, 87.25 measured from 5034.5, 8.5 over the old pin.
// ci-gate S5 (2026-11-20) raised it from 5121.75 to the measured 5128.5 (spec 4; L6): deck_post's bare `checks: { type: 'string' }`, 6.75.
// ci-gate S7 (2026-11-20) raised it from 5128.5 to the measured 5168.25 (spec 4; L10): `## Concluding` runs `pilot checks <sha> --wait` before the gate2 and posts its line as `checks`, 39.75.
// ui-design-workflow S6 (2026-11-22) raised it from 5168.25 to the measured 5183.75 (spec 4, 11; L8): "On any surface load `pilot:ui-design` and walk its checklists.", 15.75 (5168 to 5183.75).
// ui-design-workflow S9 (2026-11-22) raised it from 5183.75 to the measured 5257.5 (spec 6, 9; L8): the difference-list question named by `Differences:` before the walkthrough, and a Look notes paragraph, 73.75.
// ui-design-workflow fix round (2026-11-22) raised it from 5257.5 to the measured 5264 (L8): the walkthrough post sets `ticket`, so the Differences refusal runs, 6.5.
// pr-overview S3 (2026-11-25) raised it from 5264 to the measured 5293.25 (spec 1; A1, L6): a fix that changes what a user sees rewrites the artefact's `## Overview` per `skills/pr-overview`, 29.25.
// prune-worktrees S6 (2026-11-27) raised it from 5293.25 to the measured 5314 (spec 3, 5; L1, A1): the qa tree by `pilot worktrees add --run`, its teardown and the shell rule by `pilot worktrees remove`, 20.75, measured on top of pr-overview's `## Overview` clause.
test('QA\'s own share of its prompt stays at or under 5314 tokens, with the checklists loaded on demand', async (t) => {
  const { measure } = await import('../measure-prompt.mjs');
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-share-'));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  const rows = await measure({ root: ROOT, home });
  const qa = rows.find((row) => row.agent === 'pilot-qa');
  const own = (qa.definition + qa.skills + qa.tools) / 4;
  assert.ok(own <= 5314, `pilot-qa's own share is ${own} tokens`);
});
