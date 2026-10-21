/**
 * deck-polish S6 (spec 2, 10; L2, L11, L13): a card remembers the option its
 * newest reply chose, drawn the way a live press is, and every list but the
 * Tickets queue reads and sorts by the time of the thread's newest message.
 *
 * The chosen option is read back from the stored reply (L2), never a field, so
 * every pin below builds an item with replies and no `chosen` anywhere.
 */

import './no-open.mjs';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';

const { chosenOf, lastSaidAt } = await import('../items.mjs');
const { daySections, renderDeckPage, renderHomePage, renderThreadPage } = await import('../ui/render.mjs');

/** Local noon on Wed 30 Sep 2026. */
const NOW = new Date(2026, 8, 30, 12, 0, 0).getTime();
const ago = (ms) => new Date(NOW - ms).toISOString();
const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

const MINE = path.join('D:', 'work', 'pilot');

let minted = 0;
const question = (over = {}) => ({
  id: `itm_hist_${(minted += 1)}`,
  kind: 'question',
  title: `Which name ${minted}?`,
  body: 'pick one',
  repo: MINE,
  options: ['pilot', 'crew'],
  postedAt: ago(19 * HOUR),
  replies: [],
  ...over,
});
const said = (text, at, from = 'user') => ({ from, text, repliedAt: at, ...(from === 'user' ? { seq: 1 } : {}) });

/** The choice row's buttons, as `value -> { sent, disabled }`. */
const buttonsIn = (html) =>
  Object.fromEntries(
    [...html.matchAll(/<button type="submit" name="choice" value="([^"]*)"([^>]*)>(?!Confirm<)/g)].map(([, value, rest]) => [
      value,
      { sent: /class="[^"]*\bsent\b/.test(rest), disabled: /\bdisabled\b/.test(rest) },
    ]),
  );

const queueOn = (page) => /<main data-live="queue">([\s\S]*?)<\/main>/.exec(page)?.[1] ?? '';

/** The item's card, as the overview draws it. */
const renderCard = (item) => queueOn(renderHomePage([item], [], null, false, {}, {}, NOW));

test("the option the user's newest reply chose is chosen", () => {
  assert.equal(chosenOf(question({ replies: [said('crew', ago(MINUTE))] })), 'crew', 'the choice alone');
  assert.equal(
    chosenOf(question({ replies: [said('crew\n\nbut shorter', ago(MINUTE))] })),
    'crew',
    'the choice with a note typed beside it',
  );
  assert.equal(chosenOf(question()), null, 'no reply, no choice');
  assert.equal(
    chosenOf(question({ replies: [said('crewmate', ago(MINUTE))] })),
    null,
    'an option that only begins the reply without a blank line is not chosen',
  );
});

test('a typed reply after a press unchooses it; a closed thread chooses nothing', () => {
  assert.equal(
    chosenOf(question({ replies: [said('crew', ago(2 * MINUTE)), said('actually, neither', ago(MINUTE))] })),
    null,
    'the newest reply is the answer (L2)',
  );
  assert.equal(
    chosenOf(question({ replies: [said('crew', ago(2 * MINUTE)), said('noted', ago(MINUTE), 'pilot')] })),
    'crew',
    'a pilot line after the press does not unchoose it',
  );
  assert.equal(
    chosenOf(question({ replies: [said('crew', ago(MINUTE))], resolvedAt: ago(0) })),
    null,
    'a closed thread chooses nothing',
  );
});

