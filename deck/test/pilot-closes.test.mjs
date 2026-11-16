/**
 * blocking-close S2 (spec 3; L6): the gate2 lists the pilot's closes of its ticket's blocking questions
 * before the user presses Sign off, and the closing report lists them under `Closed by the pilot:`. A close
 * the user answered, or that is another ticket's, is not listed. The report still asks nothing (ADR 0148).
 */

import './no-open.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';

import { closingReportOf, postFilled } from '../closing-report.mjs';
import { KIND_GATE2, KIND_QUESTION, KIND_TICKET } from '../items.mjs';
import { closedByPilotLines, pilotClosesOf } from '../pilot-closes.mjs';
import { reportAskGaps } from '../report-shape.mjs';
import { addReply, listItems, postItem, resolveItem } from '../store.mjs';
import { postStored, shapedTicketBody, takeLive, tempDeck } from '../testUtils.mjs';

const REPO = path.resolve('D:/work/pilot');
const PILOT = ''; // the stamp `hooks/deck-author.js` writes for the main session
const SECTION = 'Closed by the pilot:';

const aTicket = (title) => postStored({ kind: KIND_TICKET, title, body: shapedTicketBody(title), repo: REPO, sliceCount: 3, state: 'yellow' });
const aDesign = (ticket, title = 'Schema for it') => postItem({
  kind: KIND_QUESTION, title, body: 'which?', repo: REPO, options: ['A', 'B'], recommended: 'A', ticket: ticket.id, blocking: true,
});
const gate2Fields = (ticket) => ({ kind: KIND_GATE2, title: 'Gate 2', body: 'Walk it.', repo: REPO, pr: '#250', sha: '0305827', ticket: ticket.id });
const reread = (id) => listItems().find((item) => item.id === id);

/** Two tickets: ours holds one pilot close, one user-answered close and one open question; theirs holds a pilot close. */
function fixture(t) {
  tempDeck(t);
  const ours = aTicket('Ours');
  takeLive(ours.id);
  const theirs = aTicket('Theirs');
  const assumed = aDesign(ours);
  resolveItem(assumed.id, 'Assumed: B, the schema the migration already uses', PILOT);
  const answered = aDesign(ours, 'Name for it');
  addReply(answered.id, 'A');
  resolveItem(answered.id, 'Assumed: A', PILOT);
  const other = aDesign(theirs, 'Other schema');
  resolveItem(other.id, 'Moot: done another way', PILOT);
  return { ours, theirs, assumed, answered, other };
}

test('a pilot close is listed', (t) => {
  const { ours, assumed, answered, other } = fixture(t);
  const ids = pilotClosesOf(listItems(), ours.id).map((item) => item.id);
  assert.deepEqual(ids, [assumed.id], 'the Assumed close, not the user-answered one, not another ticket\'s');
  assert.ok(!ids.includes(answered.id) && !ids.includes(other.id));
});

test('the report names it under its heading', (t) => {
  const { ours, assumed } = fixture(t);
  const record = { slug: 'x', slices: [] };
  const gate = { pr: '#250', landing: { state: 'landed', sha: '1a2b3c4', line: 'main gets pilot: #901' } };
  const { body } = closingReportOf(record, gate, [], pilotClosesOf(listItems(), ours.id));
  assert.match(body, new RegExp(`${SECTION}\\n- ${assumed.id} Schema for it: Assumed: B, the schema`));
  assert.match(closingReportOf(record, gate, [], []).body, new RegExp(`${SECTION}\\n- none`));
  assert.match(closingReportOf(record, gate, []).body, new RegExp(`${SECTION}\\n- none`));
});

test('the gate2 lists it before Sign off', (t) => {
  const { ours, theirs } = fixture(t);
  const posted = postFilled(gate2Fields(ours));
  assert.ok(posted.body.startsWith('Walk it.'), 'the body as posted comes first');
  assert.match(posted.body, new RegExp(`${SECTION}\\n- itm_\\w+ Schema for it: Assumed: B`));
  assert.equal(reread(posted.id).body, posted.body, 'stored with the section');

  const plain = aTicket('Plain');
  takeLive(plain.id);
  assert.equal(postFilled(gate2Fields(plain)).body, 'Walk it.', 'no close, the body is as posted');
  assert.match(postFilled({ ...gate2Fields(theirs), ticket: theirs.id }).body, new RegExp(`${SECTION}\\n- itm_\\w+ Other schema: Moot:`));
});

test('the report still asks nothing', () => {
  const asking = { id: 'itm_1', title: 'Which one?', resolution: 'Assumed: should it go ahead?' };
  const lines = closedByPilotLines([asking]);
  assert.equal(lines[0], SECTION);
  assert.deepEqual(reportAskGaps(lines.join('\n')), []);
  assert.deepEqual(reportAskGaps(closedByPilotLines([]).join('\n')), []);
});
