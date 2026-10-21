// `scripts/measure-prompt.mjs` (independence S1, spec line 7), pinned on a fixture
// repository and a fixture home whose sizes this test chose; the real `~/.claude` is never read.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'measure-prompt.mjs');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const { measure, formatTable } = await import('../measure-prompt.mjs');

const TOOL_A = { name: 'deck_post', description: 'post', inputSchema: { type: 'object' } };
const TOOL_B = { name: 'deck_reply', description: 'reply', inputSchema: { type: 'object' } };
const toolBytes = (tool) => Buffer.byteLength(JSON.stringify(tool));

function write(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text, 'utf8');
}

function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pilot-measure-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const root = path.join(dir, 'repo');
  const home = path.join(dir, 'home');
  // Bodies are counted after the frontmatter; each is a known byte count.
  write(path.join(root, 'agents', 'pilot.md'),
    '---\nname: pilot\ntools: Read, mcp__plugin_pilot_deck__deck_post, mcp__plugin_pilot_deck__deck_reply\ninitialPrompt: /pilot:lead\n---\n' + 'p'.repeat(100));
  write(path.join(root, 'agents', 'pilot-helper.md'),
    '---\r\nname: pilot-helper\r\ntools: Read, mcp__plugin_pilot_deck__deck_reply\r\nskills: [one, two]\r\n---\r\n' + 'h'.repeat(40));
  write(path.join(root, 'agents', 'pilot-plain.md'),
    '---\nname: pilot-plain\ntools: Agent(a, b), mcp__plugin_pilot_deck\nskills:\n- one\n- one\n---\n' + 'x'.repeat(8));
  write(path.join(root, 'agents', 'reviewer.md'), '---\nname: reviewer\n---\n' + 'r'.repeat(999));
  write(path.join(root, 'skills', 'lead', 'SKILL.md'), '---\nname: lead\n---\n' + 'l'.repeat(200));
  write(path.join(root, 'skills', 'one', 'SKILL.md'), '---\nname: one\n---\n' + 'o'.repeat(12));
  write(path.join(root, 'skills', 'two', 'SKILL.md'), 't'.repeat(20));
  write(path.join(root, 'deck', 'tools.mjs'), `export const TOOLS = ${JSON.stringify([TOOL_A, TOOL_B])};\n`);
  write(path.join(home, '.claude', 'CLAUDE.md'), 'c'.repeat(30));
  write(path.join(home, '.claude', 'rules', 'always.md'), 'a'.repeat(50));
  write(path.join(home, '.claude', 'rules', 'common', 'also.md'), '---\ndescription: d\n---\n' + 'b'.repeat(4));
  write(path.join(home, '.claude', 'rules', 'react', 'scoped.md'), '---\npaths:\n  - "**/*.tsx"\n---\n' + 'z'.repeat(500));
  write(path.join(home, '.claude', 'rules', 'notes.txt'), 'n'.repeat(700));
  return { root, home };
}

// always.md 50 + also.md whole file (23 + 4) + CLAUDE.md 30
const RULES = 50 + 27 + 30;

test('every crew agent gets a row, and only the crew', async (t) => {
  const rows = await measure(fixture(t));
  assert.deepEqual(rows.map((row) => row.agent), ['pilot', 'pilot-helper', 'pilot-plain']);
});

test('the lead row adds its body, its initialPrompt skill, the rules and its granted deck tools', async (t) => {
  const [lead] = await measure(fixture(t));
  assert.deepEqual(lead, {
    agent: 'pilot',
    definition: 100,
    skills: 200,
    rules: RULES,
    tools: toolBytes(TOOL_A) + toolBytes(TOOL_B),
    total: 100 + 200 + RULES + toolBytes(TOOL_A) + toolBytes(TOOL_B),
  });
});

test('skills inline or as a block are summed once each, and a bare server grant takes every deck tool', async (t) => {
  const [, helper, plain] = await measure(fixture(t));
  assert.deepEqual([helper.definition, helper.skills, helper.tools], [40, 12 + 20, toolBytes(TOOL_B)]);
  assert.deepEqual([plain.definition, plain.skills, plain.tools], [8, 12, toolBytes(TOOL_A) + toolBytes(TOOL_B)]);
  assert.equal(plain.total, 8 + 12 + RULES + plain.tools);
});

