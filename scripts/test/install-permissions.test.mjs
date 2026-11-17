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
