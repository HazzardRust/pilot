/**
 * Slice S2 of deck-workspace: a panel resizes in both dimensions, remembers
 * the size **per deck**, and wraps a name at word boundaries instead of
 * breaking it mid-word — spec 6 no longer asks for a sideways scrollbar; the
 * user reversed that at Gate 2 (spec 5 and 6; L4, L5, L6).
 *
 * The drag itself is still the platform's own — `resize: both` in `deck.css`
 * — so there is nothing here about mouse events. What `size.mjs` owns is
 * noticing the size the browser already set and remembering it under the deck
 * the page is showing, and putting it back before the page is looked at
 * again. The deck is the address's own `?run=` token (L4), which is the token
 * the strip's links already carry, so switching tabs switches sizes with no
 * reload — and a tab is picked in place (D1), so the panel has to follow the
 * deck there and not only on arrival.
 *
 * `localStorage`, not `sessionStorage`: a tab the deck opened itself (D14)
 * does not inherit the opener's, and the size should still be there.
 *
 * The script is installed through `loadPage` here the same way `deck/test/live.test.mjs`
 * runs it, against the least DOM this slice touches: the three panels, a
 * `localStorage` a test can preset and inspect, a `ResizeObserver` a test can
 * fire by hand in place of a real drag, and an address a test can move the
 * way a press on a run's tab moves it.
 *
 * S13 of the same feature added the other half of what a panel's box is: the
 * open panels are one column, each one's top edge on the bottom edge of the
 * one above and each capped at what is left to the foot of the window (spec
 * 22 and 23), written by a layout pass in `layout.mjs` rather than by the two
 * `:has()` counters that used to give every panel a fraction of the viewport
 * (L17). The arithmetic is what is tested here — the sum, which panels are in
 * it, and that the pass writes no height and no width (L18). Whether the
 * edges really meet in a browser is the slice's live gate and cannot be had
 * from a stand-in.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { aSandbox, loadPage } from '../testUtils.mjs';
import { install as installBookmarks } from '../ui/js/bookmarks.mjs';
import { install as installLayout } from '../ui/js/layout.mjs';
import { install as installSize } from '../ui/js/size.mjs';

const UI = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'ui');

/** The size module's own text, where spec 34's band is declared. */
const sizeJs = fs.readFileSync(path.join(UI, 'js', 'size.mjs'), 'utf8');

/**
 * Every module the page loads, read as one text: a claim about what the page's
 * script never does (a drag handler of its own, a custom property written)
 * holds of all of it, whichever module the code sits in now (ADR 0030).
 */
const deckJs = fs
  .readdirSync(path.join(UI, 'js'))
  .filter((name) => name.endsWith('.mjs'))
  .map((name) => fs.readFileSync(path.join(UI, 'js', name), 'utf8'))
  .join('\n');
const deckCss = fs.readFileSync(path.join(UI, 'deck.css'), 'utf8');

/** The overview's own address, which is the page a card carrying no tab was drawn on. */
const OVERVIEW = '/?run=';

/** A run's tab, as `render.mjs` writes its link: the repository path, encoded. */
const tabFor = (repo) => `/?run=${encodeURIComponent(repo)}`;

const A = 'D:\\work\\alpha';
const B = 'D:\\work\\beta';

/**
 * Where the group stands: `.strip` is fixed at `top: 4rem`, which is 64px, so
 * a panel at the top of it is 64px down the window. The pass writes a `top` in
 * the strip's own coordinates and counts the cap from the window, and this is
 * the one number between the two.
 */
const GROUP_TOP = 64;

/**
 * The floor `deck.css` gives a panel: `min-height: 4rem`, which is 64px.
 *
 * It was `6rem` until Gate 2 on 2026-09-23, where the user's complaint about
 * white space reached the Agents panel: 96px is taller than that panel's whole
 * content, so the floor was the blank box (measured empty, and 36px of blank
 * under two live agents), which is line 23's own complaint. 64px is the panel's
 * name and one line of what it holds, measured at 60.8px in the browser, and
 * four times the 15px the grabber collapses an unfloored panel to.
 */
const FLOOR = 64;

/**
 * The width `deck.css` gives a panel: `--panel: 19rem`, which is 304px. Spec
 * 34's band is measured against it, and the script measures it off the element
 * rather than carrying the number, so this is the stand-in's own copy of what
 * the browser would report.
 */
const DEFAULT_WIDTH = 304;

/**
 * A `.panel` element the way `strips.html` renders one: `data-live`, a style
 * object, and a box it reports the way a browser would — its own top read back
 * out of whatever the layout pass wrote there, measured against the strip it is
 * positioned inside. So the running sum the pass walks is *measured* here, as
 * it is in a browser, rather than asserted from outside it.
 *
 * `tall` is the used height a browser would give it: the content's, or the one
 * the user dragged.
 *
 * The width is not a field but is *derived* from the inline style, because
 * that is what a browser does and spec 34 depends on it: the used width has to
 * follow whoever wrote the style last — `fit` putting a deck's remembered
 * width back, the grabber dragging one, or the snap clearing it — and a field
 * only one of those three updates would report a stale box to the band. With
 * nothing inline it is the stylesheet's own, which is what a panel that
 * remembers nothing reports.
 *
 * The cap is not modelled — whether a panel with more content than room really
 * scrolls inside its own `max-height` is the browser's business and the
 * slice's live gate. What a stand-in can hold is the arithmetic, and that is
 * what these tests are.
 */
const usedWidth = (value) => {
  if (!value) return DEFAULT_WIDTH;
  // A browser resolves `18rem` against the root's 16px and reports 288; a band
  // of pixels has to be compared against pixels whatever unit was dragged.
  return value.endsWith('rem') ? parseFloat(value) * 16 : parseFloat(value);
};

