/*
 * Which bookmarks are open follows the user from page to page. That is a real
 * navigation rather than a change, so the open set is written to
 * `sessionStorage` on every toggle and read back on arrival. Opening and
 * closing a bookmark stays the `<details>` element's own doing, with no handler
 * of ours wired to it (D5); this only remembers it.
 *
 * Moved unchanged out of `legacy.mjs` (S5 of deferred-ledger, ADR 0030, L12).
 * `install(env)` reads the page's globals off `env` and nothing else (L11):
 * the window in the browser, `aSandbox(...)` in `deck/test/resize.test.mjs`.
 */

import { forEach } from './dom.mjs';

export function install(env) {
  var document = env.document;
  var sessionStorage = env.sessionStorage;

  // --- which bookmarks are open, as the user moves from page to page --------

  var KEY = 'deck.openTabs';
  var bookmarks = document.querySelectorAll('details.tab');

  var openIds = function () {
    return Array.prototype.map.call(
      document.querySelectorAll('details.tab[open]'),
      function (bookmark) {
        return bookmark.id;
      },
    );
  };

  // A browser with no sessionStorage, or a private mode that throws on it,
  // falls back to the markup's own defaults rather than breaking the page.
  try {
    var kept = JSON.parse(sessionStorage.getItem(KEY) || 'null');
    if (Array.isArray(kept)) {
      forEach(bookmarks, function (bookmark) {
        bookmark.open = kept.indexOf(bookmark.id) !== -1;
      });
    }
  } catch (e) {}

  forEach(bookmarks, function (bookmark) {
    bookmark.addEventListener('toggle', function () {
      try {
        sessionStorage.setItem(KEY, JSON.stringify(openIds()));
      } catch (e) {}
    });
  });

  refoldTickets(env, document);
}

// --- which ticket groups are open, per repository, across reloads -------------

/*
 * Green, Yellow and Red are served shut (overview-one-ticket spec 13, L9), but for
 * the group holding the ticket in hand, served open and never remembered. The
 * groups this browser opened are kept in `localStorage`, keyed by the
 * repository and holding the opened states, so they outlive the tab and a
 * reload, unlike the bookmarks above. Opening and closing stays the
 * `<details>` element's own doing; this only remembers it, and `live.mjs`
 * hands each toggle here and puts the set back on every page it fetches.
 */
var FOLDS = 'pilot.ticket-folds';

/** The kept open set, or an empty one where storage is missing, throws or holds something else. */
var readFolds = function (env) {
  try {
    var kept = JSON.parse(env.localStorage.getItem(FOLDS) || 'null');
    if (kept && typeof kept === 'object' && !Array.isArray(kept)) return kept;
  } catch (e) {}
  return {};
};

/** The states opened in `group`'s repository, as kept. */
var openedIn = function (kept, group) {
  var opened = Object.prototype.hasOwnProperty.call(kept, group.dataset.repo) ? kept[group.dataset.repo] : null;
  return Array.isArray(opened) ? opened : [];
};

/** Opens exactly the groups under `root` this browser opened: on arrival, and on every page a live swap fetched. */
export function refoldTickets(env, root) {
  var kept = readFolds(env);
  forEach(root.querySelectorAll('details.ticket-queue'), function (group) {
    group.open = group.dataset.inHand !== undefined || openedIn(kept, group).indexOf(group.dataset.queue) !== -1;
  });
}

/** Writes one group's toggle into the kept open set. */
export function rememberTicketFold(env, group) {
  if (group.dataset.inHand !== undefined) return;
  var kept = readFolds(env);
  var opened = openedIn(kept, group).filter(function (state) {
    return state !== group.dataset.queue;
  });
  if (group.open) opened.push(group.dataset.queue);
  kept[group.dataset.repo] = opened;
  try {
    env.localStorage.setItem(FOLDS, JSON.stringify(kept));
  } catch (e) {}
}
