/**
 * The walkthrough of 2026-09-19: "whenever i press one of the preselected
 * options for a thread from the deck, it jumps me back to the top of the page".
 *
 * A card's options have posted the deck's own `/reply` form since S7, and the
 * 303 that brings the user back to the page they pressed on (D7) is still a
 * page load: the browser drops the scroll and puts them at the top of a queue
 * they had scrolled down. Every other change on the deck stopped reloading the
 * page in S1; the reply the user sends themselves was the one left.
 *
 * So an option press goes over `fetch`, and nothing about the page is redrawn
 * here: the deck announces the change it always announced and the in-place
 * swap (`live.test.mjs`) does the drawing. What this file is about is which
 * submissions are taken over, what is sent when one is, and what happens when
 * the deck does not take it.
 *
 * The script is installed through `loadPage` against the least DOM it touches, the way
 * `live.test.mjs` and `resize.test.mjs` run it.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { KIND_GATE1, KIND_GATE2, NOT_YET, SIGN_OFF, TEACH_ME } from '../items.mjs';
import { aSandbox, freePort, loadPage } from '../testUtils.mjs';
import { renderHomePage, renderThreadPage } from '../ui/render.mjs';
import { aPage as aConfirmPage, formIn } from './confirm-sandbox.mjs';

// A port of this file's own, never one a scratch deck might hold.
const PORT = await freePort();

const UI = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'ui');
const uiFile = (name) => fs.readFileSync(path.join(UI, name), 'utf8');

// --- the least DOM a submission touches ------------------------------------

/** A form field, as `render.mjs` writes one: a name and a value, nothing else. */
const aField = (name, value) => ({ name, value });

/** A box, which a press carries along when there is something typed in it. */
const aBox = (value = '') => ({ name: 'text', value });

/**
 * One of the deck's forms. `getAttribute('action')` and not `action`, because
 * the attribute is what `render.mjs` wrote and the property is the absolute URL
 * the browser resolved it to.
 */
const aForm = (action, { fields = [], boxes = [] } = {}) => ({
  submitted: 0,
  added: [],
  getAttribute: (name) => (name === 'action' ? action : null),
  // The item this form answers, which is how the script remembers the answer it
  // sent under the id it sent it on (spec 18). Answered from the form's own
  // fields, so a form built without an `id` has none to give — the same as the
  // dismissal forms, which carry a run's id and never an item's.
  querySelector(selector) {
    if (selector !== 'input[name="id"]') return null;
    return fields.find((field) => field.name === 'id') ?? null;
  },
  querySelectorAll(selector) {
    if (selector === 'input[name], textarea[name]') return fields.concat(boxes);
    if (selector === 'textarea') return boxes;
    return [];
  },
  appendChild(node) {
    this.added.push(node);
  },
  submit() {
    this.submitted += 1;
  },
});

/**
 * A button in a `.choices` row: what it posts, whether it has been let go of,
 * and the two things spec 18 moves the moment it is pressed — the mark saying
 * it is the one that was sent, and whether it still takes a press.
 */
function aChoice(value, name = 'choice', marks = []) {
  const button = {
    name,
    value,
    blurred: 0,
    disabled: false,
    hidden: false,
    marked: marks.slice(),
    classList: {
      add: (mark) => {
        if (!button.marked.includes(mark)) button.marked.push(mark);
      },
      remove: (mark) => {
        button.marked = button.marked.filter((one) => one !== mark);
      },
      contains: (mark) => button.marked.includes(mark),
    },
    // A button standing on its own, until `aChoiceRow` puts it in one.
    closest: () => null,
    blur() {
      button.blurred += 1;
    },
  };
  return button;
}

/**
 * The row the options stand in, which is what a press disables (spec 18). The
 * buttons come back rather than the row, because the row is only ever reached
 * the way `reply.mjs` reaches it: from the button that was pressed.
 */
