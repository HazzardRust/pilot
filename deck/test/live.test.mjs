/**
 * Slice S1 of deck-usability: every page updates in place and never reloads.
 *
 * Spec 1 is the whole reason this feature exists — "a half-typed reply keeps
 * its text, its caret and the page's scroll position when the deck receives a
 * new item" — and the three refresh behaviours it replaces (the home reload,
 * the thread's `reloadOwed` dance and the `sessionStorage` draft) all worked by
 * throwing the page away and putting something back. Nothing put back is the
 * caret, so the test below is about what is *not* touched: the region holding
 * the box is never replaced, which is how the text, the caret, the selection
 * and the scroll survive together rather than one save-and-restore each (D1).
 *
 * The page's script runs in a browser and this suite has none, and the deck has one
 * dependency and is not getting a second for a DOM (A3, D8). So the script is
 * installed through `loadPage` against the least DOM it touches: the regions it swaps, the
 * element the browser says has focus, and the listeners it registers. That
 * exercises the rule the slice is judged on — which region is skipped, and when
 * it is taken — rather than a browser's implementation of `innerHTML`. What a
 * real browser has to confirm is that a caret sitting in an untouched textarea
 * is a caret that has not moved, and that is the slice's live gate.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { aSandbox, freePort, loadPage } from '../testUtils.mjs';
import { install as installLive } from '../ui/js/live.mjs';
import { install as installNavigate } from '../ui/js/navigate.mjs';

// A port of this file's own, never one a scratch deck might hold.
const PORT = await freePort();

const { renderDeckPage, renderHomePage, renderThreadPage } = await import('../ui/render.mjs');

const UI = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'ui');

const uiFile = (name) => fs.readFileSync(path.join(UI, name), 'utf8');

// --- the least DOM the page's script touches ---------------------------------------

/**
 * A live region: what is inside it, and the textarea it may be holding. Real
 * regions hold whole subtrees; the two questions the script asks one are "is
 * the focused element in here" and "is there text in a box in here", so those
 * are the two a stand-in has to be able to answer.
 */
const aRegion = (live, html, textarea = null) => ({
  dataset: { live },
  innerHTML: html,
  querySelectorAll(selector) {
    return selector === 'textarea' && textarea ? [textarea] : [];
  },
  contains(node) {
    return node === this || (node !== null && node === textarea);
  },
});

const aBox = (value = '') => ({ value });

/**
 * The Chat bookmark `chat.mjs` looks for, wrapping the live region a test
 * built with `aChatPanel(...)`: opening it and scrolling it to its
 * `scrollHeight` are both proved against the same object the swap writes
 * `innerHTML` onto, exactly as a real `<details>` and the `.panel` inside it
 * are the same two elements across a swap.
 */
const aChatBookmark = (region, open = true) => ({
  id: 'chat',
  open,
  querySelector: (selector) => (selector === '[data-live="chat"]' ? region : null),
  addEventListener() {},
});

/**
 * The chat panel as a live region, with the two numbers a real browser's
 * layout gives it for free that a stand-in has to be told: the `scrollHeight`
 * a swap to a given HTML string leaves it at (`declare`), and the
 * `scrollTop` a test reads back once `chat.mjs` has had its say. A real
 * `.panel`'s `scrollHeight` grows the moment taller `innerHTML` lands on it;
 * this is the same fact, named up front rather than laid out and measured.
 */
const aChatPanel = (html, height, { clientHeight = 200, box = null } = {}) => {
  const heights = new Map([[html, height]]);
  // The byline's `<time>`, which `time.mjs` finds by `time[datetime]` and
  // rewrites as "n min ago" (hand it to `aPage` as one of its `times`). Its
  // text is part of what the panel's `innerHTML` reads back, as in a browser,
  // so a panel that has been stamped never equals the server's fresh HTML,
  // which still says the ISO instant (F4). A swap puts the server's text back.
  //
  // The instant is longer than `n min ago` and wraps its byline, so stamping
  // a swapped panel shortens the lines above the reader, and a browser's
  // scroll anchoring moves `scrollTop` up by as much to keep the line in view
  // (41px, measured on 2026-09-30). A position restored before `stamp()` is
  // moved by it; one restored after is not.
  let text = SENT;
  const time = {
    dataset: {},
    parentNode: null,
    get textContent() {
      return text;
    },
    set textContent(value) {
      if (text === SENT && value !== SENT && panel.scrollTop > 0) panel.scrollTop -= ANCHORED;
      text = value;
    },
    getAttribute: (name) => (name === 'datetime' ? SENT : null),
  };
  const panel = {
    dataset: { live: 'chat' },
    scrollTop: 0,
    scrollHeight: height,
    clientHeight,
    time,
    _html: html,
    get innerHTML() {
      return panel._html.split(`>${SENT}</time>`).join(`>${time.textContent}</time>`);
    },
    set innerHTML(value) {
      panel._html = value;
      text = SENT;
      if (heights.has(value)) panel.scrollHeight = heights.get(value);
      // A browser clamps a scroll the new content is too short to hold.
      panel.scrollTop = Math.min(panel.scrollTop, Math.max(0, panel.scrollHeight - clientHeight));
    },
    querySelectorAll: (selector) => (selector === 'textarea' && box ? [box] : []),
    contains: (node) => node !== null && node === box,
  };
  panel.declare = (freshHtml, freshHeight) => heights.set(freshHtml, freshHeight);
  return panel;
};

/** How far a browser's scroll anchoring moved a restored chat panel once `stamp()` shortened its bylines. */
const ANCHORED = 41;

/** When every chat message below was sent, as the server writes it into the `<time>`. */
const SENT = '2026-09-30T09:00:00.000Z';

/** A chat message as `renderMessage` draws it: a byline carrying its stamp, then the text. */
const aMessage = (text) => `<div class="reply md"><span class="who">you · <time datetime="${SENT}">${SENT}</time></span><p>${text}</p></div>`;

/**
 * A link the script may answer a press on: one of the strip's, or the
 * EVERYTHING toggle. `closest` is the only way the script looks at what was
 * pressed, so a stand-in answers that and its href — and answers it only for a
 * query that really names it, which is what makes the script's own selector
 * part of what these tests check.
 */
const aLink = (href, selector) => {
  const link = {
    getAttribute: (name) => (name === 'href' ? href : null),
    closest: (query) => (query.split(',').some((part) => part.trim() === selector) ? link : null),
  };
  return link;
};

/**
 * A page with its script running on it, and the things a user and a daemon do
 * to one.
 *
 * The fetch each change starts is answered on the test's word rather than at
 * once, because the order two answers come back in is itself a guarantee here:
 * `announce()` fires the event and hands back the request it started, and
 * `deliver()` answers that request with a page. `changed()` is the two in the
 * ordinary order.
 */
