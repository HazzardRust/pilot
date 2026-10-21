/**
 * Slice S16 of deck-workspace, spec 26 — **amended by the user at Gate 2 on
 * 2026-09-23**: the Notifications bookmark lists the open threads this browser
 * has not viewed *since they last changed*, and carries their count.
 *
 * What the amendment moved. The count used to go the moment the panel was
 * opened, and the × hid a line for the life of one page only — hence the user's
 * own report: "deleting a notification deletes it from view, but when I reload
 * it spawns back in." Now:
 *
 * - opening a thread's page marks that thread seen, and so does pressing its ×;
 * - opening the *panel* marks nothing. Reading a list of titles is not reading
 *   the threads, and a count that cleared itself on being looked at is what
 *   made the × necessary and then useless;
 * - the mark is kept against how many times the **pilot** has written on the
 *   thread (`pilotWrites`), so a new pilot message makes a viewed thread unseen
 *   again and a reply of the user's own never does;
 * - the client hides the threads it has seen and counts the rest. The server
 *   still lists every open thread (L25), which is what keeps it ignorant of
 *   this browser.
 *
 * The count is still the *client's* (L24). Nothing server-side knows what this
 * browser has looked at, so there is no field to render it from and no
 * migration to add one — what exists is one unscoped `localStorage` key, now a
 * map of thread id to the pilot-write count seen rather than a list of ids, and
 * a key written in the old shape is read rather than thrown away.
 *
 * The script is installed through `loadPage` here the way `deck/test/live.test.mjs` and
 * `deck/test/resize.test.mjs` run it, against the least DOM this slice touches:
 * the bookmark, the lines inside its panel, a `localStorage` a test presets and
 * reads back, and a change the deck announces. What the panel *looks* like is
 * the slice's live gate and is not had from a stand-in; what is provable here
 * is the number, the marking, and what survives a reload.
 */

import './no-open.mjs';

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { aSandbox, deckOnAPort, loadPage } from '../testUtils.mjs';
import { install as installNotifications } from '../ui/js/notifications.mjs';
import { renderHomePage } from '../ui/render.mjs';

const { KIND_QUESTION, pilotWrites } = await import('../items.mjs');

const UI = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'ui');
const deckCss = fs.readFileSync(path.join(UI, 'deck.css'), 'utf8');

/** The key the count is kept under: one, for every deck, as L24 decides. */
const SEEN = 'deck.seenThreads';

const A = 'D:\\work\\alpha';

/**
 * One line of the panel, as `render.mjs` renders one: the thread's id on the
 * row, how many times the pilot has written on it, and the × inside it.
 * `closest` answers only the selectors the script really asks with, so the
 * script's own selector is part of what is checked.
 *
 * A thread is given as its id, or as `[id, said]` when the test is about the
 * pilot having written on it more than once.
 */
const aNotice = (thread) => {
  const [id, said] = Array.isArray(thread) ? thread : [thread, 1];
  const line = { dataset: { thread: id, said: String(said) }, hidden: false };
  line.closest = (selector) => (selector === '.notice' ? line : null);
  line.drop = {
    closest: (selector) =>
      selector === '.notice .drop' ? line.drop : selector === '.notice' ? line : null,
  };
  return line;
};

/**
 * One agent-closed thread's notice (deck-press-feedback S4), as `renderClosedNotice` draws it:
 * its id and when the agent closed it. Given as `[id, at]`.
 */
const aClosed = ([id, at]) => ({ dataset: { notice: id, at: String(Date.parse(at)) }, hidden: false, closest: () => null });

/** The `<summary>` the count is written onto, which is outside every live region. */
const aSummary = () => {
  const attrs = {};
  return {
    attrs,
    setAttribute(name, value) {
      attrs[name] = value;
    },
    removeAttribute(name) {
      delete attrs[name];
    },
  };
};

/**
 * The Notifications `<details>`: whether it is open, the bookmark the count
 * goes on, and the lines inside its panel. The lines are re-pointed when the
 * region's `innerHTML` is assigned, which is what a browser does — the swap
 * builds new children, and the bookmark counts those from then on.
 */
const aBookmark = (notices, open, toggles) => {
  const summary = aSummary();
  const form = { hidden: false };
  const bookmark = {
    id: 'notifications',
    open,
    summary,
    form,
    notices,
    querySelector: (selector) => (selector === 'summary' ? summary : selector === '.mark-all-form' ? form : null),
    querySelectorAll: (selector) =>
      selector === '[data-thread]'
        ? bookmark.notices.filter((line) => line.dataset.thread)
        : selector === '[data-notice]'
          ? bookmark.notices.filter((line) => line.dataset.notice)
          : [],
    addEventListener(type, handler) {
      if (type === 'toggle') toggles.push(handler);
    },
  };
  return bookmark;
};

/**
 * A live region. Assigning `innerHTML` is how the swap replaces one, and here
 * it also adopts the lines of the page that was swapped in: a region built from
 * fresh bytes holds fresh children, and the count is read off those.
 */
