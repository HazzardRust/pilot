/**
 * S8 of ui-design-workflow (spec 6, 10; L3, A2): a surface gate1 owes its `Fonts:`, `Colour means:` and `Reference:`
 * lines, and QA's walkthrough on a surface plan names its difference list, a question on its ticket, in a
 * `Differences:` line. Both are read off the body, so `postItem` refuses before it writes.
 */

import './no-open.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';

import { KIND_GATE1, KIND_QUESTION, KIND_TICKET } from '../items.mjs';
import { DeckRefusal, listItems, postItem } from '../store.mjs';
import { surfaceGate1Gaps, walkthroughPlanGaps } from '../gate2-evidence.mjs';
import { shapedTicketBody, takeLive, tempDeck } from '../testUtils.mjs';

const REPO = path.resolve('D:/work/look');
const ARTEFACT = 'docs/design/x/architecture.md';
const LOOK = 'Fonts: Inter, JetBrains Mono\nColour means: red is blocked, green is done\nReference: side bar, VS Code';

test('a surface gate1 owes three lines', () => {
  assert.equal(surfaceGate1Gaps(true, 'The artefact.').length, 3);
  assert.deepEqual(surfaceGate1Gaps(true, `The artefact.\n${LOOK}`), []);
  assert.equal(surfaceGate1Gaps(true, 'Fonts: Inter\nReference: side bar, VS Code').length, 1, 'one line missing, one gap');
  assert.deepEqual(surfaceGate1Gaps(false, 'The artefact.'), []);
  assert.deepEqual(surfaceGate1Gaps(undefined, 'The artefact.'), []);
});

test("QA's walkthrough names its difference list", () => {
  const ticket = { id: 'itm_aaaaaaaaaaaa', kind: KIND_TICKET, plan: { artefact: ARTEFACT, surface: true } };
  const own = { id: 'itm_bbbbbbbbbbbb', kind: KIND_QUESTION, ticket: ticket.id };
  const other = { id: 'itm_cccccccccccc', kind: KIND_QUESTION, ticket: 'itm_dddddddddddd' };
  const items = [ticket, own, other];
  assert.equal(walkthroughPlanGaps(ticket, 'qa', 'Look at the side bar.', items).length, 1, 'no line');
  assert.deepEqual(walkthroughPlanGaps(ticket, 'qa', `Look at the side bar.\nDifferences: ${own.id}`, items), []);
  const foreign = walkthroughPlanGaps(ticket, 'qa', `Differences: ${other.id}`, items);
  assert.equal(foreign.length, 1, "another ticket's item");
  assert.ok(!foreign[0].includes(other.id), 'the refusal does not echo the id');
  assert.equal(walkthroughPlanGaps(ticket, 'qa', `Differences: ${ticket.id}`, items).length, 1, 'the ticket itself is no question');
  assert.deepEqual(walkthroughPlanGaps(ticket, 'pilot', 'Do this.', items), [], "the pilot's wizard is not read");
});

test('the post path refuses', (t) => {
  tempDeck(t);
  const ticket = takeLive(postItem({ kind: KIND_TICKET, title: 'Look', body: shapedTicketBody('look'), repo: REPO, sliceCount: 3 }).id);
  const gate1 = (body) => postItem({
    kind: KIND_GATE1, title: 'Gate 1', body, repo: REPO, artefact: ARTEFACT,
    sha: '31efcb0', locked: 1, slices: '| S1 |', sliceCount: 3, branch: 'feat/x', ticket: ticket.id, surface: true,
  });
  assert.throws(() => gate1('The artefact.'), (error) => error instanceof DeckRefusal && /Fonts:/.test(error.message)
    && /Colour means:/.test(error.message) && /Reference:/.test(error.message), 'every gap in one refusal');
  assert.equal(listItems().filter((item) => item.kind === KIND_GATE1).length, 0, 'nothing stored');
  assert.equal(gate1(`The artefact.\n${LOOK}`).kind, KIND_GATE1);
});
