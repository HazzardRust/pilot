/**
 * other-host S8 (spec 3): at `pilot.host none` the gate2 names the feature branch and its sha, and the
 * closing report says to merge pilot into main by hand, from land's own main line (S4's `mainLine`).
 */

import './no-open.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';

import { closingReportOf } from '../closing-report.mjs';
import { KIND_GATE2, KIND_TICKET } from '../items.mjs';
import { DeckRefusal, listItems, postItem } from '../store.mjs';
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
  const posted = gate2('feat/other-host');
  const stored = listItems().find((item) => item.id === posted.id);
  assert.deepEqual([stored.pr, stored.sha], ['feat/other-host', '0305827']);
});

test('the report names branches', () => {
  const line = mainLine({ byHand: 'pilot', host: null });
  assert.equal(line, 'main gets pilot: merge pilot into main by hand');
  const { body } = closingReportOf({ feature: 'x', slug: 'x', slices: [] }, { pr: 'feat/x', landing: { state: 'landed', sha: '1a2b3c4', line: `landed feat/x on pilot at 1a2b3c4\n${line}` } }, []);
  assert.match(body, /^main gets pilot: merge pilot into main by hand$/m);
  assert.ok(body.split('\n').includes('Human step: Merge pilot into main by hand, with a merge commit.'));
  assert.doesNotMatch(body, /#\d+/);

  const other = closingReportOf({ feature: 'x', slug: 'x', slices: [] }, { pr: 'feat/x', landing: { state: 'landed', sha: '1a2b3c4', line: mainLine({ byHand: 'fork-pilot', host: null }) } }, []).body;
  assert.ok(other.split('\n').includes('Human step: Merge fork-pilot into main by hand, with a merge commit.'));
});
