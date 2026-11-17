import { test } from 'node:test';
import assert from 'node:assert/strict';

import { denyCovers, webFetchRule } from '../install-permissions.mjs';
import {
  denyCovers as denyCoversFromSettings,
  webFetchRule as webFetchRuleFromSettings,
} from '../install-settings.mjs';

test('the helpers answer from their own module', () => {
  assert.equal(denyCovers('Bash(pilot *)', 'Bash(pilot land *)'), true);
  assert.equal(denyCovers('Bash(pilot land *)', 'Bash(git push origin main)'), false);
});

test('the old import still works', () => {
  assert.equal(webFetchRuleFromSettings, webFetchRule);
  assert.equal(denyCoversFromSettings, denyCovers);
});

test('the ask step answers from its own module', async () => {
  const { DEFAULT_BRANCH_ASK, defaultBranchAskStep } = await import('../install-permissions.mjs');
  const result = defaultBranchAskStep('settings.json')({});
  assert.equal(result.state, 'added');
  assert.equal(result.added.length, 8);
  assert.deepEqual(result.added, DEFAULT_BRANCH_ASK);
  assert.ok(result.added.includes('Bash(gh pr merge *)'));
  assert.ok(result.added.includes('Bash(git push origin *:main)'));
});

test('the own-rule test answers from its own module', async () => {
  const { isOwnAllow } = await import('../install-permissions.mjs');
  assert.equal(isOwnAllow('Bash(pilot land *)'), true);
  assert.equal(isOwnAllow('mcp__plugin_pilot_deck__*'), true);
  assert.equal(isOwnAllow('Bash(npm test)'), false);
});
