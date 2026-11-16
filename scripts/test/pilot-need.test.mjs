/**
 * The pilot's `need` and `pivot` wording: retired rules stay out. Forbidden-pattern lints only;
 * what the prose says is not pinned here (ADR NNNN). The deck's refusals live in
 * deck/server.mjs. The pilot's share of its prompt is pinned in measure-prompt.test.mjs.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/** The Yellow section of agents/pilot.md, up to the next level-2 heading, on one line. */
function sub() {
  const source = fs.readFileSync(path.join(ROOT, 'agents', 'pilot.md'), 'utf8').replace(/\r\n/g, '\n');
  const marker = '\n## Yellow\n';
  const start = source.indexOf(marker);
  assert.notEqual(start, -1, 'agents/pilot.md has no "## Yellow" heading');
  const rest = source.slice(start + marker.length);
  const end = rest.search(/\n#{1,2} /);
  return (end === -1 ? rest : rest.slice(0, end)).replace(/\s+/g, ' ');
}

/** agents/pilot-co-pilot.md on one line. */
const coPilot = () => fs.readFileSync(path.join(ROOT, 'agents', 'pilot-co-pilot.md'), 'utf8').replace(/\s+/g, ' ');

test('the Yellow section keeps the retired Needed, Blocked and same-session rules out', () => {
  const text = sub();
  assert.doesNotMatch(text, /\*\*Needed\*\*/, 'no separate Needed rule'); // lint: no Needed rule
  assert.doesNotMatch(text, /take the next yellow ticket, same session/, 'a fresh co-pilot per ticket'); // lint: no same-session yellow take
  assert.doesNotMatch(text, /\*\*Blocked\*\*|finished: "blocked"|park it yellow/, 'no blocker parks its ticket'); // lint: no Blocked rule
});

test('the co-pilot posts no gate2 to end a run', () => {
  assert.doesNotMatch(coPilot(), /posting the `gate2`|"gate 2 posted"/, 'no gate2 post ends a run'); // lint: no gate2 post ends a run
});