function aChoiceRow(values) {
  // A value is the option's words, or those words and the class the deck's own
  // button carries, such as `teach`.
  const buttons = values.map((value) =>
    typeof value === 'string' ? aChoice(value) : aChoice(value.value, 'choice', value.marks),
  );
  const row = { querySelectorAll: (selector) => (selector === 'button' ? buttons : []) };
  for (const button of buttons) button.closest = (selector) => (selector === '.choices' ? row : null);
  buttons.row = row;
  return buttons;
}

/** A live region the pressed button is inside, which is what makes it busy. */
const aRegion = (live, html, holding = null) => ({
  dataset: { live },
  innerHTML: html,
  querySelectorAll: () => [],
  contains: (node) => node === holding,
});

/** What the deck answers a reply it took: a 303 left unfollowed. */
const TOOK_IT = { type: 'opaqueredirect', ok: false, status: 0 };

/** And what it answers one it refused. */
const REFUSED = { type: 'basic', ok: false, status: 403 };

function aPage(regions = [], { url = 'http://127.0.0.1:4322/' } = {}) {
  const listeners = {};
  const sse = {};
  const calls = [];
  const pages = [];

  const document = {
    activeElement: null,
    querySelectorAll: (selector) => (selector === '[data-live]' ? regions : []),
    // The EVERYTHING toggle, which a swap syncs from the page it fetched: no
    // page here has one, and a page without one is left alone.
    querySelector: () => null,
    addEventListener(type, handler) {
      (listeners[type] ??= []).push(handler);
    },
    createElement: (tag) => ({ tag }),
  };

  const sandbox = aSandbox({
    document,
    location: { href: url },
    fetch: (target, options) =>
      new Promise((resolve) => {
        calls.push({ target, options, resolve });
      }),
    DOMParser: function DOMParser() {
      this.parseFromString = (body) => ({
        // Any other selector is asked of the page's regions, which is where its forms stand.
        querySelectorAll: (selector) => {
          const regions = pages[Number(body.split(' ')[1])];
          return selector === '[data-live]' ? regions : regions.flatMap((region) => region.querySelectorAll(selector));
        },
        querySelector: () => null,
      });
    },
    EventSource: function EventSource() {
      this.addEventListener = (type, handler) => {
        sse[type] = handler;
      };
    },
  });

  loadPage(sandbox);

  const settled = async () => {
    await new Promise((resolve) => setImmediate(resolve));
    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setImmediate(resolve));
  };

  return {
    calls,
    /** The one the option press started, which is the last one out. */
    get sent() {
      return calls[calls.length - 1];
    },
    /**
     * A press on a button in a form, the way the browser reports one — and with
     * the focus a browser gives the button it is pressing, since `blur()` giving
     * it back is what lets a skipped region be taken.
     */
    press(form, pressed) {
      const event = { target: form, submitter: pressed, prevented: 0 };
      event.preventDefault = () => {
        event.prevented += 1;
      };
      if (pressed && typeof pressed.blur === 'function') {
        document.activeElement = pressed;
        const own = pressed.blur.bind(pressed);
        pressed.blur = () => {
          own();
          document.activeElement = null;
        };
      }
      for (const handler of listeners.submit ?? []) handler(event);
      return event;
    },
    /** A press on something that is not a submit button — the `No` on a sign-off's question. */
    click(target) {
      const event = { target, button: 0, prevented: 0 };
      event.preventDefault = () => {
        event.prevented += 1;
      };
      for (const handler of listeners.click ?? []) handler(event);
      return event;
    },
    /** The deck answers the request the press started. */
    async answers(response, which = calls.length - 1) {
      calls[which].resolve(response);
      await settled();
    },
    /** The daemon says something moved, and answers the page the browser then asks for. */
    async changed(fresh) {
      assert.ok(sse.changed, '`live.mjs` never subscribed to the change event');
      sse.changed({});
      const asked = calls.length - 1;
      calls[asked].resolve({
        ok: true,
        text: () => Promise.resolve(`page ${pages.push(fresh) - 1}`),
      });
      await settled();
    },
  };
}

