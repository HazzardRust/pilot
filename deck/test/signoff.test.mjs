/**
 * Spec 5 of handoff-failed-confirm (L1, L5): a verdict confirms in place, on the one seam.
 *
 * "add a confirmation step to any sign off button, I can see myself easily
 * accidentally clicking it" — the user, 2026-09-21. A sign-off's options, a
 * gate's Sign off and Not yet, and a walkthrough's Sign off are each a
 * `data-confirm` trigger, standing in a `[data-confirm-row]` of its own whose
 * hidden `.step.sure` names the option and carries a Confirm posting it.
 * Teach me and a question's answers still go in one press. Spec 19's
 * `.choices.asks` row and its `No` are retired.
 *
 * This file is the markup half, read through the sandbox's element tree so the
 * pins hold for any markup that keeps the contract. The press is in
 * `deck/test/reply.test.mjs`.
 */

import './no-open.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { KIND_GATE1, KIND_GATE2, NOT_YET, SIGN_OFF, TEACH_ME } from '../items.mjs';
import { freePort } from '../testUtils.mjs';
import { renderHomePage, renderThreadPage } from '../ui/render.mjs';
import { aPage, formIn } from './confirm-sandbox.mjs';

// A port of this file's own, never one a scratch deck might hold.
const PORT = await freePort();

const aQuestion = (over = {}) => ({
  id: 'i-1',
  kind: 'question',
  title: 'Which port should the preview deck use?',
  body: 'The machine already runs one.',
  postedAt: '2026-09-21 09:00',
  options: ['4322', String(PORT)],
  recommended: '4322',
  repo: 'D:\\work\\pilot',
  ...over,
});

const aSignoff = (over = {}) =>
  aQuestion({ id: 'i-2', kind: 'signoff', options: ['satisfied', 'not yet'], recommended: undefined, ...over });

const aGate = (kind) => aQuestion({ id: `i-${kind}`, kind, options: [SIGN_OFF, NOT_YET], recommended: undefined });

const aWalkthrough = (over = {}) => ({
  id: 'i-3',
  kind: 'walkthrough',
  title: 'Does the deck remember a panel?',
  body: 'Three steps.',
  postedAt: '2026-09-21 09:00',
  screens: ['open the deck → three bookmarks'],
  repo: 'D:\\work\\pilot',
  ...over,
});

/** The reply form of `item` on its card and on its thread page: where, its markup and its element tree. */
const placesOf = (item) =>
  [
    [`${item.kind} card`, formIn(renderHomePage([item], []))],
    [`${item.kind} page`, formIn(renderThreadPage(item))],
  ].map(([where, html]) => [where, html, aPage(html).document.root]);

/** The option buttons of a row, trigger or not, leaving out each Confirm inside a confirm step. */
const optionsIn = (root) => root.querySelectorAll('.choices button').filter((button) => !button.closest('.step'));

/** Each trigger confirms its own option: one hidden step in its row, a sentence naming it, a Confirm posting it. */
const assertTrigger = (where, trigger, html) => {
  const label = `${where} ${trigger.value}`;
  const row = trigger.closest('[data-confirm-row]');
  assert.ok(row, `${label}: in a confirm row`);
  const steps = row.querySelectorAll('.step.sure');
  assert.equal(steps.length, 1, `${label}: one confirm step in its row`);
  assert.equal(steps[0].hidden, true, `${label}: drawn hidden, so with no script one press posts`);
  const confirm = steps[0].querySelector('[type="submit"]');
  assert.equal(confirm.getAttribute('name'), 'choice', `${label}: Confirm posts the choice`);
  assert.equal(confirm.value, trigger.value, `${label}: Confirm carries the pressed option`);
  assert.ok(confirm.hasAttribute('formnovalidate'), `${label}: Confirm is not held by an empty reply box`);
  assert.ok(html.includes(`<p>Send “${trigger.value}”?</p>`), `${label}: the sentence names it`);
};

test("a sign-off's options and a gate's Sign off and Not yet are triggers; Teach me is not", () => {
  for (const item of [aSignoff(), aGate(KIND_GATE1), aGate(KIND_GATE2)]) {
    for (const [where, html, root] of placesOf(item)) {
      const options = optionsIn(root);
      const triggers = options.filter((button) => button.hasAttribute('data-confirm'));
      assert.deepEqual(triggers.map((button) => button.value), item.options, `${where}: every option is a trigger`);
      for (const trigger of triggers) assertTrigger(where, trigger, html);
      const teach = options.find((button) => button.value === TEACH_ME);
      assert.ok(teach, `${where}: Teach me is still offered`);
      assert.equal(teach.hasAttribute('data-confirm'), false, `${where}: and is not a trigger`);
    }
  }
});

test("the walkthrough's Sign off is a trigger", () => {
  for (const [where, html, root] of placesOf(aWalkthrough())) {
    const [signOff, ...rest] = optionsIn(root);
    assert.equal(signOff.value, SIGN_OFF, `${where}: the button that says Sign off`);
    assert.deepEqual(rest, [], `${where}: and no other`);
    assert.ok(signOff.hasAttribute('data-confirm'), `${where}: is a trigger`);
    assertTrigger(where, signOff, html);
  }
});

test('no .choices.asks and no .no is drawn anywhere', () => {
  for (const item of [aQuestion(), aSignoff(), aGate(KIND_GATE1), aGate(KIND_GATE2), aWalkthrough()]) {
    for (const html of [renderHomePage([item], []), renderThreadPage(item)]) {
      const { root } = aPage(formIn(html)).document;
      assert.ok(root.querySelector('.choices'), `${item.kind}: its row of options is read`);
      assert.deepEqual(root.querySelectorAll('.choices .no'), [], `${item.kind}: no No in a row of options`);
      assert.doesNotMatch(html, /class="choices asks"/, `${item.kind}: no asking row`);
      assert.doesNotMatch(html, /Send this sign-off\?/, `${item.kind}: spec 19's question is gone`);
    }
  }
});
