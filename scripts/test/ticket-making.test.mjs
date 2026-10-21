/**
 * The ticket-making skill (ticket-making S8, spec 2-6, 10-12, 20; rewritten by ticket-states S11,
 * spec 10, 12, L15, A2, A6): the rules the pilot cuts every list of jobs into tickets by, and
 * the one row that sends it there. Prompt files are pinned by text, so each test names the
 * rule a rewrite must keep.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { checkReferences, pluginRootPaths } from '../check-references.mjs';
import { TICKET_MAKING_TITLE } from '../../deck/ui/render.mjs';
import { frontmatterOf } from './lib/area-file.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SKILL_REL = 'skills/ticket-making/SKILL.md';

/** Normalised to LF: git checks these out with CRLF on Windows. */
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n');

/** The text under one `## ` heading, up to the next. */
function section(source, heading) {
  const start = source.indexOf(`\n## ${heading}\n`);
  assert.notEqual(start, -1, `the skill has no "## ${heading}" heading`);
  const rest = source.slice(start + heading.length + 5);
  const end = rest.search(/\n## /);
  return end === -1 ? rest : rest.slice(0, end);
}

test('the skill exists with name ticket-making and a description', () => {
  const skill = read(SKILL_REL);
  const front = frontmatterOf(skill);

  assert.ok(front, 'the skill opens with frontmatter');
  assert.match(front, /^name: ticket-making$/m);
  assert.match(front, /^description: .*`Add`.*$/m, 'the description names the thread that invokes it');
  assert.doesNotMatch(skill, /<!--\s*provenance/, 'the skill is own work and carries no provenance header');
  assert.ok(skill.split('\n').length < 166, 'the rewrite stays under the 166 lines it replaced (S11 Files owned)');

  const fromPilot = pluginRootPaths(ROOT, ['agents/pilot.md']).filter((ref) => ref.target === SKILL_REL);
  assert.equal(fromPilot.length, 1, 'agents/pilot.md names the skill by its plugin-root path once');
  assert.deepEqual(checkReferences(ROOT, ['agents/pilot.md', 'skills/ticket-making']).failures, []);
});

test('the skill has States, Estimates and Merging sections', () => {
  const skill = read(SKILL_REL);
  const headings = [...skill.matchAll(/^## (.+)$/gm)].map((match) => match[1]);

  assert.deepEqual(headings, [
    'When',
    'One ticket is one run',
    'States',
    'Estimates',
    'Check first',
    'The proposal',
    'The body',
    'Posting',
    'Merging',
    'Worked example',
  ]);

  const states = section(skill, 'States');
  const order = ['red', 'yellow', 'green', 'closed'].map((state) => states.search(new RegExp(`\\*\\*${state}\\*\\*`)));
  assert.ok(order.every((at) => at !== -1), `each state is named in bold: ${order}`);
  assert.deepEqual([...order].sort((a, b) => a - b), order, 'red, yellow, green, closed, in that order');
  assert.match(states, /Gate 1/, 'signing Gate 1 is what turns a ticket yellow');
  assert.match(states, /`gate2`/, 'posting gate2 is what turns it red');
});

// slice-estimates S3 (spec 5, L2, L3, L8): one size, the slice count; nothing measured.
// bigger-jobs S5 (spec 3, 5): the aim is 20 and refuses nothing; no 15 and no one-run bound remain.
test('the estimate aims at 20 and refuses nothing', () => {
  const skill = read(SKILL_REL);
  const estimates = section(skill, 'Estimates');

  assert.match(estimates, /aimed at 20 slices/, 'a ticket is aimed at 20 slices');
  assert.match(estimates, /20 is an aim, never a refusal/, '20 is an aim, not a bound');
  assert.doesNotMatch(skill, /aimed at 15|15 slices/, 'the old aim of 15 is gone');
  assert.doesNotMatch(skill, /one-run bound|\bcap\b/i, 'no bound or cap on the slice count remains');
  assert.doesNotMatch(estimates, /measured|median|per slice|Gate 1 estimate/i, 'no measured estimate remains (L2)');

  const outside = skill.replace(estimates, '');
  assert.doesNotMatch(outside, /\b20 slices/, 'the aim is stated once, in Estimates');
});

// bigger-jobs S5 (spec 5): each ticket pays four fixed costs, so one- and two-slice tickets cost more.
test('small tickets are said to cost more', () => {
  const run = section(read(SKILL_REL), 'One ticket is one run').replace(/\s+/g, ' ');

  assert.match(run, /each ticket costs a grilling, a Gate 1, a QA pass and a Gate 2/i, 'the four costs every ticket pays');
  assert.match(run, /one or two slices/, 'the cost is weighed against a ticket of one or two slices');
});

// bigger-jobs S5 (spec 5): the proposal is re-cut before it goes up.
test('small rows are re-cut before the proposal', () => {
  const skill = read(SKILL_REL);
  const proposal = section(skill, 'The proposal').replace(/\s+/g, ' ');

  assert.match(
    proposal,
    /row of one or two slices[^.]*merged into a same-surface row[^.]*before the table goes up/i,
    'a one- or two-slice row merges into a same-surface row before the proposal is posted',
  );
  assert.match(proposal, /third-party[^.]*stands? alone/i, 'the third-party rule still keeps a small row alone');
  const run = section(skill, 'One ticket is one run');
  assert.match(run, /Jobs on the same surface merge/, 'the same-surface rule is kept');

  const example = section(skill, 'Worked example').replace(/\s+/g, ' ');
  assert.match(example, /five tickets[^.]*five grillings/i, 'the worked example shows what the merged cut saves');
});

test('the skill names deck_ticket merge for planning-time merges', () => {
  const merge = section(read(SKILL_REL), 'Merging');
  const order = [/1\.\s+\*\*Into a queued ticket/, /2\.\s+\*\*Into the live planning ticket/, /3\.\s+\*\*Into a new ticket/].map(
    (step) => merge.search(step),
  );

  assert.ok(order.every((at) => at !== -1), `each merge is a numbered step: ${order}`);
  assert.deepEqual([...order].sort((a, b) => a - b), order, 'queued ticket, then the live planning ticket, then a new ticket');
  assert.match(merge, /never edit/i, "a queued ticket's body is never edited");
});

// slice-estimates S3 (A7): a reply on a queued ticket changes no count; only a merge does (spec 1).
test('a reply merge does not re-estimate', () => {
  const merge = section(read(SKILL_REL), 'Merging');

  assert.doesNotMatch(merge, /re-estimate/i, 'a reply on a queued ticket does not re-estimate it: no code reads a count from a reply');
});

test("ticket-making's Merging item 2 points at the architect", () => {
  // merge-first L6: the live-ticket merge is spelled once, in the architect's "Merge first".
  const skill = read(SKILL_REL);
  const merge = section(skill, 'Merging');
  const lines = merge.split('\n');
  const at = lines.findIndex((line) => line.startsWith('2. **Into the live planning ticket**'));
  assert.notEqual(at, -1, 'item 2 keeps its heading');
  const item2 = lines[at];

  assert.match(item2, /agents\/pilot-architect\.md/, 'item 2 names the architect by path');
  assert.match(item2, /Merge first/, 'and its section');
  assert.match(lines[at + 1], /^3\. /, 'item 2 is one line');
  assert.doesNotMatch(merge, /`deck_ticket` `merge`|deck_ticket merge/, 'no second copy of the merge rule here');
  const description = /^description: (.*)$/m.exec(skill)[1];
  assert.match(description, /architect/, "the description's merge clause names the architect");
});

test('no small ticket, Size band or Answered before posting remains', () => {
  const skill = read(SKILL_REL);

  assert.doesNotMatch(skill, /small ticket/i);
  assert.doesNotMatch(skill, /size: 'small'|`(small|regular)`/);
  assert.doesNotMatch(skill, /^## Size$/m);
  assert.doesNotMatch(skill, /\bband\b/i, 'the 5–7 h band is gone');
  assert.doesNotMatch(skill, /5[–-]7 ?h|5 to 7 hours/i);
  assert.doesNotMatch(skill, /Answered before posting/);
  assert.doesNotMatch(skill, /under 1 hour/i);
});

test('the skill states nothing is posted before the yes, one ticket is one run, and its body shape', () => {
  const skill = read(SKILL_REL);
  const run = section(skill, 'One ticket is one run');

  assert.match(section(skill, 'The proposal'), /nothing is posted before the (user's )?yes/i);
  assert.match(section(skill, 'Posting'), /After the yes[^.]*deck_post/);
  assert.match(
    section(skill, 'The body'),
    /user's own words[^\n]*quoted[\s\S]*Numbered spec lines, each with its evidence/,
    "a body quotes the user's words, then numbered spec lines with their evidence (spec 5)",
  );
  assert.match(run, /one ticket is one run/i);
  assert.doesNotMatch(skill, /^\s*1\.\s.*\?\s*$/m, 'no numbered question round');
});

// slice-estimates S3 (spec 5, A3): surface is the cut; a count never splits a ticket.
test('jobs on one surface merge into one ticket however many there are', () => {
  const run = section(read(SKILL_REL), 'One ticket is one run');

  assert.match(run, /Jobs on the same surface merge[^.]*however many/i, 'one surface is one ticket, whatever the count');
});

test('a job is split off only when its surface is completely different', () => {
  const skill = read(SKILL_REL);
  const run = section(skill, 'One ticket is one run');

  assert.match(run, /only when its surface is completely different/i, 'a different surface is the reason to split');
  assert.match(run, /third-party code or a credential[^.]*stands alone/i, 'the credential rule survives (A3)');
  assert.doesNotMatch(skill, /short jobs merge|two surfaces/i, 'the short-jobs rule is deleted (A3)');
  assert.doesNotMatch(skill, /feature-sized[^.]*stands alone/i, 'the feature-sized rule is deleted (A3)');
});

// slice-estimates S3 (spec 5, L3, L13): one unit, slices, posted as sliceCount.
test('every post carries sliceCount, the Estimate column is slices, and the skill says no "minute"', () => {
  const skill = read(SKILL_REL);
  const proposal = section(skill, 'The proposal');
  const posting = section(skill, 'Posting');

  assert.match(proposal, /\*\*Estimate\*\*: [^\n]*slices/, 'the Estimate column is a slice count');
  assert.match(proposal, /past the aim[^.]*says why/i, 'a row past the aim says why (bigger-jobs S5)');
  assert.match(posting, /`sliceCount`[^.]*every `deck_post`|every `deck_post`[^.]*`sliceCount`/, 'every post carries sliceCount');
  assert.doesNotMatch(skill, /`estimate`/, 'the retired estimate field is not named (L13)');
  assert.doesNotMatch(skill, /minute/i, 'the skill carries no minutes (L3)');
  assert.match(posting, /deck_ticket[^.]*`?up`?[^.]*`?down`?/);
  assert.match(posting, /lands planning/, 'a posted ticket is planning');
});

test('agents/pilot.md names ticket-making in its skills table against the Add title', () => {
  const pilot = read('agents/pilot.md');
  const row = pilot.split('\n').find((line) => line.startsWith('| `ticket-making` |'));

  assert.ok(row, 'the methodology skills table has a ticket-making row');
  assert.ok(row.includes(`\`${TICKET_MAKING_TITLE}\``), `the row names the ${TICKET_MAKING_TITLE} title`);
  assert.match(row, /yourself/, 'the pilot answers the thread itself, not an explorer (L6)');

  const create = pilot.slice(pilot.indexOf('**A thread the user opened with Create**'));
  assert.match(create.slice(0, 600), new RegExp(`\`${TICKET_MAKING_TITLE}\`[^.]*yourself`), 'the Create rule excepts an Add thread');
});

test("pilot.md and ticket-making say an Add thread may comment on or close a queued ticket on the user's word", () => {
  const said = /`Add` thread[^.]*queued ticket[^.]*comment[^.]*clos[^.]*user's word/;
  const flat = (rel) => read(rel).replace(/\s+/g, ' ');
  assert.match(flat('agents/pilot.md'), said, 'pilot.md');
  assert.match(flat(SKILL_REL), said, 'ticket-making');
});

test('the skill never says fold', () => {
  assert.doesNotMatch(read(SKILL_REL), /fold/i);
});

test('pilot.md routes every ticket append through ticket-making', () => {
  const pilot = read('agents/pilot.md');
  const start = pilot.indexOf('Work agreed in any thread');
  assert.notEqual(start, -1, 'the deck-inbox paragraph keeps its ticket rule');
  const rule = pilot.slice(start, pilot.indexOf('\n\n', start));

  assert.ok(rule.includes('`${CLAUDE_PLUGIN_ROOT}/' + SKILL_REL + '`'), 'the ticket rule names the skill by path');
  assert.doesNotMatch(rule, /`Add`/, 'the rule is not conditional on an Add thread');
  assert.match(rule, /queued/, 'the rule merges into a queued ticket first');
  assert.match(
    pilot,
    /`Run <n> of <feature>: docs\/design\/<slug>\/architecture\.md approved/,
    "a later run's ticket names the artefact the deck's shape check accepts",
  );
});

test("the skill's Body section matches the deck's shape", () => {
  const body = section(read(SKILL_REL), 'The body');

  assert.match(body, /quoted[^.\n]*`>`/, "the user's words on > lines");
  assert.match(body, /evidence in italics/);
  assert.match(body, /`itm_…`/, 'the thread id');
  assert.match(body, /refuses/, 'says the deck refuses a body out of shape');
  assert.match(body, /architecture\.md/, 'a run-split ticket passes by naming its artefact (A8)');
  assert.match(body, /audit[^.]*report/, 'an audit pick passes by naming its report path (A8a)');
});

// slice-estimates S3 (spec 6, A6): an audit pick is sized by its effort band, in slices.
test('the auditor posts each pick with sliceCount from its effort, and no minutes per slice', () => {
  const auditor = read('agents/pilot-auditor.md').replace(/\s+/g, ' ');
  const post = auditor.slice(auditor.indexOf('7. Otherwise group the picked ids')).slice(0, 900);

  assert.match(post, /`sliceCount`/, 'an audit pick carries sliceCount, which the deck requires');
  assert.match(post, /effort as slices \(S 1, M 3, L 8\)/, "the slice count is the row's effort as slices");
  assert.doesNotMatch(post, /`estimate`|minutes per slice/, 'no minute estimate and no conversion to time');
});

// runs-build-on-each-other S4 (spec 10, 11; L7, A5): what already exists is found before the proposal.
test('the skill runs pilot tickets --open before the proposal', () => {
  const skill = read(SKILL_REL);
  const check = section(skill, 'Check first');

  assert.match(check, /`pilot tickets --open`/, 'the check is the command, not a recollection');
  assert.ok(skill.indexOf('\n## Check first\n') < skill.indexOf('\n## The proposal\n'), 'it comes before the proposal');
  assert.match(check, /yellow[^.]*green|unmerged/, 'it reads tickets of every state and the unmerged PRs');
});

test('the proposal table carries Found with its three values', () => {
  const proposal = section(read(SKILL_REL), 'The proposal');

  assert.match(proposal, /^\| # \| Ticket \| Holds \| Why together \| Found \| Estimate \| Position \|$/m);
  const at = proposal.indexOf('\n- **Found**');
  assert.notEqual(at, -1, 'the Found column is explained');
  const found = proposal.slice(at + 1).split(/\n(?=- |\n)/)[0];
  for (const value of ['`merge into <ticket>`', '`drop: in #N`', '`nothing found`']) assert.ok(found.includes(value), value);
  assert.match(found, /Merging/, 'a merge follows the Merging rule, named not copied (L7)');
});

// handoff-closed-on-pickup S3 (spec 4, 5): the proposal is its own question, and its id is the ticket's thread.
test('the proposal goes up as its own question', () => {
  const proposal = section(read(SKILL_REL), 'The proposal').replace(/\s+/g, ' ');

  assert.match(proposal, /`question`/, 'posted as a question item');
  assert.match(proposal, /Yes/, 'option Yes');
  assert.match(proposal, /Change/, 'option Change');
  assert.match(proposal, /never a chat reply/i, 'never a chat reply');
  assert.match(proposal, /never[^.]*closed or closing/i, 'never on a thread closed or closing in the same turn');
});

test('a proposed ticket names the proposal as its thread', () => {
  const body = section(read(SKILL_REL), 'The body').replace(/\s+/g, ' ');

  assert.match(body, /proposal item's id[^.]*came from (one|it)/i, "item 3 names the proposal item's id");
});

test('the worked example shows the proposal id', () => {
  const example = section(read(SKILL_REL), 'Worked example').replace(/\s+/g, ' ');

  assert.match(example, /proposal item \(`itm_[0-9a-f]{12}`\)[^.]*thread/i, 'a proposal item id given as the thread');
});