/** The fields a card's form carries: the item it is about, and the page it is on. */
const aCardForm = (boxes = []) =>
  aForm('/reply', { fields: [aField('id', 'itm_1'), aField('back', '/?run=D:\\work')], boxes });

const bodyOf = (call) => Object.fromEntries(new URLSearchParams(call.options.body));

// --- an option press is sent, and the page stays where it is ---------------

test('an option pressed on a card is sent in place, and the browser goes nowhere', async () => {
  const page = aPage();
  const form = aCardForm();
  const pressed = aChoice('4321');

  const event = page.press(form, pressed);

  assert.equal(event.prevented, 1, 'the form submission the browser was about to do is called off');
  assert.equal(form.submitted, 0, 'and nothing submits it by hand either');
  assert.equal(page.sent.target, '/reply', 'the reply goes to the route the form named');
  assert.equal(page.sent.options.method, 'POST');
  assert.equal(page.sent.options.redirect, 'manual', 'the 303 is not a browser going anywhere');
  assert.equal(
    page.sent.options.headers['content-type'],
    'application/x-www-form-urlencoded',
    'the same encoding the form itself would have posted',
  );
  assert.deepEqual(bodyOf(page.sent), {
    id: 'itm_1',
    back: '/?run=D:\\work',
    choice: '4321',
    // Every field the form would have sent, and the button that was pressed.
  });
});

test('a press carries what was typed beside it, because the user meant both', async () => {
  const page = aPage();
  const box = aBox('4317, and here is why');
  const form = aCardForm([box]);

  page.press(form, aChoice('4321'));

  assert.deepEqual(bodyOf(page.sent), {
    id: 'itm_1',
    back: '/?run=D:\\work',
    text: '4317, and here is why',
    choice: '4321',
  });

  await page.answers(TOOK_IT);

  assert.equal(box.value, '', 'and the box it was sent from is emptied, as a reloaded page would be');
});

// --- spec 18: the press is answered before the deck is ---------------------

test('an option pressed on a card is marked as sent the moment it is pressed', () => {
  const page = aPage();
  const [picked, other] = aChoiceRow(['4321', '4317']);

  page.press(aCardForm(), picked);

  // Nothing has answered yet: the request is still in flight and no change has
  // arrived, which is exactly the moment spec 18 is about — the user should
  // not be left wondering whether the click landed.
  assert.equal(page.calls.length, 1, 'the reply has not come back');
  assert.deepEqual(picked.marked, ['sent'], 'the option the user picked says so');
  assert.equal(picked.disabled, true, 'and it cannot be pressed a second time');
  assert.equal(other.disabled, true, 'nor can the answer beside it');
  assert.deepEqual(other.marked, [], 'which is not the same as saying it was sent');
});

test('a press the deck refuses still posts the form, mark and all', async () => {
  const page = aPage();
  const form = aCardForm();
  const [picked] = aChoiceRow(['4321']);

  page.press(form, picked);
  await page.answers(REFUSED);

  // The option is carried as a field of the form's own, so a disabled button
  // takes nothing away from the post the user then reads the refusal from.
  assert.equal(form.submitted, 1);
  assert.deepEqual(form.added, [{ tag: 'input', type: 'hidden', name: 'choice', value: '4321' }]);
});

// --- spec 5 of handoff-failed-confirm: a verdict confirms in place, a question does not -----------------
// Pressed through `confirm.mjs`, `reply.mjs` and `escape.mjs` together over the markup `render.mjs` draws.

const anOption = (kind, options) => ({
  id: `itm_${kind}`, kind, title: `A ${kind}`, body: 'The evidence.', postedAt: '2026-10-10 09:00', options, repo: 'D:/work/pilot',
});

/** An item's reply form on its card and on its thread page, each with the scripts installed. */
const pagesOf = (item) => [
  [`${item.kind} card`, aConfirmPage(formIn(renderHomePage([item], [])))],
  [`${item.kind} page`, aConfirmPage(formIn(renderThreadPage(item)))],
];

