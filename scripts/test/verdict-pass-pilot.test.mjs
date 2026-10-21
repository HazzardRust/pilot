/**
 * Spec 2, 4 and 5 of `docs/design/verdict-pass/architecture.md`, on `agents/pilot.md`: once the
 * cut lands, and before any design-tree item, the pilot writes a verdict under every §6 A‹n›
 * at every depth (L3, A5), routes an overturn to a re-cut or its own commit (L7), and the
 * gate1 body names every A‹n› beside its verdict (A2). The pin on the pilot's prompt share
 * (spec 7) lives in `measure-prompt.test.mjs`.
 *
 * Each pin is a phrase a rewording must keep, not the sentence it sits in.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { flat, read } from './lib/area-file.mjs';

const PILOT = read('agents/pilot.md');

/** Step 3's raw text, up to the next `###` heading. */
const step3 = () => {
  const section = /\n### 3\. [^\n]*\n([\s\S]*?)(?=\n### )/.exec(PILOT);
  assert.ok(section, 'agents/pilot.md has no step 3');
  return section[1];
};

/** Step 3's text on one line. */
const grilling = () => flat(step3());

/** The `**Verdict pass**` paragraph of step 3 alone, up to its blank line, on one line. */
const verdictPass = () => {
  const text = step3();
  const start = text.indexOf('**Verdict pass');
  assert.ok(start >= 0, 'step 3 has no **Verdict pass** paragraph');
  const end = text.indexOf('\n\n', start);
  return flat(text.slice(start, end < 0 ? undefined : end));
};

test('the verdict pass precedes the design tree', () => {
  const text = grilling();
  const pass = text.indexOf('**Verdict pass');
  const tree = text.indexOf('Only then the design tree');
  assert.ok(pass >= 0, 'step 3 has no **Verdict pass** paragraph');
  assert.ok(tree >= 0, 'step 3 no longer opens the design tree with "Only then the design tree"');
  assert.ok(pass < tree, 'the verdict pass comes before the design tree');
  const body = verdictPass();
  assert.match(body, /every depth/, 'it runs at every depth (A5)');
  assert.match(body, /\*No grilling\*/, 'No grilling included');
  assert.match(body, /queue/, 'on the vantage of the queue');
  assert.match(body, /overlaps/, "other runs' overlaps");
  assert.match(body, /recorded preferences/, "and the user's recorded preferences");
});

test('both verdict forms are named', () => {
  const body = verdictPass();
  assert.match(body, /`Verdict: stands`/, 'the standing form');
  assert.match(body, /`Verdict: overturned: <why>`/, 'the overturned form, with its why');
  assert.match(body, /§6 A‹n›/, 'one under each §6 A‹n›');
});

test('overturns route two ways', () => {
  const body = verdictPass();
  assert.match(body, /moves a slice[^.]*re-cut/, 'an overturn that moves a slice resumes the architect to re-cut');
  assert.match(body, /`design\/<slug>`/, "any other is the pilot's commit on design/<slug>");
  assert.match(body, /stays/, 'the overturned A‹n› stays (L7)');
  assert.match(body, /§5 as an L‹n›/, 'its replacement enters §5 as an L‹n›');
  assert.match(body, /\*forks\*[^.]*\*every\*[^.]*standing[^.]*fork/, 'at forks and every only standing forking A‹n› are posted');
});

test('the gate1 body lists verdicts', () => {
  const start = PILOT.indexOf('**Gate 1** is the user signing off');
  assert.ok(start >= 0, 'agents/pilot.md has no Gate 1 paragraph');
  const paragraph = flat(PILOT.slice(start, PILOT.indexOf('\n\n', start)));
  assert.match(paragraph, /body names every A‹n› beside its verdict/, 'the gate1 body names every A‹n› with its verdict');
  assert.doesNotMatch(paragraph, /git (show|cat-file)/, 'the read at sha names no git subcommand');
});
