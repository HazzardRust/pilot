/**
 * S6 of audit-f14: the closing report reads land's `feature PR:` line and says which PRs to merge, bottom first,
 * with the method `pilot.merge` names (spec 7, 11; A8).
 */

import './no-open.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { closingReportOf, humanStep } from '../closing-report.mjs';
import { MERGE_KEY, mergeMethodOf } from '../host.mjs';
import { isShortLanding } from '../store-items.mjs';

/** A `git config --get` over a fixed config, as `hostOf`'s tests fake it: a missing key is status 1. */
const gitWith = (config) => (args) => {
  const value = config[args.at(-1)];
  if (value === undefined) throw Object.assign(new Error('no key'), { status: 1 });
  return `${value}\n`;
};

test('a stack of two is merged bottom first', () => {
  assert.equal(humanStep({ line: 'feature PR: #13 into feat/a (after #12)', method: 'merge' }), 'Merge #12, then #13 with a merge commit');
  assert.equal(humanStep({ line: 'feature PR: #12 into main', method: 'merge' }), 'Merge #12 with a merge commit');
});

test('the method words the step', () => {
  assert.equal(mergeMethodOf(gitWith({})), 'merge');
  const method = mergeMethodOf(gitWith({ [MERGE_KEY]: 'squash' }));
  assert.equal(method, 'squash');
  assert.equal(humanStep({ line: 'feature PR: #13 into feat/a (after #12)', method }), 'Merge #12, then #13 with a squash');
});

test('a bad value is named', () => {
  assert.throws(() => mergeMethodOf(gitWith({ [MERGE_KEY]: 'rebase' })), /pilot\.merge/);
});

test('an unknown feature line asks the pilot', () => {
  const line = 'landed feat/a on pilot at 1a2b3c4\nfeature PR: unknown (gh failed)';
  assert.equal(humanStep({ line, method: 'merge' }), 'Land named no feature PR (gh failed): check which PR brings this feature in');
  assert.equal(isShortLanding({ ok: true, line }), true);
});

test('a landed feature PR is not a short landing', () => {
  assert.equal(isShortLanding({ ok: true, line: 'feature PR: #12 into main' }), false);
});

test('no host leaves the merge by hand', () => {
  assert.match(humanStep({ line: 'feature PR: none (no host)', method: 'merge' }), /by hand/);
  assert.equal(humanStep({ line: 'main gets pilot: #9', method: 'merge' }), undefined);
});

test('an unreadable setting is named in the step', () => {
  const method = (() => { try { return mergeMethodOf(gitWith({ [MERGE_KEY]: 'rebase' })); } catch (err) { return err; } })();
  assert.match(humanStep({ line: 'feature PR: #12 into main', method }), /^Merge #12 with a merge commit \(pilot\.merge names "rebase"/);
});

test('the closing report carries the step and no main step', () => {
  const line = 'landed feat/a on pilot at 1a2b3c4\nfeature PR: #13 into feat/a (after #12)';
  const { body } = closingReportOf({ slug: 'a', slices: [] }, { pr: '#590', landing: { state: 'landed', sha: '1a2b3c4', line } }, [], [], undefined, 'squash');
  assert.match(body, /^Human step: Merge #12, then #13 with a squash/m);
  assert.doesNotMatch(body, /main gets pilot/);
});