test("a question's options are not triggers and send in one press", () => {
  for (const [where, page] of pagesOf(anOption('question', ['4321', String(PORT)]))) {
    const { document, fetched } = page;
    // A question's thread page has Close beside Reply, a trigger of its own (S3); its options are none.
    const option = document.root.querySelector('button[name="choice"]');
    assert.equal(document.root.querySelector('[data-confirm][name="choice"]'), null, `${where}: no trigger`);
    assert.equal(option.closest('[data-confirm-row]'), null, `${where}: and no confirm row`);
    document.press(option);
    assert.equal(fetched.length, 1, `${where}: one press sends`);
    assert.equal(fetched[0].body.choice, '4321', `${where}: the option pressed`);
    assert.deepEqual(document.navigations, [], `${where}: with no page load`);
  }
});

test('Confirm on a gate sends the pressed option with the typed text joined', () => {
  let typed = 0;
  for (const item of [anOption(KIND_GATE1, [SIGN_OFF, NOT_YET]), anOption(KIND_GATE2, [SIGN_OFF, NOT_YET]), anOption('signoff', ['satisfied'])]) {
    for (const option of item.options) {
      for (const [where, page] of pagesOf(item)) {
        const { document, fetched } = page;
        const trigger = document.root.querySelectorAll('[data-confirm]').find((button) => button.value === option);
        // A card has no reply box; a thread page has one, and what is typed in it goes too.
        const box = document.root.querySelector('textarea');
        if (box) {
          box.value = 'checked on the preview';
          typed += 1;
        }
        document.press(trigger);
        assert.deepEqual(fetched, [], `${where} ${option}: the first press sends nothing`);
        assert.equal(trigger.classList.contains('sent'), false, `${where} ${option}: and marks nothing sent`);
        assert.ok(trigger.closest('[data-confirm-row]').hasAttribute('data-confirming'), `${where} ${option}: its row confirms`);
        document.press(document.activeElement);
        assert.equal(fetched.length, 1, `${where} ${option}: Confirm sends once`);
        assert.equal(fetched[0].target, '/reply', `${where} ${option}: to the reply route`);
        assert.equal(fetched[0].body.choice, option, `${where} ${option}: the option pressed`);
        assert.ok(trigger.classList.contains('sent'), `${where} ${option}: the option reads as sent`);
        assert.ok(document.root.querySelectorAll('.choices button').every((button) => button.disabled), `${where} ${option}: and the row is locked`);
        assert.equal(fetched[0].body.text, box ? 'checked on the preview' : undefined, `${where} ${option}: with the typed text`);
        assert.deepEqual(document.navigations, [], `${where} ${option}: and no page load`);
      }
    }
  }
  assert.equal(typed, 5, 'every thread page had text typed beside its trigger');
});

test("a gate's Teach me sends in one press", () => {
  for (const [where, page] of pagesOf(anOption(KIND_GATE1, [SIGN_OFF, NOT_YET]))) {
    const { document, fetched } = page;
    document.press(document.root.querySelectorAll('button[name="choice"]').find((button) => button.value === TEACH_ME));
    assert.equal(fetched.length, 1, `${where}: one press sends`);
    assert.equal(fetched[0].body.choice, TEACH_ME, `${where}: the teaching asked for`);
  }
});

test('a reply typed into the box is marked by nothing: the press this is about is an option', () => {
  const page = aPage();
  const [option] = aChoiceRow(['4321']);

  page.press(aCardForm([aBox('the whole answer, typed')]), { name: 'submit', value: '' });

  assert.deepEqual(option.marked, [], 'the row is left alone');
  assert.equal(option.disabled, false, 'and still takes a press, because none was made');
});