const aRegion = (live, html, notices, pages) => {
  const region = {
    dataset: { live },
    html,
    notices,
    get innerHTML() {
      return region.html;
    },
    set innerHTML(value) {
      region.html = value;
      region.notices = pages.has(value) ? pages.get(value) : [];
      if (region.bookmark) region.bookmark.notices = region.notices;
    },
    querySelectorAll: (selector) => (selector === 'textarea' ? [] : region.notices),
    contains: () => false,
  };
  pages.set(html, notices);
  return region;
};

/**
 * A page with its script running on it: the Notifications bookmark, its panel as
 * a live region, a real `localStorage` a test can preset and read back, and a
 * change the deck can announce.
 *
 * `at` is load-bearing now rather than incidental: a `/thread/…` address is how
 * the script is told which thread the user is looking at, which is the whole of
 * "opening a thread's page marks it seen".
 */
function aPage({
  threads = [],
  // The agent-closed threads' notices above them, each `[id, closedAt]`.
  closed = [],
  stored = {},
  open = false,
  at = `/?run=${encodeURIComponent(A)}`,
  // The storage a *second* page of the same browser opens against, which is how
  // a reload is put to the script: the key is `localStorage` precisely so it
  // outlives one page (L24), so what survives one is a thing to assert.
  store = new Map(Object.entries(stored)),
  // The whole page by default, which is what a user runs; a test about the
  // notifications module alone installs that and nothing else (L11).
  install = loadPage,
} = {}) {
  const pages = new Map();
  const toggles = [];
  const listeners = {};
  const waiting = [];
  const answered = [];

  const notices = [...closed.map(aClosed), ...threads.map(aNotice)];
  const region = aRegion('notifications', 'the panel on arrival', notices, pages);
  const bookmark = aBookmark(notices, open, toggles);
  region.bookmark = bookmark;

  const address = new URL(at, 'http://127.0.0.1:4322');

  const document = {
    activeElement: null,
    querySelectorAll: (selector) => {
      if (selector === '[data-live]') return [region];
      // The bookmark is found among the group the script already collects, so
      // a page that draws no Notifications bookmark leaves the script with
      // nothing to count and no second query to answer.
      if (selector === 'details.tab') return [bookmark];
      if (selector === 'details.tab[open]') return bookmark.open ? [bookmark] : [];
      return [];
    },
    querySelector: () => null,
    addEventListener(type, handler) {
      (listeners[type] ??= []).push(handler);
    },
  };

  const sandbox = aSandbox({
    document,
    location: { href: address.href, search: address.search, pathname: address.pathname },
    fetched: [],
    fetch: (...args) => {
      sandbox.fetched.push(args);
      return new Promise((resolve) => {
        waiting.push((fresh) => {
          const body = `page ${answered.push(fresh) - 1}`;
          resolve({ ok: true, text: () => Promise.resolve(body) });
        });
      });
    },
    localStorage: {
      getItem: (key) => (store.has(key) ? store.get(key) : null),
      setItem: (key, value) => {
        store.set(key, value);
      },
      removeItem: (key) => {
        store.delete(key);
      },
    },
    DOMParser: function DOMParser() {
      this.parseFromString = (body) => {
        const fresh = answered[Number(body.split(' ')[1])];
        return {
          querySelectorAll: (selector) =>
            selector === '[data-live]' ? [fresh] : selector === '.notice' ? fresh.notices : [],
          querySelector: () => null,
        };
      };
    },
    EventSource: function EventSource() {
      this.addEventListener = (type, handler) => {
        if (type === 'changed') sandbox.announce = handler;
      };
    },
  });

  const installed = install(sandbox);

  const settled = async () => {
    await new Promise((resolve) => setImmediate(resolve));
    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setImmediate(resolve));
  };

  return {
    installed,
    store,
    notices,
    bookmark,
    region,
    fetched: sandbox.fetched,
    /** The number on the bookmark right now, or null when it carries none. */
    count: () => bookmark.summary.attrs['data-count'] ?? null,
    /** Whether the Mark all seen form is showing right now (notifications-seen spec 5). */
    markAllShown: () => !bookmark.form.hidden,
    /** Whether the bookmark is highlighted right now (spec 12). */
    highlighted: () => 'data-highlight' in bookmark.summary.attrs,
    /** What the key holds: thread id to the pilot-write count this browser saw. */
    seen: () => JSON.parse(store.get(SEEN) ?? 'null'),
    /** The ids of the lines still showing, in order. */
    showing: () =>
      bookmark.notices.filter((line) => line.dataset.thread && !line.hidden).map((line) => line.dataset.thread),
    /** The user opens or shuts the bookmark: the `<details>`'s own doing (D5). */
    toggle(isOpen) {
      bookmark.open = isOpen;
      for (const handler of toggles) handler();
    },
    /** The × on one line, pressed. */
    drop(notice) {
      for (const handler of listeners.click ?? []) handler({ target: notice.drop });
    },
    /** The panel's Mark all seen, pressed: its click, before its form posts in place (notifications-seen L1). */
    markAll() {
      const button = { closest: (selector) => (selector === '.mark-all' ? button : null) };
      for (const handler of listeners.click ?? []) handler({ target: button });
    },
    /** The deck announces a change and answers the read with this panel. */
    async changed(threadsNow, closedNow = []) {
      const fresh = aRegion(
        'notifications',
        `the panel with ${JSON.stringify([closedNow, threadsNow])}`,
        [...closedNow.map(aClosed), ...threadsNow.map(aNotice)],
        pages,
      );
      sandbox.announce({});
      waiting[waiting.length - 1](fresh);
      await settled();
      return fresh;
    },
  };
}