const aPanel = (live, tall = 120, boxless = false) => {
  const panel = {
    dataset: { live },
    style: {},
    tall,
    // Whether the browser gives this panel a box at all. Chrome keeps one for
    // a panel inside a shut `<details>` and reports its width (measured: 304
    // at a 1280 window, 264 at 360 where `max-width` clamps), but an engine
    // that hides those children with `display: none` reports 0 — and spec 34's
    // band cannot be measured against 0.
    boxless,
    // The stylesheet's own floor, which the pass reads off the element so that
    // `4rem` stays written once in `deck.css`.
    computed: { minHeight: `${FLOOR}px` },
    getBoundingClientRect() {
      const top = GROUP_TOP + parseFloat(panel.style.top || 0);
      const width = panel.boxless ? 0 : usedWidth(panel.style.width);
      return { top, bottom: top + panel.tall, height: panel.tall, width };
    },
  };
  return panel;
};

/**
 * The `<details class="tab">` a panel is the panel of. The script asks a
 * bookmark for its id, whether it is open, and to be told when that changes —
 * opening and closing stay the element's own doing, with no handler of the
 * script's on one (D5).
 */
const aBookmark = (panel, open, toggles) => ({
  id: panel.dataset.live,
  open,
  panel,
  addEventListener(type, handler) {
    if (type === 'toggle') toggles.push({ id: panel.dataset.live, handler });
  },
});

/** An address the way the browser holds one, split the two ways the script reads it. */
const anAddress = (at) => new URL(at, 'http://127.0.0.1:4322');

/**
 * A link in the strip of run tabs. `closest` answers only the selector the
 * navigation handler asks with, so the other click handlers on the document —
 * the settle, the dismiss question — see nothing of it, exactly as they see
 * nothing of a real link.
 */
function aTab(href) {
  const link = {
    href,
    blurred: 0,
    blur() {
      link.blurred += 1;
    },
    getAttribute: (name) => (name === 'href' ? href : null),
    closest: (selector) => (selector === '.runs-strip a, a.everything' ? link : null),
  };
  return link;
}

/**
 * A page with its script running on it: the three panels in their bookmarks, a
 * real `localStorage` a test can preset and read back, a `ResizeObserver`
 * whose callback a test fires by hand — standing in for the browser noticing
 * the size its own resize handle just set — and an address that moves when the
 * script pushes one, the way the browser's does.
 *
 * `tall` is how tall the browser draws each panel, keyed by name, and `shut`
 * names the bookmarks that are closed. Both are the layout pass's only two
 * inputs, so a test that is about the column says exactly one of them.
 */
function aPage({ stored = {}, at = OVERVIEW, tall = {}, shut = [], boxless = [], install = loadPage } = {}) {
  const tree = aPanel('tree', tall.tree, boxless.includes('tree'));
  const table = aPanel('table', tall.table);
  const agents = aPanel('agents', tall.agents);
  const panels = [tree, table, agents];
  const toggles = [];
  const bookmarks = panels.map((panel) =>
    aBookmark(panel, !shut.includes(panel.dataset.live), toggles),
  );
  const openBookmarks = () => bookmarks.filter((bookmark) => bookmark.open);
  const listeners = {};
  const observers = [];
  const frames = [];
  const store = new Map(Object.entries(stored));
  // `pathname` is the third way the script reads the address; `notifications.mjs`
  // is what still asks for it.
  const location = {
    href: anAddress(at).href,
    search: anAddress(at).search,
    pathname: anAddress(at).pathname,
  };

  const document = {
    activeElement: null,
    querySelectorAll(selector) {
      if (selector === '.panel') return panels;
      if (selector === 'details.tab') return bookmarks;
      if (selector === 'details.tab[open]') return openBookmarks();
      // The open panels in document order, which is the order the column is
      // in: the same relationship the deleted `:has()` counters read, asked
      // for as one selector instead of counted in two.
      if (selector === '.tab[open] > .panel') return openBookmarks().map((bookmark) => bookmark.panel);
      return [];
    },
    querySelector: () => null,
    addEventListener(type, handler) {
      (listeners[type] ??= []).push(handler);
    },
  };

  const sandbox = aSandbox({
    document,
    location,
    // The stylesheet as the browser has resolved it, which is where the pass
    // reads a panel's floor from rather than carrying `6rem` a second time.
    getComputedStyle: (element) => element.computed,
    fetched: [],
    fetch: (...args) => {
      sandbox.fetched.push(args);
      return new Promise(() => {});
    },
    // The browser's own: a pushed address is the address from then on, which
    // is what makes the deck the page is showing change without a reload.
    history: {
      pushState(state, title, url) {
        const next = anAddress(url);
        location.href = next.href;
        location.search = next.search;
        location.pathname = next.pathname;
      },
    },
    // The one storage this file is about: a size a browser remembers between
    // pages, which a test presets and reads back.
    localStorage: {
      getItem: (key) => (store.has(key) ? store.get(key) : null),
      setItem: (key, value) => {
        store.set(key, value);
      },
      removeItem: (key) => {
        store.delete(key);
      },
    },
    ResizeObserver: function ResizeObserver(callback) {
      this.observe = (target) => {
        observers.push({ target, fire: () => callback([{ target }]) });
      };
      this.disconnect = () => {};
    },
    // Spec 34's snap is written here rather than straight from the observer,
    // because the platform's grabber writes an inline width on every move and
    // on the release, and the last write wins (measured over CDP: a snap
    // written inside the callback is undone by the release, and one written
    // from a frame holds). A queue a test drains by hand is how that ordering
    // is asserted rather than assumed.
    requestAnimationFrame: (run) => {
      frames.push(run);
      return frames.length;
    },
  });

  install(sandbox);

  // Every observer watching this panel, the way a browser delivers to all of
  // them: the script has two, one that remembers the size and one that lays
  // the column out under it.
  const fire = (panel) => {
    const watching = observers.filter((entry) => entry.target === panel);
    assert.ok(watching.length, 'size.mjs never observed this panel for resizing');
    for (const entry of watching) entry.fire();
  };

  return {
    tree,
    table,
    agents,
    store,
    fetched: sandbox.fetched,
    /**
     * Stands in for the browser's own resize handle: it sets the size, this
     * notices it. A height in pixels is a height the box really has from then
     * on, which is what the panels below it are measured against; one in `rem`
     * is left as the tests that are only about storage wrote it.
     */
    resize(panel, { w, h } = {}) {
      if (w !== undefined) panel.style.width = w;
      if (h !== undefined) {
        panel.style.height = h;
        if (h.endsWith('px')) panel.tall = parseFloat(h);
      }
      fire(panel);
    },
    /**
     * The next frame, which is where spec 34's snap is written — and, like a
     * browser's, it runs whatever was asked for before it and nothing asked
     * for during it. A test that never calls this sees the page exactly as the
     * observer left it, which is how the deferral itself is asserted.
     */
    frame() {
      const due = frames.splice(0, frames.length);
      for (const run of due) run();
      // The snap clears the inline width, which is a size change the browser
      // would deliver to both observers, the way `resize` does for a drag.
      return due.length;
    },
    /** The observer callback on a panel nobody dragged — a redraw, or its own first fire. */
    settleWithNoDrag: fire,
    /** A bookmark opened or closed: the `<details>`'s own doing, which it announces. */
    toggle(live, open) {
      const bookmark = bookmarks.find((candidate) => candidate.id === live);
      assert.ok(bookmark, `there is no ${live} bookmark on this page`);
      bookmark.open = open;
      for (const entry of toggles) if (entry.id === live) entry.handler();
    },
    /** A press on a run's tab in the strip: the address moves and the page is read in place. */
    goTo(href) {
      const link = aTab(href);
      const event = { target: link, button: 0, preventDefault() {} };
      for (const handler of listeners.click ?? []) handler(event);
      return link;
    },
  };
}

