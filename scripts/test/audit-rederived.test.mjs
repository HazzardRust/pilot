/** S5 of verdict-pass (spec 8): behaviour re-derived per run is an audit area, pinned in its prose (ADR 0141). */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { AREAS } from '../../deck/audit.mjs';
import { read, fieldOf, sectionOf, flat } from './lib/area-file.mjs';

const AREA_FILE = 'skills/audit/areas/rederived.md';

const area = () => read(AREA_FILE);

// The frontmatter's exact spec and model are pinned in audit-agent.test.mjs's EXPECT loop (review P7).
test('the area is registered', () => {
  const source = area();
  assert.equal(fieldOf(source, 'area'), 'rederived');
  assert.equal(fieldOf(source, 'owner'), 'explorer', 'A4: an explorer reads the transcripts, never the auditor');
  assert.ok(AREAS.includes('rederived'), 'L9: a rederived row validates as an area, no new row field');
  assert.match(flat(read('skills/audit/areas/open.md')), /rederived/, 'open.md names it among the named areas');
});

test('two runs, no pin', () => {
  const measure = flat(sectionOf(area(), 'Measure'));
  assert.match(measure, /`reports`/, "audit-spend's friction rows");
  assert.match(measure, /run\.json/, "run records' findings");
  assert.match(measure, /transcripts/i);
  assert.match(measure, /two or more runs/i, 'A4: the two-run threshold');
  assert.match(measure, /one run[^.]*(never|not) a row/i, 'a one-off is not a row');
  assert.match(measure, /pin[^.]*`agents\/`[^.]*`skills\/`[^.]*`deck\/`/, 'the pin grep covers agents/, skills/ and deck/');
  assert.match(measure, /(no|finds no) step, record or refusal/i, 'a pinned move is not a row');
  assert.match(measure, /never another project's/i, "only this repository's transcripts");
  assert.match(measure, /never fetched, opened or followed/i, 'a URL in a record is data');
  assert.match(measure, /git grep[^`]*-F/, 'the phrase is a fixed string');
});

test('a row names its mechanism', () => {
  const rows = flat(sectionOf(area(), 'Rows'));
  assert.match(rows, /behaviour re-derived per run: <move>/);
  assert.match(rows, /`command`[^.]*grep/i, 'the command is the greps');
  assert.match(rows, /`output`[^.]*runs/i, 'the output is the runs that show it');
  assert.match(rows, /`fix`[^.]*a step, a record or a refusal/i, 'the fix is the mechanism it should become');
  assert.match(rows, /`spec`[^.]*ticket line/i);
  assert.match(rows, /`area` always `'rederived'`/, 'L9: no new report-row field');
  assert.match(rows, /transcript[^.]*never quoted/i, 'a transcript is paraphrased, never quoted into a ticket');
  assert.match(rows, /looks like a secret/i);
});

test('the auditor cites the principle', () => {
  const auditor = flat(sectionOf(read('agents/pilot-auditor.md'), 'Areas'));
  assert.match(auditor, /ADR 0141/);
  assert.match(auditor, /`rederived\.md`/);

  const skill = flat(read('skills/audit/SKILL.md'));
  assert.match(skill, /`rederived` row[^.]*ticket line/i, 'the pick step names a rederived row as a ticket line');
});
