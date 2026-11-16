/**
 * The pilot plans on tickets: the retired vocabulary stays out of every agent. Forbidden-pattern
 * lints only; what the prose says is not pinned here (ADR 0180). The pilot's share of its prompt
 * is pinned in measure-prompt.test.mjs.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n');

/** The text under one heading of the given depth, up to the next heading of that depth or higher, on one line. */
function section(rel, heading, depth = 2) {
  const source = read(rel);
  const marker = `\n${'#'.repeat(depth)} ${heading}\n`;
  const start = source.indexOf(marker);
  assert.notEqual(start, -1, `${rel} has no "${marker.trim()}" heading`);
  const rest = source.slice(start + marker.length);
  const end = rest.search(new RegExp(`\\n#{1,${depth}} `));
  return (end === -1 ? rest : rest.slice(0, end)).replace(/\s+/g, ' ');
}

const PILOT = 'agents/pilot.md';

test('pilot.md keeps the retired wording out of its steps and sections', () => {
  // lint: red waits for neither the gate2 post nor the sign-off
  assert.doesNotMatch(section(PILOT, 'Legend'), /Gate 2 passes|Gate 2 posted/);
  // lint: posting a gate2 does not turn the ticket red
  assert.doesNotMatch(section(PILOT, '9. Gate 2 and ready', 3), /Posting it turns the ticket red/);
  // lint: the merge is the architect's, not the pilot's
  assert.doesNotMatch(section(PILOT, '1. Problem and spec, with the user', 3), /deck_ticket merge/);
  const step3 = section(PILOT, '3. Grilling, with the user', 3);
  // lint: a signed ticket is not live, so the Sign off names no park
  assert.doesNotMatch(step3, /On the Sign off press, `deck_ticket park`/);
  // lint: the main deck never takes yellow
  assert.doesNotMatch(step3, /A ticket taken in yellow/);
  // lint: the heading exists
  section(PILOT, 'Ending a run');
});

test('no agent mentions a small ticket, side job or deck_ticket start', () => {
  const agents = fs.readdirSync(path.join(ROOT, 'agents')).filter((name) => name.endsWith('.md'));
  assert.ok(agents.includes('pilot.md'), 'the agents directory was not found');
  for (const name of agents) {
    const text = read(`agents/${name}`).replace(/\s+/g, ' ');
    // lint: the retired small ticket stays out of every agent
    assert.doesNotMatch(text, /small ticket|side job|side\/<ticket id>|deck_ticket`? `?start/i, `agents/${name} still names the retired small ticket`);
  }
});

test('pilot.md has no mode, pause, number-for-the-budget or on-the-user-behalf gate wording', () => {
  const pilot = read(PILOT).replace(/\s+/g, ' ');

  section(PILOT, 'Yellow'); // lint: the Yellow heading exists
  assert.doesNotMatch(pilot, /## Modes|autonomous|attended|reports the mode/i, 'no mode is left'); // lint: no mode
  assert.doesNotMatch(pilot, /in your own name|merge to main/, "no gate is passed on the user's behalf"); // lint: no gate passed for the user
  assert.doesNotMatch(pilot, /eight-agent|make nine|\b(three|five|eight) (agents|in all)/i, "the budget number is the record's, never the prompt's"); // lint: no budget number
  assert.doesNotMatch(section(PILOT, 'Yellow'), /\*\*Paused\*\*|finished: "paused"/, 'no pause rule'); // lint: no pause rule
  assert.doesNotMatch(read(PILOT), /refuses a `signoff`, a `gate1` or a `gate2`/, 'a gate2 no longer waits on every question'); // lint: a gate2 does not wait on every question
});

test('the sections the co-pilot and QA rules live under exist', () => {
  // lint: heading exists
  section('agents/pilot-co-pilot.md', 'Hand-back');
  section('agents/pilot-co-pilot.md', 'Steps 4 to 8');
  section('agents/pilot-co-pilot.md', 'Refused calls');
  section('agents/pilot-qa.md', 'Concluding');
  section('agents/pilot-qa.md', 'The procedure');
});