// --- what the mark is kept against -----------------------------------------

test('the pilot`s writes on a thread are the post and every message it has added', () => {
  assert.equal(pilotWrites({ replies: [] }), 1, 'a thread nobody has answered: the post itself');
  assert.equal(pilotWrites({}), 1, 'an item written before threads existed is not a corrupt one');
  assert.equal(
    pilotWrites({ replies: [{ from: 'user', text: 'mine', seq: 4 }] }),
    1,
    'a reply of the user`s own does not move it: a thread they just wrote on is not news to them',
  );
  assert.equal(
    pilotWrites({ replies: [{ from: 'user', seq: 4 }, { from: 'pilot' }, { from: 'user', seq: 5 }] }),
    2,
    'and the pilot saying something does, wherever in the thread it lands',
  );
});

// --- the arithmetic ---------------------------------------------------------

test('the bookmark counts the listed threads this browser has not seen', () => {
  const page = aPage({ threads: ['itm_1', 'itm_2'] });

  assert.equal(page.count(), '2', 'nothing has been seen, so both are new');
  assert.deepEqual(page.showing(), ['itm_1', 'itm_2'], 'and both lines are there to click');
});

test('a thread seen at what the pilot has said is neither counted nor listed', () => {
  const page = aPage({ threads: ['itm_1', 'itm_2'], stored: { [SEEN]: '{"itm_1":1}' } });

  assert.equal(page.count(), '1', 'one of the two is new');
  assert.deepEqual(page.showing(), ['itm_2'], 'and the one already read is off the panel');
});

test('nothing unseen leaves no count on the bookmark at all, not a zero', () => {
  const page = aPage({ threads: ['itm_1', 'itm_2'], stored: { [SEEN]: '{"itm_1":1,"itm_2":1}' } });

  assert.equal(page.count(), null, 'a bookmark with nothing to say says nothing');
  assert.deepEqual(page.showing(), [], 'and an empty panel, which is what having read them looks like');
});

test('a thread the pilot has written on again is unseen once more, and back on the panel', () => {
  // The user read it when the pilot had said one thing. It has said another.
  const page = aPage({ threads: [['itm_1', 2]], stored: { [SEEN]: '{"itm_1":1}' } });

  assert.equal(page.count(), '1', 'a thread that has changed since it was read is news again');
  assert.deepEqual(page.showing(), ['itm_1']);
});

test('a thread seen at a later count than this page was drawn with is still seen', () => {
  // Another tab of the same browser read it after a message this page predates.
  const page = aPage({ threads: ['itm_1'], stored: { [SEEN]: '{"itm_1":5}' } });

  assert.equal(page.count(), null, 'a mark ahead of the page is not a thread to flag');
});

test('a panel with no thread in it counts nothing', () => {
  const page = aPage({ threads: [], stored: { [SEEN]: '{"itm_1":1}' } });

  assert.equal(page.count(), null);
  assert.equal(
    page.seen(),
    null,
    'and the key goes with the last thread it remembered: a key holding nothing is no key',
  );
});

test('a key this browser cannot read is nothing seen, not a broken page', () => {
  const page = aPage({ threads: ['itm_1'], stored: { [SEEN]: 'not json' } });

  assert.equal(page.count(), '1');
});

test('a value in the key that is not a number is read as nothing seen', () => {
  const page = aPage({
    threads: ['itm_1', 'itm_2'],
    stored: { [SEEN]: '{"itm_1":"yes","itm_2":1}' },
  });

  assert.equal(page.count(), '1', 'the unreadable one is shown again rather than hidden on a guess');
  assert.deepEqual(page.showing(), ['itm_1']);
});

/**
 * The shape this key held before the amendment: a plain list of ids, with no
 * count in it. A real browser of the user's has one, so it is read rather than
 * thrown away — a thread in that list had been looked at, which is exactly
 * "seen at the first thing the pilot said", and anything the pilot has said
 * since makes it unseen again. Discarding it would flag every thread they had
 * already read; throwing on it would leave the panel with no count at all.
 */
test('a key written in the old list shape is read, not thrown away', () => {
  const page = aPage({
    threads: ['itm_1', ['itm_2', 3], 'itm_3'],
    stored: { [SEEN]: '["itm_1","itm_2"]' },
  });

  assert.deepEqual(page.showing(), ['itm_2', 'itm_3'], 'itm_1 was read and stays read');
  assert.equal(page.count(), '2', 'itm_2 has moved on since, and itm_3 was never read');
  assert.deepEqual(page.seen(), { itm_1: 1, itm_2: 1 }, 'and the key is a map from then on');
});

// --- opening the panel marks nothing (the amendment) -----------------------

test('opening the panel changes neither the count nor the key', () => {
  const page = aPage({ threads: ['itm_1', 'itm_2'] });
  assert.equal(page.count(), '2');

  page.toggle(true);

  assert.equal(page.count(), '2', 'reading a list of titles is not reading the threads');
  assert.equal(page.seen(), null, 'and nothing was written: opening the panel is not an event here');
});

