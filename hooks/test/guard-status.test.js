#!/usr/bin/env node
/**
 * The subagent status line renders from its own module, `lib/guard-status.js`,
 * and says what the guard said before it moved.
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert');

const status = require('../lib/guard-status.js');

test('the status rows render from their own module', function () {
  const rows = status.statusRows({
    tickets: [
      {
        id: 't1',
        name: 'pilot-implementer',
        description: 'Slice 9',
        contextWindowSize: 200000,
        tokenCount: 100000,
      },
    ],
  });

  // 100k of a 200k window: under the scaled advisory mark (144k), so green.
  assert.deepStrictEqual(rows, [
    { id: 't1', content: 'pilot-implementer · Slice 9 · \x1b[32m100k/200k 50%\x1b[0m' },
  ]);
});
