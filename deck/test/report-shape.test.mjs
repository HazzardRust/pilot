/**
 * S2 of report-record: a closing report asks the user nothing (spec 4, 5; L4, L5, A1, A3, ADR 0148).
 * `reportAskGaps` names each line that asks; `postItem` refuses a report with one before anything is
 * stored, and `addPilotMessage` refuses a reply on a record that asks, so the worktrees reply cannot.
 */

import './no-open.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { reportAskGaps } from '../report-shape.mjs';
import { KIND_REPORT, KIND_TICKET } from '../items.mjs';
import { addPilotMessage, listItems, postItem } from '../store.mjs';
import { postStored, shapedTicketBody, tempDeck } from '../testUtils.mjs';

const REPO = path.resolve('D:/work/alpha');
const reread = (id) => listItems().find((item) => item.id === id);
// Synthetic lines in the shapes the stored reports carry (A5): the store itself was not copied.
const FIXTURE = JSON.parse(fs.readFileSync(new URL('./fixtures/report-lines.json', import.meta.url), 'utf8'));

test('a question line in the body is refused naming it', () => {
  const body = 'What landed: S1 and S2.\nShould I keep the worktree?\nNothing else.';
  assert.deepEqual(reportAskGaps(body), ['the body asks: Should I keep the worktree?']);
});

test('say so, tell me and let me know are asks in any case', () => {
  const steps = ['Open the deck -> the report shows', 'Decide (SAY SO on the chat)', 'Tell me which to keep', 'If it breaks, Let Me Know.'];
  assert.deepEqual(reportAskGaps('Done.', steps), [
    'step 2 asks: Decide (SAY SO on the chat)',
    'step 3 asks: Tell me which to keep',
    'step 4 asks: If it breaks, Let Me Know.',
  ]);
  assert.deepEqual(reportAskGaps('Done.\nLet me know when it merges.'), ['the body asks: Let me know when it merges.']);
  assert.deepEqual(reportAskGaps('Done.', []), [], 'a report with no steps and no ask passes');
});

test('a ? inside a code span, a URL or quotes asks nothing', () => {
  for (const line of FIXTURE.questionMarks) {
    assert.deepEqual(reportAskGaps(line), [], line);
    assert.deepEqual(reportAskGaps('Done.', [line]), [], `as a step: ${line}`);
  }
});

test("today's sanctioned lines pass and today's asks do not", () => {
  for (const line of FIXTURE.replyHere) assert.deepEqual(reportAskGaps(line, [line]), [], line);
  for (const line of FIXTURE.asks) {
    assert.deepEqual(reportAskGaps(`Done.\n${line}`), [`the body asks: ${line}`]);
    assert.deepEqual(reportAskGaps('Done.', ['Open the PR -> merged', line]), [`step 2 asks: ${line}`]);
  }
});

test('a report that asks is refused at post and stores nothing', (t) => {
  tempDeck(t);
  const ticket = postStored({ kind: KIND_TICKET, title: 'green one', body: shapedTicketBody('green one'), repo: REPO, state: 'green' });
  const report = {
    kind: KIND_REPORT,
    title: 'Closing report',
    body: 'What landed.',
    repo: REPO,
    ticket: ticket.id,
    screens: ['Open the PR -> it is merged', 'Decide whether this becomes a ticket (say so on the chat).'],
  };
  assert.throws(() => postItem(report), {
    message: 'a closing report asks nothing (ADR 0148); step 2 asks: Decide whether this becomes a ticket (say so on the chat).',
  });
  assert.equal(reread(ticket.id).state, 'green', 'the ticket stays open');
  assert.equal(listItems().filter((item) => item.kind === KIND_REPORT).length, 0, 'no report stored');

  const stated = postItem({ ...report, screens: ['Open the PR -> it is merged'] });
  assert.equal(reread(stated.id).kind, KIND_REPORT, 'the same report without the ask posts');
});

test('the worktrees reply cannot ask', (t) => {
  tempDeck(t);
  const report = postStored({ kind: KIND_REPORT, title: 'Closing report', body: 'What landed.', repo: REPO });
  assert.throws(() => addPilotMessage(report.id, 'Tell me which to keep'), /a closing report asks nothing \(ADR 0148\); the reply asks: Tell me which to keep$/);
  assert.deepEqual(reread(report.id).replies, [], 'the ask is not stored');
  addPilotMessage(report.id, 'Kept: `pilot-feat-x` (dirty)');
  assert.deepEqual(reread(report.id).replies.map((reply) => reply.text), ['Kept: `pilot-feat-x` (dirty)']);
});

test('an ask phrase in quotes or a code span is exempt; a ? before a code span is not', () => {
  assert.deepEqual(reportAskGaps('The "Tell me more" button is gone.'), []);
  assert.deepEqual(reportAskGaps('`let me know` is the old flag'), []);
  assert.deepEqual(reportAskGaps('Keep it? `pilot-x`'), ['the body asks: Keep it? `pilot-x`']);
});

test("a report's title that asks is refused naming the title", (t) => {
  tempDeck(t);
  const report = { kind: KIND_REPORT, title: 'Shall I merge it?', body: 'What landed.', repo: REPO };
  assert.throws(() => postItem(report), {
    message: 'a closing report asks nothing (ADR 0148); the title asks: Shall I merge it?',
  });
  assert.equal(listItems().filter((item) => item.kind === KIND_REPORT).length, 0, 'no report stored');
  const stated = postItem({ ...report, title: 'Closing report: `why?` answered' });
  assert.equal(reread(stated.id).kind, KIND_REPORT, 'a ? in a code span in the title posts');
});