test('a thread arriving while the panel stands open is counted like any other', async () => {
  const page = aPage({ threads: ['itm_1'], open: true, stored: { [SEEN]: '{"itm_1":1}' } });
  assert.equal(page.count(), null);

  await page.changed([['itm_2', 1], ['itm_1', 1]]);

  assert.equal(page.count(), '1', 'an open panel is not a thread read');
});

// --- the key is pruned, and unscoped (L24) --------------------------------

test('the key is pruned on write to the threads still on the deck', () => {
  const page = aPage({
    threads: ['itm_2'],
    stored: { [SEEN]: '{"itm_1":1,"itm_2":1,"itm_3":2}' },
  });

  assert.deepEqual(
    page.seen(),
    { itm_2: 1 },
    'a thread that has left the deck leaves the key with it, or the key only ever grows',
  );
});

test('the key carries no ?run= token: it is one key for every deck (L24)', () => {
  const onADeck = aPage({ threads: ['itm_1'], at: `/?run=${encodeURIComponent(A)}` });
  const onTheOverview = aPage({ threads: ['itm_1'], at: '/?run=' });

  onADeck.drop(onADeck.notices[0]);
  onTheOverview.drop(onTheOverview.notices[0]);

  assert.deepEqual([...onADeck.store.keys()], [SEEN], 'one key, and it is that one');
  assert.deepEqual([...onTheOverview.store.keys()], [SEEN], 'the same key on the overview');
  for (const key of onADeck.store.keys()) {
    assert.doesNotMatch(key, /run=|alpha/, 'the count is cross-deck, so its key names no deck');
  }
});

test('a key restating what it already holds is not written again', () => {
  const page = aPage({ threads: ['itm_1'], stored: { [SEEN]: '{"itm_1":1}' } });
  const writes = [];
  const store = page.store;
  const setItem = store.set.bind(store);
  store.set = (key, value) => {
    writes.push(key);
    return setItem(key, value);
  };

  page.drop(page.notices[0]);

  assert.deepEqual(writes, [], 'nothing changed, so nothing was written');
});

// --- a thread arriving raises the count, with nothing reloaded ------------

test('a thread posted on another deck raises the count on the page in place', async () => {
  const page = aPage({ threads: ['itm_1'], stored: { [SEEN]: '{"itm_1":1}' } });
  assert.equal(page.count(), null, 'the one open thread has been seen');

  await page.changed(['itm_2', 'itm_1']);

  assert.equal(page.count(), '1', 'the thread that has just arrived is the one that is new');
  assert.equal(page.fetched.length, 1, 'one read of the address the page is already at, and no reload');
  assert.deepEqual(page.seen(), { itm_1: 1 }, 'and what was already read stays read');
});

test('a thread already read arrives hidden, and the others do not', async () => {
  const page = aPage({ threads: ['itm_1'], stored: { [SEEN]: '{"itm_1":1}' } });

  const fresh = await page.changed(['itm_3', 'itm_2', 'itm_1']);

  const hidden = fresh.notices.filter((line) => line.hidden).map((line) => line.dataset.thread);
  assert.deepEqual(hidden, ['itm_1'], 'the line already read arrives already hidden, and only it');
  assert.equal(page.count(), '2', 'the two lines still listed are the two that are new');
});

// --- the × marks the thread seen, and that survives a reload -------------

test('the × hides its line and takes it out of the count', () => {
  const page = aPage({ threads: ['itm_1', 'itm_2'] });
  assert.equal(page.count(), '2');

  page.drop(page.notices[0]);

  assert.equal(page.notices[0].hidden, true, 'that line is gone');
  assert.equal(page.notices[1].hidden, false, 'and the others are where they were');
  assert.equal(page.count(), '1', 'a line that is gone is not a thread waiting to be seen');
});

test('the × posts nothing: it closes no thread and dismisses no run (L25)', () => {
  const page = aPage({ threads: ['itm_1'] });

  page.drop(page.notices[0]);

  assert.deepEqual(page.fetched, [], 'nothing was sent to the deck');
});

/**
 * The user's own report at Gate 2: "deleting a notification deletes it from
 * view, but when I reload it spawns back in." The × was page-scoped — a list
 * inside the script, put back across a swap and gone with the page — so a
 * reload drew every line again. It writes the mark now, the same mark opening
 * the thread writes, and the line stays gone until the pilot says something.
 */
test('a line dropped with the × is still gone after a reload', () => {
  const browser = new Map();
  const first = aPage({ threads: ['itm_1', 'itm_2'], store: browser });

  first.drop(first.notices[0]);
  assert.deepEqual(first.seen(), { itm_1: 1 }, 'the × wrote the mark, and only for its own line');

  // A reload, or any other page of the deck: the same browser, both threads
  // still open on the deck, so the server draws both lines again.
  const next = aPage({ threads: ['itm_1', 'itm_2'], store: browser });

  assert.deepEqual(next.showing(), ['itm_2'], 'the dropped line does not spawn back in');
  assert.equal(next.count(), '1', 'and it is not counted either');
});

