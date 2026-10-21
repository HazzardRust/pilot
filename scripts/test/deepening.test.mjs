/**
 * The architect deepens, then writes seam-first slices (deep-modules S2, spec 1, 2; L13, A2).
 * Before the slices are cut the architect runs a deepening pass, records the design's seams
 * in Findings, caps a fold slice at 200 changed lines, and writes Tests lines that each name
 * an Interface symbol, checked with `check-slices`. The prose is the interface here, so each
 * pin holds a rule, not a sentence: a rewording that keeps the rule keeps the pins green.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { flat, read, sectionOf } from './lib/area-file.mjs';

const ARCHITECT = read('agents/pilot-architect.md');

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

test('the architect deepens before it slices', () => {
  const text = section('Decide, and stash what is not yours');
  assert.match(text, /deepening/i, 'a deepening pass is named (spec 2)');
  assert.match(text, /deletion test/i, 'shallow modules are found with the deletion test (spec 2)');
  assert.match(text, /DEEPENING\.md/, "the vendored DEEPENING.md is the reference (L13)");
  assert.match(text, /dependency categor/i, "DEEPENING.md's dependency categories classify each seam (spec 2)");
  assert.match(text, /before[^.]*slices[^.]*deepening pass|deepening pass[^.]*before[^.]*slices/i, 'the pass runs before the slices are cut (spec 2)');
  assert.doesNotMatch(text, /improve-codebase-architecture/, 'the upstream skill is not ported (L13)');
});

test("findings carry the design's seams", () => {
  const text = item(3);
  assert.match(text, /\*\*Seams\*\* table/, 'Findings carries a Seams table (spec 2)');
  assert.match(text, /seam,\s*interface,[^.]*folded[^.]*,\s*category/i, 'its columns are seam, interface, folded, category, in order (spec 2)');
});

test('the Seams table has one row per seam, naming the functions behind it', () => {
  const text = section('Decide, and stash what is not yours');
  assert.match(text, /Seams table[^.]*one row per seam[^.]*functions/i, 'one row per seam (module), its interface naming its functions (QA F4)');
});

test('a fold slice keeps its spec lines and is red on the new seam', () => {
  const text = section('Decide, and stash what is not yours');
  assert.match(text, /fold slice delivers[^.]*spec lines[^.]*behaviour it keeps/i, 'a fold slice delivers the lines whose behaviour it keeps (QA F3)');
  assert.match(text, /red step is the new seam's test[^.]*fails before the fold/i, 'its red step is the new seam test, red before the fold (QA F3)');
});

test('a fold is its own slice under a cap', () => {
  const text = section('Decide, and stash what is not yours');
  assert.match(text, /fold[^.]*own slice/i, 'a fold that changes code is its own slice (spec 2)');
  assert.match(text, /200 changed lines/, 'the fold slice is capped at 200 changed lines (A2)');
  // bigger-jobs S3 (spec 1): a fold over the cap is sliced in the run, never a candidate ticket.
  assert.match(text, /fold over 200[^.]*several fold slices[^.]*in the run/i, 'a bigger fold is several fold slices in the run');
  assert.doesNotMatch(text, /candidate ticket/i, 'a bigger fold is not sent to main as a candidate ticket');
});

test('slices are written seam-first and checked', () => {
  const text = item(8);
  assert.match(text, /Tests line[^.]*Interface/i, 'each Tests line names a symbol of the Interface block (spec 1)');
  assert.match(text, /`Rewrite check:`/, 'the slice file carries a rewrite check (spec 1)');
});