function aPage(
  regions,
  {
    url = 'http://127.0.0.1:4322/thread/itm_1',
    toggle = null,
    times = [],
    chatBookmark = null,
    badges = null,
  } = {},
) {
  const listeners = {};
  const captured = {};
  const onWindow = {};
  const sse = {};
  const waiting = [];
  const answered = [];
  const freshToggles = [];
  const freshBadges = [];
  const pushed = [];
  const replaced = [];

  // The Tickets and Reports bookmarks' own `<summary>`, found by the same kind
  // of selector the real one is: a direct child of the bookmark's `id`,
  // outside the `[data-live]` panel beside it (`render.mjs`'s `renderTabSummary`).
  const badgeSummary = (selector, badgesOf) => {
    const match = /^#(tickets|reports) > summary$/.exec(selector);
    return match && badgesOf ? (badgesOf[match[1]] ?? null) : null;
  };

  const document = {
    activeElement: null,
    querySelectorAll: (selector) => {
      if (selector === '[data-live]') return regions;
      // Every stamp on the page, which the script reads as a distance from now
      // — or, for a day heading, as a calendar day (spec 35).
      if (selector === 'time[datetime]') return times;
      // The Chat bookmark `chat.mjs` looks for among the group, present only
      // where a test is about it (`chatBookmark`); every other test's page
      // carries none, exactly as a page naming no deck does.
      if (selector === 'details.tab') return chatBookmark ? [chatBookmark] : [];
      return [];
    },
    // The EVERYTHING toggle lives outside every live region, so a swap looks
    // for it by name rather than finding it among them; the two badges are
    // the same claim, one bookmark at a time.
    querySelector: (selector) => (selector === '.strip.right' ? toggle : badgeSummary(selector, badges)),
    // The phase is recorded as well as the handler: `toggle` does not bubble,
    // so a listener for one that is not on the way down hears nothing in a real
    // browser and everything here.
    addEventListener(type, handler, capture) {
      (listeners[type] ??= []).push(handler);
      (captured[type] ??= []).push(Boolean(capture));
    },
  };

  const sandbox = aSandbox({
    document,
    location: { href: url, pathname: new URL(url).pathname },
    // Moving the address is the browser's doing in a browser; here it is this,
    // and what it records is what a test reads back.
    history: {
      pushState(state, title, href) {
        pushed.push(href);
        sandbox.location.href = href;
      },
      replaceState(state, title, href) {
        replaced.push(href);
        sandbox.location.href = href;
      },
    },
    addEventListener(type, handler) {
      (onWindow[type] ??= []).push(handler);
    },
    fetch: (...args) => {
      sandbox.fetched.push(args);
      return new Promise((resolve) => {
        waiting.push((fresh, fresherToggle = null, fresherBadges = null) => {
          const body = `page ${answered.push(fresh) - 1}`;
          freshToggles[answered.length - 1] = fresherToggle;
          freshBadges[answered.length - 1] = fresherBadges;
          resolve({ ok: true, text: () => Promise.resolve(body) });
        });
      });
    },
    fetched: [],
    DOMParser: function DOMParser() {
      this.parseFromString = (body) => {
        const at = Number(body.split(' ')[1]);
        return {
          querySelectorAll: (selector) => {
            if (selector === '[data-live]') return answered[at];
            // The overview's run sections: inside the page's own regions, and
            // served shut.
            if (selector === 'details.run-section') {
              return answered[at].flatMap((region) => region.sections ?? []);
            }
            // The queue's days (spec 35), which are the third polarity again:
            // the server serves today's open and every earlier one shut.
            if (selector === 'details.day') {
              return answered[at].flatMap((region) => region.days ?? []);
            }
            // The forms a card answers in one click — a reply's option row, and
            // a dismissal (spec 27, amended) — inside the page's own regions,
            // and served with every option pressable, which is the opposite of
            // how an answered one has to arrive. The actions are read out of the
            // script's own selector rather than assumed here, so a script that
            // stopped asking for one of them would find nothing.
            if (selector.indexOf('form[action=') === 0) {
              const wanted = [...selector.matchAll(/form\[action="([^"]+)"\]/g)].map(([, one]) => one);
              return answered[at].flatMap((region) =>
                (region.forms ?? []).filter((form) => wanted.includes(form.getAttribute('action'))),
              );
            }
            return [];
          },
          querySelector: (selector) =>
            selector === '.strip.right' ? freshToggles[at] : badgeSummary(selector, freshBadges[at]),
        };
      };
    },
    EventSource: function EventSource(source) {
      sandbox.eventSource = source;
      this.addEventListener = (type, handler) => {
        sse[type] = handler;
      };
    },
  });

  loadPage(sandbox);

  // Long enough for the fetch's two `then`s (microtasks) and for the turn the
  // script defers a click's settle by (a timer), in that order.
  const settled = async () => {
    await new Promise((resolve) => setImmediate(resolve));
    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setImmediate(resolve));
  };

  /** Runs the handlers synchronously, the way the browser calls them, and nothing more. */
  const fire = (type, event) => {
    for (const handler of listeners[type] ?? []) handler(event);
  };

  return {
    sandbox,
    /** Every address the script has moved to without a navigation. */
    pushed,
    replaced,
    /** Which of the script's document listeners are on the way down. */
    captured,
    /**
     * The user folds a branch, or opens it again. The `<details>` shuts itself —
     * no handler of ours does it (L20) — and says so with a `toggle`.
     */
    fold(branch) {
      branch.open = false;
      fire('toggle', { target: branch });
    },
    unfold(branch) {
      branch.open = true;
      fire('toggle', { target: branch });
    },
    /**
     * A press on a link, delivered the way a browser delivers one — cancellable,
     * and with the modifier keys it would carry. The event comes back so a test
     * can ask whether the script took the press or left it to the browser.
     */
    press(link, modifiers = {}) {
      // A mouse press focuses the link it lands on, and `preventDefault` does
      // not undo that — so the focus is on the link while the swap runs, which
      // is the whole reason the script has to let go of it.
      document.activeElement = link;
      link.blur = () => {
        document.activeElement = null;
      };
      const event = {
        target: link,
        defaultPrevented: false,
        preventDefault() {
          event.defaultPrevented = true;
        },
        ...modifiers,
      };
      fire('click', event);
      return event;
    },
    /**
     * An option pressed on a card, delivered the way a browser delivers a
     * submit: the form is the target and the button pressed is the `submitter`,
     * which is the only way the script can tell which of the row's answers went
     * out. The press holds the focus, exactly as a link's does.
     */
    submit(form, pressed) {
      document.activeElement = pressed;
      const event = {
        target: form,
        submitter: pressed,
        defaultPrevented: false,
        preventDefault() {
          event.defaultPrevented = true;
        },
      };
      fire('submit', event);
      return event;
    },
    /** Back (or Forward): the address moves under the page, and nothing else does. */
    back(href) {
      sandbox.location.href = href;
      for (const handler of onWindow.popstate ?? []) handler({});
    },
    /** The daemon says something moved; the page goes and looks, and waits. */
    announce() {
      assert.ok(sse.changed, '`live.mjs` never subscribed to the change event');
      sse.changed({});
      return waiting.length - 1;
    },
    /** The page's stream reaches the daemon: once after load, and again after any drop. */
    connect() {
      assert.ok(sse.open, '`live.mjs` never listened for its stream opening');
      sse.open({});
      return waiting.length - 1;
    },
    /** The deck answers one of the requests in flight, with this page. */
    async deliver(request, fresh, freshToggle = null, freshBadgesOf = null) {
      waiting[request](fresh, freshToggle, freshBadgesOf);
      await settled();
    },
    /** A change announced and answered in the ordinary order. */
    async changed(fresh) {
      await this.deliver(this.announce(), fresh);
    },
    /** The browser moves focus, which is one of the events the script settles on. */
    async focus(node) {
      document.activeElement = node;
      fire('focusin', { target: node });
      await settled();
    },
    /**
     * A click on something that takes no focus, which fires no `focusin` at
     * all. Fires the handler and returns at once, without waiting for the
     * turn `live.mjs` defers its own settling to (`settleAfterClick` is that
     * wait, kept separate so a test can look at a region in between).
     */
    clickAway() {
      document.activeElement = null;
      fire('click', { target: null });
    },
    /** The turn a deferred click settles on. */
    async settleAfterClick() {
      await settled();
    },
    /** A key in the box. */
    async type(box, value) {
      box.value = value;
      fire('input', { target: box });
      await settled();
    },
  };
}

// --- spec 1: the half-typed reply ------------------------------------------

test('a change under a half-typed reply leaves the box alone and lands anyway (spec 1, D1)', async () => {
  const box = aBox('we should probably just delete i');
  const reply = aRegion('reply', '<form>the box</form>', box);
  const thread = aRegion('thread', '<pre>one message</pre>');
  const page = aPage([thread, reply]);

  await page.focus(box);
  await page.changed([
    aRegion('thread', '<pre>two messages</pre>'),
    aRegion('reply', '<form>a fresh box</form>'),
  ]);

  assert.equal(
    reply.innerHTML,
    '<form>the box</form>',
    'the region holding the caret was not replaced, which is how the caret stayed put',
  );
  assert.equal(box.value, 'we should probably just delete i', 'and the words with it');
  assert.equal(
    thread.innerHTML,
    '<pre>two messages</pre>',
    "the pilot's new message still arrived — a skipped region is not a skipped page",
  );
});

test('a live swap that redraws the chat panel scrolls it to its newest message', async () => {
  const chat = aChatPanel('<p>one message</p>', 400);
  const page = aPage([chat], { url: 'http://127.0.0.1:4322/', chatBookmark: aChatBookmark(chat) });

  const freshHtml = '<p>one message</p><p>a reply just landed</p>';
  chat.declare(freshHtml, 900); // taller now that a reply is in it
  await page.changed([aRegion('chat', freshHtml)]);

  assert.equal(chat.innerHTML, freshHtml);
  assert.equal(chat.scrollTop, 900, 'the panel followed the new message to the bottom');
});

test('a swap that leaves the chat panel unchanged does not fight a scroll the user made', async () => {
  const chat = aChatPanel('<p>one message</p>', 400);
  const page = aPage([chat], { url: 'http://127.0.0.1:4322/', chatBookmark: aChatBookmark(chat) });

  // The page opened at the bottom, as it always does; the user has since
  // scrolled up to reread something, after the page had already loaded.
  chat.scrollTop = 40;

  await page.changed([aRegion('chat', '<p>one message</p>')]);

  assert.equal(chat.scrollTop, 40, 'nothing changed in the panel, so nothing moved the scroll');
});

// --- the chat keeps its place (deck-polish S3, spec 3, F4, L5) ---------------------

