/**
 * yellow-lane S14 (spec 6, 7, 24): the co-pilot's definition and the ticket-making skill name
 * what the deck now records or refuses. A clause reworded keeps its pin only while the rule
 * it names survives: a friction row per crew report, a blocked step the pilot posts blocking,
 * and a proposal flagged and unticketed.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { read, sectionOf, flat } from './lib/area-file.mjs';

/** A section of a file as one line; a missing one fails here, not as a vacuous pass. */
function section(rel, heading) {
  const text = flat(sectionOf(read(rel), heading));
  assert.notEqual(text, '', `${rel} has no "## ${heading}"`);
  return text;
}

test('the co-pilot writes a friction row per crew report', () => {
  const coPilot = flat(read('agents/pilot-co-pilot.md'));
  assert.match(
    coPilot,
    /each crew report[^.]*`deck_status`[^.]*`friction`[^.]*\{ ?agent, what, evidence, size\? ?\}/,
    'the co-pilot does not send a friction row per crew report with deck_status',
  );
});

test("the co-pilot's blocked step goes up blocking", () => {
  const refused = section('agents/pilot-co-pilot.md', 'Refused calls');
  assert.match(
    refused,
    /the pilot posts each blocked step as a blocking item titled `Blocked: <command>`/,
    'Refused calls does not say the pilot posts a blocked step blocking',
  );
});

test('a proposal is flagged', () => {
  const proposal = section('skills/ticket-making/SKILL.md', 'The proposal');
  assert.match(proposal, /`proposal: true` and no `ticket`/, 'the proposal is not posted flagged and unticketed');
  assert.match(
    proposal,
    /never for a decision a run stands on/,
    'the skill does not keep a real decision out of the proposal flag',
  );
});
