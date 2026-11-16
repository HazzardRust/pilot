/**
 * Spec 5 of `docs/design/verdict-pass/architecture.md`, on `agents/pilot.md`: the gate1 body
 * names no git subcommand for the read at sha. The phrase pins that once held the verdict pass
 * are gone (crew-tests-behaviour S10, L5): prose is not a test target. The pin on the pilot's
 * prompt share (spec 7) lives in `measure-prompt.test.mjs`.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { flat, read } from './lib/area-file.mjs';

const PILOT = read('agents/pilot.md');

test('the gate1 read at sha names no git subcommand', () => {
  // lint: pilot.md, its Gate 1 paragraph included, names no git show / cat-file
  assert.doesNotMatch(flat(PILOT), /git (show|cat-file)/, 'the read at sha names no git subcommand');
});
