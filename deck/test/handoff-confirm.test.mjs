/**
 * S1 of handoff-failed-confirm, spec 1-4 (L1, L3, L4): Handoff failed confirms in place on the one seam
 * `confirm.mjs` owns, keyed on a `data-confirm` trigger and its `[data-confirm-row]`.
 *
 * The sandbox runs `confirm.mjs` and `reply.mjs` together over the markup `render.mjs` really draws, read
 * into the few lines of element tree in `confirm-sandbox.mjs`, so the pins hold for whatever implementation stands behind
 * `data-confirm` (the slice's rewrite check).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { HANDOFF_FAILED, KIND_AUDIT, KIND_CREW_HANDOFF, KIND_HANDOFF, askFor } from '../items.mjs';
import { listItems, postItem } from '../store.mjs';
import { renderHomePage, renderThreadPage } from '../ui/render.mjs';
import { postStored, tempDeck } from '../testUtils.mjs';
import { aPage, formIn } from './confirm-sandbox.mjs';

const REPO = 'D:/work/alpha';

const aHandoff = (kind) => ({ kind, title: `Handoff: ${kind}`, body: 'Brief a fresh one if nothing arrives.', repo: REPO });

const cardOf = (item) => renderHomePage(listItems().filter((candidate) => candidate.id === item.id));

/** Each place a handoff's Handoff failed is drawn, as its reply form: card and page, both kinds. */
const handoffForms = (t) => {
  tempDeck(t);
  return [KIND_HANDOFF, KIND_CREW_HANDOFF].flatMap((kind) => {
    const item = postItem(aHandoff(kind));
    return [[`${kind} card`, formIn(cardOf(item)), kind], [`${kind} page`, formIn(renderThreadPage(item, [item], [])), kind]];
  });
};

// --- the pins ---------------------------------------------------------------------------------------------

test('a handoff row confirms in place, card and page, both kinds', (t) => {
  assert.equal(askFor(KIND_HANDOFF), 'Treat the session this went to as lost, and brief a fresh one from this hand-off?');
  assert.equal(askFor(KIND_CREW_HANDOFF), 'Treat this agent as lost, and brief a fresh one from its branch?');
  assert.equal(askFor(KIND_AUDIT), null, 'a kind with no confirm asks nothing');
  for (const [where, html, kind] of handoffForms(t)) {
    const { trigger, row, sure, confirm } = aPage(html);
    assert.ok(trigger, `${where}: Handoff failed is a trigger`);
    assert.equal(trigger.getAttribute('value'), HANDOFF_FAILED, `${where}: the trigger is Handoff failed`);
    assert.ok(row, `${where}: inside a confirm row`);
    assert.equal(sure?.hidden, true, `${where}: the confirm step is drawn hidden, so no script posts at once`);
    assert.equal(sure.querySelector('p')?.parent, sure, `${where}: the sentence`);
    assert.ok(html.includes(`<p>${askFor(kind).replace(/'/g, '&#39;')}</p>`), `${where}: says the ${kind} sentence`);
    assert.equal(confirm?.getAttribute('name'), 'choice', `${where}: Confirm posts the choice`);
    assert.equal(confirm.getAttribute('value'), HANDOFF_FAILED, `${where}: Confirm carries Handoff failed`);
    assert.ok(confirm.hasAttribute('formnovalidate'), `${where}: Confirm is not held by an empty reply box`);
  }
});

test('the first press on a trigger is prevented and nothing is fetched', (t) => {
  for (const [where, html] of handoffForms(t)) {
    const { document, fetched, trigger, row, sure, confirm } = aPage(html);
    document.press(trigger);
    assert.deepEqual(fetched, [], `${where}: nothing fetched`);
    assert.deepEqual(document.navigations, [], `${where}: nothing posted`);
    assert.ok(row.hasAttribute('data-confirming'), `${where}: the row blanks to its confirm`);
    assert.equal(sure.hidden, false, `${where}: the sentence and Confirm show`);
    assert.equal(document.activeElement, confirm, `${where}: Confirm takes the focus`);
  }
});

test("Confirm submits the trigger's value through the reply fetch", (t) => {
  for (const [where, html] of handoffForms(t)) {
    const { document, fetched, trigger, confirm } = aPage(html);
    document.press(trigger);
    document.press(confirm);
    assert.equal(fetched.length, 1, `${where}: one fetch`);
    assert.equal(fetched[0].target, '/reply', `${where}: to the reply route`);
    assert.equal(fetched[0].body.choice, HANDOFF_FAILED, `${where}: carrying Handoff failed`);
    assert.deepEqual(document.navigations, [], `${where}: and no page load`);
  }
});

test('a click elsewhere or Escape reverts and posts nothing', (t) => {
  for (const [where, html] of handoffForms(t)) {
    for (const [how, away] of [['a click elsewhere', (page) => page.document.click(page.document.root)], ['Escape', (page) => page.document.key('Escape')]]) {
      const page = aPage(html);
      page.document.press(page.trigger);
      away(page);
      assert.equal(page.row.hasAttribute('data-confirming'), false, `${where}, ${how}: the row is back`);
      assert.equal(page.sure.hidden, true, `${where}, ${how}: the confirm step is hidden again`);
      assert.deepEqual(page.fetched, [], `${where}, ${how}: nothing fetched`);
      assert.deepEqual(page.document.navigations, [], `${where}, ${how}: nothing posted`);
      // Pressed again, it confirms again: exactly one row confirming, and the row reusable.
      page.document.press(page.trigger);
      assert.ok(page.row.hasAttribute('data-confirming'), `${where}, ${how}: a second press confirms again`);
    }
  }
});

test('Tab while confirming leaves the row confirming', (t) => {
  for (const [where, html] of handoffForms(t)) {
    const { document, row, sure, trigger } = aPage(html);
    document.press(trigger);
    document.key('Tab');
    assert.ok(row.hasAttribute('data-confirming'), `${where}: still confirming`);
    assert.equal(sure.hidden, false, `${where}: the confirm step still shows`);
  }
});

test("a handoff with no options draws no trigger, and an audit's row answers in one press", (t) => {
  tempDeck(t);
  const bare = postStored({ ...aHandoff(KIND_HANDOFF) });
  const audit = postItem({ kind: KIND_AUDIT, title: 'Audit: alpha', body: '1. **F1** The suite is slow', repo: REPO });
  for (const [where, html] of [
    ['an old handoff page', formIn(renderThreadPage(bare, [bare], []))],
    ['an audit card', formIn(cardOf(audit))],
    ['an audit page', formIn(renderThreadPage(audit, [audit], []))],
  ]) {
    assert.doesNotMatch(html, /data-confirm/, `${where}: no trigger and no confirm row`);
  }
  const { document, fetched } = aPage(formIn(cardOf(audit)));
  document.press(document.root.querySelector('button[name="choice"]'));
  assert.equal(fetched.length, 1, "an audit's option goes in one press");
});

test("Escape on a thread page puts the row back and does not leave the thread", (t) => {
  tempDeck(t);
  const item = postItem(aHandoff(KIND_HANDOFF));
  const { document, trigger, row } = aPage(`<a class="back" href="/">back</a>${formIn(renderThreadPage(item, [item], []))}`);
  document.press(trigger);
  document.key('Escape');
  assert.equal(row.hasAttribute('data-confirming'), false, 'the row is back');
  assert.deepEqual(document.navigations, [], 'and the page stays on the thread');
  document.key('Escape');
  assert.deepEqual(document.navigations, ['/'], 'with nothing confirming, Escape leaves the thread as it always has');
});
