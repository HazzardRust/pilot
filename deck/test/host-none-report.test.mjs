/**
 * other-host S8 (spec 3): at `pilot.host none` the gate2 names the feature branch and its sha, and the
 * closing report says to merge pilot into main by hand, from land's own main line (S4's `mainLine`).
 */

import './no-open.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { closingReportOf, stepsOf } from '../closing-report.mjs';
import { KIND_GATE2, KIND_TICKET } from '../items.mjs';
import { DeckRefusal, listItems, postItem, storeFile } from '../store.mjs';
import { mainLine } from '../../scripts/land.mjs';
import { postStored, shapedTicketBody, takeLive, tempDeck } from '../testUtils.mjs';

const REPO = path.resolve('D:/work/pilot');

test('a gate2 at none is accepted', (t) => {
  tempDeck(t);
  const ticket = postStored({ kind: KIND_TICKET, title: 'Hostless', body: shapedTicketBody('Hostless'), repo: REPO, sliceCount: 60, state: 'yellow' });
  takeLive(ticket.id);
  const gate2 = (pr) => postItem({ kind: KIND_GATE2, title: 'Gate 2', body: 'Walk it.', repo: REPO, pr, sha: '0305827', ticket: ticket.id });

  for (const bad of ['feat/../x', 'feat/', 'feat/a b', 'feat/x;rm']) {
    assert.throws(() => gate2(bad), DeckRefusal, `${bad} is refused`);
  }
  // No run record yet: no branch is the ticket's own.
  assert.throws(() => gate2('feat/other-host'), /names none, not feat\/other-host/);
  const file = storeFile();
  const deck = JSON.parse(fs.readFileSync(file, 'utf8'));
  deck.records = [{ repo: REPO, record: { slug: 'other-host', ticket: ticket.id, branch: 'feat/other-host' } }];
  fs.writeFileSync(file, JSON.stringify(deck), 'utf8');
  // Another run's branch, or a shape-only `feat/..`, is not this ticket's (QA F1).
  assert.throws(() => gate2('feat/someone-else'), /names feat\/other-host, not feat\/someone-else/);
  assert.throws(() => gate2('feat/..'), /names feat\/other-host, not feat\/\.\./);
  const posted = gate2('feat/other-host');
  const stored = listItems().find((item) => item.id === posted.id);
  assert.deepEqual([stored.pr, stored.sha], ['feat/other-host', '0305827']);
});

test('the report names branches', () => {
  const line = mainLine({ byHand: 'pilot', host: null });
  assert.equal(line, 'main gets pilot: merge pilot into main by hand');
  const record = { feature: 'x', slug: 'x', slices: [] };
  const gate = { pr: 'feat/x', landing: { state: 'landed', sha: '1a2b3c4', line: `landed feat/x on pilot at 1a2b3c4\n${line}` } };
  const { body } = closingReportOf(record, gate, []);
  const texts = stepsOf(record, gate).map((step) => step.text);
  assert.match(body, /^main gets pilot: merge pilot into main by hand$/m);
  assert.equal(texts[0], 'Merge pilot into main by hand, with a merge commit.');
  assert.doesNotMatch(`${body}\n${texts.join('\n')}`, /#\d+/);

  const other = stepsOf(record, { pr: 'feat/x', landing: { state: 'landed', sha: '1a2b3c4', line: mainLine({ byHand: 'fork-pilot', host: null }) } });
  assert.equal(other[0].text, 'Merge fork-pilot into main by hand, with a merge commit.');
});
