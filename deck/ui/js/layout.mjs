/*
 * The open panels as one column (deck-workspace spec 22, 23; L17, L18; ADR
 * 0026): each open panel's top edge on the bottom edge of the one above, each
 * capped at what is left to the foot of the window.
 *
 * Moved unchanged out of `legacy.mjs` (S5 of deferred-ledger, ADR 0030, L12).
 * `install(env)` reads the page's globals off `env` and nothing else (L11):
 * the window in the browser, `aSandbox(...)` in `deck/test/resize.test.mjs`.
 * It is installed after `size.mjs`, so the first pass stacks the panels at the
 * sizes that module has just put back.
 */

import { forEach } from './dom.mjs';

export function install(env) {
  var document = env.document;
  var getComputedStyle = env.getComputedStyle;
  var ResizeObserver = env.ResizeObserver;

  var bookmarks = document.querySelectorAll('details.tab');
  var panels = document.querySelectorAll('.panel');

  // --- the open panels as one column (spec 22, 23; L17, L18) ---------------

  /**
   * The foot of the window a panel stops short of, in the stylesheet's own
   * unit. `.panel`'s unscripted cap is `calc(100vh - 6rem)` from a group top
   * of `4rem`, and this is the other two.
   */
  var FOOT = '2rem';

  /**
   * Where the open panels are: the topmost at the top of the group, and every
   * other one's top edge exactly on the bottom edge of the one above it, in
   * the strip's own order (spec 22). Each is capped at what is left between
   * its own top and the foot of the window, less the floor the panels below it
   * keep, so every open panel's bottom stays on screen and one with more
   * content than room scrolls inside itself instead of running off it
   * (spec 23).
   *
   * This exists because CSS cannot read another element's used height, and the
   * sum this walks is exactly that: a panel's height is either its content's
   * or the one the user dragged, and the two counters that stood in for it
   * gave every panel a fraction of the viewport instead — which is what left a
   * short panel with blank space under it and a lower one floating away from
   * the one above (L17, ADR 0026).
   *
   * Both of a panel's numbers come off its own box, which is why there is no
   * strip to find and nothing to measure one against: `top` is in the strip's
   * coordinates and is the running sum, and the cap is counted from where the
   * panel's box turns out to *be*. Each height is read after that panel's own
   * two writes, because the cap is what decides the used height of a panel
   * with more content than room, and it is the used height the one below it
   * sits on.
   *
   * It writes `top` and `max-height` and nothing else (L18). The
   * `ResizeObserver` in `size.mjs` persists `panel.style.height`, so a height written
   * here would be stored as a size nobody dragged and would undo the
   * remembered size of spec 5 one slice after it was built. Nor is one needed:
   * `.panel` declares no `height`, so a panel with nothing remembered is
   * already exactly as tall as its content, and a height the user dragged is
   * the inline one on the element and wins by itself.
   *
   * The two things that move under it are the two it is re-run on — which
   * bookmarks are open, and how tall each open panel is. The height of the
   * window is not one of them: it is in the `calc()` as `100vh`, and the
   * browser keeps that up to date without being asked, so a window dragged
   * taller widens every cap with no pass at all. Nor is the floor, which is a
   * line of the stylesheet.
   */
  var stack = function () {
    // The open panels in document order, which is the order the column is in.
    // The same relationship the deleted `:has()` counters read, asked as one
    // selector rather than counted in two — and re-asked every pass, because
    // a bookmark opening is one of the two things that changes the answer.
    var open = document.querySelectorAll('.tab[open] > .panel');

    // The room the open panels under each one keep for themselves, counted up
    // from the last. Spec 23 is every open panel's bottom and not just the
    // topmost one's, and without this a panel with more content than the whole
    // window would leave the ones below it a cap of nothing: they would stand
    // at their floor past the foot of the screen, which is what the browser
    // measured before this loop existed. The floor is each panel's own
    // `min-height` — the one that stops the grabber taking it to 15px — read
    // off the element rather than written again here, so the number stays
    // declared once in `deck.css` (L16's discipline, one slice on).
    var reserved = [];
    var floors = 0;
    for (var index = open.length - 1; index >= 0; index -= 1) {
      reserved[index] = floors;
      floors += parseFloat(getComputedStyle(open[index]).minHeight) || 0;
    }

    var top = 0;
    forEach(open, function (panel, at) {
      panel.style.top = top + 'px';
      // What the window has already spent by the time this panel's box ends
      // up where it is, plus what is promised to the panels under it.
      var spent = panel.getBoundingClientRect().top + reserved[at];
      panel.style.maxHeight = 'calc(100vh - ' + FOOT + ' - ' + spent + 'px)';
      top += panel.getBoundingClientRect().height;
    });
  };

  stack();

  // A bookmark opening or closing changes which panels are in the column and
  // in what order, and the `<details>` announces that itself. Still no handler
  // of ours on one (D5): what this changes is where a panel is, never whether
  // it is open.
  forEach(bookmarks, function (bookmark) {
    bookmark.addEventListener('toggle', stack);
  });

  // And a panel's height moving is the other of the two — the drag the user
  // has just finished, or content redrawn taller — so the panels below it
  // move in the same tick. One observer for all three, because the pass walks
  // all of them however few moved. A browser without `ResizeObserver` keeps
  // the column it arrived with, which is the same browser in which the
  // remembered size of spec 5 was never noticed either.
  if (typeof ResizeObserver !== 'undefined') {
    var column = new ResizeObserver(stack);
    forEach(panels, function (panel) {
      column.observe(panel);
    });
  }
}