test('a swap while scrolled up keeps the scroll position', async () => {
  const html = aMessage('one') + aMessage('two');
  const chat = aChatPanel(html, 900);
  const page = aPage([chat], { url: 'http://127.0.0.1:4322/', chatBookmark: aChatBookmark(chat), times: [chat.time] });

  assert.notEqual(chat.innerHTML, html, 'the stamp has rewritten the time, so the panel no longer equals the server');
  chat.scrollTop = 120; // the user scrolled up to reread something

  const freshHtml = html + aMessage('posted from another deck');
  chat.declare(freshHtml, 1100);
  await page.changed([aRegion('chat', freshHtml)]);

  assert.equal(chat.innerHTML.includes('posted from another deck'), true, 'the new message still arrived');
  assert.equal(chat.scrollTop, 120, 'and the view stayed where the reader had it');

  // And a refresh that brings nothing new, which is every refresh the rewritten
  // time used to turn into a swap and a jump to the bottom.
  await page.changed([aRegion('chat', freshHtml)]);
  assert.equal(chat.scrollTop, 120, 'a refresh with nothing new does not move it either');
});

test('a swap while at the bottom follows to the new bottom', async () => {
  const html = aMessage('one');
  const chat = aChatPanel(html, 900);
  const page = aPage([chat], { url: 'http://127.0.0.1:4322/', chatBookmark: aChatBookmark(chat), times: [chat.time] });

  chat.scrollTop = 700; // the bottom: 900 tall, 200 showing
  const freshHtml = html + aMessage('a reply just landed');
  chat.declare(freshHtml, 1300);
  await page.changed([aRegion('chat', freshHtml)]);

  assert.equal(chat.scrollTop, 1300, 'the panel followed the new message to the bottom');
});

test('a deferred swap applied on click keeps the position too', async () => {
  const box = aBox('');
  const html = aMessage('one') + aMessage('two');
  const chat = aChatPanel(html, 900, { box });
  const page = aPage([chat], { url: 'http://127.0.0.1:4322/', chatBookmark: aChatBookmark(chat), times: [chat.time] });

  chat.scrollTop = 120;
  await page.focus(box); // in the chat box, so the change is owed rather than swapped
  const freshHtml = html + aMessage('posted from another deck');
  chat.declare(freshHtml, 1100);
  await page.changed([aRegion('chat', freshHtml)]);
  assert.equal(chat.innerHTML.includes('posted from another deck'), false, 'owed while the user is in the box');

  page.clickAway();
  await page.settleAfterClick();

  assert.equal(chat.innerHTML.includes('posted from another deck'), true, 'taken once they left it');
  assert.equal(chat.scrollTop, 120, 'and the view stayed where the reader had it');
});

test('a region nobody is in is replaced the moment the deck changes', async () => {
  const queue = aRegion('queue', '<article>one card</article>');
  const page = aPage([queue], { url: 'http://127.0.0.1:4322/' });

  await page.changed([aRegion('queue', '<article>two cards</article>')]);

  assert.equal(queue.innerHTML, '<article>two cards</article>');
  assert.deepEqual(
    page.sandbox.fetched.map(([url]) => url),
    ['http://127.0.0.1:4322/'],
    'the page asked for its own URL and nothing else (D1)',
  );
});

// The walkthrough of 2026-09-27: a reply typed into the box posts and lands on a
// fresh page, and an answer written in the few milliseconds before that page's
// stream connected was announced to nobody, so it showed only on the next change.
test('an answer written before the page`s stream connected is read the moment it connects', async () => {
  const thread = aRegion('thread', '<pre>your reply</pre>');
  const page = aPage([thread]);

  await page.deliver(page.connect(), [aRegion('thread', '<pre>your reply</pre><pre>its answer</pre>')]);

  assert.equal(thread.innerHTML, '<pre>your reply</pre><pre>its answer</pre>');
});

test('a box with text in it is skipped even after the user has clicked away', async () => {
  const box = aBox('a draft they have not sent');
  const reply = aRegion('reply', '<form>the box</form>', box);
  const elsewhere = {};
  const page = aPage([reply]);

  await page.focus(box);
  await page.changed([aRegion('reply', '<form>a fresh box</form>')]);
  await page.focus(elsewhere);

  assert.equal(
    reply.innerHTML,
    '<form>the box</form>',
    'their unsent words outlive their attention; an empty box put back would be the reload again',
  );
});

test('the owed change is taken the moment the region goes clean (D1)', async () => {
  const box = aBox('half a reply');
  const reply = aRegion('reply', '<form>the box</form>', box);
  const elsewhere = {};
  const page = aPage([reply]);

  await page.focus(box);
  await page.changed([aRegion('reply', '<form>a fresh box</form>')]);
  await page.type(box, '');
  assert.equal(reply.innerHTML, '<form>the box</form>', 'still theirs while the caret is in it');

  await page.focus(elsewhere);

  assert.equal(reply.innerHTML, '<form>a fresh box</form>', 'empty and left: the change is taken');
});

/**
 * Two changes in quick succession are two fetches in flight at once, and the
 * deck answers them in whatever order it finishes them. The page must end up
 * showing the newer answer whichever one lands last, or a busy deck can leave
 * a region reading something the deck stopped saying — and worse, owing the
 * stale page to any region that was skipped.
 */
test('an answer that arrives late never overwrites a newer one (D1)', async () => {
  const queue = aRegion('queue', '<article>one card</article>');
  const page = aPage([queue], { url: 'http://127.0.0.1:4322/' });

  const first = page.announce();
  const second = page.announce();
  await page.deliver(second, [aRegion('queue', '<article>three cards</article>')]);
  await page.deliver(first, [aRegion('queue', '<article>two cards</article>')]);

  assert.equal(
    queue.innerHTML,
    '<article>three cards</article>',
    'the page the deck answered last for is the page on screen, not the request that was slowest',
  );
});

/**
 * Settling on `focusin` alone leaves one gap: a user who empties the box and
 * then clicks something that takes no focus — a paragraph, the background —
 * moves focus without announcing it anywhere. The region they have left would
 * keep the change it is owed until the deck next changed.
 *
 * The settle a click causes is deferred a turn (the docblock above `settle`
 * says why: an undeferred one would remove a submit button's form between the
 * press and the release). So this asserts in two beats: right after the click
 * fires, before that turn has passed, the region must still be the user's —
 * an assertion an undeferred settle would already have broken — and only once
 * `settleAfterClick` resolves is it taken.
 */
test('a change owed to a box the user emptied is taken when they click away, a turn later', async () => {
  const box = aBox('half a reply');
  const reply = aRegion('reply', '<form>the box</form>', box);
  const page = aPage([reply]);

  await page.focus(box);
  await page.changed([aRegion('reply', '<form>a fresh box</form>')]);
  await page.type(box, '');

  page.clickAway();
  assert.equal(
    reply.innerHTML,
    '<form>the box</form>',
    "still theirs the instant the click fires — the deferral hasn't run yet",
  );

  await page.settleAfterClick();
  assert.equal(reply.innerHTML, '<form>a fresh box</form>', 'and taken once that turn passes');
});

test('a region the fresh page does not have is left where it is, not emptied', async () => {
  const panel = aRegion('table', '<table>the run</table>');
  const queue = aRegion('queue', '<article>one card</article>');
  const page = aPage([panel, queue]);

  await page.changed([aRegion('queue', '<article>two cards</article>')]);

  assert.equal(
    panel.innerHTML,
    '<table>the run</table>',
    'a region missing from the fresh page is left alone',
  );
  assert.equal(
    queue.innerHTML,
    '<article>two cards</article>',
    'and a region the fresh page does carry still updates',
  );
});

// --- the two bookmarks' badges follow their lists (badge said 3, list said 2) --

/**
 * The Tickets and Reports bookmarks' badge is `data-count` on the `<summary>`
 * itself (`render.mjs`'s `renderTabSummary`), outside the `[data-live="tickets"]`
 * / `[data-live="reports"]` panel beside it, so the region swap never touches
 * it on its own. `getAttribute`/`setAttribute`/`removeAttribute` is all the
 * script asks of one.
 */
const aBadge = (count = null) => ({
  _count: count,
  getAttribute(name) {
    return name === 'data-count' ? this._count : null;
  },
  setAttribute(name, value) {
    if (name === 'data-count') this._count = value;
  },
  removeAttribute(name) {
    if (name === 'data-count') this._count = null;
  },
});

