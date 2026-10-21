/**
 * plain-session S1 (spec 3, 4, 9; L1, L4, L5, A2, A3): `scripts/reach.mjs` is the one reader of
 * `reach.json`, and it turns a level into what each place holds. `pilot run`'s settings are
 * `claudeArgs`'s, tested in `deck/test/run.test.mjs`.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { PLUGIN_ID, readReach, rootRules, rulesPlan, rulesRoot } from '../reach.mjs';

/** A HOME of its own, removed after the test. */
function fakeHome(t) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'pilot-reach-'));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  return home;
}

function writeReach(home, text) {
  const dir = path.join(home, '.claude', 'pilot');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'reach.json'), text);
}

test('the plugin id and the rules root sit where pilot run names them', (t) => {
  const home = fakeHome(t);
  assert.equal(PLUGIN_ID, 'pilot@pilot');
  assert.equal(rulesRoot({ home }), path.join(home, '.claude', 'pilot', 'rules-root'));
  assert.equal(rootRules({ home }), path.join(home, '.claude', 'pilot', 'rules-root', '.claude', 'rules'));
});

test('no reach file reads as everything, not chosen', (t) => {
  const home = fakeHome(t);
  assert.deepEqual(readReach({ home }), { level: 'everything', chosen: false });

  for (const text of ['{not json', '{"level":"most"}', '[]', 'null', '']) {
    writeReach(home, text);
    assert.deepEqual(readReach({ home }), { level: 'everything', chosen: false }, `malformed: ${JSON.stringify(text)}`);
  }

  for (const level of ['nothing', 'rules', 'everything']) {
    writeReach(home, JSON.stringify({ level, at: '2026-10-19T00:00:00.000Z' }));
    assert.deepEqual(readReach({ home }), { level, chosen: true });
  }
});

test('the plan matches the level table', () => {
  assert.deepEqual(rulesPlan('nothing'), { home: 'none', root: 'all', user: false });
  assert.deepEqual(rulesPlan('rules'), { home: 'scoped', root: 'always', user: false });
  assert.deepEqual(rulesPlan('everything'), { home: 'all', root: 'none', user: true });
  assert.throws(() => rulesPlan('most'), /reach/);
});

test('a non-string level reads as not chosen', (t) => {
  const home = fakeHome(t);
  writeReach(home, '{"level":["nothing"]}');
  assert.deepEqual(readReach({ home }), { level: 'everything', chosen: false });
  assert.throws(() => rulesPlan(['nothing']), /reach/);
});