test('a thread dropped with the × comes back when the pilot says something', () => {
  const browser = new Map();
  const first = aPage({ threads: ['itm_1'], store: browser });
  first.drop(first.notices[0]);

  // The pilot pushes back on the thread the user had finished with.
  const next = aPage({ threads: [['itm_1', 2]], store: browser });

  assert.deepEqual(next.showing(), ['itm_1'], 'the × is "I am done for now", not "never again"');
  assert.equal(next.count(), '1');
});

// --- Mark all seen (notifications-seen S1, spec 1, 2, 6, L2, L5) ----------

test('Mark all seen marks every listed thread at its own count', () => {
  const page = aPage({ threads: ['itm_1', ['itm_2', 3]], closed: [['itm_n', '2026-10-01T10:00:00.000Z']] });

  page.markAll();

  assert.deepEqual(page.showing(), [], 'every listed thread is hidden');
  assert.deepEqual(page.seen(), { itm_1: 1, itm_2: 3 }, 'each at its own data-said');
  assert.deepEqual(page.fetched, [], 'the click itself sends nothing to the deck');
});

test('a pilot write after the press lights that thread alone', async () => {
  const page = aPage({ threads: ['itm_1', 'itm_2'] });
  page.markAll();

  await page.changed(['itm_1', ['itm_2', 2]]);

  assert.deepEqual(page.showing(), ['itm_2']);
  assert.equal(page.count(), '1');
});

test("the notices' share stays until the swap removes them", async () => {
  const closed = [['itm_n', '2026-10-01T10:00:00.000Z'], ['itm_m', '2026-10-02T10:00:00.000Z']];
  const page = aPage({ threads: ['itm_1'], closed });
  assert.equal(page.count(), '3');

  page.markAll();
  assert.equal(page.count(), '2', 'the open thread goes at once; the notices wait for the deck');

  await page.changed(['itm_1'], []);
  assert.equal(page.count(), null);
});

test('Mark all seen is drawn only while a row shows (spec 5)', async () => {
  const seenAll = aPage({ threads: ['itm_1', 'itm_2'] });
  assert.equal(seenAll.markAllShown(), true);
  seenAll.markAll();
  assert.equal(seenAll.markAllShown(), false, 'every thread seen and no notice: the panel would hold only the button');

  await seenAll.changed(['itm_1', ['itm_2', 2]]);
  assert.equal(seenAll.markAllShown(), true, 'one unseen line brings it back');

  const withNotice = aPage({ threads: ['itm_1'], closed: [['itm_n', '2026-10-01T10:00:00.000Z']] });
  withNotice.markAll();
  assert.equal(withNotice.markAllShown(), true, 'a notice row stays until the deck clears it (L5)');
});

// --- opening a thread's page marks that thread seen -----------------------

test('a thread`s own page marks it seen, at what the pilot has said so far', () => {
  const browser = new Map();
  const onIt = aPage({ threads: [['itm_1', 2], 'itm_2'], at: '/thread/itm_1', store: browser });

  assert.deepEqual(onIt.seen(), { itm_1: 2 }, 'the thread being read, at the count it was read at');
  assert.equal(onIt.count(), '1', 'and the other one is still waiting to be looked at');

  const elsewhere = aPage({ threads: [['itm_1', 2], 'itm_2'], store: browser });
  assert.deepEqual(elsewhere.showing(), ['itm_2'], 'which holds on the next page, and on a reload');
});

test('an id in the address that is on no line marks nothing, and does not throw', () => {
  const page = aPage({ threads: ['itm_1'], at: '/thread/itm_gone' });

  assert.equal(page.count(), '1', 'a resolved thread is on no line, so there is nothing to mark');
  assert.equal(page.seen(), null, 'and nothing is invented for it');
});

test('the id in the address is decoded before it is matched', () => {
  // Ids are `itm_<hex>` and carry nothing that has to be escaped, but the
  // address is the browser's and is read as one — so the script decodes it
  // rather than matching the raw path, and a `%5F` still finds its own line.
  const page = aPage({ threads: ['itm_1'], at: '/thread/itm%5F1' });

  assert.deepEqual(page.seen(), { itm_1: 1 }, 'the same thread, spelt the other way');
});

test('the home page marks nothing seen, however many lines it draws', () => {
  const page = aPage({ threads: ['itm_1', 'itm_2'], at: `/?run=${encodeURIComponent(A)}` });

  assert.equal(page.count(), '2', 'a page of cards is not a thread opened');
  assert.equal(page.seen(), null);
});

test('a pilot message arriving on the thread the user is reading does not flag it', async () => {
  const page = aPage({ threads: ['itm_1', 'itm_2'], at: '/thread/itm_1' });
  assert.equal(page.count(), '1', 'itm_2, which they have not looked at');

  // The pilot pushes back while they are on the page. The thread has changed,
  // and they are looking at it as it changes.
  await page.changed([['itm_1', 2], 'itm_2']);

  assert.equal(page.count(), '1', 'still only itm_2: this one is being read');
  assert.deepEqual(page.seen(), { itm_1: 2 }, 'and the mark moved up with it');
});

// --- the × stands at the right edge of its line, whatever the title ------
// --- (the user at Gate 2, 2026-09-23) -------------------------------------