test('a live update that changes the open ticket count moves the Tickets badge with it', async () => {
  const tickets = aRegion('tickets', '<ol class="tickets-list"><li>one</li><li>two</li><li>three</li></ol>');
  const badge = aBadge('3');
  const page = aPage([tickets], { url: 'http://127.0.0.1:4322/', badges: { tickets: badge } });

  await page.deliver(
    page.announce(),
    [aRegion('tickets', '<ol class="tickets-list"><li>one</li><li>two</li></ol>')],
    null,
    { tickets: aBadge('2') },
  );

  assert.equal(tickets.innerHTML, '<ol class="tickets-list"><li>one</li><li>two</li></ol>', 'the list shows two');
  assert.equal(badge.getAttribute('data-count'), '2', 'and the badge says two, not the three it loaded with');
});

test('resolving the last open ticket drops the Tickets badge entirely, not to a bare data-count=""', async () => {
  const tickets = aRegion('tickets', '<ol class="tickets-list"><li>one</li></ol>');
  const badge = aBadge('1');
  const page = aPage([tickets], { badges: { tickets: badge } });

  await page.deliver(page.announce(), [aRegion('tickets', '<p class="nobody">no tickets</p>')], null, {
    tickets: aBadge(null),
  });

  assert.equal(tickets.innerHTML, '<p class="nobody">no tickets</p>');
  assert.equal(badge.getAttribute('data-count'), null, 'no badge at all, the way a zero count is drawn');
});

test('the Reports badge follows its list the same way, including from no badge to one', async () => {
  const reports = aRegion('reports', '<p class="nobody">no reports</p>');
  const badge = aBadge(null);
  const page = aPage([reports], { badges: { reports: badge } });

  await page.deliver(
    page.announce(),
    [aRegion('reports', '<ol class="reports-list"><li>one</li></ol>')],
    null,
    { reports: aBadge('1') },
  );

  assert.equal(
    reports.innerHTML,
    '<ol class="reports-list"><li>one</li></ol>',
    'the list gained the report that opened',
  );
  assert.equal(badge.getAttribute('data-count'), '1', 'a badge appears where the page had loaded with none');
});

/**
 * The list and its badge are the same claim (spec: they must never disagree),
 * which cuts both ways: a change owed to a busy Tickets region — the user is in
 * it, the same reason the list itself is skipped (`busy`, above) — must not
 * move the badge on ahead of a list that has not moved yet. Modelled on "a
 * change under a half-typed reply leaves the box alone and lands anyway".
 */
test('a live update owed to a busy Tickets region does not move its badge ahead of the list', async () => {
  const tickets = aRegion('tickets', '<ol class="tickets-list"><li>one</li><li>two</li></ol>');
  const badge = aBadge('2');
  const elsewhere = {};
  const page = aPage([tickets], { badges: { tickets: badge } });

  await page.focus(tickets);
  await page.deliver(
    page.announce(),
    [aRegion('tickets', '<ol class="tickets-list"><li>one</li></ol>')],
    null,
    { tickets: aBadge('1') },
  );

  assert.equal(
    tickets.innerHTML,
    '<ol class="tickets-list"><li>one</li><li>two</li></ol>',
    'still theirs while they are in it',
  );
  assert.equal(badge.getAttribute('data-count'), '2', 'and the badge waits with it, not ahead of it');

  await page.focus(elsewhere);

  assert.equal(tickets.innerHTML, '<ol class="tickets-list"><li>one</li></ol>', 'taken once they leave');
  assert.equal(badge.getAttribute('data-count'), '1', 'and the badge catches up in the same swap');
});

// --- moving between the deck's own pages, in place --------------------------

/**
 * "pressing 'everything' reloads the page, unsure if this was still supposed to
 * be a thing?" — the user, on walkthrough #2. The strip and the toggle are
 * links and stay links, so the view still lives in the address and a browser
 * with no script still follows them; what changes is that this browser moves
 * the address itself and reads the new page into the one already open.
 */
test('a tab or the toggle moves the address and reads the page in place, never navigating', async () => {
  for (const [selector, href] of [
    ['a.everything', '/?run=alpha&all=1'],
    ['.runs-strip a', '/?run=bravo'],
  ]) {
    const queue = aRegion('queue', '<p>what is waiting</p>');
    const tabs = aRegion('tabs', '<nav>alpha is the one</nav>');
    const page = aPage([tabs, queue], { url: 'http://127.0.0.1:4322/?run=alpha' });

    // The link the user presses is inside the strip, which is itself a region
    // the swap redraws — so a press that kept the focus would skip the very
    // region that shows which tab is now the current one.
    const link = aLink(href, selector);
    tabs.contains = (node) => node === tabs || node === link;

    const press = page.press(link);

    assert.ok(press.defaultPrevented, `${selector}: the browser is told not to follow it`);
    assert.deepEqual(page.pushed, [href], `${selector}: the address moved, so the URL still names the view`);
    assert.equal(page.sandbox.fetched.length, 1, `${selector}: one read`);
    assert.equal(page.sandbox.fetched[0][0], href, 'of the page it has just moved to');

    await page.deliver(0, [
      aRegion('tabs', '<nav>and now it is the other one</nav>'),
      aRegion('queue', '<p>what that one is waiting on</p>'),
    ]);
    assert.equal(queue.innerHTML, '<p>what that one is waiting on</p>', `${selector}: the cards are that page's`);
    assert.equal(
      tabs.innerHTML,
      '<nav>and now it is the other one</nav>',
      `${selector}: and the strip says so, though the press landed inside it`,
    );

    // A click the browser would do something else with is the browser's — each
    // of the four keys that means "not here", and the middle button.
    for (const held of ['metaKey', 'ctrlKey', 'shiftKey', 'altKey']) {
      const modified = page.press(aLink(href, selector), { [held]: true });
      assert.equal(modified.defaultPrevented, false, `${selector}: ${held} opens a tab, as it always did`);
    }
    const middle = page.press(aLink(href, selector), { button: 1 });
    assert.equal(middle.defaultPrevented, false, `${selector}: the middle button is the browser's too`);
    assert.equal(page.pushed.length, 1, 'and none of them moves anything here');
    assert.equal(page.sandbox.fetched.length, 1, 'or reads anything here');
  }
});

test('Back reads the page it went back to, in place and without pushing anything', async () => {
  const queue = aRegion('queue', '<p>the tab they moved to</p>');
  const page = aPage([queue], { url: 'http://127.0.0.1:4322/?run=bravo' });

  page.back('http://127.0.0.1:4322/?run=alpha');

  assert.equal(page.sandbox.fetched.length, 1, 'one read');
  assert.equal(page.sandbox.fetched[0][0], 'http://127.0.0.1:4322/?run=alpha', 'of the address Back left behind');
  await page.deliver(0, [aRegion('queue', '<p>the tab they came from</p>')]);

  assert.equal(queue.innerHTML, '<p>the tab they came from</p>');
  assert.deepEqual(page.pushed, [], 'and nothing is pushed: the history has already moved');
});

/**
 * The toggle is outside every live region on purpose — what it says is the
 * address's, not the deck's — so the swap has to take it from the page it
 * fetched or the user would light nothing by pressing it.
 */
test('the toggle is relit from the page fetched, though it is in no live region', async () => {
  const queue = aRegion('queue', '<p>what is waiting</p>');
  const toggle = aRegion('right', '<a class="everything" href="/?run=alpha&all=1">Everything</a>');
  const page = aPage([queue], { url: 'http://127.0.0.1:4322/?run=alpha', toggle });

  // The toggle the user presses is inside the very thing that has to be
  // redrawn, and the press leaves the focus on it.
  const link = aLink('/?run=alpha&all=1', 'a.everything');
  toggle.contains = (node) => node === toggle || node === link;

  page.press(link);
  await page.deliver(
    0,
    [aRegion('queue', '<p>and what is settled</p>')],
    aRegion('right', '<a class="everything on" href="/?run=alpha">Everything</a>'),
  );

  assert.match(toggle.innerHTML, /class="everything on"/, 'lit, with no page thrown away');
  assert.match(toggle.innerHTML, /href="\/\?run=alpha"/, 'and pointing back the other way');
});

/**
 * A thread page's toggle swaps the walk in place; if it pushed an entry, Back
 * (and the arrow, which is Back from a deck page) would land on the same
 * thread. It replaces the entry instead; the strip and other pages still push
 * (back-arrow, decision itm_498a61106fc8).
 */
test('the toggle on a thread replaces the history entry, and the strip and other pages push', () => {
  for (const [why, url, selector, href, pushes] of [
    ['toggle on a thread', 'http://127.0.0.1:4322/thread/itm_000000000001', 'a.everything', '/thread/itm_000000000001?all=1', false],
    ['toggle on the deck', 'http://127.0.0.1:4322/?run=alpha', 'a.everything', '/?run=alpha&all=1', true],
    ['strip on a thread', 'http://127.0.0.1:4322/thread/itm_000000000001', '.runs-strip a', '/?run=bravo', true],
  ]) {
    const page = aPage([aRegion('queue', '<p>x</p>')], { url });

    page.press(aLink(href, selector));

    assert.deepEqual(page.pushed, pushes ? [href] : [], `${why}: pushed`);
    assert.deepEqual(page.replaced, pushes ? [] : [href], `${why}: replaced`);
  }
});

