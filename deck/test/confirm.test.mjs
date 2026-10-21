/**
 * F2 of the independence fix round: `js/confirm.mjs` is the one script Create
 * and Remove share, with Start and End since (each once repeated the same
 * show/hide, cancel and submit handling).
 * `create.test.mjs` and `remove-deck.test.mjs` each keep the
 * spec-specific coverage for their own form; what belongs here once, rather
 * than three times over, is the shape the script itself owns regardless of
 * which form it is bound to: a press outside `.cancel` leaves a form alone,
 * and a submit from a form the script does not own is never touched.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import path from 'node:path';

import { aSandbox, tempDeck } from '../testUtils.mjs';
import { repoKey } from '../items.mjs';
import { renderDeckPage, renderHomePage, renderThreadPage } from '../ui/render.mjs';
import { install as installConfirm } from '../ui/js/confirm.mjs';
import { aPage } from './confirm-sandbox.mjs';

const { createThread, listDeckNumbers, listItems, listRuns, listStoredRuns, postItem, registerRun } = await import('../store.mjs');

/** A generic confirm form's DOM, stubbed to what `confirm.mjs` reads and writes. */
const aConfirmForm = () => {
  const steps = { name: { hidden: false }, sure: { hidden: true } };
  const details = { open: true };
  const form = {
    resets: 0,
    reset() {
      this.resets += 1;
    },
    matches: (selector) => selector === 'form.confirm',
    closest: (selector) => (selector === 'details' ? details : null),
    querySelector: (selector) =>
      ({ '.step.name': steps.name, '.step.sure': steps.sure, '.step.sure [type="submit"]': { focus() {} } })[
        selector
      ] ?? null,
  };
  /** A click target: `elsewhere` when it is inside the form but not `.cancel`. */
  const target = (name, elsewhere = false) => ({
    closest: (selector) => {
      if (selector === 'form.confirm') return elsewhere ? null : form;
      if (selector === `.${name}`) return elsewhere ? null : {};
      return null;
    },
  });
  return { form, steps, details, target };
};

/** The script's listeners, each event run through the capturing ones first and then the rest, as a browser runs them. */
const installed = () => {
  const listeners = [];
  installConfirm(aSandbox({ document: { addEventListener: (type, run, capture = false) => listeners.push({ type, run, capture }) } }));
  const dispatch = (type) => (event) => {
    const prevent = event.preventDefault;
    event.defaultPrevented = false;
    event.preventDefault = () => {
      event.defaultPrevented = true;
      if (prevent) prevent();
    };
    for (const phase of [true, false]) {
      for (const one of listeners) if (one.type === type && Boolean(one.capture) === phase) one.run(event);
    }
    return event;
  };
  return { submit: dispatch('submit'), click: dispatch('click'), keydown: dispatch('keydown') };
};

test('a click inside the form that is not Cancel leaves the confirm step alone', () => {
  const handlers = installed();
  const { form, steps, details, target } = aConfirmForm();
  handlers.submit({ target: form, preventDefault() {} });
  assert.equal(steps.sure.hidden, false, 'the confirm step is showing');

  // `closest('.cancel')` finds nothing: the press landed somewhere else in the
  // form (the name field, the confirm button itself before its own submit).
  handlers.click({ target: target('name'), preventDefault() {} });

  assert.equal(form.resets, 0, 'no reset ran');
  assert.equal(details.open, true, 'the form is still open');
  assert.equal(steps.sure.hidden, false, 'still on the confirm step');
});

test("a click on Cancel outside any form.confirm at all is left alone (nothing to close)", () => {
  const handlers = installed();
  const { target } = aConfirmForm();

  // `closest('form.confirm')` finds nothing: the press is a `.cancel` that
  // belongs to some other region entirely.
  assert.doesNotThrow(() => handlers.click({ target: target('cancel', true), preventDefault() {} }));
});

test("another form's submit is left alone: no preventDefault, no step touched", () => {
  const handlers = installed();
  const otherForm = {
    matches: (selector) => selector === 'form.dismiss',
    querySelector() {
      throw new Error('confirm.mjs has no business reading a form it does not own');
    },
  };
  let prevented = false;

  handlers.submit({ target: otherForm, preventDefault: () => (prevented = true) });

  assert.equal(prevented, false, 'the browser is left to post it as it normally would');
});

/**
 * Continue on the one seam (handoff-failed-confirm L1): its controls are the confirm row, play is the trigger, and the
 * switch form around them is a `form.confirm` the older path must leave to it.
 */
