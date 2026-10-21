/**
 * yellow-lane S13 (spec 6, 7, 11, 21, 22): the pilot's definition names each mechanism the
 * deck now enforces or records, in the section where the pilot meets it. A clause reworded
 * keeps its pin only while the rule it names survives: the proposal flag, the blocked step's
 * blocking item, the promise flag, friction as the record's rows with its four drains, and a
 * hand-off that writes no friction of its own.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { read, sectionOf, flat } from './lib/area-file.mjs';

const PILOT = read('agents/pilot.md');

/** A section of the pilot's definition as one line; a missing one fails here, not as a vacuous pass. */
function section(heading) {
  const text = flat(sectionOf(PILOT, heading));
  assert.notEqual(text, '', `agents/pilot.md has no "## ${heading}"`);
  return text;
}

test('each clause is pinned', () => {
  const inbox = section('The deck is the only inbox');
  assert.match(inbox, /proposal is a `question`[^.]*`proposal: true` and no `ticket`, the one question without one[^.]*holding no gate/, 'the ticket-making line does not flag a proposal');
  assert.match(inbox, /promises? later work[^.]*`promise: true`/, 'a reply promising later work carries no `promise: true`');

  const yellow = section('Yellow');
  const blocked = yellow.slice(yellow.indexOf('A blocked step'), yellow.indexOf('unflagged.') + 1);
  assert.match(blocked, /`blocking`/, 'Yellow does not post a blocked step as a blocking item');
  assert.match(blocked, /`Blocked: <command>`/, 'Yellow does not title a blocked step with its command');

  const ending = section('Ending a run');
  assert.match(ending, /`deck_status`'s `friction`[^.]*appends[^.]*the record's rows/, 'friction is not the record\'s rows');
  for (const drain of ['a foreign item read', 'a hook notice acted on', 'an output read twice', 'a large read done in the pilot']) {
    assert.ok(ending.includes(drain), `Ending a run does not name the drain "${drain}"`);
  }
  assert.match(ending, /never send `report\.friction`/, 'the closing report still lets the pilot send its own friction');
});

test('the hand-off section asks for no friction', () => {
  assert.doesNotMatch(section('When your own context fills'), /friction/i, 'the hand-off asks for a friction summary');
});