/**
 * The × was the last thing in an inline row, so it stood wherever the title's
 * last word left it: measured on the preview across the six lines of one
 * panel, its right edge at x=303, 257, 173, 227, 135 and 196, and below the
 * title's first line on every one of them — a mark that moves is a mark the
 * user has to look for.
 *
 * It is taken out of the flow rather than laid out as a flex row, for the
 * reason the rule itself gives: the title and the deck's name beside it are
 * one sentence that wraps, and three flex items would stand the deck's name in
 * a column of its own beside a two-line title. The row reserves the mark's
 * width on its right so a wrapping title stops before it, which is what
 * `.tree li` already does for its marker on the left.
 *
 * Where the mark lands is a browser measurement — this file's preamble says
 * what the panel looks like is not had from a stand-in — and the declarations
 * are what a test can hold.
 */
test("the × is out of the flow at the row's right edge, with room reserved for it", () => {
  const row = deckCss.match(/\n\.notice \{[^}]*\}/)[0];
  const drop = deckCss.match(/\n\.notice \.drop[^{]*\{[^}]*\}/)[0];

  assert.match(row, /position:\s*relative/, 'the mark is positioned against its own row, not against the panel');
  assert.match(row, /padding-right:/, 'without reserved room a long title wraps under the mark instead of before it');
  assert.match(drop, /position:\s*absolute/, 'in the flow it stands wherever the last word left it');
  assert.match(drop, /right:\s*0/, 'the right edge of the row is the whole of the ask');
  // The row alone, not the file: the mark is out of the flow and may carry a
  // `display` of its own, and only a `display` on the row would beat `hidden`.
  assert.doesNotMatch(
    row,
    /display:/,
    'a display of any kind on the row beats the `hidden` the × sets, and the × would appear to do nothing',
  );
});

// --- the region is a module, installed against its env alone (S5, L11) -----
// The tests above install the whole page; these install `notifications.mjs`
// with nothing around it, so a module that leaned on a sibling's variables
// fails here rather than only in a browser.

test('the notifications module alone counts the threads this browser has not seen', () => {
  const page = aPage({
    threads: ['itm_1', 'itm_2'],
    stored: { [SEEN]: '{"itm_1":1}' },
    install: installNotifications,
  });

  assert.equal(page.count(), '1');
  assert.deepEqual(page.showing(), ['itm_2']);
});

test('the notifications module alone writes the × into the key a reload reads', () => {
  const page = aPage({ threads: ['itm_1', 'itm_2'], install: installNotifications });

  page.drop(page.notices[0]);

  assert.deepEqual(page.seen(), { itm_1: 1 }, 'the key and its shape as they were');
  assert.equal(page.count(), '1');
});

test('the notifications module alone marks the thread whose page this is', () => {
  const page = aPage({ threads: [['itm_1', 2], 'itm_2'], at: '/thread/itm_1', install: installNotifications });

  assert.deepEqual(page.seen(), { itm_1: 2 });
});

test('what the module hands the live updates hides a fresh line this browser has read', () => {
  const page = aPage({ threads: ['itm_1', 'itm_2'], stored: { [SEEN]: '{"itm_1":1}' }, install: installNotifications });
  const fresh = [aNotice('itm_1'), aNotice('itm_2')];

  page.installed.rehide({ querySelector: () => null, querySelectorAll: (selector) => (selector === '.notice' ? fresh : []) });

  assert.deepEqual(
    fresh.map((line) => line.hidden),
    [true, false],
    'put back on the fetched page before it is compared, as a fold is',
  );
});

// --- a closing report takes an × too (deck-polish S7, spec 6, A4) ----------
// The same promise as a notice's ×, kept under a key of its own: the report is
// hidden in this browser and nothing is sent, so its thread still opens.

const HIDDEN_REPORTS = 'deck.hiddenReports';

/** One row of the Closing reports panel, as `renderReportRow` draws it. */
const aReportRow = (id, open = true) => {
  const row = { dataset: { report: id }, hidden: false };
  row.querySelector = (selector) => (selector === '.open' && open ? {} : null);
  row.drop = {
    closest: (selector) =>
      selector === '[data-report] .drop' ? row.drop : selector === '[data-report]' ? row : null,
  };
  return row;
};

/** A tab's page with only the Closing reports bookmark on its rail. */
function aReportsPage({ reports = [], store = new Map() } = {}) {
  const summary = aSummary();
  const rows = reports.map((report) => (Array.isArray(report) ? aReportRow(...report) : aReportRow(report)));
  const allHidden = { hidden: true };
  const bookmark = {
    id: 'reports',
    querySelector: (selector) => (selector === 'summary' ? summary : selector === '[data-all-hidden]' ? allHidden : null),
    querySelectorAll: (selector) => (selector === '[data-report]' ? rows : []),
  };
  const clicks = [];
  const document = {
    querySelectorAll: (selector) => (selector === 'details.tab' ? [bookmark] : []),
    querySelector: () => null,
    addEventListener: (type, handler) => type === 'click' && clicks.push(handler),
  };
  const installed = installNotifications(
    aSandbox({
      document,
      location: { pathname: '/', search: '?run=x', href: 'http://127.0.0.1:4322/?run=x' },
      localStorage: {
        getItem: (key) => (store.has(key) ? store.get(key) : null),
        setItem: (key, value) => store.set(key, value),
        removeItem: (key) => store.delete(key),
      },
    }),
  );
  return {
    installed,
    store,
    rows,
    count: () => summary.attrs['data-count'] ?? null,
    allHidden: () => !allHidden.hidden,
    showing: () => rows.filter((row) => !row.hidden).map((row) => row.dataset.report),
    drop: (row) => clicks.forEach((handler) => handler({ target: row.drop })),
  };
}

