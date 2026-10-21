/**
 * The architect works deeper, not wider (architect-deeper S2, spec 1, 2, 5, 6; L1, L5, L6).
 * A depth step before the research, a red-team pass after the deepening pass, a bar on every
 * spec line, and the check run on `architecture.md`. The prose is the interface, so each pin
 * holds a rule, not a sentence: a rewording that keeps the rule keeps the pins green.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { flat, read, sectionOf } from './lib/area-file.mjs';

const ARCHITECT = read('agents/pilot-architect.md');
const body = ARCHITECT.slice(ARCHITECT.indexOf('\n---', 4) + 4);

/** The text under one `## ` heading, up to the next, on one line. */
function section(heading) {
  const text = sectionOf(ARCHITECT, heading);
  assert.notEqual(text, '', `no "## ${heading}" heading`);
  return flat(text);
}

/** One numbered item of the artefact's section list, up to the next item, on one line. */
function item(n) {
  const text = section('The artefact');
  const start = text.search(new RegExp(`(?:^| )${n}\\. \\*\\*`));
  assert.notEqual(start, -1, `no item ${n}. in The artefact`);
  const rest = text.slice(start + 1);
  const end = rest.search(new RegExp(` ${n + 1}\\. \\*\\*`));
  return end === -1 ? rest : rest.slice(0, end);
}

test('the depth step is the second section', () => {
  const headings = [...body.matchAll(/^## (.+)$/gm)].map((match) => match[1]);
  assert.deepEqual(headings.slice(0, 2), ['Merge first', 'Depth first'], 'Depth first follows Merge first (spec 1, L1)');
  assert.ok(headings.indexOf('Depth first') < headings.indexOf('Read before you design'), 'the depth step comes before the research (spec 1)');
});

test('the depth step asks 3 questions and stays inside the ask', () => {
  const text = section('Depth first');
  assert.match(text, /top practitioner[^.?]*(did not|never) ask/i, 'what a top practitioner would do that the brief did not ask (spec 1)');
  assert.match(text, /raw material/i, 'what raw material they would start from (spec 1)');
  assert.match(text, /outside (you|the architect) and the user[^.?]*confirm/i, 'what outside the architect and the user would confirm it (spec 1)');
  assert.match(text, /`practitioner: <who>`/, 'each answer becomes a §2 line tagged practitioner (spec 1)');
  assert.match(text, /§2/, 'the answers land in the spec (spec 1)');
  assert.match(text, /never wider/i, 'deeper on the stated ask, never wider (spec 1)');
  assert.match(text, /`pilot:pilot-explorer`/, 'knowledge from outside the repo comes through a research brief (L6)');
});

test('the red team runs after the deepening pass and records its finds', () => {
  const text = section('Decide, and stash what is not yours');
  assert.match(text, /red[- ]team/i, 'a red-team pass is named (spec 2)');
  assert.ok(text.search(/deepening pass/i) < text.search(/red[- ]team/i), 'the red team runs after the deepening pass (spec 2)');
  assert.match(text, /by doing the work/i, 'the attack is done, not role-played (spec 2)');
  assert.match(text, /first red step/i, "it walks each slice's first red step (spec 2)");
  assert.match(text, /half-build/i, 'it names every seam 2 slices each half-build (spec 2)');
  assert.match(text, /`red team:`/, 'each find is marked red team: (spec 2)');
  assert.match(text, /`red team: none found/, 'a pass with no find still records what it attacked (spec 2)');
  assert.match(text, /§6[^.]*§8/, 'the finds go into §6 or §8 (spec 2)');
});

test('the artefact asks a bar and names the check on architecture.md', () => {
  assert.match(item(2), /\bbar\b/, 'every spec line carries a bar (spec 5)');
  assert.match(item(2), /a number, a count or a bound/i, 'a bar is a number, a count or a bound (spec 5)');
  const eight = item(8);
  assert.match(eight, /check-slices\.mjs[^.]*`architecture\.md`/, 'the check runs on architecture.md too (spec 5)');
  assert.match(eight, /check-slices\.mjs[^.]*`slices\/`/, 'and still on slices/ (spec 5)');
});
