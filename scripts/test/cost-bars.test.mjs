import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// The measured S10 run (docs/design/cheap-suite/cost-after.txt); SPAWN_CEILING in gate.mjs stops regressions.
const SPAWN_BAR = 13571;
const GIT_BAR = 12472;

function costBars(table) {
  const m = /^spawns (\d+) \(node (\d+), git (\d+), other (\d+)\)$/m.exec(table);
  if (!m) throw new Error('no spawns line in the cost table');
  const spawns = Number(m[1]);
  const git = Number(m[3]);
  return { spawns, git, ok: spawns <= SPAWN_BAR && git <= GIT_BAR };
}

const line = (spawns, git) => `spawns ${spawns} (node 1, git ${git}, other 1)\n`;

test('the recorded run meets the spawn bars', () => {
  const file = fileURLToPath(new URL('../../docs/design/cheap-suite/cost-after.txt', import.meta.url));
  const r = costBars(readFileSync(file, 'utf8'));
  assert.equal(r.spawns, 13571);
  assert.equal(r.git, 12472);
  assert.equal(r.ok, true);
});

test('a table one over either bar is not ok', () => {
  assert.equal(costBars(line(SPAWN_BAR + 1, GIT_BAR)).ok, false);
  assert.equal(costBars(line(SPAWN_BAR, GIT_BAR + 1)).ok, false);
  assert.equal(costBars(line(SPAWN_BAR, GIT_BAR)).ok, true);
});

test('a table with no spawns line fails closed', () => {
  assert.throws(() => costBars('left running: none\n'), /no spawns line/);
});
