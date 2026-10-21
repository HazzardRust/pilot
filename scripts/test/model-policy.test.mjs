// The crew's model policy (cheaper-crew S4, ADR 0150): the pilot's Models table names a model
// and a reason per role, Sonnet on a precise implementer slice, Haiku on the two helpers; both
// orchestrators copy the slice's `Model:` line into the implementer's brief; and the ADR is
// cited where it governs. The assertions read roles, models and the Model line, never a
// sentence, so a reworded table or brief paragraph still passes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n');

/** The body of a `### <title>` section of agents/pilot.md, up to the next heading. */
function pilotSection(title) {
  const text = read('agents/pilot.md');
  const start = text.indexOf(`\n### ${title}\n`);
  assert.ok(start !== -1, `agents/pilot.md has a ### ${title} section`);
  const rest = text.slice(start + title.length + 6);
  const end = rest.search(/\n#{2,3} /);
  return end === -1 ? rest : rest.slice(0, end);
}

/** The Models table as role -> { model, why }, from `| Role | Default | Why |` rows. */
function modelsTable() {
  const rows = new Map();
  for (const line of pilotSection('Models').split('\n')) {
    const cells = line.replace(/`/g, '').split('|').slice(1, -1).map((c) => c.trim());
    if (cells.length !== 3 || !/^[a-z-]+$/.test(cells[0])) continue;
    rows.set(cells[0], { model: cells[1], why: cells[2] });
  }
  return rows;
}

/** Spec 8: the files that cite the ADR by number. */
const CITING = ['agents/pilot-implementer.md', 'agents/pilot-fundamentalist.md', 'agents/pilot-fact-sheet.md', 'agents/pilot-evidence-runner.md'];

test('the table keeps the five and names both helpers', () => {
  const rows = modelsTable();
  assert.equal(rows.get('pilot')?.model, 'Fable', 'the pilot stays on Fable');
  for (const role of ['pilot-architect', 'pilot-co-pilot', 'pilot-fundamentalist', 'pilot-qa']) {
    assert.equal(rows.get(role)?.model, 'Opus', `${role} stays on Opus`);
  }
  for (const role of ['pilot', 'pilot-architect', 'pilot-co-pilot', 'pilot-fundamentalist', 'pilot-qa']) {
    assert.ok(rows.get(role)?.why?.length > 0, `${role}'s row says why`);
  }
  for (const helper of ['pilot-fact-sheet', 'pilot-evidence-runner']) {
    assert.equal(rows.get(helper)?.model, 'Haiku', `${helper} is a Haiku helper row`);
    assert.ok(rows.get(helper)?.why?.length > 0, `${helper}'s row says why`);
  }
});

test('the implementer row names Sonnet for a precise slice', () => {
  const row = modelsTable().get('pilot-implementer');
  assert.ok(row, 'the Models table has an implementer row');
  assert.match(row.model, /^Opus\b/, 'the implementer defaults to Opus, the first word the default');
  assert.match(row.model, /\bSonnet\b[^|]*\bprecise slice\b/, 'and runs Sonnet on a precise slice');
  assert.ok(row.why.length > 0, "the implementer's row says why");
});

test('both orchestrators copy the Model line into the brief', () => {
  const modelLine = /`Model: <?sonnet\|opus>? — <[^>]+>`/;
  assert.match(pilotSection('Briefs'), modelLine, "the pilot's Briefs name the slice's Model line");
  assert.match(read('agents/pilot-co-pilot.md'), modelLine, "the co-pilot's briefs carry the slice's Model line");
});

test('ADR 0150 is cited where it governs', () => {
  assert.match(pilotSection('Models'), /ADR 0150/, 'the Models section cites it');
  for (const file of CITING) assert.match(read(file), /ADR 0150/, `${file} cites ADR 0150`);
});
