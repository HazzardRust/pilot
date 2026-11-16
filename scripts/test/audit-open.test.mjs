/** S7 of housekeeping-audit: the open area's cap is a code constant; the prose of its area file is not a test target. */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { MAX_OPEN_ROWS } from '../../deck/audit.mjs';

test("the open area is capped at S1's ten open rows", () => {
  assert.equal(MAX_OPEN_ROWS, 10);
});