test('the card and the page draw the chosen option pressed and the row disabled', () => {
  const item = question({ replies: [said('crew', ago(MINUTE))] });
  for (const [where, html] of [
    ['card', renderCard(item)],
    ['page', renderThreadPage(item, [item])],
  ]) {
    const buttons = buttonsIn(html);
    assert.deepEqual(buttons.crew, { sent: true, disabled: true }, `${where}: the chosen one is pressed`);
    assert.deepEqual(buttons.pilot, { sent: false, disabled: true }, `${where}: the rest of the row is disabled`);
    assert.deepEqual(buttons['Teach me'], { sent: false, disabled: true }, `${where}: Teach me is locked with it (L11)`);
  }
  const audit = question({ kind: 'audit', options: ['fix 1', 'none'], replies: [said('fix 1', ago(MINUTE))] });
  assert.deepEqual(buttonsIn(renderCard(audit))['fix 1'], { sent: true, disabled: true }, "an audit's pick is locked");
  const fresh = buttonsIn(renderCard(question()));
  assert.deepEqual(fresh.crew, { sent: false, disabled: false }, 'nothing chosen, nothing locked');
});

test("a walkthrough's Sign off stays pressed once sent, so the press shows it landed", () => {
  const walk = (over = {}) =>
    question({ kind: 'walkthrough', options: undefined, url: 'C:/x', screens: ['a -> b'], ...over });
  const signed = walk({ replies: [said('Sign off', ago(MINUTE))] });
  for (const [where, html] of [
    ['card', renderCard(signed)],
    ['page', renderThreadPage(signed, [signed])],
  ]) {
    assert.deepEqual(buttonsIn(html)['Sign off'], { sent: true, disabled: true }, `${where}: Sign off is pressed`);
  }
  const typed = walk({ replies: [said('step 2 did nothing', ago(MINUTE))] });
  assert.deepEqual(buttonsIn(renderCard(typed))['Sign off'], { sent: false, disabled: false }, 'a typed reply is no sign-off');
});

test('time ago reads the newest message, whoever sent it', () => {
  const reply = ago(MINUTE);
  const byUser = question({ replies: [said('crew', reply)] });
  const byPilot = question({ replies: [said('noted', reply, 'pilot')] });
  assert.equal(lastSaidAt(byUser), reply);
  assert.equal(lastSaidAt(byPilot), reply);
  const stamp = `<time datetime="${reply}">`;
  assert.ok(renderCard(byUser).includes(stamp), 'the card reads the reply');
  const kind = /<span class="kind" data-live="kind">(.*)$/m.exec(renderThreadPage(byPilot, [byPilot]))?.[1] ?? '';
  assert.ok(kind.includes(stamp), 'the page kind line reads the reply');
});

test('a thread closed after its newest reply reads its closing time (J4)', () => {
  const closed = ago(MINUTE);
  const item = question({ postedAt: ago(2 * DAY), replies: [said('crew', ago(DAY))], resolvedAt: closed });
  assert.equal(lastSaidAt(item), closed);
  const later = ago(MINUTE / 2);
  assert.equal(lastSaidAt(question({ replies: [said('crew', later)], resolvedAt: closed })), later, 'a later reply still wins');
});

test('a thread with no messages reads its posting time', () => {
  const item = question();
  assert.equal(lastSaidAt(item), item.postedAt);
  assert.ok(renderCard(item).includes(`<time datetime="${item.postedAt}">`));
});

test("a fresh reply moves an open card to the front, and a settled card into today's section", () => {
  const older = question({ title: 'older', postedAt: ago(2 * DAY), replies: [said('crew', ago(MINUTE))] });
  const newer = question({ title: 'newer', postedAt: ago(DAY) });
  const page = queueOn(renderHomePage([older, newer], [], null, false, {}, {}, NOW));
  assert.ok(page.indexOf('>older<') !== -1 && page.indexOf('>older<') < page.indexOf('>newer<'), 'the replied one is first');

  const settledOld = { ...older, resolvedAt: ago(2 * DAY + HOUR) };
  const settledNew = { ...newer, resolvedAt: ago(DAY) };
  const sections = daySections([settledNew, settledOld], NOW);
  assert.equal(sections[0].key, '2026-09-30', 'filed under today');
  assert.deepEqual(sections[0].items.map((each) => each.title), ['older']);

  const sameDay = daySections(
    [
      question({ title: 'a', postedAt: ago(3 * HOUR), resolvedAt: ago(HOUR) }),
      question({ title: 'b', postedAt: ago(4 * HOUR), replies: [said('x', ago(MINUTE))], resolvedAt: ago(HOUR) }),
    ],
    NOW,
  );
  assert.deepEqual(sameDay[0].items.map((each) => each.title), ['b', 'a'], 'within a section, newest said first');
});