const aContinueRow = () => {
  const sure = { hidden: true };
  const confirm = { focused: 0, focus() { this.focused += 1; } };
  const row = {
    attrs: new Set(),
    toggleAttribute(name, on) { if (on) this.attrs.add(name); else this.attrs.delete(name); },
    querySelector: (selector) => ({ '.step.sure': sure, '.step.sure [type="submit"]': confirm })[selector] ?? null,
  };
  const trigger = {
    isConnected: true,
    focused: 0,
    focus() { this.focused += 1; },
    matches: (selector) => selector === '[data-confirm]',
    closest: (selector) => (selector === '[data-confirm-row]' ? row : null),
  };
  const form = { matches: (selector) => selector === 'form.confirm', querySelector: (selector) => (selector === '.step.sure' ? sure : null) };
  const play = () => ({ target: form, submitter: trigger, preventDefault() {} });
  const press = (onConfirm) => ({ target: { closest: (selector) => (selector === '.step.sure [type="submit"]' && onConfirm ? confirm : null) } });
  return { row, sure, trigger, confirm, play, press };
};

test('play blanks its row to the confirm step; a press anywhere but Confirm puts the row back', () => {
  const handlers = installed();
  const { row, sure, trigger, confirm, play, press } = aContinueRow();
  const first = handlers.submit(play());
  assert.equal(first.defaultPrevented, true, 'the first press posts nothing');
  assert.equal(row.attrs.has('data-confirming'), true, 'the row is taken over');
  assert.equal(sure.hidden, false);
  assert.equal(confirm.focused, 1, 'Confirm takes the focus');

  handlers.click(press(true));
  assert.equal(row.attrs.has('data-confirming'), true, 'Confirm leaves the takeover to its own submit');

  handlers.click(press(false));
  assert.equal(row.attrs.has('data-confirming'), false, 'any other press reverts the row');
  assert.equal(sure.hidden, true);
  assert.equal(trigger.focused, 1, 'and play has the focus back');
});

test('Escape reverts a taken row too', () => {
  const handlers = installed();
  const { row, play } = aContinueRow();
  handlers.submit(play());
  handlers.keydown({ key: 'Escape' });
  assert.equal(row.attrs.has('data-confirming'), false);
});

test('exactly one row confirms at a time: a second play puts the first row back', () => {
  const handlers = installed();
  const one = aContinueRow();
  const two = aContinueRow();
  handlers.submit(one.play());
  handlers.click(two.press(false));
  handlers.submit(two.play());
  assert.equal(one.row.attrs.has('data-confirming'), false, 'the first row is back');
  assert.equal(two.row.attrs.has('data-confirming'), true, 'the second confirms');
});

test("a popout's Cancel pressed while a row is taken still puts the popout away", () => {
  const handlers = installed();
  const row = aContinueRow();
  const popout = aConfirmForm();
  handlers.submit({ target: popout.form, preventDefault() {} });
  handlers.submit(row.play());
  handlers.click({ target: popout.target('cancel'), preventDefault() {} });
  assert.equal(row.row.attrs.has('data-confirming'), false, 'the row is put back');
  assert.equal(popout.details.open, false, 'and the popout closes on the same press');
  assert.equal(popout.form.resets, 1);
});

test('a row the deck redrew away is let go without touching it', () => {
  const handlers = installed();
  const { row, trigger, play, press } = aContinueRow();
  handlers.submit(play());
  trigger.isConnected = false;
  assert.doesNotThrow(() => handlers.click(press(false)));
  assert.equal(row.attrs.has('data-confirming'), true, 'the detached row is not touched');
  assert.equal(trigger.focused, 0, 'nor focused');
  assert.doesNotThrow(() => handlers.click(press(false)), 'and nothing is left taken');
});

// --- S3 of handoff-failed-confirm (spec 6, 7; L1, L5, A1): Close, dismiss, Remove, Start and End on the seam ----------

const REPO = path.resolve('D:/work/alpha');

const onPlatform = (t, platform) => {
  const original = Object.getOwnPropertyDescriptor(process, 'platform');
  Object.defineProperty(process, 'platform', { ...original, value: platform });
  t.after(() => Object.defineProperty(process, 'platform', original));
};

const rightStrip = (page) => page.slice(page.indexOf('<aside class="strip right">'), page.indexOf('</aside>', page.indexOf('strip right')));
const cut = (html, pattern) => html.match(pattern)?.[0] ?? '';
const panel = (kind) => new RegExp(`<details class="${kind}"[^>]*>.*?</details>`, 's');
/** A Close: the reply form it sits in and the close form it posts. */
const closeOf = (html) => cut(html, /<form method="post" action="\/reply"[^>]*>.*?<\/form>/s) + cut(html, /<form id="close-[^"]*".*?<\/form>/s);