const sizeOf = (panel) => ({ w: panel.style.width, h: panel.style.height });

// --- spec 5: the size survives a reload, in both dimensions ----------------

test('a stored size is applied to the matching panel as soon as the script runs', () => {
  const page = aPage({
    stored: {
      'deck.panel.overview.tree': '{"w":"30rem","h":"18rem"}',
      'deck.panel.overview.table': '{"w":"14rem"}',
    },
  });

  assert.deepEqual(sizeOf(page.tree), { w: '30rem', h: '18rem' }, 'both dimensions came back');
  assert.equal(page.table.style.width, '14rem', 'a panel dragged only wider keeps only its width');
  assert.equal(page.table.style.height, '', 'and takes no height it was never given');
});

test('a panel with nothing stored keeps the width the markup gave it', () => {
  const page = aPage();

  assert.deepEqual(sizeOf(page.tree), { w: '', h: '' }, 'no inline size was written for nothing stored');
});

test("dragging a panel's own resize handle saves both dimensions it lands on (spec 5)", () => {
  const page = aPage();

  page.resize(page.table, { w: '25rem', h: '12rem' });

  assert.equal(page.store.get('deck.panel.overview.table'), '{"w":"25rem","h":"12rem"}');
});

test('each panel is saved under its own key, so resizing one never touches the other', () => {
  const page = aPage();

  // 28rem and 22rem, both well clear of the default: a width inside spec 34's
  // band is not remembered at all, and this test is about which key holds one.
  page.resize(page.tree, { w: '28rem' });
  page.resize(page.agents, { w: '22rem' });

  assert.equal(page.store.get('deck.panel.overview.tree'), '{"w":"28rem"}');
  assert.equal(page.store.get('deck.panel.overview.agents'), '{"w":"22rem"}');
});

// --- spec 5: per deck, and the deck is the address's own `?run=` (L4) ------

test("a run's tab reads the size stored for that run, not the overview's", () => {
  const page = aPage({
    at: tabFor(A),
    stored: {
      'deck.panel.overview.tree': '{"w":"30rem"}',
      [`deck.panel.${A}.tree`]: '{"w":"41rem"}',
    },
  });

  assert.equal(page.tree.style.width, '41rem', "the run's own size, and not the overview's");
});

test("dragging on a run's tab writes under that run, leaving every other deck alone", () => {
  const page = aPage({ at: tabFor(A), stored: { 'deck.panel.overview.tree': '{"w":"30rem"}' } });

  page.resize(page.tree, { w: '41rem', h: '20rem' });

  assert.equal(page.store.get(`deck.panel.${A}.tree`), '{"w":"41rem","h":"20rem"}');
  assert.equal(page.store.get('deck.panel.overview.tree'), '{"w":"30rem"}', 'the overview is as it was');
});

test('the Everything toggle is not a deck: the same run keeps one size with it on', () => {
  const page = aPage({ at: `${tabFor(A)}&all=1`, stored: { [`deck.panel.${A}.tree`]: '{"w":"41rem"}' } });

  assert.equal(page.tree.style.width, '41rem', 'only the `run` token says which deck this is');
});

// --- spec 5: the deck switches in place, and the size follows it -----------

