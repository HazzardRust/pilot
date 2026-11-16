/**
 * The ticket-making skill: structure and forbidden-pattern lints only. What the prose says is
 * not pinned here (ADR NNNN); each test names the rule it keeps.
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

test('the skill exists with name ticket-making, no provenance header, and pilot.md references it', () => {
  const skill = read(SKILL_REL);
  const front = frontmatterOf(skill);

  assert.ok(front, 'the skill opens with frontmatter'); // lint: frontmatter exists
  assert.match(front, /^name: ticket-making$/m); // lint: the name field exists
  assert.doesNotMatch(skill, /<!--\s*provenance/, 'the skill is own work and carries no provenance header'); // lint: no provenance header

  const fromPilot = pluginRootPaths(ROOT, ['agents/pilot.md']).filter((ref) => ref.target === SKILL_REL);
  assert.equal(fromPilot.length, 1, 'agents/pilot.md names the skill by its plugin-root path once'); // lint: the reference resolves
  assert.deepEqual(checkReferences(ROOT, ['agents/pilot.md', 'skills/ticket-making']).failures, []);
});

test('the skill has its section headings, and the states in order', () => {
  const skill = read(SKILL_REL);
  const headings = [...skill.matchAll(/^## (.+)$/gm)].map((match) => match[1]);

  // lint: the skill's headings exist, in order (Check first precedes The proposal)
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
  assert.ok(order.every((at) => at !== -1), `each state is named in bold: ${order}`); // lint: each state step exists
  assert.deepEqual([...order].sort((a, b) => a - b), order, 'red, yellow, green, closed, in that order');
});

test('no retired estimate, cap or size vocabulary remains', () => {
  const skill = read(SKILL_REL);
  const estimates = section(skill, 'Estimates');

  // lint: the retired 15-slice aim, the cap and the measured estimate stay gone
  assert.doesNotMatch(skill, /aimed at 15|15 slices/, 'the old aim of 15 is gone');
  assert.doesNotMatch(skill, /one-run bound|\bcap\b/i, 'no bound or cap on the slice count remains');
  assert.doesNotMatch(estimates, /measured|median|per slice|Gate 1 estimate/i, 'no measured estimate remains');
  assert.doesNotMatch(skill.replace(estimates, ''), /\b20 slices/, 'the aim is stated once, in Estimates');

  // lint: the small-ticket, Size-band, minutes and `estimate` field vocabulary stays gone
  assert.doesNotMatch(skill, /small ticket/i);
  assert.doesNotMatch(skill, /size: 'small'|`(small|regular)`/);
  assert.doesNotMatch(skill, /^## Size$/m);
  assert.doesNotMatch(skill, /\bband\b/i, 'the 5–7 h band is gone');
  assert.doesNotMatch(skill, /5[–-]7 ?h|5 to 7 hours/i);
  assert.doesNotMatch(skill, /Answered before posting/);
  assert.doesNotMatch(skill, /under 1 hour/i);
  assert.doesNotMatch(skill, /`estimate`/, 'the retired estimate field is not named');
  assert.doesNotMatch(skill, /minute/i, 'the skill carries no minutes');
});

test('Merging keeps its three numbered steps in order and no second copy of the merge rule', () => {
  const skill = read(SKILL_REL);
  const merge = section(skill, 'Merging');
  const order = [/1\.\s+\*\*Into a queued ticket/, /2\.\s+\*\*Into the live planning ticket/, /3\.\s+\*\*Into a new ticket/].map(
    (step) => merge.search(step),
  );

  assert.ok(order.every((at) => at !== -1), `each merge is a numbered step: ${order}`); // lint: each merge step exists
  assert.deepEqual([...order].sort((a, b) => a - b), order, 'queued ticket, then the live planning ticket, then a new ticket');
  assert.doesNotMatch(merge, /re-estimate/i, 'a reply on a queued ticket does not re-estimate it'); // lint: no re-estimate on a reply
  assert.doesNotMatch(merge, /`deck_ticket` `merge`|deck_ticket merge/, 'no second copy of the merge rule here'); // lint: the merge rule is spelled once, in the architect

  const lines = merge.split('\n');
  const at = lines.findIndex((line) => line.startsWith('2. **Into the live planning ticket**'));
  assert.match(lines[at + 1], /^3\. /, 'item 2 is one line'); // lint: item 2 stays a one-line pointer
});

test('the skill keeps its forbidden patterns out', () => {
  const skill = read(SKILL_REL);

  assert.doesNotMatch(skill, /^\s*1\.\s.*\?\s*$/m, 'no numbered question round'); // lint: no numbered question round
  assert.doesNotMatch(skill, /short jobs merge|two surfaces/i, 'the short-jobs rule is deleted'); // lint: retired split rules stay gone
  assert.doesNotMatch(skill, /feature-sized[^.]*stands alone/i, 'the feature-sized rule is deleted');
  assert.doesNotMatch(skill, /fold/i); // lint: the skill never says fold
});

test('the proposal table keeps its header row', () => {
  const proposal = section(read(SKILL_REL), 'The proposal');

  // lint: the proposal table's columns exist
  assert.match(proposal, /^\| # \| Ticket \| Holds \| Why together \| Found \| Estimate \| Position \|$/m);
});

test('agents/pilot.md keeps its ticket-making row and routes ticket appends through the skill', () => {
  const pilot = read('agents/pilot.md');
  const row = pilot.split('\n').find((line) => line.startsWith('| `ticket-making` |'));

  assert.ok(row, 'the methodology skills table has a ticket-making row'); // lint: the row exists
  assert.ok(row.includes(`\`${TICKET_MAKING_TITLE}\``), `the row names the ${TICKET_MAKING_TITLE} title`); // lint: the row names the deck's title

  const start = pilot.indexOf('Work agreed in any thread');
  assert.notEqual(start, -1, 'the deck-inbox paragraph keeps its ticket rule');
  const rule = pilot.slice(start, pilot.indexOf('\n\n', start));
  assert.ok(rule.includes('`${CLAUDE_PLUGIN_ROOT}/' + SKILL_REL + '`'), 'the ticket rule names the skill by path'); // lint: the rule references the skill
  assert.doesNotMatch(rule, /`Add`/, 'the rule is not conditional on an Add thread'); // lint: the rule is not Add-only
});

// lint: the auditor never converts a pick to minutes per slice
test('the auditor posts no minutes per slice', () => {
  const auditor = read('agents/pilot-auditor.md').replace(/\s+/g, ' ');

  assert.doesNotMatch(auditor, /minutes per slice/, 'no conversion to time');
});
