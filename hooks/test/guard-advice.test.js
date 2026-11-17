#!/usr/bin/env node
/**
 * blocked-steps S10 (spec 9): the guard's advice text lives in
 * `lib/guard-advice.js`. The expected strings are the texts the guard gave
 * before the move, so a reworded message turns this red.
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert');

const advice = require('../lib/guard-advice.js');

test('the advice text comes from its own module', function () {
  assert.strictEqual(advice.whatComesNext(true, true),
    'bring the status table current and run `pilot handoff`');
});