test('a reply typed into the box still posts the form, and lands on its anchor', () => {
  const page = aPage();
  const form = aCardForm([aBox('the whole answer, typed')]);

  // No submitter is the `Reply` button at the end of the form, which carries no
  // `choice`: its 303 goes to the thread's own `#reply`, under the newest
  // message, which is where the user was reading.
  const typed = page.press(form, { name: 'submit', value: '' });
  const bare = page.press(form, null);

  assert.equal(typed.prevented, 0, 'the browser posts it the way it always did');
  assert.equal(bare.prevented, 0);
  assert.equal(page.calls.length, 0, 'and nothing is sent behind its back');
});

test('a form that is not the reply route is left entirely alone', () => {
  const page = aPage();
  const dismissal = aForm('/dismiss', { fields: [aField('id', 'run_1')] });

  const event = page.press(dismissal, aChoice('yes'));

  assert.equal(event.prevented, 0, 'dismissing a run is a navigation, and stays one');
  assert.equal(page.calls.length, 0);
});

// --- the bar moves without the user having to click anything --------------

test('the change the deck announces is taken once the pressed button is let go of', async () => {
  const pressed = aChoice('4321');
  const queue = aRegion('queue', '<article>posted</article>', pressed);
  const page = aPage([queue]);

  page.press(aCardForm(), pressed);
  // The deck stores the reply and announces it while the button still has the
  // focus, so the queue is a region `apply` skips: the card would sit there
  // reading `posted` until the user clicked somewhere else.
  await page.changed([aRegion('queue', '<article>not picked up yet</article>')]);

  assert.equal(queue.innerHTML, '<article>posted</article>', 'skipped, because the press is in it');

  await page.answers(TOOK_IT, 0);

  assert.equal(pressed.blurred, 1, 'the button is let go of');
  assert.equal(
    queue.innerHTML,
    '<article>not picked up yet</article>',
    'and the bar the user is watching moves, with nothing else pressed',
  );
});

test('a change that arrives after the answer needs no settling of its own', async () => {
  const pressed = aChoice('4321');
  const queue = aRegion('queue', '<article>posted</article>', pressed);
  const page = aPage([queue]);

  page.press(aCardForm(), pressed);
  await page.answers(TOOK_IT);
  await page.changed([aRegion('queue', '<article>not picked up yet</article>')]);

  assert.equal(queue.innerHTML, '<article>not picked up yet</article>');
});

// --- and when the deck does not take it ------------------------------------

test('a press the deck refuses is posted for real, so the user reads the refusal', async () => {
  const page = aPage();
  const form = aCardForm();
  const pressed = aChoice('4321');

  page.press(form, pressed);
  await page.answers(REFUSED);

  assert.equal(form.submitted, 1, 'the browser posts it, and shows what the deck says back');
  assert.deepEqual(
    form.added,
    [{ tag: 'input', type: 'hidden', name: 'choice', value: '4321' }],
    'with the option that was pressed, which `form.submit()` does not carry by itself',
  );
});

test('a press that never reaches the deck is posted for real too', async () => {
  const page = aPage();
  const form = aCardForm();

  page.press(form, aChoice('Teach me'));
  page.calls[0].resolve(Promise.reject(new Error('the daemon went away')));
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(form.submitted, 1, 'a reply that vanishes without a word is the one thing worse');
});

// --- spec 5: the reply box stays in reach (L10) -----------------------------

/**
 * L10: the slot the reply form lives in sticks on the same idiom as the header
 * (`body[data-item] header` in `deck.css`), so no swap can undo it — the swap
 * only ever replaces what is inside the reply slot, never the slot itself.
 * CSS only; the page's script carries nothing about scrolling.
 *
 * The selector is single-quoted in `deck.css` itself (`live.test.mjs`'s own
 * page-wide scan for `data-live="…"`, double-quoted, would otherwise read the
 * rule — inlined into every page — as a second reply region); matched here
 * with a regex that does not care which quote the file uses.
 */