test('a preloaded skill with no SKILL.md fails loudly rather than counting as zero', async (t) => {
  const paths = fixture(t);
  fs.rmSync(path.join(paths.root, 'skills', 'two'), { recursive: true });
  await assert.rejects(measure(paths), /two/);
});

test('the table prints one row per agent in tokens, bytes divided by four', async (t) => {
  const rows = await measure(fixture(t));
  const table = formatTable(rows);
  const lead = table.split('\n').find((line) => line.startsWith('| pilot |'));
  assert.equal(lead, `| pilot | 25 | 50 | 27 | ${Math.round(148 / 4)} | ${Math.round((100 + 200 + RULES + 148) / 4)} |`);
});

test('the command prints the table, and --json prints the rows', (t) => {
  const { root, home } = fixture(t);
  const run = (...extra) => spawnSync(process.execPath, [SCRIPT, '--root', root, '--home', home, ...extra], { encoding: 'utf8' });
  const table = run();
  assert.equal(table.status, 0, table.stderr);
  assert.match(table.stdout, /^\| Agent \| Definition \| Preloaded skills \| Unconditional rules \| Deck tool schemas \| Total \|$/m);
  const json = run('--json');
  assert.equal(json.status, 0, json.stderr);
  assert.deepEqual(JSON.parse(json.stdout).map((row) => row.rules), [RULES, RULES, RULES]);
});

