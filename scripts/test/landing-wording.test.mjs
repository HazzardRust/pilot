// gate2-frees-lane S9 (spec 5, 6; L2-L7, A1, A2): the pilot's and QA's prose name the new order. The press frees
// the lane and the deck lands it, the deck writes the report and its `report due` takes a `Findings:` reply, and a
// conflict gets `Resolving`, a resolver in `conflict.dir`, a fresh reviewer and `Land again`. lander S1 (spec 1; L2): that
// resolver is one spawn of `pilot-lander` with the gate2's id, and the lander says `Resolving` and `Land again`.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');
const flat = (text) => text.replace(/\s+/g, ' ');

/** The text under one heading of agents/pilot.md, up to the next heading of the same or a higher level. */
function section(text, heading) {
  const start = text.indexOf(`\n${heading}\n`);
  assert.ok(start >= 0, `agents/pilot.md lost its heading ${heading}`);
  const rest = text.slice(start + heading.length + 2);
  const next = rest.search(new RegExp(`\n#{1,${heading.match(/^#+/)[0].length}} `));
  return flat(next < 0 ? rest : rest.slice(0, next));
}

test('the pilot names the new order', () => {
  const pilot = read('agents/pilot.md');
  const where = {
    '### 9. Gate 2 and ready': ['the press frees the lane', 'pilot-lander', 'Land again', 'resolving-merge-conflicts'],
    '## Ending a run': ['report due', 'Findings:'],
  };
  for (const [heading, phrases] of Object.entries(where)) {
    const text = section(pilot, heading);
    for (const phrase of phrases) assert.ok(text.includes(phrase), `${heading} does not name "${phrase}"`);
  }
  assert.doesNotMatch(flat(pilot), /run[^.]*`pilot landing[^.]*background/, 'the pilot no longer runs the landing wait');
});

test('QA tears down on the press', () => {
  assert.ok(flat(read('agents/pilot-qa.md')).includes('tear down on the press'), 'agents/pilot-qa.md does not tear down on the press');
});

test('the pin moves by the wording', () => {
  const source = read('scripts/test/measure-prompt.test.mjs');
  const line = /^\/\/ gate2-frees-lane S9 \(\d{4}-\d\d-\d\d\) raised it from ([\d.]+) to the measured ([\d.]+) .*, ([\d.]+)\.$/m.exec(source);
  assert.ok(line, 'the pilot pin carries no gate2-frees-lane S9 history line naming its delta');
  const [from, to, cost] = line.slice(1, 4).map(Number);
  assert.equal(to - from, cost, 'the history line names a cost that is not its difference');
  // Later lines move the pin on (lander S1 lowered it), so the pin is the newest history line's measured number.
  const head = source.slice(0, source.indexOf("test('the pilot pin holds at its new number'"));
  const newest = [...head.matchAll(/ to the measured ([\d.]+) /g)].at(-1)[1];
  assert.equal(Number(/own <= ([\d.]+), `pilot's own share/.exec(source)[1]), Number(newest), 'the pin is not the measured number its newest history line names');
});

// lander S10 (spec 8; L12): the lander prunes and hands back; the pilot prunes nothing and quotes its line.
test('the pilot no longer prunes', () => {
  const pilot = read('agents/pilot.md');
  assert.doesNotMatch(pilot, /pilot branches prune|pilot worktrees prune/, 'agents/pilot.md still prunes');
  assert.ok(section(pilot, '## Ending a run').includes("quotes the lander's"), "Ending a run's Findings: does not quote the lander's line");
});