// --- the panels are not disturbed by the view changing (deck-workspace S13) -

/**
 * A panel, as the swap sees one: the box the user drags, marked `data-live`
 * itself, inside the `<details>` that opened it and is not (D3). That is the
 * whole reason a dragged size and an open bookmark survive a swap — the node
 * the size is an inline style on is never replaced, only filled — and it is
 * the reason a report that pressing EVERYTHING closed the panels could not be
 * reproduced here.
 *
 * `replaceWith` is modelled so that a swap which *did* replace the node would
 * be visible to a test rather than invisible: what is on screen afterwards is
 * `tab.panel`, which is the fresh node in that case and carries none of the
 * user's size.
 */
const aPanelTab = (live, html, height = '') => {
  const tab = { open: true };
  const panel = {
    dataset: { live },
    innerHTML: html,
    style: { height },
    querySelectorAll: () => [],
    contains: (node) => node === panel,
    replaceWith(next) {
      tab.panel = next;
    },
  };
  tab.panel = panel;
  return tab;
};

/**
 * The walkthrough of 2026-09-22 reported that pressing EVERYTHING shut the
 * open panels and lost the height they had been dragged to. Nothing on this
 * branch does that, and a report that cannot be reproduced is not fixed by
 * guessing at a cause — so what the slice leaves behind is this, the test that
 * would catch it if the swap ever did replace a panel instead of filling it.
 */
test('pressing EVERYTHING leaves an open panel open and at the height it was dragged to', async () => {
  const tab = aPanelTab('tree', '<ul>one run</ul>', '18rem');
  const panel = tab.panel;
  const toggle = aRegion('right', '<a class="everything" href="/?run=alpha&all=1">Everything</a>');
  const page = aPage([panel], { url: 'http://127.0.0.1:4322/?run=alpha', toggle });

  const link = aLink('/?run=alpha&all=1', 'a.everything');
  toggle.contains = (node) => node === toggle || node === link;

  const press = page.press(link);
  assert.equal(press.defaultPrevented, true, 'the toggle is read in place, not followed as a link');

  await page.deliver(
    0,
    [aPanelTab('tree', '<ul>one run and one settled thread</ul>').panel],
    aRegion('right', '<a class="everything on" href="/?run=alpha">Everything</a>'),
  );

  assert.equal(
    tab.panel,
    panel,
    'the panel on screen is the one that was there: a swap fills a region, it does not replace it',
  );
  assert.equal(
    tab.panel.innerHTML,
    '<ul>one run and one settled thread</ul>',
    'and it did take the view the press asked for, or this pin is asserting nothing',
  );
  assert.equal(tab.panel.style.height, '18rem', 'at the height the user dragged it to (spec 5)');
  assert.equal(tab.open, true, 'and the bookmark that opened it is still open');
});

/** A live region with nothing foldable in it, for the tests that only need one to exist. */
const aTree = (live) => ({
  dataset: { live },
  writes: 0,
  innerHTML: '',
  querySelectorAll: () => [],
  contains(node) {
    return node === this;
  },
});

/**
 * The overview's run sections, which are the same claim upside down: the server
 * serves every one of them shut (`render.mjs`'s `inSection`), so what has to
 * ride in with a swap is the one the user opened — and a list shared with the
 * branches would say "shut" where it meant "open".
 */
const sectionHtml = (sections) =>
  sections
    .map(
      (section) =>
        `<details class="run-section" data-section="${section.dataset.section}"` +
        `${section.open ? ' open' : ''}></details>`,
    )
    .join('');

const aSections = (live, names) => {
  const sections = names.map((name) => ({ dataset: { section: name }, open: false }));
  let written = null;
  const region = {
    dataset: { live },
    sections,
    writes: 0,
    get innerHTML() {
      return written ?? sectionHtml(sections);
    },
    set innerHTML(html) {
      region.writes += 1;
      written = html;
    },
    querySelectorAll: (selector) => (selector === 'details.run-section' ? sections : []),
    contains(node) {
      return node === region;
    },
  };
  return region;
};

test('a run section the user opened on the overview outlives the swap under it', async () => {
  const tree = aSections('tree', ['pilot', 'kettle']);
  const page = aPage([tree], { url: 'http://127.0.0.1:4322/' });

  page.unfold(tree.sections[0]);

  // A third run registers, so the overview's bytes differ and the region is
  // genuinely replaced — which is the moment an opened section used to shut.
  const fresh = aSections('tree', ['pilot', 'kettle', 'teapot']);
  await page.changed([fresh]);

  assert.equal(tree.writes, 1, 'the change landed');
  assert.equal(fresh.sections[0].open, true, 'the section the user opened arrived open');
  assert.equal(fresh.sections[1].open, false, 'the one they never touched arrived as the server draws it');
  assert.match(tree.innerHTML, /data-section="pilot" open/, 'so nothing on screen flashed shut');
  assert.match(tree.innerHTML, /data-section="teapot"><\/details>/, 'and the new run is there, shut');
});

test('a run section the user shut again is not reopened by the next change', async () => {
  const tree = aSections('tree', ['pilot']);
  const page = aPage([tree], { url: 'http://127.0.0.1:4322/' });

  page.unfold(tree.sections[0]);
  page.fold(tree.sections[0]);

  const fresh = aSections('tree', ['pilot', 'kettle']);
  await page.changed([fresh]);

  assert.equal(fresh.sections[0].open, false, 'opening it was forgotten the moment it was undone');
});

/**
 * The queue's days (spec 35), which are the third polarity and the reason
 * neither list above can hold them: `render.mjs` serves today's section open and
 * every earlier one shut, so "remember what was shut" and "remember what was
 * opened" are both wrong for half of them. What rides in with a swap is the
 * user's own choice either way, and a day they never touched keeps whatever the
 * server served it as.
 *
 * `open` here is what the server would send, which is why the helper takes it
 * per day rather than assuming one polarity for all of them.
 */
const dayHtml = (days) =>
  days
    .map(
      (day) =>
        `<details class="day" data-day="${day.dataset.day}"${day.open ? ' open' : ''}></details>`,
    )
    .join('');

const aDays = (live, served) => {
  const days = Object.entries(served).map(([key, open]) => ({ dataset: { day: key }, open }));
  let written = null;
  const region = {
    dataset: { live },
    days,
    writes: 0,
    get innerHTML() {
      return written ?? dayHtml(days);
    },
    set innerHTML(html) {
      region.writes += 1;
      written = html;
    },
    querySelectorAll: (selector) => (selector === 'details.day' ? days : []),
    contains(node) {
      return node === region;
    },
  };
  return region;
};

test('a day the user opened stays open through the swap under it, and one shut stays shut', async () => {
  const queue = aDays('queue', { '2026-09-22': true, '2026-09-21': false, '2026-09-20': false });
  const page = aPage([queue], { url: 'http://127.0.0.1:4322/?run=alpha&all=1' });

  // The user opens yesterday to look something up, and shuts today, which they
  // are done with. The third day they never touch.
  page.unfold(queue.days[1]);
  page.fold(queue.days[0]);

  // A thread resolves, so the settled list gains a card and the bytes differ.
  const fresh = aDays('queue', {
    '2026-09-22': true,
    '2026-09-21': false,
    '2026-09-20': false,
    '2026-09-19': false,
  });
  await page.changed([fresh]);

  assert.equal(queue.writes, 1, 'the change landed');
  assert.equal(fresh.days[0].open, false, 'today arrived shut, because the user shut it');
  assert.equal(fresh.days[1].open, true, 'and yesterday open, because the user opened it');
  assert.equal(
    fresh.days[2].open,
    false,
    'the day they never touched arrived as the server draws it, and not as either choice',
  );
  assert.match(queue.innerHTML, /data-day="2026-09-22"><\/details>/, 'so nothing on screen flashed open');
  assert.match(queue.innerHTML, /data-day="2026-09-21" open/, 'and nothing flashed shut');
});

test('a day the user put back the way the server had it is the server`s again', async () => {
  const queue = aDays('queue', { '2026-09-21': false });
  const page = aPage([queue], { url: 'http://127.0.0.1:4322/?run=alpha&all=1' });

  page.unfold(queue.days[0]);
  page.fold(queue.days[0]);

  // Which is only visible in the case the two differ: after midnight the very
  // same day is served open on one page and shut on the next, and a choice
  // recorded as "shut" would hold it shut for ever.
  const fresh = aDays('queue', { '2026-09-21': true, '2026-09-20': false });
  await page.changed([fresh]);

  assert.equal(
    fresh.days[0].open,
    false,
    'a choice is a choice until it is made again: shut is what they last chose',
  );
});

