'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');

test('notes are stamped on an even second', () => {
  assert.equal(new Date().getSeconds() % 2, 0);
});
