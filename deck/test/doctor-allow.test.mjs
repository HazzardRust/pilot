import assert from 'node:assert/strict';
import { test } from 'node:test';

import { allowRow } from '../doctor.mjs';
import { PILOT_MERGE_ALLOW } from '../../scripts/install-settings.mjs';

const settingsWith = (allow, extra = {}) => ({ permissions: { allow, ...extra } });
const without = (...gone) => PILOT_MERGE_ALLOW.filter((rule) => !gone.includes(rule));

test('two missing rules are named', () => {
  const row = allowRow({ readSettings: () => settingsWith(without('Bash(pilot sync *)', 'Bash(pilot integrate *)')) });
  assert.equal(row.name, 'pilot allow rules');
  assert.equal(row.verdict, 'fail');
  assert.match(row.detail, /Bash\(pilot sync \*\)/);
  assert.match(row.detail, /Bash\(pilot integrate \*\)/);
  for (const rule of without('Bash(pilot sync *)', 'Bash(pilot integrate *)')) assert.ok(!row.detail.includes(rule), rule);
  assert.match(row.steps[0], /^node ".*install-settings\.mjs"$/);
});

test('all present passes', () => {
  assert.equal(allowRow({ readSettings: () => settingsWith([...PILOT_MERGE_ALLOW]) }).verdict, 'pass');
});

test('a covered rule is not missing', () => {
  const settings = settingsWith(without('Bash(pilot land *)'), { ask: ['Bash(pilot land *)'] });
  assert.equal(allowRow({ readSettings: () => settings }).verdict, 'pass');
});

test('an unreadable settings file cannot tell', () => {
  assert.equal(allowRow({ readSettings: () => null }).verdict, 'cannot tell');
  assert.equal(allowRow({ readSettings: () => { throw new Error('boom'); } }).verdict, 'cannot tell');
});