/**
 * The reading itself, which is the browser's half of spec 35: the server wrote
 * an absolute date and this is the only place `Today` is ever decided.
 *
 * The clock is the real one on both sides — the test's and the script's — and it
 * has to be: the script reads `Date` from the realm and never from `env`, so a
 * `Date` handed in on the sandbox is not the `Date` the script sees. Both reads happen in the same
 * millisecond, so the pair only disagrees if midnight falls between them.
 */
test('a day heading reads as Today or Yesterday on this browser`s clock, and never as a distance', () => {
  const now = new Date();
  const dayBefore = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  const key = (at) =>
    `${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, '0')}-${String(at.getDate()).padStart(2, '0')}`;
  // The words the server wrote are on the element as well as in it, so a
  // heading is read from them afresh each minute and never from its own text.
  const aDayStamp = (at, words) => ({
    dataset: { calendar: words },
    getAttribute: (name) => (name === 'datetime' ? key(at) : null),
    textContent: words,
    parentNode: null,
  });

  const today = aDayStamp(now, 'the date the server wrote');
  const yesterday = aDayStamp(dayBefore, 'the date the server wrote');
  const older = aDayStamp(new Date(2026, 7, 13), 'Thu 13 Aug');

  // `stamp()` runs as the script loads, over every stamp on the page.
  aPage([], { times: [today, yesterday, older] });

  assert.equal(today.textContent, 'Today');
  assert.equal(yesterday.textContent, 'Yesterday');
  assert.equal(older.textContent, 'Thu 13 Aug', 'anything earlier keeps the date, and reads as no distance');
});

test('an ordinary stamp is still read as a distance, day heading or no day heading', () => {
  const anHourAgo = new Date(Date.now() - 61 * 60 * 1000).toISOString();
  const moment = {
    dataset: {},
    getAttribute: (name) => (name === 'datetime' ? anHourAgo : null),
    textContent: anHourAgo,
    parentNode: null,
  };

  aPage([], { times: [moment] });

  assert.equal(moment.textContent, '1 hr ago', 'the reading spec 7 asks for, unchanged');
});

/**
 * The one thing this sandbox cannot exercise: it calls every listener it was
 * handed, whatever phase that listener asked for. In a browser `toggle` does not
 * bubble, so a listener on the document hears a branch only on the way down —
 * and a branch lives inside a live region, so a listener bound to the branch
 * itself would be thrown away by the first swap (D3). The browser gate is what
 * proves it works; this is what stops it being quietly undone.
 */
test('the fold is heard on the way down, because a toggle does not bubble', () => {
  const page = aPage([aTree('tree', ['1 tabs'])], { url: 'http://127.0.0.1:4322/?run=alpha' });

  assert.deepEqual(page.captured.toggle, [true], 'one document listener for toggle, in the capture phase');
});

test('live swaps keep no fold state for the tree', () => {
  const source = uiFile(path.join('js', 'live.mjs'));

  assert.doesNotMatch(source, /details\.branch/, 'the graph has no branches to put back');
  assert.doesNotMatch(source, /keys\.branch/, 'and no fold key is remembered for one');
});

// --- what the pages carry --------------------------------------------------

const MINE = process.cwd();

const anItem = (over = {}) => ({
  id: 'itm_000000000001',
  kind: 'question',
  title: 'Which way round?',
  body: 'The body of it.',
  slice: '1 skeleton',
  repo: MINE,
  postedAt: '2026-09-18T10:00:00.000Z',
  replies: [],
  ...over,
});

const aRun = (over = {}) => ({
  id: 'run_000000000001',
  repo: MINE,
  name: 'pilot',
  pid: process.pid,
  startedAt: '2026-09-18T10:00:00.000Z',
  slices: [{ slice: '1 skeleton', state: 'implementing' }],
  ...over,
});

const everyPage = () => {
  const items = [anItem()];
  const runs = [aRun()];
  return [
    ['home', renderHomePage(items, runs)],
    ['thread', renderThreadPage(items[0], items, runs)],
    ['items', renderDeckPage(items, runs)],
  ];
};

test('no page the deck serves reloads itself any more (D1)', () => {
  // Recursive, because the page's script is modules under `ui/js/` now (ADR 0030).
  const files = fs.readdirSync(UI, { recursive: true }).filter((name) => fs.statSync(path.join(UI, name)).isFile());
  for (const name of files) {
    assert.doesNotMatch(uiFile(name), /location\s*\.\s*reload/, `${name} still reloads the page`);
  }
  for (const [name, page] of everyPage()) {
    assert.doesNotMatch(page, /location\s*\.\s*reload/, `the ${name} page still reloads itself`);
  }
});

test('every page carries one script, and it is the module entry rather than inline text (ADR 0030)', () => {
  for (const [name, page] of everyPage()) {
    assert.deepEqual(
      page.match(/<script[^>]*>[\s\S]*?<\/script>/g),
      ['<script type="module" src="/ui/deck.mjs"></script>'],
      `the ${name} page loads /ui/deck.mjs as a module and carries no script text of its own`,
    );
  }
});

test('the thread keeps the argument and the reply box in separate live regions (D1)', () => {
  const item = anItem();
  const page = renderThreadPage(item, [item], [aRun()]);
  const regions = [...page.matchAll(/data-live="([\w-]+)"/g)].map((match) => match[1]);

  assert.deepEqual(
    regions,
    ['kind', 'nav', 'position', 'thread', 'reply', 'notifications', 'chat', 'status', 'agents', 'tickets', 'reports'],
    'the box is its own region, so a change lands in the argument above it while it is being typed in',
  );
  assert.match(
    page.split('data-live="reply"')[1],
    /^[^<]*<form/,
    'and the form is inside that region rather than being it',
  );
});

test('the home page makes its strip, its queue and its panels live, and nothing else', () => {
  const regions = [...renderHomePage([anItem()], [aRun()]).matchAll(/data-live="([\w-]+)"/g)];

  assert.deepEqual(
    regions.map((match) => match[1]),
    ['tabs', 'queue', 'notifications', 'chat', 'status', 'agents', 'tickets', 'reports'],
  );
});

/**
 * What lets the script take a press on a tab at all: every page that draws one
 * also draws the queue the press is asking to change. A page with the strip on
 * it and nothing for the strip to swap would move its own address and leave the
 * screen exactly as it was — so this is checked on the markup rather than
 * guarded for in the script, which is where it would be dead code.
 */
test('the strip and the toggle are drawn only where a swap has something to swap', () => {
  let checked = 0;
  for (const [name, page] of everyPage()) {
    if (!/class="runs-strip"/.test(page) && !/class="everything/.test(page)) continue;
    checked += 1;
    // A thread page's toggle redraws the walk, its arrows and X/N, not a queue.
    assert.match(page, /data-live="(queue|nav)"/, `${name}: a control, but nothing for it to redraw`);
  }
  assert.ok(checked, 'no page carried either control, so this stopped checking anything');
});

test('a live region is never a details or a form (D3)', () => {
  for (const [name, page] of everyPage()) {
    assert.doesNotMatch(page, /<details[^>]*data-live/, `${name}: an open panel is not swapped shut`);
    assert.doesNotMatch(page, /<form[^>]*data-live/, `${name}: a form is not swapped from under a click`);
  }
});

// --- spec 16: the comment that closed itself -------------------------------

/**
 * `strips.html` opened with a comment that named its own slot in full, and the
 * slot's `-->` closed the comment eleven words in, so the rest of the paragraph
 * was printed on every page that carried the fragment. Removing every
 * well-formed comment and finding an arrow left over is exactly that bug.
 */
test('no template comment prints itself onto a page (spec 16)', () => {
  for (const [name, page] of everyPage()) {
    assert.doesNotMatch(
      page.replace(/<!--[\s\S]*?-->/g, ''),
      /-->/,
      `the ${name} page leaks the tail of a comment whose slot closed it early`,
    );
  }
});

// --- spec 5: the way back --------------------------------------------------

test('a thread says how to get back, wherever the user has scrolled to (spec 5)', () => {
  const item = anItem();
  const page = renderThreadPage(item, [item], [aRun()]);

  // An arrow since the walkthrough of 2026-09-19, where it used to be a line of
  // words; at the start of the header since spec 15 (L19). The words are still
  // what a screen reader reads and what a hover says, which is the half of the
  // old link that was carrying the meaning.
  // Its href is the owning deck's (ADR 0118, spec 1); `the arrow goes to the deck that owns the thread` owns that.
  assert.match(
    page,
    /<a class="back" href="[^"]*" title="Back to deck" aria-label="Back to deck">←<\/a>/,
    'the way back is an arrow, and it says in words what it is',
  );
  assert.doesNotMatch(page, />Back to deck</, 'and the line of words it replaces is gone');
  assert.match(
    page,
    /<header>[\s\S]*<a class="back"[\s\S]*<\/header>/,
    'in the header, since spec 15 put it where the title stood',
  );
  assert.match(
    uiFile('deck.css'),
    /body\[data-item\] header \{[^}]*position: sticky/,
    'and the header travels with the reader, so the arrow does too',
  );
});

