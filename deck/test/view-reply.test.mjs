/**
 * rune-deck-ui S9: the thread screen's `reply` region, `replyView`, read against the HTML page's reply slot
 * (`renderReplySlot`, spec 3, 5, 6c): the same options with the same confirm flags, and the same reopen,
 * dismiss and nothing-at-all cases.
 *
 * Pure: no store, no port.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

const { renderReplySlot } = await import('../ui/render-cards.mjs');
const { renderThreadPage } = await import('../ui/render.mjs');
const { replyView } = await import('../view/reply.mjs');

const AT = '2026-11-20T09:00:00.000Z';

let minted = 0;
const anItem = (over = {}) => ({
  id: `itm_${String((minted += 1)).padStart(12, '0')}`,
  kind: 'question',
  title: 'A thread',
  body: 'the body',
  repo: 'D:/work/pilot',
  postedAt: AT,
  replies: [],
  ...over,
});

const readsOf = (items) => ({ seq: 1, items, runs: [], numbers: {}, agents: {}, added: [], alerts: {}, lanes: { coPilots: {}, switches: {} }, held: [] });

/**
 * The options a user can press in the page's reply slot, in order: each `choice` button's value and whether it
 * is a confirm trigger (`data-confirm`). A trigger's own Confirm, in its hidden step, is the same press, not an option.
 */
function pageOptions(html) {
  return [...html.matchAll(/<button type="submit" name="choice" value="([^"]*)"([^>]*)>([\s\S]*?)<\/button>/g)]
    .filter(([, , , text]) => text !== 'Confirm')
    .map(([, value, attrs, text]) => ({
      label: value.replace(/&amp;/g, '&'), confirm: attrs.includes('data-confirm'), locked: / disabled\b/.test(attrs),
      recommended: text.includes('<span class="quiet">(recommended)</span>'),
    }));
}

const said = (text, from = 'user') => ({ from, text, repliedAt: AT });

test('a locked option is the page\'s disabled one: pressed answers lock, a signed gate keeps Not yet', () => {
  const cases = [
    anItem({ kind: 'gate2', options: ['Sign off', 'Not yet'], replies: [said('Sign off')] }),
    anItem({ kind: 'gate1', options: ['Sign off', 'Not yet'], replies: [said('Not yet')] }),
    // Every landing state that locks a signed gate's Not yet, and one that does not.
    ...['queued', 'running', 'landed', 'refused', 'failed'].map((state) =>
      anItem({ kind: 'gate2', options: ['Sign off', 'Not yet'], replies: [said('Sign off')], landing: { state } })),
    anItem({ kind: 'signoff', options: ['Ship', 'Hold'], replies: [said('Ship')] }),
    anItem({ kind: 'crew-handoff', options: ['Handoff failed'], replies: [said('Handoff failed')] }),
    anItem({ kind: 'handoff', options: ['Picked up'] }),
    anItem({ kind: 'question', options: ['Yes', 'No'], blocking: true, replies: [said('Yes')] }),
    anItem({ kind: 'walkthrough', replies: [said('Sign off')] }),
    anItem({ kind: 'audit', options: ['a', 'none'], replies: [said('none')] }),
    anItem({ kind: 'handoff', options: ['Handoff failed'], replies: [said('Handoff failed')] }),
    anItem({ kind: 'lesson', options: ['x', 'y'], replies: [said('x')] }),
    anItem({ kind: 'lesson', options: ['x', 'y'], replies: [said('x'), said('try again', 'pilot')] }),
  ];
  for (const item of cases) {
    const view = replyView(readsOf(cases), { id: item.id });
    assert.deepEqual(view.options, pageOptions(renderReplySlot(item)), `${item.kind} ${item.replies.map((r) => r.text)}`);
  }
  // The page's own answer, not only agreement: a signed gate locks Sign off and leaves Not yet pressable.
  assert.deepEqual(replyView(readsOf(cases), { id: cases[0].id }).options.map((o) => o.locked), [true, false, true]);
});