// L8 (reset 2026-09-25): the pilot's and the explorer's own prompt share, measured
// against the real repository rather than the fixture above, stay under their budgets.
// QA's own-share budget (<= 4357.25) is tested in scripts/test/qa-preview.test.mjs; this
// reuses that test's pattern for the other two agents whose budgets L8 reset.
// ticket-states S16 lowered the pilot's from 10342: full auto's prose went, net of the modes'.
// merge-first S2 lowered it from 10336.75: the merge sentence moved into the architect.
// merge-first S5 lowered it from 10271.5: the gate prose reworded to name the Sign off press.
// pilot-branch S5 lowered it from 10270.75: land and the merge order, paid for by the stack lines removed.
// pilot-branch S12 lowered it from 10266.25: "Sub-deck" replaced "Modes" and step 4's agent count.
// pilot-branch FA lowered it from 10265: Needed folded into the sub-deck's ending paid for branch protection.
// pilot-branch QA (A23) lowered it from 10260: the role is read with `pilot budget`, not `GET /api/record`.
// pilot-branch QA (F) lowered it from 10258.75: integrate names `pilot --dir <worktree>`, not "in that worktree".
// yellow-agent S1 lowered it from 10258.25: "Yellow" replaced "Sub-deck"; its run moved to pilot-co-pilot.md.
// yellow-agent S4 lowered it from 10132.5: the Sign off names no park, a signed ticket being already not live.
// yellow-agent S5 lowered it from 10128: "Mark yours" scopes the blocking test, paid by "between the two".
// yellow-agent fix round lowered it from 10124.5: the co-pilot's `yellow` budget, paid by "run here" and "a ticket with".
// clear-waits-co-pilot S2 lowered it from 10124: the co-pilot and release clause and enum, paid by the stale gate1 sentence and a list-is-a-form tail.
// user-thread-listener S1 lowered it from 10115.5: the read-the-output sentence, paid for by the "already failed to wait" clause.
// co-pilot-reports S3 lowered it from 10115: one reply per override and the PR-title formats, paid for by T1 to T3 and two more reason clauses.
// co-pilot-reports fix lowered it from 10109: QA-F1 deleted " to `main`" from step 8.
// walkthrough-taste S3 lowered it from 10107: step 8 reads as a look for taste at what QA left running, its list cut to five bare nouns and the machine checks "in a table".
// security-reviewer S4 lowered it from 10098: step 5's security hold and step 7's consider row, paid by step 7's subtraction list and coverage line, both the fundamentalist's own.
// security-reviewer fix round lowered it from 10096: step 5 holds on the Reviewers line and a `Verdict:` line in the PR body, the trigger hit being the implementer's and the fundamentalist's.
// slice-graph S3 lowered it from 10098: deck_status's after became a list by S<n>, paid for by dropping delivers (A2).
// slice-graph S4 lowered it from 10064: step 4 reads parallelism off the lanes, paid for by dropping the `delivers` mirror (A2).
// security-reviewer's merge of base pilot lowered it to 10044.25: both features' cuts to agents/pilot.md, measured together.
// gate2-lands S3 left it at 10044.25: step 9 reads the deck's landing with `pilot landing`, paid for by its own run-land clauses (10037 to 10040).
// co-pilot-successor S1 raised it from 10044.25 by the Yellow clause's measured cost (L6): a paused co-pilot's successor, spawned with three ids.
// co-pilot-successor fix raised it from 10081.75: QA-Q3 resolves the crew-handoff after the spawn, part paid by QA-Q4's "own hard".
// red-lands-on-pilot S1 left it at 10088: step 7 runs `pilot land` and step 9 sends a refusal to QA, paid by the narrowed merge-conflict row (10086.5 to 10085.5).
// research-first S1 raised it from 10088 to the measured 10123 (L5): the research-first clause in §3 cost 36.5 (10086.5 to 10123).
// research-first's merge of base pilot keeps 10123: both features' clauses to agents/pilot.md measured together, under it.
// short-by-default S2 raised it from 10123 to the measured 10208 (L9): "Writing to the user" names what the decision needs and the general answer, 89 (10119 to 10208) net of §3's dropped "the evidence".
// short-by-default fix lowered it from 10208 to the measured 10196 (L9): "its reasons, options and cases come on request" went, and step 9 says QA edits its QA comment, 12.
// short-by-default QA fix raised it from 10196 to the measured 10219.5 (L9): deck_post's `longer` field, the walkthrough body cap's backdoor (itm_03d153719048), 23.5.
// bigger-jobs S2 raised it from 10219.5 to the measured 10250.5 (L5): §3 names grilling's build-now rule, 27.5; the first turn reads `brief: true` then by `id`, 12; step 7's rails lose the count, net -8.5.
// bigger-jobs fix raised it from 10250.5 to the measured 10297.25 (L5): step 6 builds a found issue a crew agent reports as an added slice, naming the build-now rule, 46.75.
// bigger-jobs QA fix (2026-10-11) lowered it from 10297.25 to the measured 10296.75 (L5): step 6 builds a found issue whoever finds it, not only one a crew agent reports, -0.5.
// bigger-jobs QA fix 2 (2026-10-11) raised it from 10296.75 to the measured 10327.5 (L5): step 6 never queues a found issue that stands between a spec line and its evidence, 30.75.
// session-row S2 (2026-10-12) raised it from 10296.75 to the measured 10318.25 (A3): deck_read's `messages` property, the read window, 21.5.
// session-row S4 (2026-10-12) raised it from 10318.25 to the measured 10345.5 (A3): the first-turn and step 6 reads name a `messages` window, and Yellow names green first with no yellow open, 27.25.
// session-row fix (2026-10-12) lowered it from 10345.5 to the measured 10340.25 (A3): the first-turn read drops "the window you need", -5.25.
// bigger-jobs QA fix 2 (2026-10-11) raised it from 10296.75 to the measured 10327.5 (L5): step 6 never queues a found issue that stands between a spec line and its evidence, 30.75.
// landing bigger-jobs on pilot (2026-10-12) raised it from 10340.25 to the measured 10371 (L5): the session-row chain and the bigger-jobs chain together, 30.75.
// clean-landing S10 (2026-10-12) lowered it from 10371 to the measured 10369.5 (L9, L10): step 9 retries a `pr ready failed`, paid by the close's prune and `feat/<slug>` clauses, -1.5.
// pilot-fork S9 (2026-10-12) raised it from 10369.5 to the measured 10465.25 (spec 9, L12, L13): brief.md carries the run remote, and the close runs `pilot branches prune` after the merge, only when every listed branch carries the run's slug, with the backlog a human step, 95.75.
// pilot-fork red prose (2026-10-13, itm_2ecda9e7c405) lowered it from 10465.25 to the measured 10464 (L12): the close names the backlog step per slug, -1.25.
// gate-no-stall S3 (2026-10-13) raised it from 10464 to the measured 10472.5 (L6): step 9's `pr ready failed` is the deck's blocked item and a denied call is never retried, not a `gh pr ready` retry, 8.5.
// gate-no-stall S6 (2026-10-13) raised it from 10472.5 to the measured 10494.75 (L8, A2): step 9 runs `pilot integrate --default` before the gate2 and posts the sha it prints, 22.25.
// verdict-pass S3 (2026-10-13) raised it from 10494.75 to the measured 10632.75 (spec 2, 4, 5, 7; L3, L7, A2, A5): step 3's verdict pass and the gate1 body naming every A‹n› beside its verdict, net of the informal "assumed default" sentence it replaces, 138.
// yellow-lane S13 (2026-10-14) raised it from 10632.75 to the measured 10775.25 (spec 6, 7, 11, 21, 22, 25): a proposal is flagged and unticketed, a promising reply carries `promise: true`, a blocked step goes up blocking as `Blocked: <command>`, and friction is the record's rows with four drains and no `report.friction` sent, 142.5.
// yellow-lane S10 (2026-10-14) raised it from 10775.25 to the measured 10821.75 (spec 20, 21; L8, A6): deck_status's `friction` property, the two row shapes appended with the newest 40 kept, 46.5.
// yellow-lane S11 (2026-10-14) raised it from 10821.75 to the measured 10828 (spec 23; L8, A7): deck_status's `report` description says friction is never sent, the deck ranking it from the record's rows, 6.25.
// yellow-lane S17 (2026-10-14) raised it from 10828 to the measured 10838 (spec 14, 25; L3, L9): the states read red planning and green concluding, and a blocking question refuses its ticket's gate2 on post and on the Sign-off press alike, 10.
// cheaper-crew S4 (2026-10-14) raised it from 10838 to the measured 11003.75 (spec 6, 7, 8, 9; L2, A2): the Models table gains a Why per row, the implementer's Sonnet on a precise slice and the two Haiku helpers, and the Briefs copy the slice's Model line, 165.75.
// report-record S4 (2026-10-14) raised it from 11003.75 to the measured 11063.75 (spec 6, 8; L4, A3): the worktrees reply is the only reply on a closing report, an ask goes up as its own question or walkthrough before it, a user's words on it are never relayed or acted on (ADR 0148), and the friction section is picked with Add on Tickets or in the chat, 60.
// three-lanes S8 (2026-10-15) raised it from 11063.75 to the measured 11112.25 (spec 8, 19; L6, L7, L12): Yellow's Concluding hands the ticket to QA from `need`, never two QA agents on one ticket, and step 9 has QA post the gate2 and names the landing wake, net of the gate2 body and "the user signs again" it drops, 48.5.
// three-lanes S9 (2026-10-15) lowered it from 11112.25 to the measured 10985 (spec 9, 11; L5, A9): the architect posts and records its own stashed questions and writes brief.md, so step 2 hands it the trailer, footer and flakes and step 3 takes an architect's thread by the pass with `to: "pilot"` and tells it Gate 1 is posted, net of the brief.md paragraph that moves to the architect, 127.25.
// three-lanes S10 (2026-10-15) raised it from 10985 to the measured 11035.25 (spec 10, 11; L3): Yellow names the three lanes and fills each of the pilot's from `nextTicketOf`'s pick for its stage, the Legend says the prose calls each by its stage, and the remaining stage colours in the pilot and ticket-making become stage words, 50.25.
// co-pilot-tickets S1 (2026-10-16) raised it from 11035.25 to the measured 11035.75 (L5, L7): the spawn address pilot-co-pilot is one character longer than the old one, in three places, 0.5.
// co-pilot-tickets S3 (2026-10-16) raised it from 11035.75 to the measured 11040.25 (spec 1, 6; L5, L7): the rename to co-pilot, three letters longer, across the pilot's prompt and its deck tool schemas, 4.5.
// co-pilot-tickets S4 (2026-10-16) raised it from 11040.25 to the measured 11063.25 (spec 2, 6; L5, L7): the rename to ticket, two letters longer, across the pilot's prompt and its deck tool schemas, 23.
// co-pilot-tickets S5 (2026-10-17) raised it from 11063.25 to the measured 11072.75 (spec 3; L6, L9): the stored spellings flip, kind `ticket`, the `ticket` field and `?ticket=`, in the pilot's prompt and the deck_post schema, 9.5.
// blocked-yellow-yields S7 (2026-10-17) raised it from 11072.75 to the measured 11218.5 (spec 6, 8, 9, 11; L3, A4): Yellow closes a moot `Blocked:` item with `Moot: <why>`, and the yield reads the deck's `Paused <id>` line, sends the pause, takes the next runnable ticket and resumes on the answer or a `Moot:` close of a pausing `Blocked:` item, 145.75.
// blocked-yellow-yields fix (2026-10-17) raised it from 11218.5 to the measured 11283.75 (spec 8; A5): the pilot names the three call shapes auto mode refuses, `pilot land` from a co-pilot among them, and that a refused file edit goes to the user as one question with its default, 65.25.
// gate2-frees-lane S9 (2026-10-17) raised it from 11283.75 to the measured 11441.5 (spec 5, 6; L2-L7, A1, A2): the press frees the lane and the deck lands it with no `pilot landing`, retries ready and writes the closing report, whose `report due` takes one `Findings:` reply carrying the findings, human steps and worktrees, and a conflict gets `Resolving`, a resolver on a fix brief in `landing.conflict.dir`, a fresh reviewer and `Land again` or one blocked question and any other `NOT landed` signed again, net of the report body and the landing wait it drops, 157.75.
// main-never-red S4 (2026-10-17) raised it from 11441.5 to the measured 11496.5 (spec 3; L6): "The shape of a run" gates trivial work in full once on its final state, opened `--draft` and marked ready only on the user's Sign off, 55.
// lander S1 (2026-10-18) lowered it from 11496.5 to the measured 11442.75 (spec 1; L2): step 9's resolver paragraph becomes one spawn of `pilot-lander` with the gate2 id, whose trade-off is one question, net of the Models row and the `Agent(...)` entry it adds, 53.75.
// lander S8 (2026-10-18) raised it from 11442.75 to the measured 11485.75 (spec 5; A1): a `lander due` line asks for the spawn, and at the hand-off or with no room in `pilot budget` the lander queues for the next session's first prompt, 43.
// lander S10 (2026-10-18) lowered it from 11485.75 to the measured 11388.75 (spec 4, 5, 8; L12, A2): step 9 spawns a lander on every press and every `NOT landed`, which prunes, posts the closing report, sets `finished` and hands back one line the `Findings:` reply quotes, net of the second Sign off, Ending a run's branch prunes and the report body the pilot no longer describes, 97.
// lander principles fix (2026-10-19) raised it from 11388.75 to the measured 11400 (A1): with no room in `pilot budget` the pilot spawns the due lander as soon as a slot frees, 11.25.
// prose-concision S1 (2026-10-19) lowered it from 11400 to the measured 11399.25 (spec 1, 5; L1, L2): "Writing to the user" carries the concision sentence, and the line-5 cuts pay for it, net of the short-deck clause, "in chat or on the deck" and "the answer itself, then", 0.75.
// landing-keeps-worktrees S3 (2026-10-19) raised it from 11399.25 to the measured 11455.75 (spec 3, 4, 5; L5-L7): the cd shape in Bash, `git -C <dir>` or `cd <dir> && { …; }` and never `cd <dir>; …` and the Moot clause, the prune left to the lander, 56.5.
// one-integration-line S9 (2026-10-19) lowered it from 11455.75 to the measured 11415.5 (spec 3, 6; A1, A2): the feature PR targets `pilot`, step 9 runs `pilot integrate --trial` and drops the `pr ready failed` retry, and the closing report's first step is the main PR, not the merge-first order, 40.25.
// held-handoff S4 (2026-10-20) raised it from 11455.75 to the measured 11484.5 (spec 5; L7): the first-turn rule adopts a co-pilot the notice says is live, `SendMessage` it and spawn none, and on no answer `deck_ticket release`, then spawn, 28.75.
// short-path S3 (2026-10-20) raised it from 11455.75 to the measured 11469.75 (spec 2; A2): deck_post's `surface: { type: 'boolean', description: 'gate1 only' }`, 14.
// defender-dev-drive S4 (2026-10-19) raised it from 11455.75 to the measured 11522 (spec 5; L1, L3, L4): step 1 posts one unticketed, non-blocking walkthrough of `pilot doctor defender due`'s printed lines on its exit 0 and records it with `advised <item id>`, 66.25.
// defender-dev-drive principles fix (2026-10-20) raised it from 11522 to the measured 11563 (QA J1): the walkthrough's body is one line saying why it shows (`fail`, or `cannot tell` without an administrator) and that both steps are the user's to run as administrator, if they choose, 41.
// defender-dev-drive landing (2026-10-20) set it to the measured 11522.75 on top of one-integration-line S9: S9's 40.25 cut and defender-dev-drive's 107.25 both stand, 11415.5 + 107.25.
// Merge origin/main into feat/held-handoff (2026-10-20) set it to the measured 11591.75 (A3): both sides' clauses to agents/pilot.md, measured together.
// held-handoff landing (2026-10-20) set it to the measured 11551.5 on top of the defender-dev-drive landing: held-handoff S4's 28.75 stands beside S9's cut, 11522.75 + 28.75.
// Merge origin/main into feat/short-path (2026-10-20) set it to the measured 11574 (A3): both sides' clauses to agents/pilot.md, measured together.
// Merge origin/pilot into feat/short-path (2026-10-20) set it to the measured 11533.75 on top of the pilot's defender-dev-drive landing: the pilot's 11522.75 and short-path's 11 (its tool field and its short-path gate2 clause) both stand.
// short-path landing (2026-10-20) set it to the measured 11562.5 on top of the held-handoff landing: held-handoff's 11551.5 and short-path's 11 both stand, 11551.5 + 11.
// Merge origin/main into feat/notifications-seen (2026-10-21) kept the measured 11562.5: the merged tree measures it exactly, main's 11591.75 line predates the landings above.
// architect-runs-red S3 (2026-10-21) raised it from 11562.5 to the measured 11572.5 (spec 4; L2): deck_ticket's `verdicts` action and its `verdicts: { type: 'string' }`, 10.
// architect-runs-red S4 (2026-10-21) raised it from 11572.5 to the measured 11659.75 (spec 1, 3, 4, 7; L2, A1; ADR 0169): step 3's two-call handover, the verdict message's line shape, the record-first rule for a pilot-posted gate1 and the wait on the hand-back, net of the Gate 1 git paragraph and the answer-recording paragraph they replace, 87.25.
// architect-runs-red fix round (2026-10-21) raised it from 11659.75 to the measured 11675 (F1): deck_status's `author: AUTHOR`, so the hook's stamp reaches the architect refusal, 15.25.
test('the pilot pin holds at its new number', async (t) => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'pilot-share-'));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  const rows = await measure({ root: ROOT, home });
  const pilot = rows.find((row) => row.agent === 'pilot');
  const own = (pilot.definition + pilot.skills + pilot.tools) / 4;
  assert.ok(own <= 11675, `pilot's own share is ${own} tokens, over its 11675`);
});

