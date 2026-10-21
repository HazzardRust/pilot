/*
 * Each panel's size follows the user, per deck (deck-workspace spec 5). The
 * drag itself is `resize: both` in `deck.css` — the platform's own grabber,
 * not a handler of ours — and this only notices, through a `ResizeObserver`,
 * the size it left behind, and writes it to `localStorage`. Not
 * `sessionStorage`: a tab the deck opens itself (D14) does not inherit the one
 * that opened it, and the size should still be there. A width dragged back to
 * within a hair of the stylesheet's own snaps to it (spec 34).
 *
 * Moved unchanged out of `legacy.mjs` (S5 of deferred-ledger, ADR 0030, L12).
 * `install(env)` reads the page's globals off `env` and nothing else (L11):
 * the window in the browser, `aSandbox(...)` in `deck/test/resize.test.mjs`.
 * It hands back `rescope`, which the page's navigation calls when the deck it
 * shows changes without a reload.
 */

import { forEach } from './dom.mjs';

export function install(env) {
  var document = env.document;
  var location = env.location;
  var localStorage = env.localStorage;
  var URLSearchParams = env.URLSearchParams;
  var requestAnimationFrame = env.requestAnimationFrame;
  var ResizeObserver = env.ResizeObserver;

  // --- each panel's size follows the user, per deck (spec 5, L4) ------------

  var SIZE_KEY = 'deck.panel.';
  var WIDTH_KEY = 'deck.panelWidth.';
  var OVERVIEW = 'overview';

  var panels = document.querySelectorAll('.panel');

  /**
   * Which deck the page is showing, in the address's own words: the `?run=`
   * token the strip's links already carry (`render.mjs`'s `hrefFor`), and
   * `overview` where there is none, that being the page a card with no tab is
   * drawn on. Nothing else in the address says which deck this is — the
   * EVERYTHING toggle is a view of the same one — so nothing else is read.
   */
  var scopeOf = function () {
    var run = new URLSearchParams(location.search || '').get('run');
    return run ? run : OVERVIEW;
  };

  var scope = scopeOf();

  var keyFor = function (panel) {
    return SIZE_KEY + scope + '.' + panel.dataset.live;
  };

  /**
   * The size this deck remembers for this panel, or nothing. A width dragged
   * before there were decks is the *overview's* starting width and no other
   * deck's (L5): it was one browser's preference for a page that had one
   * panel set, and copying it onto a run the user has never opened would be a
   * width they never chose. It is read and never written, so it stays where
   * it is for a page this script never ran on.
   */
  var sizeFor = function (panel) {
    try {
      var stored = localStorage.getItem(keyFor(panel));
      if (stored) return JSON.parse(stored);
      if (scope !== OVERVIEW) return null;
      var width = localStorage.getItem(WIDTH_KEY + panel.dataset.live);
      return width ? { w: width } : null;
    } catch (e) {
      // No localStorage, a private mode that throws on it, or a value that is
      // not the object this wrote: the markup's own default width, rather
      // than a broken page.
      return null;
    }
  };

  /**
   * The panel, at the size this deck remembers — and at the stylesheet's own
   * default where it remembers none, which is what puts a deck's size back
   * when the user moves off a deck that had one. Never a custom property:
   * `--panel` is the gutter the column starts at (L16), and a remembered
   * width wider than it overlays the text rather than moving it.
   */
  var fit = function (panel) {
    var size = sizeFor(panel) || {};
    panel.style.width = size.w || '';
    panel.style.height = size.h || '';
  };

  /**
   * How near the stylesheet's own width a drag has to land for the panel to go
   * back to it (spec 34). One number, and this is it.
   */
  var SNAP = 20;

  /**
   * The width the stylesheet gives each panel, measured before anything
   * remembered is put back — so `--panel` stays written once in `deck.css`
   * (L16, the discipline L17's pass follows for `min-height`), and a window
   * narrow enough for `max-width` to clamp a panel is measured as clamped
   * rather than computed as though it were not.
   *
   * A panel inside a shut bookmark still has a box in the engine measured at
   * Gate 2, and reports it. One that hides those children with `display: none`
   * instead would report 0, and a band measured against 0 never matches a real
   * width — so spec 34 would be quietly off for the three shut panels for the
   * life of the page, which is the kind of single-engine bet L17 refused
   * anchor positioning over. So the measurement heals itself: it is taken on
   * the first measurement that finds nothing inline on the panel, which in
   * such an engine is the delivery its bookmark opening causes.
   */
  var defaultWidth = {};
  var widthOf = function (panel) {
    var live = panel.dataset.live;
    if (!defaultWidth[live] && !panel.style.width) {
      defaultWidth[live] = panel.getBoundingClientRect().width;
    }
    return defaultWidth[live];
  };
  forEach(panels, widthOf);

  forEach(panels, fit);

  /**
   * The deck the page is showing has changed, which is a thing that happens
   * without a reload (D1): the strip's links move the address and read the
   * page in place. Only on a change of deck, because re-fitting a panel on
   * every announced change would put a stored size back under a drag the
   * observer had not yet noticed.
   */
  var rescope = function () {
    var now = scopeOf();
    if (now === scope) return;
    scope = now;
    forEach(panels, fit);
  };

  // `resize: both` (deck.css) is the platform's own grabber, and dragging it
  // sets the panel's inline width and height itself; there is no drag handler
  // of ours. This only notices what it set, and only once it has set
  // something — the observer's own first call, before any drag, finds no
  // inline size and writes nothing. `ResizeObserver` fires on a rendered
  // height change too — a live update can redraw the panel taller or
  // shorter — and that leaves the inline size alone, which is what makes an
  // inline size the thing to read. The stored value is compared before it is
  // written, so a tick restating the same size writes nothing.
  var store = function (panel, size) {
    var value = JSON.stringify(size);
    try {
      if (localStorage.getItem(keyFor(panel)) === value) return;
      localStorage.setItem(keyFor(panel), value);
    } catch (e) {}
  };

  if (typeof ResizeObserver !== 'undefined') {
    forEach(panels, function (panel) {
      // Whether a frame has already been asked for, so a drag crossing the
      // band over a dozen moves asks for one and not a dozen.
      var snapping = false;
      new ResizeObserver(function () {
        // Asked first, and before the early return below, because a delivery
        // that carries no dragged size is exactly the one that can still take
        // the stylesheet's own width: nothing is inline on the panel then.
        var wide = widthOf(panel);
        var size = {};
        if (panel.style.width) size.w = panel.style.width;
        if (panel.style.height) size.h = panel.style.height;
        if (!size.w && !size.h) return;
        /*
         * Spec 34: a width dragged to within `SNAP` of the stylesheet's own
         * goes back to it, and stops being remembered — so a later change to
         * the default is followed rather than overridden by a width the user
         * dragged to almost exactly the old one.
         *
         * Written from a frame rather than from here, and that ordering is the
         * whole of why it holds: the grabber writes an inline width on every
         * pointer move *and again on the release*, and the last write wins.
         * Measured over CDP at Gate 2 — the same clear written here ended the
         * drag at 316px, and deferred to a frame ended it at 304px with the
         * inline width gone. The callback runs before paint, so the snap is
         * seen while the drag is still going on and not only at its end.
         *
         * The key is written without its width half rather than removed, even
         * when that leaves it empty: a missing key is what sends `sizeFor` to
         * the width dragged before there were decks (L5), so removing it would
         * snap the panel and then hand it that width on the next page.
         */
        if (size.w && wide && Math.abs(panel.getBoundingClientRect().width - wide) <= SNAP) {
          if (snapping) return;
          snapping = true;
          requestAnimationFrame(function () {
            snapping = false;
            // The band is asked again here rather than trusted from a frame
            // ago, because anything may have moved the panel in between: a
            // press on another run's tab rescopes the page and puts *that*
            // deck's remembered width on it (`rescope`), and clearing that
            // would forget a width the user never touched, under a key that
            // is no longer the one the drag happened on.
            if (!panel.style.width) return;
            if (Math.abs(panel.getBoundingClientRect().width - wide) > SNAP) return;
            panel.style.width = '';
            var kept = {};
            if (panel.style.height) kept.h = panel.style.height;
            store(panel, kept);
          });
          return;
        }
        store(panel, size);
      }).observe(panel);
    });
  }

  return { rescope: rescope };
}
