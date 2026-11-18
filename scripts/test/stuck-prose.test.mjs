// never-stuck S18 (spec 11, 16, 20, 23; L8): each agent's definition names the rule its slice built: the pilot acts on
// what `NO REPLY` prints and never takes a held co-pilot lane, the lander checks an interrupted land has exited, and
// a live check runs in `pilot live-root`. One-line pins on the names the code prints, not on the prose around them.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8').replace(/\r\n/g, '\n');
/** Whether one blank-line-separated paragraph of `text` carries every word. */
const together = (text, words) => text.split(/\n\s*\n/).some((p) => words.every((w) => p.includes(w)));

test('the pilot acts on NO REPLY', () => {
  assert.ok(together(read('agents/pilot.md'), ['NO REPLY', 'owed']), 'pilot.md: no paragraph acts on NO REPLY and its owed rows');
});

test('the pilot never takes a held lane', () => {
  const pilot = read('agents/pilot.md');
  assert.ok(together(pilot, ['held by', 'queued']), 'pilot.md: no paragraph keeps a ticket queued while the lane is held by another');
});

test('the lander checks the old land', () => {
  assert.ok(together(read('agents/pilot-lander.md'), ['deck restarted', 'exited']), 'pilot-lander.md: no paragraph checks the old land exited');
});

test('implementers use the live root', () => {
  assert.ok(read('agents/pilot-implementer.md').includes('pilot live-root'), 'pilot-implementer.md never names pilot live-root');
  assert.ok(read('agents/pilot-architect.md').includes('## Live root'), 'pilot-architect.md: brief.md has no ## Live root heading');
});
