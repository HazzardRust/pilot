/**
 * `pilot doctor`'s Reach row (plain-session S5): what a plain session carries, and drift from the
 * enabled plugin. Both readers are injected; nothing here reads the real home.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { checkAll, reachRow } from '../doctor.mjs';

const CHANGE = 'change with: pilot reach <level>';

test('each chosen level passes with its change step', () => {
  const enabledFor = { nothing: false, rules: false, everything: true };
  for (const level of ['nothing', 'rules', 'everything']) {
    const row = reachRow({ reach: { level, chosen: true }, enabled: enabledFor[level] });
    assert.equal(row.name, 'Reach');
    assert.equal(row.verdict, 'pass', level);
    assert.match(row.detail, new RegExp(level));
    assert.deepEqual(row.steps, [CHANGE]);
  }
  assert.equal(reachRow({ reach: { level: 'nothing', chosen: true }, enabled: undefined }).detail, 'nothing: plain sessions carry no pilot');
});

test('not chosen says so', () => {
  const row = reachRow({ reach: { level: 'everything', chosen: false }, enabled: true });
  assert.equal(row.verdict, 'cannot tell');
  assert.equal(row.detail, 'not chosen; reads as everything');
  assert.deepEqual(row.steps, ['pilot reach nothing']);
});

test('drift fails', () => {
  const nothing = reachRow({ reach: { level: 'nothing', chosen: true }, enabled: true });
  assert.equal(nothing.verdict, 'fail');
  assert.equal(nothing.detail, 'reach nothing but pilot@pilot is enabled');
  assert.deepEqual(nothing.steps, ['pilot reach nothing']);
  const everything = reachRow({ reach: { level: 'everything', chosen: true }, enabled: false });
  assert.equal(everything.verdict, 'fail');
  assert.match(everything.detail, /reach everything but pilot@pilot is not enabled/);
});

test('checkAll reads the reach and the enabled plugin through its deps, after the store row', async () => {
  const rows = await checkAll({
    platform: 'linux',
    resolveDep: () => true,
    canWrite: () => true,
    onPath: () => true,
    probe: async () => ({ state: 'none' }),
    readReach: () => ({ level: 'nothing', chosen: true }),
    readEnabled: () => true,
  });
  const names = rows.map((r) => r.name);
  assert.equal(names[names.indexOf('store directory') + 1], 'Reach');
  assert.equal(rows.find((r) => r.name === 'Reach').verdict, 'fail');
});
