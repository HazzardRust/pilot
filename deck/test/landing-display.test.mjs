/**
 * S12 of gate2-frees-lane: a landing ticket's Tickets row offers no Continue (a switch to it is refused `already
 * live`), and a report whose last line is the deck's `report due` reads as awaiting findings, never `landing ended
 * short` (spec 10).
 */

import './no-open.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { REPORT_DUE } from '../closing-report.mjs';
import { KIND_GATE2, KIND_REPORT, SIGN_OFF, threadState } from '../items.mjs';
import { addReply, listItems, postItem } from '../store.mjs';
import { beginLanding, noteDeck } from '../store-items.mjs';
import { renderMessages } from '../ui/render-parts.mjs';
import { aTicket, page, rowsOf, takeLive, tempDeck } from '../testUtils.mjs';

const reread = (id) => listItems().find((item) => item.id === id);

test('a landing ticket offers no Continue', (t) => {
  tempDeck(t);
  const landing = takeLive(aTicket('Landing one', 'green').id);
  const gate = postItem({ kind: KIND_GATE2, title: 'Gate 2', body: 'Walk it.', pr: '#250', sha: '0305827', ticket: landing.id });
  addReply(gate.id, SIGN_OFF);
  takeLive(aTicket('Holder', 'green').id);
  const queued = aTicket('Queued one', 'green');
  const rows = rowsOf(page());
  assert.doesNotMatch(rows[landing.id], /data-switch=/, 'a landing row has no switch control');
  assert.match(rows[queued.id], /data-switch="idle"/, 'a plain queued ticket still does');
});

test('a report due is not a short landing', (t) => {
  tempDeck(t);
  const report = postItem({ kind: KIND_REPORT, title: 'Report', body: 'Done.' });
  noteDeck(report.id, REPORT_DUE);
  assert.notEqual(threadState(reread(report.id)), 'landing ended short');
  assert.equal(threadState(reread(report.id)), 'awaiting findings');

  const gate = postItem({ kind: KIND_GATE2, title: 'Gate 2', body: 'Walk it.', pr: '#250', sha: '0305827', ticket: takeLive(aTicket('Short one', 'green').id).id });
  noteDeck(gate.id, 'landing ended short: the merge was refused');
  assert.equal(threadState(reread(gate.id)), 'landing ended short');
});

// QA J1: the landing lines the deck writes as pilot-kind (no `seq`) read as the deck, never `other`.
test("a landing line the deck writes is bylined deck", (t) => {
  tempDeck(t);
  const gate = postItem({ kind: KIND_GATE2, title: 'Gate 2', body: 'Walk it.', pr: '#250', sha: '0305827', ticket: takeLive(aTicket('Lands', 'green').id).id });
  beginLanding(gate.id, { worktree: 'C:/x-land-lands' });
  const html = renderMessages(reread(gate.id));
  assert.match(html, /<span class="who by-deck">deck · <time[^>]*>[^<]*<\/time><\/span>[\s\S]*landing started in/);
  assert.doesNotMatch(html, /by-other/);
});