/** Each of the five presses as the markup its page draws, with the route its Confirm posts. */
const fivePresses = (t) => {
  tempDeck(t);
  onPlatform(t, 'win32');
  const run = registerRun({ repo: REPO, pid: process.pid });
  const question = postItem({ kind: 'question', title: 'Which port?', body: '4321?', repo: REPO });
  const thread = createThread({ name: 'Tidy the docs', repo: REPO });
  const strip = (runs, wrapped = {}) => rightStrip(renderHomePage(listItems(), runs, REPO, false, listDeckNumbers(), {}, Date.now(), [], null, wrapped));
  const ended = { ...run, pid: 999999 };
  return [
    ['Close on a thread page', closeOf(renderThreadPage(question, listItems())), '/close'],
    ['Close on a card', cut(renderHomePage(listItems(), listStoredRuns(), REPO, true), new RegExp(`<div class="send"(?:(?!<div class="send").)*?<form id="close-${thread.id}".*?</form>`, 's')), '/close'],
    ['dismiss a run', cut(renderDeckPage(listItems(), listRuns()), /<li[^>]*>(?:(?!<li).)*?<form class="dismiss".*?<\/li>/s), '/dismiss'],
    ['Remove deck', cut(strip([ended]), panel('remove')), '/remove-deck'],
    ['Start', cut(strip([ended]), panel('session')), '/start-session'],
    ['End', cut(strip([run], { [repoKey(REPO)]: true }), panel('session')), '/end-session'],
  ];
};

test('Close, dismiss, Remove, Start and End each render a trigger and one .sure', (t) => {
  for (const [press, html] of fivePresses(t)) {
    assert.ok(html, `${press}: drawn`);
    assert.equal(html.match(/ data-confirm[ >]/g)?.length, 1, `${press}: one trigger`);
    assert.equal(html.match(/ data-confirm-row[ >]/g)?.length, 1, `${press}: in one confirm row`);
    assert.equal(html.match(/<div class="step sure" hidden>/g)?.length, 1, `${press}: one confirm step, hidden`);
    assert.match(html, /<div class="step sure" hidden><p>[^<]+<\/p><button type="submit"[^>]*>Confirm<\/button><\/div>/, `${press}: a sentence and Confirm`);
  }
});

test('none of them draws a .no, a Yes or a Cancel', (t) => {
  for (const [press, html] of fivePresses(t)) {
    assert.doesNotMatch(html, /class="(no|ask|cancel|next)"|>Yes<|>Cancel<|>No</, `${press}: the seam is its only confirmation`);
    assert.doesNotMatch(html, /class="[^"]*\bconfirm\b/, `${press}: no form.confirm and no .confirm span`);
  }
});

test('Create still draws its own name-then-confirm with Cancel', (t) => {
  tempDeck(t);
  registerRun({ repo: REPO, pid: process.pid });
  const create = cut(rightStrip(renderHomePage(listItems(), listStoredRuns(), REPO, false, listDeckNumbers(), {}, Date.now())), panel('create'));
  assert.match(create, /<form class="create confirm" method="post" action="\/create" data-in-place="move">/);
  assert.match(create, /<div class="step name">.*<button type="submit" class="next">Next<\/button><button type="button" class="cancel">Cancel<\/button><\/div>/s);
  assert.match(create, /<div class="step sure" hidden>.*<button type="submit">Create<\/button><button type="button" class="cancel">Cancel<\/button><\/div>/s);
  assert.doesNotMatch(create, /data-confirm/, 'Create is not on the seam (A1)');
});

test("the trigger's first press posts nothing; Confirm posts the form's own route", (t) => {
  for (const [press, html, route] of fivePresses(t)) {
    const { document, fetched, trigger, row, sure, confirm } = aPage(html);
    document.press(trigger);
    assert.deepEqual(document.navigations, [], `${press}: the first press posts nothing`);
    assert.ok(row.hasAttribute('data-confirming'), `${press}: the row blanks to its confirm`);
    assert.equal(sure.hidden, false, `${press}: the sentence and Confirm show`);
    document.press(confirm);
    assert.deepEqual(fetched.map(({ target }) => target), [route], `${press}: Confirm posts ${route}, once`);
    assert.deepEqual(document.navigations, [], `${press}: in place`);
  }
});
