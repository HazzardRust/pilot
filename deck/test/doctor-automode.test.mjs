// `pilot doctor`'s auto mode row (classifier-env spec 8): a user-level autoMode list without "$defaults" fails.
import test from 'node:test';
import assert from 'node:assert/strict';

import { autoModeRow } from '../doctor.mjs';

test('no autoMode block passes', () => {
  const row = autoModeRow({ settings: {} });
  assert.equal(row.name, 'auto mode defaults');
  assert.equal(row.verdict, 'pass', row.detail);
});

test('a block keeping the defaults passes', () => {
  const settings = { autoMode: { environment: ['$defaults', 'x'], allow: ['y', '$defaults'] } };
  assert.equal(autoModeRow({ settings }).verdict, 'pass');
});

test('a block dropping them fails and names the fix', () => {
  const settings = Object.freeze({ autoMode: Object.freeze({ environment: Object.freeze(['x']), soft_deny: Object.freeze(['$defaults']) }) });
  const before = JSON.stringify(settings);
  const row = autoModeRow({ settings });
  assert.equal(row.verdict, 'fail');
  assert.match(row.detail, /\benvironment\b/);
  assert.doesNotMatch(row.detail, /soft_deny/, 'a list that keeps "$defaults" is not named');
  assert.ok(row.steps.some((step) => step.includes('claude auto-mode reset')), row.steps.join('\n'));
  assert.equal(JSON.stringify(settings), before, 'the settings are only read');
});

test('every list that drops them is named', () => {
  const row = autoModeRow({ settings: { autoMode: { allow: [], hard_deny: ['z'], environment: ['$defaults'] } } });
  assert.equal(row.verdict, 'fail');
  assert.match(row.detail, /\ballow\b/);
  assert.match(row.detail, /\bhard_deny\b/);
  assert.doesNotMatch(row.detail, /environment/);
});

test('unreadable settings cannot tell', () => {
  assert.equal(autoModeRow({ settings: null }).verdict, 'cannot tell');
});
