/**
 * S5 of audit-f1-f7: the gate carries a per-test timeout (spec 6, 7; L5). Its hung-fake
 * test copied `deck/test/run.test.mjs`, which left with `pilot run` (handoff-mod S7).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const { gateArgv } = await import('../gate.mjs');
const scripts = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).scripts;

test('npm test and npm run coverage carry a 60 s per-test timeout', () => {
  // Since process-gc S7 the scripts run the gate, and the gate puts the timeout before any flag.
  for (const name of ['test', 'coverage']) {
    assert.match(scripts[name], /^node scripts\/gate\.mjs( |$)/, `${name}: ${scripts[name]}`);
  }
  assert.ok(gateArgv([], 1, ROOT).includes('--test-timeout=60000'));
});