test("the reply slot sticks to the bottom of the viewport on the header's own idiom", () => {
  const css = uiFile('deck.css');
  const rule = /body\[data-item\] \[data-live=['"]reply['"]\] \{([^}]*)\}/.exec(css);

  assert.ok(rule, 'the rule for the reply slot exists in deck.css');
  const body = rule[1];

  assert.match(body, /position: sticky/, 'the slot sticks, the same idiom the header above already uses');
  assert.match(body, /bottom: 0/, 'stuck to the bottom of the viewport, not the top');
  assert.match(body, /background: Canvas/, 'so the thread scrolling under it does not show through');
  assert.match(
    body,
    /border-top/,
    'and a line marks where it sits over the thread',
  );
});

// --- a ticket's arrows move it in place (Gate 2 of ticket-making) ----------------
// "every time i rearrange one of the tickets, the page reloads. i want it to feel
// smoother." The arrows post `/move` over `fetch`, as an option press posts
// `/reply`, and the change the deck announces redraws the tickets panel.

const aMoveForm = () =>
  aForm('/move', { fields: [aField('id', 'itm_1'), aField('back', '/?run=D:\\work')] });

test("a ticket's arrow is sent in place, and the browser goes nowhere", () => {
  const page = aPage();
  const form = aMoveForm();
  const event = page.press(form, aChoice('up', 'direction'));

  assert.equal(event.prevented, 1, 'the page load the browser was about to do is called off');
  assert.equal(form.submitted, 0);
  assert.equal(page.sent.target, '/move');
  assert.equal(page.sent.options.method, 'POST');
  assert.equal(page.sent.options.redirect, 'manual');
  assert.deepEqual(bodyOf(page.sent), { id: 'itm_1', back: '/?run=D:\\work', direction: 'up' });
});

test('a move the deck refuses is posted for real, so the user reads the refusal', async () => {
  const page = aPage();
  const form = aMoveForm();
  page.press(form, aChoice('down', 'direction'));
  await page.answers(REFUSED);

  assert.equal(form.submitted, 1);
  assert.deepEqual(form.added.map(({ name, value }) => [name, value]), [['direction', 'down']]);
});

test('a move the deck took lets go of the arrow, so the redraw is taken', async () => {
  const page = aPage();
  const pressed = aChoice('up', 'direction');
  const form = aMoveForm();
  page.press(form, pressed);
  await page.answers(TOOK_IT);

  assert.equal(form.submitted, 0, 'nothing is posted for real');
  assert.equal(pressed.blurred, 1, 'the arrow lets go of the focus a live region would be skipped for');
});

// --- a lesson's trial press (ADR 0053): the deck's own drawing wins once it has the answer ---

/** A region on a fetched page holding one item's form, its option row drawn as the deck drew it. */
const aFreshCard = (live, id, values) => {
  const buttons = aChoiceRow(values);
  const form = {
    querySelector: (selector) => {
      if (selector === 'input[name="id"]') return aField('id', id);
      if (selector === '.choices') return buttons.row;
      return null;
    },
  };
  return { region: { ...aRegion(live, `<article>${id}</article>`), querySelectorAll: (selector) => (selector.startsWith('form[action="/reply"]') ? [form] : []) }, buttons };
};

test('a press is put back on a page fetched while it is in flight, and not once the deck has it', async () => {
  const pressed = aChoiceRow(['Postgres', 'SQLite'])[1];
  const queue = aRegion('queue', '<article>posted</article>', pressed);
  const page = aPage([queue]);

  page.press(aCardForm(), pressed);
  const early = aFreshCard('queue', 'itm_1', ['Postgres', 'SQLite']);
  await page.changed([early.region]);
  assert.ok(early.buttons.every((button) => button.disabled), 'in flight, the row stays taken (spec 18)');

  await page.answers(TOOK_IT, 0);
  const later = aFreshCard('queue', 'itm_1', ['Postgres', 'SQLite']);
  await page.changed([later.region]);
  assert.ok(
    later.buttons.every((button) => !button.disabled),
    'once taken, the row is as the deck drew it: a lesson the teacher answered can be tried again',
  );
});
