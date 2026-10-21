/**
 * co-pilot-tickets S5 (spec 4, L13): a run.json in another repository may still name its ticket under
 * the legacy key `task`; the reader takes `ticket`, else `task`. A §7 fixture: it spells the old key.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { recordTicket } from '../runs.mjs';

test('a legacy run record still reads', () => {
  assert.equal(recordTicket({ task: 'itm_1' }), 'itm_1');
  assert.equal(recordTicket({ ticket: 'itm_1' }), 'itm_1');
  assert.equal(recordTicket({ ticket: 'itm_2', task: 'itm_1' }), 'itm_2', 'the new key wins');
  assert.equal(recordTicket({ slug: 'x' }), undefined);
});
