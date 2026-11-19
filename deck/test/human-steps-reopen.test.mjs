/**
 * S5 of human-steps: a closed steps thread offers no Reopen, since `reopenItem` always refuses it.
 */

import './no-open.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';

import { KIND_GATE2, KIND_QUESTION, KIND_TICKET, NOT_YET, SIGN_OFF } from '../items.mjs';
import { closeItem, listItems, postItem, postSteps, resolveItem } from '../store.mjs';
import { postStored, shapedTicketBody, tempDeck } from '../testUtils.mjs';
import { renderThreadPage } from '../ui/render.mjs';

const REPO = path.join('D:', 'work', 'pilot');
const reread = (id) => listItems().find((item) => item.id === id);
const REOPEN_FORM = /action="\/reopen"/;

/** A landed green ticket with an open steps thread, as human-steps.test.mjs builds one. */
const aStepsThread = () => {
  const ticket = postStored({ kind: KIND_TICKET, title: 'land it', body: shapedTicketBody('land it'), repo: REPO, state: 'green', live: true, concludedBy: 'itm_0123456789ab' });
  const at = new Date().toISOString();
  postStored({
    kind: KIND_GATE2, title: 'Gate 2', body: 'Walk it.\n\n| spec | result | evidence |\n| --- | --- | --- |\n| 1 | pass | ok |', repo: REPO, ticket: ticket.id,
    options: [SIGN_OFF, NOT_YET], replies: [{ from: 'user', text: SIGN_OFF, repliedAt: at }], resolution: 'landed abc1234', resolvedAt: at,
    landing: { state: 'landed', sha: 'abc1234def' },
  });
  return postSteps({ ticket: ticket.id, repo: REPO, title: 'Human steps', steps: [{ text: 'Merge the main PR #140 on GitHub.' }] });
};

test('a closed steps thread draws no Reopen', (t) => {
  tempDeck(t);
  const steps = aStepsThread();
  closeItem(steps.id);

  const page = renderThreadPage(reread(steps.id), listItems());
  assert.ok(!REOPEN_FORM.test(page), 'Done is its one close, so no Reopen form');
  assert.ok(page.includes('Closed by you.'), 'and its resolution is still drawn');
});

test('any other closed thread still draws Reopen', (t) => {
  tempDeck(t);
  const closed = resolveItem(postItem({ kind: KIND_QUESTION, title: 'Which port?', body: '4321?', repo: REPO }).id, 'we went with 4321');

  const page = renderThreadPage(reread(closed.id), listItems());
  assert.equal((page.match(REOPEN_FORM) ?? []).length, 1);
});