test("picking another run's tab puts that run's size on the panel, with no reload", () => {
  const page = aPage({
    at: tabFor(A),
    stored: {
      [`deck.panel.${A}.tree`]: '{"w":"41rem","h":"20rem"}',
      [`deck.panel.${B}.tree`]: '{"w":"15rem"}',
    },
  });
  assert.equal(page.tree.style.width, '41rem', 'A first');

  page.goTo(tabFor(B));

  assert.deepEqual(sizeOf(page.tree), { w: '15rem', h: '' }, "B's own size, and none of A's height");
});

test("a deck with nothing stored gets the default width back, not the last deck's", () => {
  const page = aPage({ at: tabFor(A), stored: { [`deck.panel.${A}.tree`]: '{"w":"41rem"}' } });

  page.goTo(tabFor(B));

  assert.deepEqual(sizeOf(page.tree), { w: '', h: '' }, "the markup's own default width is back");
});

test('a drag after the switch is written under the deck that is showing now', () => {
  const page = aPage({ at: tabFor(A) });

  page.goTo(tabFor(B));
  page.resize(page.tree, { w: '15rem' });

  assert.equal(page.store.get(`deck.panel.${B}.tree`), '{"w":"15rem"}');
  assert.equal(page.store.has(`deck.panel.${A}.tree`), false, 'nothing was written under the deck left behind');
});

// --- L5: the old global width is the overview's starting width -------------

test("the width stored before this slice is the overview's starting width", () => {
  const page = aPage({ stored: { 'deck.panelWidth.tree': '30rem' } });

  assert.equal(page.tree.style.width, '30rem', 'a width dragged last week is still there');
});

test('the old global width is left in place, never deleted, once a per-deck size is written', () => {
  const page = aPage({ stored: { 'deck.panelWidth.tree': '30rem' } });

  // 24rem rather than 20: 20rem is inside spec 34's band, and a width in the
  // band is not remembered, which is the next section and not this one.
  page.resize(page.tree, { w: '24rem' });

  assert.equal(page.store.get('deck.panelWidth.tree'), '30rem', 'the old key is where it was');
  assert.equal(page.store.get('deck.panel.overview.tree'), '{"w":"24rem"}', 'and the new one is what is read');
});

test('a per-deck size beats the old global width on the overview', () => {
  const page = aPage({
    stored: { 'deck.panelWidth.tree': '30rem', 'deck.panel.overview.tree': '{"w":"20rem"}' },
  });

  assert.equal(page.tree.style.width, '20rem');
});

test("a run's tab never takes the old global width: the deck it was dragged on is the overview", () => {
  const page = aPage({ at: tabFor(A), stored: { 'deck.panelWidth.tree': '30rem' } });

  assert.equal(page.tree.style.width, '', "a run starts at the markup's own width");
});

// --- a value this script did not write ------------------------------------

test('a stored size that is not the object this wrote leaves the markup\'s own width', () => {
  for (const nonsense of ['{', '"41rem"', 'null', '3']) {
    const page = aPage({ stored: { 'deck.panel.overview.tree': nonsense } });

    assert.deepEqual(
      sizeOf(page.tree),
      { w: '', h: '' },
      `a page carrying ${nonsense} under the key should still be a page`,
    );
  }
});

test('a panel whose size could not be read is still saved when it is dragged', () => {
  const page = aPage({ stored: { 'deck.panel.overview.tree': '{' } });

  // 24rem, clear of spec 34's band: a width inside it is not written at all,
  // which would make this pass for the wrong reason.
  page.resize(page.tree, { w: '24rem' });

  assert.equal(page.store.get('deck.panel.overview.tree'), '{"w":"24rem"}', 'the bad value is written over');
});

// --- spec 22, 23: the open panels are one column (L17, L18) ----------------

/**
 * The cap the pass writes for a panel whose own top is `y` down the window:
 * what is left between it and the foot. `100vh` is left to the browser on
 * purpose — the window changing height then changes the cap with no pass at
 * all, which is why the pass is re-run on the two things it really reads.
 */
const capAt = (y) => `calc(100vh - 2rem - ${y}px)`;

test("each open panel's top edge is exactly the bottom edge of the one above (spec 22)", () => {
  const page = aPage({ tall: { tree: 100, table: 240, agents: 60 } });

  assert.deepEqual(
    [page.tree.style.top, page.table.style.top, page.agents.style.top],
    ['0px', '100px', '340px'],
    'the topmost at the top of the group, and each next one at the sum of the heights above it',
  );
});

test('a shut bookmark is not in the column: the panels below it close up (spec 22)', () => {
  const page = aPage({ shut: ['table'], tall: { tree: 100, table: 240, agents: 60 } });

  assert.equal(page.tree.style.top, '0px', 'the tree is still the topmost');
  assert.equal(page.agents.style.top, '100px', "and the shut panel's height is no part of the sum");
  assert.equal(page.table.style.top, undefined, 'nothing was written for the panel nobody can see');
});

test('the only open panel is capped at the window bar its foot (spec 23)', () => {
  const page = aPage({ shut: ['table', 'agents'], tall: { tree: 100 } });

  assert.equal(page.tree.style.maxHeight, capAt(GROUP_TOP), 'nothing is below it, so nothing is held back');
});

/**
 * Spec 23 is every open panel's bottom, not the topmost one's. A cap counted
 * only to the foot of the window gives the first panel everything it asks for,
 * and a tree with more content than the whole screen then leaves the panels
 * under it a cap of nothing — measured at 1280x900 before this existed, the
 * status panel stood at its 96px floor with its bottom 64px past the foot. So
 * each panel's cap holds back the floor of every open panel below it.
 */