test('a report row carries an ×', () => {
  const report = { id: 'r1', kind: 'report', title: 'A report', body: 'x', repo: A, replies: [] };
  const page = renderHomePage([report], [{ id: 'run_1', repo: A, name: 'alpha', pid: process.pid }], A);

  const list = page.match(/<ol class="reports-list">.*?<\/ol>/s)?.[0] ?? '';

  assert.match(
    list,
    /<li data-report="r1">.*<button type="button" class="drop" title="Take this off the panel">×<\/button><\/li>/,
  );
});

test('pressing × hides the row and it stays hidden after a reload and after a live swap', () => {
  const page = aReportsPage({ reports: ['r1', 'r2'] });

  page.drop(page.rows[0]);

  assert.deepEqual(page.showing(), ['r2'], 'the row goes at once');
  assert.deepEqual(JSON.parse(page.store.get(HIDDEN_REPORTS)), ['r1'], 'and is remembered');

  const reloaded = aReportsPage({ reports: ['r1', 'r2'], store: page.store });
  assert.deepEqual(reloaded.showing(), ['r2'], 'a reload draws it hidden');

  const fresh = [aReportRow('r1'), aReportRow('r2')];
  reloaded.installed.rehide({
    querySelector: () => null,
    querySelectorAll: (selector) => (selector === '[data-report]' ? fresh : []),
  });
  assert.deepEqual(
    fresh.map((row) => row.hidden),
    [true, false],
    'a swapped-in panel arrives with it hidden',
  );
});

test('an unreadable deck.hiddenReports hides nothing, and × starts it afresh', () => {
  for (const kept of ['{not json', '{"r1":true}']) {
    const page = aReportsPage({ reports: ['r1', 'r2'], store: new Map([[HIDDEN_REPORTS, kept]]) });
    assert.deepEqual(page.showing(), ['r1', 'r2'], `${kept} is nothing hidden`);
    page.drop(page.rows[1]);
    assert.deepEqual(JSON.parse(page.store.get(HIDDEN_REPORTS)), ['r2'], `${kept} is replaced by a list`);
  }
});

test('the Closing reports count drops by the hidden rows', () => {
  const page = aReportsPage({ reports: ['r1', 'r2', ['r3', false]] });
  assert.equal(page.count(), '2', 'the open rows, as the server counts them');

  page.drop(page.rows[0]);
  assert.equal(page.count(), '1');

  page.drop(page.rows[1]);
  assert.equal(page.count(), null, 'no count at all past zero, as the server draws it');
});

test('a panel whose every report is hidden says so, and not before', () => {
  const report = { id: 'r1', kind: 'report', title: 'A report', body: 'x', repo: A, replies: [] };
  const drawn = renderHomePage([report], [{ id: 'run_1', repo: A, name: 'alpha', pid: process.pid }], A);
  assert.match(drawn, /<p class="nobody" data-all-hidden hidden>all hidden<\/p>/, 'the line ships hidden');

  const page = aReportsPage({ reports: ['r1', ['r2', false]] });
  assert.equal(page.allHidden(), false, 'a row still shows');
  page.drop(page.rows[0]);
  assert.equal(page.allHidden(), false, 'a closed report still shows');
  page.drop(page.rows[1]);
  assert.equal(page.allHidden(), true, 'nothing left to show: the line says why');
  const reloaded = aReportsPage({ reports: ['r1', 'r2'], store: page.store });
  assert.equal(reloaded.allHidden(), true, 'and after a reload');

  const line = { hidden: true };
  reloaded.installed.rehide({
    querySelector: (selector) => (selector === '[data-all-hidden]' ? line : null),
    querySelectorAll: (selector) => (selector === '[data-report]' ? [aReportRow('r1'), aReportRow('r2')] : []),
  });
  assert.equal(line.hidden, false, "a live swap's fresh panel arrives saying so, so it matches the page");
});

test("the hidden report's thread still opens", async (t) => {
  const origin = await deckOnAPort(t);
  const { postItem, listItems } = await import('../store.mjs');
  const report = postItem({ kind: 'report', title: 'A closing report', body: 'x', repo: A });
  const before = JSON.stringify(listItems().find((item) => item.id === report.id));

  const response = await fetch(`${origin}/thread/${encodeURIComponent(report.id)}`);

  assert.equal(response.status, 200);
  assert.match(await response.text(), /A closing report/);
  assert.equal(JSON.stringify(listItems().find((item) => item.id === report.id)), before, 'the item is untouched');
});

test('the Closing reports list reads newest message first, not newest posted (L13)', () => {
  const aReport = (id, postedAt, replies = []) => ({ id, kind: 'report', title: id, body: 'x', repo: A, postedAt, replies });
  const items = [
    aReport('older-post-newer-word', '2026-09-01T00:00:00.000Z', [
      { from: 'pilot', text: 'more', repliedAt: '2026-09-03T00:00:00.000Z' },
    ]),
    aReport('newer-post-quiet', '2026-09-02T00:00:00.000Z'),
  ];
  const page = renderHomePage(items, [{ id: 'run_1', repo: A, name: 'alpha', pid: process.pid }], A);

  assert.deepEqual(
    [...page.matchAll(/<li data-report="([^"]+)"/g)].map((match) => match[1]),
    ['older-post-newer-word', 'newer-post-quiet'],
  );
});

