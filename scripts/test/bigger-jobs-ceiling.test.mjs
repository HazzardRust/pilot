/**
 * Spec 7 and 9 of `docs/design/bigger-jobs/architecture.md`: twelve agents in flight, and every
 * file that names a child count says the same one (A2, A8): architect six, implementer five, QA
 * three, and the co-pilot's yellow lane fits itself, an implementer and that implementer's five.
 * QA and the co-pilot name grilling's build-now rule for a found issue (spec 1; L4, never restated).
 *
 * Only forbidden-pattern lints stay (crew-tests-behaviour S10, L5): prose is not a test target.
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

test('no old child count survives', () => {
  // lint: no superseded count in the rules, the implementer or QA
  const rules = section('rules/orchestration.md', 'Concurrency: the middle ground');
  assert.doesNotMatch(rules, /Up to eight agents|up to four researchers|up to three children|QA agent up to two/, 'no old count survives');

  const implementer = flat(read('agents/pilot-implementer.md'));
  assert.doesNotMatch(implementer, /At most three children/);

  const qa = flat(read('agents/pilot-qa.md'));
  assert.doesNotMatch(qa, /at most two at once/);
});