test('the cap holds back the floor of every open panel below it (spec 23)', () => {
  const page = aPage({ tall: { tree: 100, table: 240 } });

  assert.equal(
    page.tree.style.maxHeight,
    capAt(GROUP_TOP + 2 * FLOOR),
    "the tree leaves the two panels under it their own floors, whatever it does with the rest",
  );
  assert.equal(
    page.table.style.maxHeight,
    capAt(GROUP_TOP + 100 + FLOOR),
    'the status panel starts under the tree and leaves one floor below it',
  );
  assert.equal(
    page.agents.style.maxHeight,
    capAt(GROUP_TOP + 340),
    'and the last in the column holds nothing back: it may have the rest',
  );
});

test('dragging a panel shorter moves the ones below it at once (spec 22)', () => {
  const page = aPage({ tall: { tree: 300 } });
  assert.equal(page.table.style.top, '300px', 'the status panel starts under the tree at its old height');

  page.resize(page.tree, { h: '120px' });

  assert.equal(page.table.style.top, '120px', 'the panel below followed the drag');
  assert.equal(
    page.table.style.maxHeight,
    capAt(GROUP_TOP + 120 + FLOOR),
    'and took back the room the drag left it, less the floor of the one under it',
  );
  assert.equal(page.table.style.width, '', 'a drag on one panel changes no width but its own');
});

test('opening a bookmark restacks the column, and shutting one restacks it back', () => {
  const page = aPage({ shut: ['tree'], tall: { tree: 100, table: 240 } });
  assert.equal(page.table.style.top, '0px', 'the status panel is the topmost while the tree is shut');

  page.toggle('tree', true);

  assert.equal(page.tree.style.top, '0px', 'the tree takes the top of the group');
  assert.equal(page.table.style.top, '100px', 'and the status panel drops onto its bottom edge');

  page.toggle('tree', false);

  assert.equal(page.table.style.top, '0px', 'and comes back up when the tree is shut again');
});

// --- prohibited: the pass writes `top` and `max-height` and nothing else ----

test('the layout pass writes no height and no width, so it can store no size (L18)', () => {
  const page = aPage({ tall: { tree: 900 } });

  assert.equal(page.tree.style.height, '', 'a panel with more content than room is capped, never resized');
  assert.equal(page.tree.style.width, '', 'and the pass has no opinion about a width at all');
  assert.equal(page.store.size, 0, 'so nothing the user never dragged reached storage');

  page.settleWithNoDrag(page.tree);

  assert.equal(page.store.size, 0, 'nor on the tick the pass itself causes');
});

// --- the dedupe guard: a redraw restates nothing ----------------------------

test('the observer firing twice with the same size writes to storage only once', () => {
  const page = aPage();
  let calls = 0;
  const nativeSet = page.store.set.bind(page.store);
  page.store.set = (key, value) => {
    calls += 1;
    return nativeSet(key, value);
  };

  page.resize(page.table, { w: '25rem' });
  page.settleWithNoDrag(page.table); // a second tick, e.g. a live region redrawn taller

  assert.equal(calls, 1, `expected exactly one write to storage, got ${calls}`);
});

// --- prohibited: nothing written on a height the drag did not cause ---------

test('the observer noticing an unresized panel writes nothing (no hand-rolled drag state)', () => {
  const page = aPage();

  page.settleWithNoDrag(page.tree);

  assert.equal(page.store.size, 0, 'nothing was written until a size was actually set');
});

// --- prohibited: no size leaves the browser --------------------------------

test("resizing a panel makes no request; the size never reaches the deck's store", () => {
  const page = aPage();

  page.resize(page.table, { w: '25rem', h: '12rem' });

  assert.deepEqual(page.fetched, [], 'no fetch was made for a resize');
});

// --- spec 34: a width dragged near the default goes back to it -------------
// --- (the user at Gate 2, 2026-09-23) --------------------------------------

/**
 * The band is 20px either side of the width the stylesheet gives a panel,
 * which `size.mjs` measures off the element at startup — before anything
 * remembered is put back — so `--panel` stays written once in `deck.css`
 * (L16) and a window narrow enough for `max-width` to clamp it is measured as
 * clamped. `DEFAULT_WIDTH` above is this stand-in's copy of what the browser
 * would then report.
 *
 * The snap is written from a frame and not from the observer callback, and
 * that ordering is the whole of why it works: the platform's grabber writes an
 * inline width on every pointer move *and again on the release*, and the last
 * write wins. Measured over CDP on the preview — a clear written inside the
 * callback ended the drag at 316px, and the same clear deferred to a frame
 * ended it at 304px with the inline width gone. The observer callback runs
 * before paint, so the snap is seen during the drag and not only at its end.
 */
test('a width dragged to the edge of the band either side snaps back to the default (spec 34)', () => {
  for (const [dragged, side] of [
    ['324px', '20px wider'],
    ['284px', '20px narrower'],
    ['305px', 'a pixel wider'],
    ['303px', 'a pixel narrower'],
  ]) {
    const page = aPage();

    page.resize(page.tree, { w: dragged });
    page.frame();

    assert.equal(page.tree.style.width, '', `${side} than the default is the default: the inline width is gone`);
    assert.equal(
      page.store.get('deck.panel.overview.tree'),
      '{}',
      `and ${side} is not a width to remember, so the key holds none`,
    );
  }
});

test('a width a pixel outside the band is a width the user chose, and is kept (spec 34)', () => {
  for (const dragged of ['325px', '283px']) {
    const page = aPage();

    page.resize(page.tree, { w: dragged });
    page.frame();

    assert.equal(page.tree.style.width, dragged, `${dragged} is outside the band and stands`);
    assert.equal(page.store.get('deck.panel.overview.tree'), `{"w":"${dragged}"}`, 'and is remembered');
  }
});