// --- back-arrow: the arrow goes to the deck that owns the thread (ADR 0118) ---

const theArrow = (page) => page.match(/<a class="back" href="([^"]*)"/)?.[1];

test('the arrow goes to the deck that owns the thread', () => {
  const R = 'D:\\work\\other & "repo"';
  const item = anItem({ repo: R });
  const page = renderThreadPage(item, [item], [aRun(), aRun({ id: 'run_000000000002', repo: R, name: 'other' })]);

  assert.equal(
    theArrow(page),
    `/?run=${encodeURIComponent(R)}`,
    "R's tab, not the `/` that lands on the overview when two decks are live",
  );
});

test('under Everything the arrow keeps all', () => {
  const R = 'D:\\work\\other';
  const item = anItem({ repo: R });
  const page = renderThreadPage(item, [item], [aRun({ repo: R })], {}, {}, true);

  assert.equal(theArrow(page), `/?run=${encodeURIComponent(R)}&amp;all=1`, 'the toggle the user chose survives the way back');
});

test('a thread no deck owns goes to the overview', () => {
  const item = anItem({ repo: undefined });
  const page = renderThreadPage(item, [item], [aRun()]);

  assert.equal(theArrow(page), '/?run=', 'the overview always, never `/`, which may land on another deck');
});

// --- an answer sent outlives the swap that sending it announces (spec 18) ---

/**
 * One of a card's options, as a browser holds one. `closest` answers only the
 * selector the script really asks with, `.choices` to find the row itself, so
 * the script's own selector is part of what these tests check.
 */
const anOption = (row, value) => {
  const classes = [];
  return {
    name: 'choice',
    value,
    classes,
    disabled: false,
    classList: {
      add: (name) => {
        if (classes.indexOf(name) === -1) classes.push(name);
      },
      remove: (name) => {
        const at = classes.indexOf(name);
        if (at !== -1) classes.splice(at, 1);
      },
      contains: (name) => classes.indexOf(name) !== -1,
    },
    blur() {},
    closest: (selector) => (selector === '.choices' ? row : null),
  };
};

/**
 * A card as a live region: the item's id in the reply form, the option row, and
 * the buttons in it. Its `innerHTML` is written from the marks the buttons
 * carry, because that is what the swap compares — a row that arrives already
 * marked is bytes the page already has, so the region is left alone and the
 * mark was never at risk. Writes are counted for exactly that reason.
 */
const aCard = (live, id, values, action = '/reply') => {
  const row = {};
  row.buttons = values.map((value) => anOption(row, value));
  row.querySelectorAll = (selector) => (selector === 'button' ? row.buttons : []);

  const named = { name: 'id', value: id };
  const form = {
    getAttribute: (name) => (name === 'action' ? action : null),
    querySelector: (selector) =>
      selector === 'input[name="id"]' ? named : selector === '.choices' ? row : null,
    querySelectorAll: (selector) =>
      selector === 'input[name], textarea[name]' ? [named] : [],
  };

  const region = {
    dataset: { live },
    row,
    form,
    forms: [form],
    writes: 0,
    get innerHTML() {
      return (
        id +
        ':' +
        row.buttons
          .map((b) => b.value + (b.classList.contains('sent') ? '!' : '') + (b.disabled ? '-' : ''))
          .join(',')
      );
    },
    set innerHTML(html) {
      region.writes += 1;
    },
    querySelectorAll: () => [],
    contains: () => false,
  };
  return region;
};

/** The press a user makes on an option, delivered as a browser delivers a submit. */
const answerWith = (page, card, value) => {
  const pressed = card.row.buttons.find((b) => b.value === value);
  page.submit(card.form, pressed);
  return pressed;
};

test('an option pressed stays marked and unpressable through the swap it causes (spec 18)', async () => {
  const card = aCard('home', 'itm_1', ['Cap it', 'Leave it uncapped']);
  const page = aPage([card], { url: 'http://127.0.0.1:4322/?run=alpha' });

  const pressed = answerWith(page, card, 'Cap it');
  assert.ok(pressed.classList.contains('sent'), 'the press marks the option at once');

  // The reply's own POST is still in flight — the deck announces the change it
  // made before that 303 comes back, which is the redraw that used to take the
  // mark away. The server renders every option pressable and cannot know which
  // one went out, the way it renders every branch open (L20).
  const fresh = aCard('home', 'itm_1', ['Cap it', 'Leave it uncapped']);
  await page.changed([fresh]);

  const marked = fresh.row.buttons.filter((b) => b.classList.contains('sent')).map((b) => b.value);
  assert.deepEqual(marked, ['Cap it'], 'the answer that went out is the one marked, on the page that arrived');
  assert.deepEqual(
    fresh.row.buttons.map((b) => b.disabled),
    [true, true],
    'and no option in that row can be pressed a second time',
  );
  assert.equal(card.writes, 0, 'a row that arrives already marked is bytes the page has: nothing is swapped');
});

/**
 * Spec 27, amended at Gate 2: a card of a kind the deck does not know carries
 * Dismiss, and pressing it is answered in one click exactly as an option is —
 * sent without navigating, marked at once, and the mark put back after the swap
 * that sending it announces. The whole of that is the mechanism spec 18 already
 * had; what this pins is that the *route* being a different one does not take
 * the card out of it, which is the one thing that could quietly break.
 */
test('Dismiss pressed on a card is sent and marked like any other option (spec 27)', async () => {
  const card = aCard('home', 'itm_handoff', ['Dismiss'], '/dismiss-item');
  const page = aPage([card], { url: 'http://127.0.0.1:4322/?run=alpha' });

  const pressed = answerWith(page, card, 'Dismiss');

  assert.ok(pressed.classList.contains('sent'), 'the press marks it at once, before the deck answers');
  assert.ok(pressed.disabled, 'and the row stops taking presses, so it cannot be dismissed twice');
  assert.equal(page.sandbox.fetched.length, 1, 'it went over fetch: no navigation, no lost scroll');
  assert.equal(page.sandbox.fetched[0][0], '/dismiss-item', 'to the route the thread page already uses');

  // The deck announces the dismissal, and the server draws the card pressable
  // again because every option is pressable there for a browser with no script.
  const fresh = aCard('home', 'itm_handoff', ['Dismiss'], '/dismiss-item');
  await page.changed([fresh]);

  assert.ok(fresh.row.buttons[0].classList.contains('sent'), 'the mark rides in with the swap');
  assert.ok(fresh.row.buttons[0].disabled, 'and so does the row being spent');
});

test('a card this browser never answered arrives pressable, as it should (spec 18)', async () => {
  const mine = aCard('home', 'itm_1', ['Cap it', 'Leave it uncapped']);
  const page = aPage([mine], { url: 'http://127.0.0.1:4322/?run=alpha' });

  answerWith(page, mine, 'Cap it');

  // A different item, on the same page: nobody has answered it here.
  const other = aCard('home', 'itm_2', ['Approve', 'Changes needed']);
  await page.changed([other]);

  assert.deepEqual(
    other.row.buttons.map((b) => b.classList.contains('sent')),
    [false, false],
    'no mark is put on an item this browser has said nothing about',
  );
  assert.deepEqual(
    other.row.buttons.map((b) => b.disabled),
    [false, false],
    'and its options are pressable',
  );
});

/**
 * S6 of deferred-ledger: the last of the old inline script left `legacy.mjs`
 * region by region, and the file went with its last region (ADR 0030, L11).
 * Each region is a module of its own that installs against `env` and reads
 * nothing off the window it is not handed.
 */
test('every region of the page is a module of its own, and legacy.mjs is gone (L11)', async () => {
  const js = path.join(UI, 'js');
  assert.ok(!fs.existsSync(path.join(js, 'legacy.mjs')), 'legacy.mjs still carries part of the page');
  for (const name of ['time', 'live', 'reply', 'inplace', 'navigate', 'escape']) {
    const module = await import(`../ui/js/${name}.mjs`);
    assert.equal(typeof module.install, 'function', `${name}.mjs installs against env`);
  }
});

// --- handoff-failed-confirm S6: a move across page kinds -------------------------------------

/**
 * A page's shell for the page-kind swap: its `<header>` and `<main>` with the regions each holds, the
 * panels beside them, its title and the thread its body names. `outerHTML` is what the swap moves a
 * part by, so a part's reads as a name for it and writing one puts the named part in its place.
 */
