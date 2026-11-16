/**
 * blocking-close S2 (spec 3; L6): the gate2 lists the pilot's closes of its ticket's blocking questions
 * before the user presses Sign off, and the closing report lists them under `Closed by the pilot:`. A close
 * the user answered, another ticket's, or another repository's is not listed. The section is bounded, and the
 * report still asks nothing (ADR 0148).
 */

import './no-open.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';

import { closedByPilotLines, closingReportOf, pilotClosesOf, postFilled } from '../closing-report.mjs';
import { KIND_GATE2, KIND_QUESTION, KIND_TICKET } from '../items.mjs';
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

test('the report names it under its heading', (t) => {
  const { ours, assumed } = fixture(t);
  const record = { slug: 'x', slices: [] };
  const gate = { pr: '#250', landing: { state: 'landed', sha: '1a2b3c4', line: 'main gets pilot: #901' } };
  const { body } = closingReportOf(record, gate, [], pilotClosesOf(listItems(), ours.id, REPO));
  assert.match(body, new RegExp(`${SECTION}\\n- ${assumed.id} Schema for it: Assumed: B, the schema`));
  assert.match(closingReportOf(record, gate, [], []).body, new RegExp(`${SECTION}\\n- none`));
  assert.match(closingReportOf(record, gate, []).body, new RegExp(`${SECTION}\\n- none`));
});

test('the gate2 lists it before Sign off, and not the user-answered close or another ticket\'s', (t) => {
  const { ours, theirs, assumed, answered, other } = fixture(t);
  const posted = postFilled(gate2Fields(ours));
  assert.ok(posted.body.startsWith('Walk it.'), 'the body as posted comes first');
  assert.match(posted.body, new RegExp(`${SECTION}\\n- ${assumed.id} Schema for it: Assumed: B`));
  assert.ok(!posted.body.includes(answered.id), 'the user-answered close is not listed');
  assert.ok(!posted.body.includes(other.id), 'another ticket\'s close is not listed');
  assert.equal(reread(posted.id).body, posted.body, 'stored with the section');

  const plain = aTicket('Plain');
  takeLive(plain.id);
  assert.equal(postFilled(gate2Fields(plain)).body, 'Walk it.', 'no close, the body is as posted');
  assert.match(postFilled({ ...gate2Fields(theirs), ticket: theirs.id }).body, new RegExp(`${SECTION}\\n- itm_\\w+ Other schema: Moot:`));
});

test('a blank gate2 body is still refused when the ticket has closes', (t) => {
  const { ours } = fixture(t);
  const before = listItems().length;
  assert.throws(() => postFilled({ ...gate2Fields(ours), body: '  \n ' }), /body/);
  assert.equal(listItems().length, before, 'nothing posted');
});

test('another repository\'s close under the same ticket id is not listed', (t) => {
  const { ours, assumed } = fixture(t);
  // Stored past `postItem`, which refuses a question on another directory's ticket: the filter must not lean on that.
  const elsewhere = postStored({
    kind: KIND_QUESTION, title: 'Elsewhere schema', body: 'which?', repo: path.resolve('D:/work/other'), options: ['A', 'B'], recommended: 'A', ticket: ours.id, blocking: true,
  });
  resolveItem(elsewhere.id, 'Moot: done in the other repository', PILOT);
  assert.deepEqual(pilotClosesOf(listItems(), ours.id, REPO).map((item) => item.id), [assumed.id]);
  assert.ok(!postFilled(gate2Fields(ours)).body.includes(elsewhere.id), 'the gate2 does not list it');
});

test('the section is bounded: each close clipped, at most 20 listed', () => {
  const closes = Array.from({ length: 23 }, (_, n) => ({ id: `itm_${n}`, title: 'Long one', resolution: `Moot: ${'x'.repeat(1000)}` }));
  const lines = closedByPilotLines(closes);
  assert.equal(lines.length, 1 + 20 + 1, 'the heading, 20 closes, the remainder line');
  assert.equal(lines.at(-1), '- and 3 more');
  assert.ok(lines[1].endsWith('…'), 'clipped with an ellipsis');
  assert.ok(lines[1].length <= 320, `clipped to about 300 chars, got ${lines[1].length}`);
  assert.deepEqual(closedByPilotLines(closes.slice(0, 20)).at(-1).startsWith('- itm_19'), true, 'exactly 20: no remainder line');
});

test('the report still asks nothing', () => {
  const asking = { id: 'itm_1', title: 'Which one?', resolution: 'Assumed: should it go ahead?' };
  const lines = closedByPilotLines([asking]);
  assert.equal(lines[0], SECTION);
  assert.deepEqual(reportAskGaps(lines.join('\n')), []);
  assert.deepEqual(reportAskGaps(closedByPilotLines([]).join('\n')), []);
});