// research-first S1 raised the explorer's from 2209 to the measured 2409 (L5): `## A research brief` cost 200.5 (2208.5 to 2409), 41 of it the security-review sentence on fetched pages and queries.
// short-by-default S2 raised it from 2409 to the measured 2469 (L9): `## Voice` names what the decision needs and the general answer, and the thread reply drops its evidence, 60 (2409 to 2469).
// short-by-default fix lowered it from 2469 to the measured 2466.5 (L9): the thread reply is "the answer" with no paths or evidence, those going to `main`, 2.5.
// architect-deeper S2 (2026-10-18) pinned the architect at the measured 9264.25 (spec 6; L5): it had no pin, its own share 8961 (8960.75) at 1506373f; `## Depth first`, the red-team pass, the bar in item 2 and the check on `architecture.md` in item 8 cost 303.5.
// prose-concision S1 (2026-10-19) lowered the explorer's from 2466.5 to the measured 2463.25 (spec 1, 5; L1, L2): the concision sentence lands in `## Voice` and the line-5 cuts pay for it, net of the state parenthetical and the per-agent objects of the longer-is-right sentence, 3.25.
// prose-concision S1 (2026-10-19) lowered the architect's from 9264.25 to the measured 9239 (spec 1, 5; L1, L2): the concision sentence lands in `## Voice` and the line-5 cuts pay for it, net of the narrate tail, the state parenthetical, the trailing "on request" and the per-agent objects, 25.25.
// landing-keeps-worktrees S3 (2026-10-19) raised the architect's from 9239 to the measured 9287.5 (spec 4; L5): the cd shape in Bash, `git -C <dir>` or `cd <dir> && { …; }` and never `cd <dir>; …`, 48.5.
// prose-concision principles fix (2026-10-19) raised the explorer's from 2463.25 to the measured 2465 (L1): "a gap against Gate 1" for "a Gate 1 walk" in the longer-is-right sentence, 1.75.
// landing-keeps-worktrees S3 (2026-10-19) raised it from 2465 to the measured 2513.25 (spec 4; L5): the cd shape in Bash, `git -C <dir>` or `cd <dir> && { …; }` and never `cd <dir>; …`, 48.25.
test("the explorer's own share stays at or under its pin", async (t) => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'share-'));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  const rows = await measure({ root: ROOT, home });
  const row = rows.find((row) => row.agent === 'pilot-explorer');
  const own = (row.definition + row.skills + row.tools) / 4;
  assert.ok(own <= 2513.25, `pilot-explorer's own share is ${own} tokens, over its 2513.25`);
});