// --- deck-press-feedback S5: the count at first paint, the highlight while unseen (spec 9, 12; L8)

/** The key the highlight is kept against: when this browser last had the tab open. */
const OPENED = 'deck.notificationsOpenedAt';

const aClosedThread = (id, resolvedAt, notice = true) => ({
  id, kind: KIND_QUESTION, title: id, body: 'x', repo: A, replies: [], resolution: 'done', resolvedAt,
  ...(notice ? { notice: true } : {}),
});

/** The Notifications `<summary>` exactly as served, before any script has run. */
const servedSummary = (items) =>
  /<details class="tab" id="notifications">\s*(<summary[^>]*>[^<]*<\/summary>)/.exec(
    renderHomePage(items, [{ id: 'run_1', repo: A, name: 'alpha', pid: process.pid }], A),
  )?.[1];

test('two pending notices put count 2 in the served HTML', () => {
  const items = [aClosedThread('itm_a', '2026-10-01T10:00:00.000Z'), aClosedThread('itm_b', '2026-10-02T10:00:00.000Z')];

  assert.equal(servedSummary(items), '<summary data-count="2">Notifications</summary>', 'no script has run');
  assert.match(
    renderHomePage(items, [], null),
    new RegExp(`data-notice="itm_b" data-at="${Date.parse('2026-10-02T10:00:00.000Z')}"`),
    'each notice carries when it was closed, which is what the highlight is kept against',
  );
});

test('clearing one serves count 1', () => {
  const items = [aClosedThread('itm_a', '2026-10-01T10:00:00.000Z'), aClosedThread('itm_b', '2026-10-02T10:00:00.000Z', false)];

  assert.equal(servedSummary(items), '<summary data-count="1">Notifications</summary>');
  assert.equal(servedSummary([]), '<summary>Notifications</summary>', 'none: no attribute at all, not a zero');
});

test('a notice newer than the opened stamp sets data-highlight, on any tab', async () => {
  const stale = aPage({
    closed: [['itm_n', '2026-10-01T10:00:00.000Z']],
    stored: { [OPENED]: '2026-10-01T11:00:00.000Z' },
  });
  assert.equal(stale.highlighted(), false, 'seen with the tab open since it arrived');
  assert.equal(stale.count(), '1', 'but still counted: the count is what is there, the highlight what is new');

  const page = aPage({
    threads: ['itm_1'],
    closed: [['itm_n', '2026-10-01T10:00:00.000Z']],
    stored: { [OPENED]: '2026-10-01T09:00:00.000Z' },
    at: '/thread/itm_other',
  });
  assert.equal(page.highlighted(), true, 'a notice the tab has not shown since it arrived');
  assert.equal(page.count(), '2', 'the notice and the open thread this browser has not seen');

  const fresh = aPage({ at: '/?run=elsewhere' });
  assert.equal(fresh.highlighted(), false);
  await fresh.changed([], [['itm_m', '2026-10-01T10:00:00.000Z']]);
  assert.equal(fresh.highlighted(), true, 'a notice arriving on another tab lights it in place, with no reload');
  assert.equal(fresh.count(), '1');
});

test('opening the tab clears the highlight, and the next notice brings it back', async () => {
  const page = aPage({ closed: [['itm_n', '2026-10-01T10:00:00.000Z']] });
  assert.equal(page.highlighted(), true, 'never opened: everything on it is new');

  page.toggle(true);
  assert.equal(page.highlighted(), false, 'opened: the highlight goes');
  assert.ok(Date.parse(page.store.get(OPENED)) >= Date.parse('2026-10-01T10:00:00.000Z'), 'and the stamp is written');
  assert.equal(page.count(), '1', 'the count stays until the notice is cleared');
  page.toggle(false);
  assert.equal(page.highlighted(), false, 'shutting it again brings nothing back');

  await page.changed([], [['itm_later', '2999-01-01T00:00:00.000Z'], ['itm_n', '2026-10-01T10:00:00.000Z']]);
  assert.equal(page.highlighted(), true, 'the next notice lights it again');
  assert.equal(page.count(), '2');
});

test('clearing the last notice row leaves no count on the bookmark', async () => {
  const page = aPage({ closed: [['itm_n', '2026-10-01T10:00:00.000Z']] });
  assert.equal(page.count(), '1');

  await page.changed([], []);
  assert.equal(page.count(), null, 'data-count is removed, not left at zero');
});

test('the highlight carries a marker, not only a colour', () => {
  const rule = deckCss.match(/\n[^{\n]*summary\[data-highlight\]::before[^{]*\{[^}]*\}/)?.[0] ?? '';

  assert.match(rule, /content:\s*"[^"\s]+"/, 'a mark that reads in greyscale, drawn by the stylesheet');
  assert.match(rule, /position:\s*absolute/, 'out of the flow, so the label down the edge stands still');
});
