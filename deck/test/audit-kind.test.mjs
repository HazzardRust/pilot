/** S1 of housekeeping-audit, L12 and L16: `audit` is a known kind that waits for the user's pick. */

import './no-open.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { GATED_KINDS, KINDS, KIND_AUDIT, STANDING_KINDS, TEACH_ME, appearsInYours } from '../items.mjs';
import { DeckRefusal, dismissItem, postItem } from '../store.mjs';
import { renderThreadPage } from '../ui/render.mjs';
import { tempDeck } from '../testUtils.mjs';
import { yoursFor, yoursIndex } from '../status.mjs';

const REPO = 'D:/work/alpha';

const anAudit = () =>
  postItem({ kind: KIND_AUDIT, title: 'Audit: alpha', body: '1. **F1** The suite is slow', repo: REPO });

test('an audit item is in Yours, offers none beside the reply, cannot be dismissed, and holds back no signoff', (t) => {
  tempDeck(t);
  assert.equal(KIND_AUDIT, 'audit');
  assert.ok(KINDS.includes(KIND_AUDIT), 'deck_post takes it');
  assert.ok(!STANDING_KINDS.includes(KIND_AUDIT), 'it waits for the user');
  assert.ok(!GATED_KINDS.includes(KIND_AUDIT), 'it waits for nothing');

  const audit = anAudit();
  assert.deepEqual(audit.options, ['none']);
  assert.equal(appearsInYours(audit), true);

  const page = renderThreadPage(audit, [audit], []);
  assert.match(page, /name="choice" value="none"/, 'a none button');
  assert.doesNotMatch(page, new RegExp(`value="${TEACH_ME}"`), 'a list of fixes has nothing to teach');
  assert.doesNotMatch(page, /class="dismiss-item"/, 'no Dismiss');
  assert.throws(() => dismissItem(audit.id), DeckRefusal);

  const signoff = postItem({ kind: 'signoff', title: 'Done?', body: 'Satisfied?', repo: REPO });
  assert.ok(signoff.id, 'a signoff posts while the audit is open');
});

test('an audit item posted with the run\'s current slice joins that row\'s Yours (B1)', (t) => {
  tempDeck(t);
  const audit = postItem({
    kind: KIND_AUDIT,
    title: 'Audit: alpha',
    body: '1. **F1** The suite is slow',
    repo: REPO,
    slice: '4 Status table',
  });
  const index = yoursIndex([audit]);
  assert.equal(yoursFor({ repo: REPO }, { slice: '4 Status table' }, index), audit, 'joins on repo and slice (deck/status.mjs:108)');
  assert.equal(yoursFor({ repo: REPO }, { slice: 'a different slice' }, index), null, 'a different slice is not this row\'s Yours');
});