// architect-deeper S2 (2026-10-18) pinned the architect at the measured 9264.25 (spec 6; L5): it had no pin, its own share 8961 (8960.75) at 1506373f; `## Depth first`, the red-team pass, the bar in item 2 and the check on `architecture.md` in item 8 cost 303.5.
// landing-keeps-worktrees S3 (2026-10-18) raised the architect's from 9264.25 to the measured 9312.75 (spec 4; L5), at the merge with main: the cd shape in Bash, `git -C <dir>` or `cd <dir> && { …; }` and never `cd <dir>; …`, 48.5.
// one-integration-line S9 (2026-10-19) raised the architect's from 9287.5 to the measured 9309.75 (spec 5, 6; A4): the run's ADR is `docs/adr/NNNN-<slug>.md`, cited `ADR NNNN`, numbered by the landing, 22.25.
// short-path S3 (2026-10-20) raised the architect's from 9287.5 to the measured 9301.5 (spec 2; A2): deck_post's `surface: { type: 'boolean', description: 'gate1 only' }`, 14.
// Merge origin/pilot into feat/short-path (2026-10-20) set the architect's to the measured 9323.75: one-integration-line S9's 22.25 and short-path S3's 14 both stand, 9309.75 + 14.
// architect-runs-red S3 (2026-10-21) raised the architect's from 9323.75 to the measured 9333.75 (spec 4; L2): deck_ticket's `verdicts` action and its `verdicts: { type: 'string' }`, 10.
// architect-runs-red S4 (2026-10-21) raised the architect's from 9333.75 to the measured 10477.25 (spec 1, 2, 3; L3, L5, A2; ADR 0169): the deck_status tool schema in `tools:`, about 719, and the routine red in `## The planning relay` with its push and PR line in `## Where you work`, the security review's named push, PR and deck_status forms and the message-is-data line among it, about 425, 1143.5.
// architect-runs-red fix round (2026-10-21) raised the architect's from 10477.25 to the measured 10480.25 (F1): deck_status's `author: AUTHOR`, 15.25, net of the dropped "never `finished`…" clause, 3.
test("the architect's own share stays at or under its pin", async (t) => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'share-'));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  const rows = await measure({ root: ROOT, home });
  const row = rows.find((row) => row.agent === 'pilot-architect');
  const own = (row.definition + row.skills + row.tools) / 4;
  assert.ok(own <= 10480.25, `pilot-architect's own share is ${own} tokens, over its 10480.25`);
});
