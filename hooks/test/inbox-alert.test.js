/**
 * The inbox notice is worded from the deck line's kind (gate2-frees-lane S4, spec 4): a short landing as
 * before, and the deck's `report due` on its own report as its own heading, never as the user.
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert');

const inbox = require('../inbox-alert.js');

const REPORT_DUE = 'report due: add the findings and the human steps with a Findings: reply';

test('the next tool call shows report due', () => {
  const line = { itemId: 'itm_r', title: 'Closing report: x', owner: 'pilot', kind: 'report', from: 'deck', author: 'deck', text: REPORT_DUE, seq: 7 };
  const told = inbox.notice([line], null);
  const said = told.systemMessage + '\n' + told.additionalContext;

  assert.match(told.additionalContext, /^SYSTEM NOTICE: a closing report is due on the deck/);
  assert.match(told.systemMessage, /report due/i);
  assert.match(told.additionalContext, /Findings:/, 'says how to answer it');
  assert.doesNotMatch(said, /ended short/, 'not a landing');
  assert.doesNotMatch(said, /the user (has answered|replied)/, 'never told as the user');
  assert.doesNotMatch(said, /gate2/, 'answered on the report, not a gate2');
});

test('a short landing is still told as one', () => {
  const line = { itemId: 'itm_g', title: 'Gate 2', owner: 'qa', kind: 'gate2', from: 'deck', author: 'deck', text: 'NOT landed: x', seq: 8 };
  assert.match(inbox.notice([line], null).additionalContext, /landing ended short/);
});