test('the snap is deferred to the next frame, because the release would beat it (spec 34)', () => {
  const page = aPage();

  page.resize(page.tree, { w: '316px' });

  assert.equal(page.tree.style.width, '316px', 'the observer itself changes nothing: the grabber is still dragging');
  assert.equal(page.store.get('deck.panel.overview.tree'), undefined, 'and an in-band width is not written on the way past');

  assert.equal(page.frame(), 1, 'one frame was asked for');
  assert.equal(page.tree.style.width, '', 'and the frame is where the snap lands');
});

test('however many moves cross the band, they ask for one frame, not one each (spec 34)', () => {
  const page = aPage();

  for (const w of ['316px', '312px', '308px', '304px']) page.resize(page.tree, { w });

  assert.equal(page.frame(), 1, 'a frame already asked for is not asked for again');
  assert.equal(page.tree.style.width, '', 'and it still snaps');
});

test('a snap keeps the height the user dragged, and only forgets the width (spec 34)', () => {
  const page = aPage();

  page.resize(page.tree, { w: '420px', h: '300px' });
  assert.equal(page.store.get('deck.panel.overview.tree'), '{"w":"420px","h":"300px"}', 'both were remembered');

  page.resize(page.tree, { w: '310px' });
  page.frame();

  assert.equal(page.tree.style.height, '300px', 'the height is the one dimension the user is not undoing');
  assert.equal(page.store.get('deck.panel.overview.tree'), '{"h":"300px"}', 'and it is still remembered on its own');
});

/**
 * The key is written empty rather than removed, and that is not fussiness: a
 * missing key is what sends `sizeFor` to the width dragged before there were
 * decks (L5), so removing it would snap the panel and then hand it a width
 * from last week on the next page. An empty object is read as "this deck
 * remembers nothing", which is what a snap means.
 */
test('a snap on the overview is not undone by the width dragged before there were decks (L5)', () => {
  const page = aPage({ stored: { 'deck.panelWidth.tree': '30rem' } });

  page.resize(page.tree, { w: '300px' });
  page.frame();

  assert.equal(page.store.get('deck.panel.overview.tree'), '{}', 'the key is written, not removed');
  assert.equal(page.store.get('deck.panelWidth.tree'), '30rem', 'and the old global width is still left where it is');

  const next = aPage({ stored: Object.fromEntries(page.store) });
  assert.equal(next.tree.style.width, '', 'so the panel comes back at the default and not at 30rem');
});

/**
 * A browser delivers a first observation as soon as it observes, so a width
 * stored inside the band from before this change is snapped on arrival rather
 * than waiting for a drag. That is spec 34's own words — the panel follows the
 * default again rather than remembering a hand-set width — and it is the one
 * case where the observer writes to storage without the user touching
 * anything, which the comment above it used to say could not happen.
 */
test('a remembered width inside the band is snapped the first time the panel is measured (spec 34)', () => {
  const page = aPage({ stored: { 'deck.panel.overview.tree': '{"w":"310px","h":"200px"}' } });
  assert.equal(page.tree.style.width, '310px', 'it is put back first, as any remembered width is');

  page.settleWithNoDrag(page.tree);
  page.frame();

  assert.equal(page.tree.style.width, '', 'and then let go of');
  assert.equal(page.store.get('deck.panel.overview.tree'), '{"h":"200px"}', 'the height it was stored with stands');
});

/**
 * The frame the snap is written from is a frame later, and the page may have
 * moved: a press on another run's tab rescopes it and puts that deck's own
 * remembered width on the panel. The snap has to notice, or it forgets a width
 * the user never touched, under a key the drag did not happen on.
 */
test('a snap that no longer applies when its frame comes round does nothing (spec 34)', () => {
  const page = aPage({
    stored: {
      'deck.panel.overview.tree': '{"w":"310px"}',
      [`deck.panel.${A}.tree`]: '{"w":"500px"}',
    },
  });

  // The observer sees the overview's in-band width and asks for a frame; the
  // user picks another run's tab before it comes round.
  page.settleWithNoDrag(page.tree);
  page.goTo(tabFor(A));
  assert.equal(page.tree.style.width, '500px', "the other deck's own width is on the panel now");

  page.frame();

  assert.equal(page.tree.style.width, '500px', 'and the frame left it alone');
  assert.equal(
    page.store.get(`deck.panel.${A}.tree`),
    '{"w":"500px"}',
    'a width this deck remembers and nobody dragged is not forgotten by the other deck\'s snap',
  );
});

/**
 * The default width is measured at load, and three of the four panels are
 * inside a shut `<details>` then. Chrome gives them a box and reports it
 * (measured at Gate 2: 304 at a 1280 window, 264 at 360 where `max-width`
 * clamps), but an engine that hides those children with `display: none`
 * reports 0, and a band measured against 0 never matches a real width — spec
 * 34 would be silently off for those three panels for the life of the page.
 * L17 refused anchor positioning for exactly this kind of bet, so the
 * measurement heals itself instead: the first time the panel is measured with
 * nothing inline on it, which in a browser is the delivery its bookmark
 * opening causes, the default is taken then.
 */
test('a panel with no box at load takes its default from the first measurement it gets (spec 34)', () => {
  const page = aPage({ boxless: ['tree'] });
  assert.equal(page.tree.getBoundingClientRect().width, 0, 'this engine gives a shut panel nothing to measure');

  // Dragged before the bookmark was ever opened there is nothing to compare
  // against, and a width the user chose is kept rather than snapped to a guess.
  page.resize(page.tree, { w: '310px' });
  page.frame();
  assert.equal(page.tree.style.width, '310px', 'no default, no snap: the width stands');

  // The bookmark opens: the browser delivers a size, and nothing is inline on
  // the panel because nothing was remembered for it.
  page.tree.boxless = false;
  page.tree.style.width = '';
  page.settleWithNoDrag(page.tree);

  page.resize(page.tree, { w: '310px' });
  page.frame();

  assert.equal(page.tree.style.width, '', 'once it has been measured the band works as it does anywhere else');
});

