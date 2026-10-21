/**
 * S5 of crew-voice-rules: the deck refuses a ticket whose body is not in ticket-making's shape
 * (spec 14, L12, A8). The shape is the user's words quoted, numbered spec lines each with
 * italic evidence, and the thread id. Every
 * test takes its own store; nothing touches 4321.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { shapedTicketBody, tempDeck } from '../testUtils.mjs';
import { ticketShapeGaps } from '../ticket-shape.mjs';

const { DeckRefusal, listItems, postItem, storeFile } = await import('../store.mjs');

const REPO = path.resolve('D:/work/alpha');
const aTicket = (body) => ({ kind: 'ticket', sliceCount: 60, title: 'Fix the thing', body, repo: REPO });

test('an unshaped body is refused naming every gap', (t) => {
  tempDeck(t);
  assert.deepEqual(ticketShapeGaps('fix the thing'), [
    "the user's words quoted (a > line)",
    'numbered spec lines',
    'the thread id (itm_…)',
  ]);
  assert.throws(
    () => postItem(aTicket('fix the thing')),
    (error) =>
      error instanceof DeckRefusal &&
      error.message ===
        "a ticket's body is not in ticket-making's shape; missing: the user's words quoted (a > line), " +
          'numbered spec lines, the thread id (itm_…)',
  );
  assert.deepEqual(
    ticketShapeGaps('> fix it\n\n1. It is fixed. *The test passes.*\n2. It stays fixed.\n\nitm_d2f9ed260436'),
    ['evidence in italics on line 2'],
    'a spec line without its evidence is named by its number',
  );
});

test('only line-start forms count, and evidence is *…*', () => {
  const gaps = (body) => ticketShapeGaps(`${body}\n\nitm_d2f9ed260436`);
  assert.ok(gaps('so a > b holds\n\n1. It is done. *Shown.*').includes("the user's words quoted (a > line)"));
  assert.ok(gaps('> fix it\n\nsee 1. x here').includes('numbered spec lines'));
  assert.deepEqual(ticketShapeGaps('> fix it\n\n1. It is done. _Shown._\n\nitm_d2f9ed260436'), ['evidence in italics on line 1']);
});

test('a shaped body is stored', (t) => {
  tempDeck(t);
  assert.deepEqual(ticketShapeGaps(shapedTicketBody()), []);
  const posted = postItem(aTicket(shapedTicketBody('fix the thing')));
  assert.equal(listItems().find((item) => item.id === posted.id)?.body, shapedTicketBody('fix the thing'));
});

test('ticket-shape no longer asks for Answered before posting', (t) => {
  tempDeck(t);
  assert.deepEqual(ticketShapeGaps(shapedTicketBody(), { size: 'small' }), [], 'a stray options argument asks for nothing more');
  const posted = postItem(aTicket(shapedTicketBody('tiny')));
  assert.equal(listItems().find((item) => item.id === posted.id)?.body, shapedTicketBody('tiny'));
});

test('a run-split ticket naming its artefact is stored', (t) => {
  tempDeck(t);
  const body = 'Run 2 of crew-voice-rules: artefact docs/design/crew-voice-rules/architecture.md, slices S5-S8';
  assert.deepEqual(ticketShapeGaps(body), []);
  assert.equal(postItem(aTicket(body)).body, body);
});

test('an audit pick naming its saved report is stored, and the same spec without it is refused', (t) => {
  tempDeck(t);
  const spec = 'Problem: the suite takes 4 min.\n\n1. `npm test` runs in under 60 s';
  const report = 'C:\\Users\\me\\.claude\\pilot\\audits\\D_work_alpha-0123456789\\2026-09-27T10-00-00-000Z.json';
  for (const slash of [report, report.replaceAll('\\', '/')]) {
    assert.deepEqual(ticketShapeGaps(`${spec}\n\nAudit report: ${slash}`), [], slash);
  }
  assert.equal(postItem(aTicket(`${spec}\n\nAudit report: ${report}`)).kind, 'ticket');
  assert.throws(() => postItem(aTicket(spec)), DeckRefusal);
});

test('the refusal comes before anything is written', (t) => {
  tempDeck(t);
  postItem(aTicket(shapedTicketBody()));
  const before = fs.readFileSync(storeFile(), 'utf8');
  assert.throws(() => postItem(aTicket('fix the thing')), DeckRefusal);
  assert.equal(fs.readFileSync(storeFile(), 'utf8'), before);
});
