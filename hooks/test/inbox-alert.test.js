/**
 * The inbox notice is worded from the deck line's kind (gate2-frees-lane S4, spec 4): a short landing as
 * before, and the deck's `report due` on its own report as its own heading, never as the user.
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert');

const inbox = require('../inbox-alert.js');

/** The deck's own line, imported, so this pin follows its wording rather than a copy of it. */
const reportDue = import('../../deck/items-bounds.mjs').then(function (bounds) { return bounds.REPORT_DUE; });

test('the report-due line asks for findings only', async () => {
  // Human steps reach the user's steps thread as they arise (human-steps S4), never through the report.
  assert.doesNotMatch(await reportDue, /human step/i);
});

test('the next tool call shows report due', async () => {
  const REPORT_DUE = await reportDue;
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