test('the band is one number, written once (spec 34)', () => {
  const declared = sizeJs.match(/var SNAP\w* = (\d+);/);

  assert.ok(declared, 'the band is a named constant, not a literal in the middle of the observer');
  assert.equal(declared[1], '20', 'and it is the 20px the user asked for');
  assert.equal(
    (deckJs.match(/\b20\b/g) ?? []).length,
    1,
    'written once: a second 20 in this file is a copy of the band that will drift from it',
  );
});

// --- prohibited: no drag handler written by hand ----------------------------

test("the page's script registers no mouse or pointer handler of its own; the grabber is the platform's", () => {
  aPage();

  assert.doesNotMatch(
    deckJs,
    /addEventListener\(\s*['"](mousedown|mousemove|mouseup|pointerdown|pointermove|pointerup)['"]/,
    "a drag handler here would be the one the slice forbids — `resize: both` is the platform's own",
  );
});

// --- the CSS side: the grabber takes both dimensions now (spec 5) ----------

test('the panel is resizable in both dimensions, and has a floor in both', () => {
  const panelRule = deckCss.match(/\.panel \{[^}]*\}/)[0];

  assert.match(panelRule, /resize:\s*both/, "the panel opts into the platform's own grabber, both ways");
  assert.match(panelRule, /min-width:/, 'a panel cannot be dragged to nothing across');
  assert.match(
    panelRule,
    /min-height:/,
    'nor down: the grabber takes it to 15px otherwise, and the size is remembered',
  );
});

test('a remembered size never moves the column: the gutter is the default width alone (L16)', () => {
  const body = deckCss.match(/\nbody \{[^}]*\}/)[0];

  assert.match(body, /var\(--panel\)/, 'the gutter is derived from the default width');
  assert.doesNotMatch(
    deckJs,
    /setProperty/,
    'a remembered width wider than the gutter overlays the column; it must not move it',
  );
});

// --- spec 6: a name wraps at word boundaries, never mid-word, and the -----
// --- panel never scrolls sideways for it -----------------------------------

test('a status cell wraps at word boundaries, never mid-word, and never holds to one line', () => {
  // Anchored at the line, because `.slices th, .slices td` sets the padding for
  // the cell and is not the rule the assertion is about.
  const cell = deckCss.match(/\n\.slices td \{[^}]*\}/)[0];

  assert.doesNotMatch(
    deckCss,
    /\.slices td[^{}]*\{[^}]*overflow-wrap/,
    'breaking a name mid-word is what the user rejected first; reversing the scrollbar does not bring it back',
  );
  assert.doesNotMatch(cell, /white-space:\s*nowrap/, 'a cell wraps at word boundaries, it does not hold one line');
});

// --- spec 23: the panel ends at its content, with no blank space under it --
// --- (the user at Gate 2, 2026-09-23: "both tree and status spawned with ---
// --- too much white space") ------------------------------------------------

/**
 * Measured on the preview at 1280x1400, from the last line of text to the
 * panel's own border: Tree 32px, Status 43px, and a twelve-slice chain 53px.
 * Two causes, and both of them are a bottom gutter carried for something that
 * is not there:
 *
 * - a section (`.tree`, `.run-status`) carries `padding-bottom` and a rule for
 *   the section *below* it, because the overview stacks one per run; the one
 *   at the foot of a panel has nothing below it. 20px on Tree, 28px on Status.
 * - a tree row carries `0.15rem` under its own name for the row that follows
 *   it, and a chain nests each slice inside the last, so a dozen of those
 *   paddings stack under the deepest row. 28.8px at twelve, growing with the
 *   chain.
 *
 * Both are pinned here as declarations and nowhere else: a stand-in returns
 * whatever numbers it is given, so the gap itself is a browser measurement
 * (S13's own gate), quoted in the commit.
 */
test('the section at the foot of a panel carries no gutter and no rule below it (spec 23)', () => {
  const status = deckCss.match(/\n\.panel > \.run-status,[\s\S]*?\{[^}]*\}/);
  const tree = deckCss.match(/\n\.panel > \.tree,[\s\S]*?\{[^}]*\}/);

  assert.ok(status && tree, 'a rule has to name the sections that end a panel, or the gutter is still under them');
  for (const rule of [status[0], tree[0]]) {
    assert.match(rule, /border-bottom:\s*0/, "the section's own rule, a hairline above the panel's, is what boxed that space in");
    assert.match(
      rule,
      /\.run-section:last-child > \./,
      "the overview stacks a section per run, so there the foot is the last run's, not every run's",
    );
  }
  assert.match(status[0], /padding-bottom:\s*0;/, 'the table closes itself: the last row carries a hairline, so it is the foot');
  // The roster is the third thing that can end a panel, and it closes on no
  // rule either: with the floor at 4rem a panel of two agents is its content's
  // height and its last row sat 4.8px off the border, measured.
  assert.match(
    deckCss.match(/\n\.agents \{[^}]*\}/)[0],
    /padding-bottom:\s*0\.5rem/,
    "the roster's last row keeps the same 0.5rem the tree's last name does",
  );
  assert.match(tree[0], /padding-bottom:\s*0\.5rem/, 'the tree closes on nothing, so its last name keeps the 0.5rem its first row has above it');

  // The gutter these rules override is the one the overview still needs
  // between two runs, so it is pinned here too: trim the base and the foot
  // rule above goes on passing while the stack closes up.
  assert.match(
    deckCss.match(/\n\.tree \{[^}]*\}/)[0],
    /padding:\s*1\.25rem 0;/,
    "a section that is not at the foot keeps its 20px, or two runs' rows touch on the overview",
  );
  assert.match(
    deckCss.match(/\n\.run-status \{[^}]*\}/)[0],
    /padding:\s*1\.25rem 0 1\.75rem;/,
    'and the table section keeps its 28px, which is the gutter its own rule stands in',
  );
  assert.doesNotMatch(
    `${status[0]}${tree[0]}`,
    /\n\.tree:last-child/,
    'every overview section is the last child of its own run-section; trimming on that selector takes the gutter out from between two runs',
  );
});