test('the overview and the thread arrows walk newest said first, user threads below the questions', () => {
  // The store appends, so it holds these oldest first: an order the rule must change.
  const stale = question({ title: 'stale', postedAt: ago(2 * DAY) });
  const fresh = question({ title: 'fresh', postedAt: ago(DAY), replies: [said('crew', ago(HOUR))] });
  const mine = question({ title: 'mine', kind: 'user', options: undefined, postedAt: ago(MINUTE) });
  const items = [stale, fresh, mine];
  const page = queueOn(renderHomePage(items, [], null, false, {}, {}, NOW));
  const at = (title) => page.indexOf(`>${title}<`);
  assert.ok(at('stale') !== -1 && at('fresh') < at('stale'), 'the one heard from last is first');
  assert.ok(at('stale') < at('mine'), 'and the newest user thread is still below every question');
  const position = (item) => /data-live="position">([^<]*)</.exec(renderThreadPage(item, items))?.[1];
  assert.deepEqual([fresh, stale, mine].map(position), ['1/3', '2/3', '3/3'], 'the arrows walk the same list');
});

test('a settled user thread shown under Everything carries no Close', () => {
  const settled = question({ title: 'done', kind: 'user', options: undefined, postedAt: ago(HOUR), resolvedAt: ago(MINUTE) });
  const page = queueOn(renderHomePage([settled], [], null, true, {}, {}, NOW));
  assert.ok(page.includes('>done<'), 'the settled card is drawn');
  assert.ok(!page.includes('action="/close"'), 'and it has nothing left to close');
});

test('a comment on a ticket does not move it in the Tickets queue', () => {
  const ticket = (title, over = {}) => ({
    id: `itm_ticket_${(minted += 1)}`,
    kind: 'ticket',
    title,
    body: 'do it',
    repo: MINE,
    postedAt: ago(DAY),
    replies: [],
    ...over,
  });
  const first = ticket('first ticket');
  const second = ticket('second ticket', { replies: [said('a comment', ago(MINUTE))] });
  const run = { id: 'run_000000000001', repo: MINE, name: 'pilot', pid: process.pid, startedAt: ago(DAY), slices: [] };
  const page = renderHomePage([first, second], [run], MINE, false, {}, {}, NOW);
  const list = /<ol class="tickets-list">([\s\S]*?)<\/ol>/.exec(page)?.[1] ?? '';
  assert.ok(list.indexOf('first ticket') !== -1, 'the queue is drawn');
  assert.ok(list.indexOf('first ticket') < list.indexOf('second ticket'), 'deck order holds (L13)');
});

test('/items draws open cards in the queue order and settled ones newest message first (J3)', () => {
  const settledOld = question({ title: 'settled old', resolvedAt: ago(2 * DAY), postedAt: ago(3 * DAY) });
  const oldOpen = question({ title: 'open old', postedAt: ago(2 * DAY) });
  const settledNew = question({ title: 'settled new', resolvedAt: ago(HOUR), postedAt: ago(3 * DAY) });
  const newOpen = question({ title: 'open new', replies: [said('crew', ago(MINUTE))] });
  const page = /<main data-live="items">([\s\S]*?)<\/main>/.exec(
    renderDeckPage([settledOld, oldOpen, settledNew, newOpen]),
  )[1];
  const order = ['open new', 'open old', 'settled new', 'settled old'].map((title) => page.indexOf(title));
  assert.ok(order.every((at) => at !== -1), 'every card is drawn');
  assert.deepEqual([...order].sort((a, b) => a - b), order, 'queue first, then settled newest first');
});
