/**
 * Spec 7 and 9 of `docs/design/bigger-jobs/architecture.md`: twelve agents in flight, and every
 * file that names a child count says the same one (A2, A8): architect six, implementer five, QA
 * three, and the co-pilot's yellow lane fits itself, an implementer and that implementer's five.
 * QA and the co-pilot name grilling's build-now rule for a found issue (spec 1; L4, never restated).
 *
 * Each pin is a phrase a rewording must keep, not the sentence it sits in.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { flat, read } from './lib/area-file.mjs';

/** The text of one `## <heading>` section, up to the next, on one line. */
const section = (file, heading) => {
  const found = new RegExp(`\\n## ${heading}\\n([\\s\\S]*?)(?=\\n## |$)`).exec(read(file));
  assert.ok(found, `${file} has no "## ${heading}" section`);
  return flat(found[1]);
};

test('every crew file says the same counts', () => {
  const rules = section('rules/orchestration.md', 'Concurrency: the middle ground');
  assert.match(rules, /Up to thirteen agents in flight/, 'the ceiling is thirteen');
  assert.match(rules, /from eight/i, 'the move from eight is recorded');
  assert.match(rules, /architect holds up to six/, 'architect six');
  assert.match(rules, /implementer up to five children/, 'implementer five');
  assert.match(rules, /QA agent up to three/, 'QA three');
  assert.doesNotMatch(rules, /Up to eight agents|up to four researchers|up to three children|QA agent up to two/, 'no old count survives');

  const implementer = flat(read('agents/pilot-implementer.md'));
  assert.match(implementer, /At most five children at once/, 'the implementer says five');
  assert.doesNotMatch(implementer, /At most three children/);

  const qa = flat(read('agents/pilot-qa.md'));
  assert.match(qa, /at most three at once/, 'QA says three');
  assert.doesNotMatch(qa, /at most two at once/);

  const coPilot = flat(read('agents/pilot-co-pilot.md'));
  assert.match(coPilot, /`yellow` budget fits you, an implementer and its five children/, "the co-pilot's lane names five");
});

test('QA and the co-pilot build a found issue now', () => {
  for (const file of ['agents/pilot-qa.md', 'agents/pilot-co-pilot.md']) {
    const text = flat(read(file));
    assert.match(text, /found issue is built in the run/, `${file}: the build-now clause`);
    assert.match(text, /grilling skill's build-now rule/, `${file}: names grilling's rule rather than restating it`);
  }
});