const parts = new Map();
const aPart = (tag, regions, { live = null, usage = [] } = {}) => {
  const part = {
    tag,
    regions,
    usage,
    dataset: live ? { live } : {},
    innerHTML: `${tag} of ${regions.map((region) => region.dataset.live).join(',')}`,
    get outerHTML() {
      const name = `<${tag} #${parts.size}>`;
      parts.set(name, part);
      return name;
    },
    querySelectorAll: (selector) => {
      if (selector === '[data-live]') return regions;
      const attr = /^\[(data-usage|data-resets)\]$/.exec(selector)?.[1];
      return attr ? usage.filter((figure) => figure.attr === attr) : [];
    },
    querySelector: (selector) => {
      const [, attr, key] = /^\[(data-usage|data-resets)="([^"]+)"\]$/.exec(selector) ?? [];
      return usage.find((figure) => figure.attr === attr && figure.key === key) ?? null;
    },
  };
  return part;
};

/** A usage figure or reset line, `attr` naming which, saying `says`. */
const aFigure = (attr, key, says) => {
  const figure = {
    attr,
    key,
    says,
    getAttribute: (name) => (name === attr ? key : null),
    get outerHTML() {
      const name = `<figure #${parts.size}>`;
      parts.set(name, figure);
      return name;
    },
  };
  return figure;
};

const aShell = ({ title, item = null, header, main, panels }) => {
  const attrs = item === null ? {} : { 'data-item': item };
  const shell = {
    title,
    header,
    main,
    body: {
      getAttribute: (name) => attrs[name] ?? null,
      setAttribute: (name, value) => (attrs[name] = value),
      removeAttribute: (name) => delete attrs[name],
    },
    querySelector: (selector) => (selector === 'header' ? shell.header : selector === 'main' ? shell.main : null),
    querySelectorAll: (selector) =>
      selector === '[data-live]'
        ? [...shell.header.regions, ...(shell.main.dataset.live ? [shell.main] : []), ...shell.main.regions, ...panels]
        : [],
  };
  // Writing a part's `outerHTML` is the one way the swap puts it on the page; a figure is written inside its part.
  for (const tag of ['header', 'main']) {
    Object.defineProperty(shell[tag], 'outerHTML', {
      get: Object.getOwnPropertyDescriptor(shell[tag], 'outerHTML').get,
      set: (name) => (shell[tag] = parts.get(name)),
    });
    for (const figure of shell[tag].usage) {
      Object.defineProperty(figure, 'outerHTML', {
        get: Object.getOwnPropertyDescriptor(figure, 'outerHTML').get,
        set: (name) => shell[tag].usage.splice(shell[tag].usage.indexOf(figure), 1, parts.get(name)),
      });
    }
  }
  return shell;
};

/** `live.mjs` alone over `shown`, its one fetch answered with `fresh`; it hands back `refresh` and what moved. */
const aKindPage = (shown, fresh, url) => {
  // The document the script reads is the shell itself, so what the swap writes is what the test reads.
  const sandbox = aSandbox({
    document: Object.assign(shown, { activeElement: null, addEventListener() {} }),
    location: { href: url, assign: () => assert.fail('a move is never a navigation') },
    history: { pushState: (state, title, href) => (sandbox.location.href = href) },
    fetched: [],
    fetch: (href) => {
      sandbox.fetched.push(href);
      return Promise.resolve({ ok: true, text: () => Promise.resolve('the thread page') });
    },
    DOMParser: function DOMParser() {
      this.parseFromString = () => fresh;
    },
  });
  const notices = { rehide() {}, recount() {}, markThisThread() {} };
  const { refresh } = installLive(sandbox, notices, { rescope() {} }, () => {}, () => {}, null);
  return { sandbox, refresh };
};

const anOverview = (usage = []) =>
  aShell({
    title: 'Pilot deck',
    header: aPart('header', [aRegion('tabs', '<nav>D1</nav>')], { usage }),
    main: aPart('main', [], { live: 'queue' }),
    panels: [aRegion('table', '<p>one run</p>')],
  });

const aThreadShell = (usage = []) =>
  aShell({
    title: 'Plan · Pilot deck',
    item: 'itm_000000000009',
    header: aPart('header', [aRegion('kind', 'question'), aRegion('nav', '<a>next</a>')], { usage }),
    main: aPart('main', [aRegion('thread', '<p>the argument</p>'), aRegion('reply', '<form></form>')]),
    panels: [aRegion('table', '<p>one run, one thread</p>')],
  });

const namesOn = (shell) => shell.querySelectorAll('[data-live]').map((region) => region.dataset.live).sort();

test('refresh carries the overview to a thread page', async () => {
  const shown = anOverview();
  const panel = shown.querySelectorAll('[data-live]').find((region) => region.dataset.live === 'table');
  const { sandbox, refresh } = aKindPage(shown, aThreadShell(), `http://127.0.0.1:${PORT}/`);

  sandbox.history.pushState(null, '', `http://127.0.0.1:${PORT}/thread/itm_000000000009`);
  refresh();
  await new Promise((resolve) => setImmediate(resolve));

  assert.deepEqual(sandbox.fetched, [`http://127.0.0.1:${PORT}/thread/itm_000000000009`]);
  assert.deepEqual(namesOn(shown), ['kind', 'nav', 'reply', 'table', 'thread'], 'the thread and its reply, and no queue');
  assert.equal(shown.title, 'Plan · Pilot deck');
  assert.equal(shown.body.getAttribute('data-item'), 'itm_000000000009', 'the body names the thread, which the stylesheet reads');
  assert.equal(shown.querySelectorAll('[data-live]').find((region) => region.dataset.live === 'table'), panel, 'a panel goes region by region');
  assert.equal(panel.innerHTML, '<p>one run, one thread</p>');
});

test('a move across page kinds keeps the account-wide usage readings, never another deck`s context', async () => {
  const shown = anOverview([
    aFigure('data-usage', 'ctx', '63%'),
    aFigure('data-usage', 'session', '41%'),
    aFigure('data-resets', 'session', 'resets in 2 hrs'),
  ]);
  const fresh = aThreadShell([
    aFigure('data-usage', 'ctx', 'unknown'),
    aFigure('data-usage', 'session', 'unknown'),
    aFigure('data-resets', 'session', ''),
  ]);
  const { sandbox, refresh } = aKindPage(shown, fresh, `http://127.0.0.1:${PORT}/`);

  sandbox.history.pushState(null, '', `http://127.0.0.1:${PORT}/thread/itm_000000000009`);
  refresh();
  await new Promise((resolve) => setImmediate(resolve));

  assert.deepEqual(shown.header.usage.map((figure) => `${figure.key} ${figure.says}`), [
    'ctx unknown',
    'session 41%',
    'session resets in 2 hrs',
  ]);
});

test('Back from a thread page to the overview moves it in place, the thread let go', async () => {
  const shown = aThreadShell();
  const { sandbox, refresh } = aKindPage(shown, anOverview(), `http://127.0.0.1:${PORT}/thread/itm_000000000009`);
  let popstate = null;
  installNavigate({ ...sandbox, addEventListener: (type, run) => (popstate = run) }, refresh);

  sandbox.location.href = `http://127.0.0.1:${PORT}/`;
  popstate({});
  await new Promise((resolve) => setImmediate(resolve));

  assert.deepEqual(sandbox.fetched, [`http://127.0.0.1:${PORT}/`]);
  assert.equal(shown.body.getAttribute('data-item'), null, 'the body names no thread');
  assert.deepEqual(namesOn(shown), ['queue', 'table', 'tabs'], 'the queue is drawn, and no thread');
});

test('a refusal fetched in place of a thread page moves nothing, its title and its thread included', async () => {
  const shown = aThreadShell();
  const refusal = { title: '', body: { getAttribute: () => null }, querySelector: () => null, querySelectorAll: () => [] };
  const { refresh } = aKindPage(shown, refusal, `http://127.0.0.1:${PORT}/thread/itm_000000000009`);
  const { header, main } = shown;

  refresh();
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(shown.title, 'Plan · Pilot deck');
  assert.equal(shown.body.getAttribute('data-item'), 'itm_000000000009', 'the stylesheet still lays out a thread');
  assert.equal(shown.header, header);
  assert.equal(shown.main, main);
});

test('a change on the same kind of page swaps region by region, never the header or main whole', async () => {
  const shown = aThreadShell();
  const { header, main } = shown;
  const { refresh } = aKindPage(shown, aThreadShell(), `http://127.0.0.1:${PORT}/thread/itm_000000000009`);

  refresh();
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(shown.header, header, 'a reply being typed in <main> stays where it is');
  assert.equal(shown.main, main);
});