test('Close is offered where the page draws it, confirmed in place: a question and a user thread', () => {
  for (const item of [anItem({ kind: 'question' }), anItem({ kind: 'user' }), anItem({ kind: 'gate2', options: ['Sign off'] })]) {
    const view = replyView(readsOf([item]), { id: item.id });
    const drawn = renderReplySlot(item).includes('action="/close"');
    assert.deepEqual(view.close ?? null, drawn ? { confirm: true } : null, item.kind);
  }
});

test('the options are the page\'s: a gate, a question and a walkthrough', () => {
  const cases = [
    anItem({ kind: 'gate2', title: 'Gate 2', options: ['Sign off', 'Not yet'], recommended: 'Sign off' }),
    anItem({ kind: 'question', options: ['Yes', 'No'], recommended: 'Yes', blocking: true }),
    anItem({ kind: 'walkthrough', title: 'Walk it' }),
  ];
  for (const item of cases) {
    const view = replyView(readsOf(cases), { id: item.id });
    const page = pageOptions(renderReplySlot(item));
    assert.ok(page.length > 0, `${item.kind}: the page offers options`);
    assert.deepEqual(view.options, page, item.kind);
    assert.equal(view.mode, 'reply', item.kind);
    // The page's form posts to its own thread; the box carries that thread's id.
    assert.equal(view.id, item.id, item.kind);
  }
});

test('a verdict confirms and a question does not; Teach me never does', () => {
  const gate = anItem({ kind: 'gate1', options: ['Sign off', 'Not yet'] });
  const question = anItem({ kind: 'question', options: ['A'] });
  assert.deepEqual(replyView(readsOf([gate]), { id: gate.id }).options, [
    { label: 'Sign off', confirm: true, locked: false, recommended: false },
    { label: 'Not yet', confirm: true, locked: false, recommended: false },
    { label: 'Teach me', confirm: false, locked: false, recommended: false },
  ]);
  assert.deepEqual(replyView(readsOf([question]), { id: question.id }).options, [
    { label: 'A', confirm: false, locked: false, recommended: false },
    { label: 'Teach me', confirm: false, locked: false, recommended: false },
  ]);
});

test('the recommended option is the one the page marks (recommended), and only on the pilot\'s answers', () => {
  const cases = [
    anItem({ kind: 'question', options: ['Yes', 'No'], recommended: 'No', blocking: true }),
    anItem({ kind: 'gate1', options: ['Sign off', 'Not yet'], recommended: 'Sign off' }),
  ];
  for (const item of cases) {
    const view = replyView(readsOf(cases), { id: item.id });
    assert.deepEqual(view.options, pageOptions(renderReplySlot(item)), item.kind);
  }
  // The page's own answer: No is marked; Assume the default, which answers with it, and Teach me are not.
  assert.deepEqual(replyView(readsOf(cases), { id: cases[0].id }).options.map((o) => o.recommended), [false, true, false, false]);
});

test('dismiss is offered where the page offers it: a gate and an unknown kind, never a question', () => {
  for (const item of [anItem({ kind: 'gate2', options: ['Sign off'] }), anItem({ kind: 'some-new-kind' }), anItem({ kind: 'question' })]) {
    const view = replyView(readsOf([item]), { id: item.id });
    assert.equal(view.dismiss, renderReplySlot(item).includes('action="/dismiss-item"'), item.kind);
  }
});

test('a closed thread offers reopen, as the page does, and nothing else', () => {
  const closed = anItem({ options: ['A'], resolution: 'Done.', resolvedAt: AT });
  const view = replyView(readsOf([closed]), { id: closed.id });
  assert.deepEqual(view, { mode: 'reopen', id: closed.id, options: [], dismiss: false });
  assert.match(renderThreadPage(closed, [closed]), /action="\/reopen"/);
});

test('a record, an archived thread or an unknown id offers nothing', () => {
  const report = anItem({ kind: 'report' });
  const none = { mode: 'none', options: [], dismiss: false };
  assert.equal(renderReplySlot(report), '');
  assert.deepEqual(replyView(readsOf([report]), { id: report.id }), none);
  // An archived thread is not among the live items the view reads: read-only, as the page's archived slot is.
  assert.deepEqual(replyView(readsOf([]), { id: 'itm_ffffffffffff' }), none);
});
