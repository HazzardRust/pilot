/**
 * `pilot doctor`'s mods row (handoff-mod S6, spec 8): whether this Claude Code can run the hand-off mod.
 * Every input is passed in; nothing here runs `claude` or reads a real settings file.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { checkAll, modsRow } from '../doctor.mjs';

test('doctor fails an old version and disableAllHooks, passes 2.1.325', () => {
  const pass = modsRow({ version: '2.1.325', settings: {}, env: {} });
  assert.equal(pass.name, 'mods');
  assert.equal(pass.verdict, 'pass');
  assert.match(pass.detail, /2\.1\.325/);

  const old = modsRow({ version: '2.1.324', settings: {}, env: {} });
  assert.equal(old.verdict, 'fail');
  assert.match(old.detail, /Claude Code 2\.1\.324 is below 2\.1\.325/);
  assert.ok(old.steps?.length, 'a fail carries its step');

  const hooksOff = modsRow({ version: '2.1.326', settings: { disableAllHooks: true }, env: {} });
  assert.equal(hooksOff.verdict, 'fail');
  assert.match(hooksOff.detail, /disableAllHooks/);

  const safe = modsRow({ version: '2.1.326', settings: {}, env: { CLAUDE_CODE_SAFE_MODE: '1' } });
  assert.equal(safe.verdict, 'fail');
  assert.match(safe.detail, /CLAUDE_CODE_SAFE_MODE/);

  assert.equal(modsRow({ version: null, settings: {}, env: {} }).verdict, 'cannot tell', 'an unreadable version is not a guess');
  assert.equal(modsRow({ version: '2.1.326', settings: { disableAllHooks: false }, env: { CLAUDE_CODE_SAFE_MODE: '' } }).verdict, 'pass');
});

test('checkAll reads the version from `claude --version` through its run, never a shell', async () => {
  const calls = [];
  const rows = await checkAll({
    platform: 'linux',
    run: (cmd, args) => (calls.push([cmd, ...args]), '2.1.326 (Claude Code)\n'),
    resolveDep: () => true,
    canWrite: () => true,
    onPath: () => true,
    probe: async () => ({ state: 'none' }),
    readReach: () => ({ level: 'everything', chosen: true }),
    readEnabled: () => true,
    readSettings: () => ({}),
    env: {},
  });
  assert.deepEqual(calls, [['claude', '--version']]);
  const mods = rows.find((r) => r.name === 'mods');
  assert.equal(mods.verdict, 'pass', mods.detail);
  assert.match(mods.detail, /2\.1\.326/);
});