test('the panel still owns overflow, but wrapping means only an unbreakable token reaches it', () => {
  const panelRule = deckCss.match(/\.panel \{[^}]*\}/)[0];

  assert.match(panelRule, /overflow:\s*auto/, 'a single unbreakable token longer than the panel still needs somewhere to go');
  assert.doesNotMatch(
    deckCss,
    /\.(tree|slices)[^{]*\{[^}]*overflow-x:/,
    'a scrolling box inside one that already scrolls is what L6 rejected, and wrapping does not need one either',
  );
});

// --- the rail's regions are modules, each installed against its env alone ---
// (S5 of deferred-ledger, L11). The tests above install the whole page, which
// is what a user runs; these install one module with nothing else around it,
// so a module that leaned on a sibling's variables fails here and not only in
// a browser.

test('the size module alone puts a stored size on its panel and remembers a drag (L11)', () => {
  const page = aPage({
    stored: { 'deck.panel.overview.tree': JSON.stringify({ w: '400px', h: '200px' }) },
    install: installSize,
  });

  assert.deepEqual(sizeOf(page.tree), { w: '400px', h: '200px' }, 'the remembered size is back on arrival');

  page.resize(page.table, { w: '350px', h: '180px' });

  assert.equal(
    page.store.get('deck.panel.overview.table'),
    JSON.stringify({ w: '350px', h: '180px' }),
    'and a drag is written under the deck showing',
  );
});

test('the size module alone snaps a width inside the band back to the default (L11, spec 34)', () => {
  const page = aPage({ install: installSize });

  page.resize(page.tree, { w: `${DEFAULT_WIDTH + 10}px` });
  page.frame();

  assert.equal(page.tree.style.width, '', 'the snap is the size module’s own, with no layout pass beside it');
});

test('the layout module alone stacks the open panels, each on the one above (L11, spec 22)', () => {
  const page = aPage({ tall: { tree: 100, table: 150, agents: 80 }, shut: ['table'], install: installLayout });

  assert.deepEqual(
    [page.tree.style.top, page.agents.style.top],
    ['0px', '100px'],
    'the shut bookmark is out of the column, and the next one sits on the first',
  );

  page.toggle('table', true);

  assert.deepEqual(
    [page.tree.style.top, page.table.style.top, page.agents.style.top],
    ['0px', '100px', '250px'],
    'and a bookmark opening restacks it',
  );
});

/** A rail of bookmarks the bookmarks module is installed against, and the session it reads. */
const aBookmarkRail = (kept) => {
  const toggles = [];
  const marks = ['tree', 'table', 'agents'].map((live, at) => aBookmark(aPanel(live), at === 0, toggles));
  const session = new Map(kept === undefined ? [] : [['deck.openTabs', kept]]);
  installBookmarks(
    aSandbox({
      document: {
        querySelectorAll: (selector) =>
          selector === 'details.tab'
            ? marks
            : selector === 'details.tab[open]'
              ? marks.filter((mark) => mark.open)
              : [],
      },
      sessionStorage: {
        getItem: (key) => (session.has(key) ? session.get(key) : null),
        setItem: (key, value) => {
          session.set(key, value);
        },
        removeItem: (key) => {
          session.delete(key);
        },
      },
    }),
  );
  return { marks, session, toggles };
};

test('the bookmarks module alone opens what was open on the last page, and shuts the rest', () => {
  const rail = aBookmarkRail('["agents"]');

  assert.deepEqual(
    rail.marks.map((mark) => mark.open),
    [false, false, true],
    'the open set follows the user from page to page, over the markup’s own default',
  );
});

test('the bookmarks module alone writes the open set on every toggle', () => {
  const rail = aBookmarkRail();

  rail.marks[1].open = true;
  for (const entry of rail.toggles) entry.handler();

  assert.equal(rail.session.get('deck.openTabs'), '["tree","table"]', 'the key and its shape as they were');
});

test('a kept open set that cannot be read leaves the markup’s own defaults', () => {
  const rail = aBookmarkRail('not json');

  assert.deepEqual(rail.marks.map((mark) => mark.open), [true, false, false]);
});

test('on a thread page the rail strip stacks above the header and below the title', () => {
  const zOf = (rule) => Number(rule.match(/z-index:\s*(\d+)/)[1]);
  const header = zOf(deckCss.match(/\nbody\[data-item\] header \{[^}]*\}/)[0]);
  const title = zOf(deckCss.match(/\nh1 \{[^}]*\}/)[0]);
  const strip = zOf(deckCss.match(/\nbody\[data-item\] \.strip \{[^}]*\}/)[0]);
  const page = fs.readFileSync(path.join(UI, 'thread.html'), 'utf8');

  // An equal z-index is painted in document order, and the strip comes after
  // the header on a thread page: that, and not a clamp in `layout.mjs`, is what
  // puts a panel dragged up over the header on top of it (L7).
  assert.equal(strip, header, 'level with the sticky header');
  assert.ok(page.indexOf('<!--STRIPS-->') > page.indexOf('<header>'), 'and after it, so painted over it');
  assert.ok(strip < title, 'and under the fixed title');
});
