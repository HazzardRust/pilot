/*
 * The Notifications bookmark: which listed threads this browser has not seen
 * since the pilot last wrote on them, and their count (spec 26, L24, L25).
 *
 * Moved unchanged out of `legacy.mjs` (S5 of deferred-ledger, ADR 0030, L12).
 * `install(env)` reads the page's globals off `env` and nothing else (L11):
 * the window in the browser, `aSandbox(...)` in
 * `deck/test/notifications.test.mjs`. It hands back the three a live update
 * calls on each swap, which is how the panel stays right without a reload (D1).
 */

import { forEach } from './dom.mjs';

export function install(env) {
  var document = env.document;
  var location = env.location;
  var localStorage = env.localStorage;

  // --- how many listed threads this browser has not seen (spec 26, L24) -----

  /*
   * The open threads' share of the Notifications count is computed here and
   * nowhere else (the notices' share is the server's, deck-press-feedback L8).
   * Nothing server-side knows what *this browser* has looked at, so there is no
   * field to render it from and none is added: what exists is one key, and the
   * number is the listed threads it does not account for.
   *
   * The key is a **map of thread id to the number of times the pilot had
   * written on that thread when this browser last looked at it** (spec 26,
   * amended by the user at Gate 2, 2026-09-23). It was a plain list of ids
   * until then, and a real browser of the user's holds one, so `seenSoFar`
   * reads that shape too.
   *
   * A count and not a flag, because "seen" has to expire: the user reads a
   * thread, the pilot pushes back on it, and it is news again. The number the
   * mark is kept against is `pilotWrites` (`items.mjs`), rendered onto each
   * line as `data-said` — the pilot's own messages carry no sequence number, on
   * purpose, so counting them is the one value that moves when and only when
   * the pilot says something. A reply of the user's own never moves it.
   *
   * The key is deliberately **not** scoped by `?run=` the way a panel's size is
   * (L4). A size is a preference about one deck's rows; what has been seen is a
   * fact about the person looking, and line 26 counts the threads on *any*
   * deck — a key per deck would count the same thread again on the next tab.
   *
   * `localStorage` and not `sessionStorage`, for the reason a panel's size uses it
   * (`size.mjs`): a tab the deck opens itself (D14) does not inherit the one that opened
   * it, and a thread already read should not come back as new. It is also what
   * the user's own bug turned on — "deleting a notification deletes it from
   * view, but when I reload it spawns back in" — because the × used to be
   * remembered for the life of one page and this outlives one.
   */
  var SEEN = 'deck.seenThreads';

  /*
   * When this browser last had the Notifications tab in view (deck-press-feedback spec 12, L8):
   * a notice the deck closed after it is one the user has not seen, and lights the tab. A per-browser
   * view state, so `localStorage` and no write to the deck; unreadable is "never", which lights it.
   */
  var OPENED = 'deck.notificationsOpenedAt';

  var openedAt = function () {
    try {
      return Date.parse(localStorage.getItem(OPENED) || '') || 0;
    } catch (e) {
      return 0;
    }
  };

  // Found among the bookmarks rather than asked for by id: this one is one of
  // them, and the group is the only place it can be. Null on
  // a page that carries no such bookmark — the daemon's error page, a refusal —
  // so everything below is guarded on it.
  var bookmarks = document.querySelectorAll('details.tab');
  var notifications = null;
  var reports = null;

  forEach(bookmarks, function (bookmark) {
    if (bookmark.id === 'notifications') notifications = bookmark;
    if (bookmark.id === 'reports') reports = bookmark;
  });

  // --- the closing reports this browser has taken off (deck-polish A4) -------

  /*
   * A report's × is a notice's × for a report: this browser's own view of the
   * panel, kept in `localStorage` so a reload keeps it, and sent nowhere, so the
   * report stays open and its thread still opens at its address. A plain list
   * of ids, because a report has no "the pilot said more" to come back on.
   *
   * Not pruned to the rows drawn, unlike `deck.seenThreads`: the reports panel
   * is one deck's, so pruning on another tab or on the overview would forget
   * every report hidden on this one. The list only grows by a press of ×.
   */
  var HIDDEN_REPORTS = 'deck.hiddenReports';

  var hiddenReports = function () {
    try {
      var kept = JSON.parse(localStorage.getItem(HIDDEN_REPORTS) || '[]');
      if (Array.isArray(kept)) return kept;
    } catch (e) {}
    return [];
  };

  var hideReport = function (id) {
    var hidden = hiddenReports();
    hidden.push(id);
    try {
      localStorage.setItem(HIDDEN_REPORTS, JSON.stringify(hidden));
    } catch (e) {}
  };

  var hideReportsIn = function (root) {
    var hidden = hiddenReports();
    var shown = 0;
    forEach(root.querySelectorAll('[data-report]'), function (row) {
      row.hidden = hidden.indexOf(row.dataset.report) !== -1;
      if (!row.hidden) shown += 1;
    });
    // Every row hidden: say so, rather than an empty panel that reads as broken.
    // Here and not in the recount, so a live swap's fresh copy arrives matching.
    var allHidden = root.querySelector('[data-all-hidden]');
    if (allHidden) allHidden.hidden = shown > 0;
  };

  /**
   * The Closing reports count, redrawn as the server draws it (`renderTabSummary`)
   * less the open rows this browser has hidden: no attribute at all past zero.
   */
  var recountReports = function () {
    if (!reports) return;
    var summary = reports.querySelector('summary');
    hideReportsIn(reports);
    var open = 0;
    forEach(reports.querySelectorAll('[data-report]'), function (row) {
      if (!row.hidden && row.querySelector('.open')) open += 1;
    });
    if (open > 0) summary.setAttribute('data-count', String(open));
    else summary.removeAttribute('data-count');
  };

  /**
   * What this browser has seen, as a map of thread id to a pilot-write count.
   *
   * A list of ids is the shape the key held before the amendment, and one is in
   * the user's real browser: it is read as "seen at the first thing the pilot
   * said", which is what it meant — every thread in it had been looked at — so
   * anything the pilot has said since makes it unseen again. Discarding the old
   * key would flag every thread they had already read.
   *
   * Anything else unreadable is nothing seen, which shows the count again
   * rather than hiding a thread behind a broken key: no `localStorage` at all, a
   * private mode that throws on it, or a value that is neither shape.
   */
  var seenSoFar = function () {
    // Without a prototype, for the reason `answered` below is built that way: a
    // thread called `__proto__` would otherwise reach the legacy accessor
    // instead of making a key, and the mark would go quietly missing. Ids are
    // the deck's own `itm_<hex>` today, so this holds an invariant rather than
    // stopping a hole. (The word every reviewer reaches for here is one
    // `daemon.test.mjs` asserts is nowhere on the page — this file is inlined
    // into every one of them, and a comment is page text like any other.)
    var seen = Object.create(null);
    try {
      var kept = JSON.parse(localStorage.getItem(SEEN) || 'null');
      if (Array.isArray(kept)) {
        forEach(kept, function (id) {
          if (typeof id === 'string') seen[id] = 1;
        });
      } else if (kept !== null && typeof kept === 'object') {
        for (var id in kept) {
          // A value that is not a whole number is left out, so the thread it
          // names is shown again rather than hidden on a guess.
          if (typeof kept[id] === 'number' && kept[id] === Math.floor(kept[id])) seen[id] = kept[id];
        }
      }
    } catch (e) {}
    return seen;
  };

  var remember = function (seen) {
    var value = JSON.stringify(seen);
    try {
      // A key that remembers nothing is no key at all: this browser has looked
      // at nothing yet, or the last thread it had read has left the deck. So a
      // page that draws a panel and has no mark to keep writes nothing.
      if (value === '{}') localStorage.removeItem(SEEN);
      // Otherwise compared before it is written, the way a panel's size is: a
      // swap that changed nothing restates the same map and must not write.
      else if (localStorage.getItem(SEEN) !== value) localStorage.setItem(SEEN, value);
    } catch (e) {}
  };

  /** Every line the deck drew on the panel, hidden or not. */
  var noticesOn = function () {
    return notifications ? notifications.querySelectorAll('[data-thread]') : [];
  };

  /**
   * How many times the pilot has written on the thread this line is for, as the
   * server rendered it. A line without the attribute is read as one write —
   * the post — so a thread already seen stays seen rather than flashing back.
   */
  var saidOn = function (line) {
    var said = parseInt(line.dataset.said, 10);
    return isNaN(said) ? 1 : said;
  };

  /** Whether this browser has looked at this line since the pilot last wrote. */
  var isSeen = function (seen, line) {
    var mark = seen[line.dataset.thread];
    return typeof mark === 'number' && mark >= saidOn(line);
  };

  /**
   * The mark, written: this thread, seen at what the pilot had said by the time
   * the user looked. Pruned to the threads the deck is still drawing on its way
   * out, so the key stays bounded by what is open on the deck rather than by how
   * long this browser has been running — a thread the pilot settles leaves the
   * deck, and remembering that it was once read is a key that only ever grows.
   */
  var prune = function (seen) {
    var kept = Object.create(null);
    forEach(noticesOn(), function (line) {
      var mark = seen[line.dataset.thread];
      if (typeof mark === 'number') kept[line.dataset.thread] = mark;
    });
    return kept;
  };

  var markSeen = function (id, said) {
    var seen = seenSoFar();
    seen[id] = said;
    remember(prune(seen));
  };

  /** Mark all seen (notifications-seen L2): every listed thread at its own count, in one read and one write. */
  var markAllSeen = function () {
    var seen = seenSoFar();
    forEach(noticesOn(), function (line) {
      seen[line.dataset.thread] = saidOn(line);
    });
    remember(prune(seen));
  };

  /**
   * The panel and the number on it, both from the same answer: a thread this
   * browser has seen since the pilot last wrote on it is hidden, and the rest
   * are counted.
   *
   * The number goes on the `<summary>`, which is outside every live region, so
   * a change swapping the panel underneath does not take the count with it —
   * `deck.css` is what draws it, and nothing here writes markup.
   *
   * Opening the panel does nothing here, and that is the amendment (spec 26 at
   * Gate 2). The count used to clear itself the moment the panel was opened, so
   * a panel that was read emptied its own count and the × was left with nothing
   * to do; reading a list of titles is not reading the threads. What marks a
   * thread seen is opening it, or saying so with its ×.
   *
   * The key is written on the way through, pruned, because this is the one place
   * that knows which threads the deck is still drawing.
   *
   * The count also takes the agent-closed threads' notices (deck-press-feedback L8), which the
   * server already wrote into the same `data-count` at first paint; this restates it with the unseen
   * open threads added. The tab is highlighted while it is shut and holds a notice closed after it
   * was last in view; a time that will not parse is read as new rather than hidden on a guess. The
   * notice's time is epoch milliseconds, not an ISO stamp: every stamp a page shows is a `<time>`
   * (D11), and this one is never shown.
   */
  var recount = function () {
    recountReports();
    if (!notifications) return;
    var summary = notifications.querySelector('summary');
    if (!summary) return;
    var seen = prune(seenSoFar());
    remember(seen);
    var closed = notifications.querySelectorAll('[data-notice]');
    var unseen = closed.length;
    forEach(noticesOn(), function (line) {
      line.hidden = isSeen(seen, line);
      if (!line.hidden) unseen += 1;
    });
    var form = notifications.querySelector('.mark-all-form');
    if (form) form.hidden = unseen === 0;
    if (unseen > 0) summary.setAttribute('data-count', String(unseen));
    else summary.removeAttribute('data-count');
    var since = openedAt();
    var news = false;
    forEach(closed, function (line) {
      if (!(parseInt(line.dataset.at, 10) <= since)) news = true;
    });
    if (news && !notifications.open) summary.setAttribute('data-highlight', '');
    else summary.removeAttribute('data-highlight');
  };

  /**
   * The thread whose own page this is, or null. The address is the one place it
   * is written down that this script can read, and it is decoded rather than
   * matched raw: the id is in a path segment the server encoded.
   */
  var threadHere = function () {
    var path = String(location.pathname || '');
    if (path.indexOf('/thread/') !== 0) return null;
    try {
      return decodeURIComponent(path.slice('/thread/'.length));
    } catch (e) {
      return null;
    }
  };

  /**
   * Opening a thread's page is what marks that thread seen (spec 26, amended).
   * The line the panel already draws for it is where the count comes from, so
   * no second fact has to reach the browser — and a thread on no line, a
   * resolved one, marks nothing rather than inventing a number for it.
   *
   * Run again after every swap, not only at load: a pilot message arriving on
   * the thread the user is *reading* raises its count, and flagging the thread
   * they are looking at as unread is the one reading of "not viewed since it
   * last changed" that is plainly wrong.
   */
  var markThisThread = function () {
    var id = threadHere();
    if (id === null) return;
    forEach(noticesOn(), function (line) {
      if (line.dataset.thread === id) markSeen(id, saidOn(line));
    });
  };

  /**
   * A line for a thread already seen arrives hidden, exactly as a folded branch
   * arrives folded — put back on each fetched page *before* the two are
   * compared, so a change that moved nothing else compares equal and swaps
   * nothing, and one that did arrives already hidden with no frame of it back.
   *
   * It closes nothing (L25). The thread is still open, still on the home queue
   * and still in the terminal's waiting count; this is the panel saying the
   * person looking has read it, which is why it is in this browser's own key
   * and in no store.
   */
  var rehide = function (fresh) {
    var seen = seenSoFar();
    var shown = 0;
    forEach(fresh.querySelectorAll('.notice'), function (line) {
      line.hidden = isSeen(seen, line);
      if (!line.hidden) shown += 1;
    });
    // Mark all seen has nothing to act on when no row is left to show (notifications-seen spec 5).
    var form = fresh.querySelector('.mark-all-form');
    if (form) form.hidden = shown === 0;
    hideReportsIn(fresh);
  };

  // Opening the tab, and shutting it, stamps what was in view (spec 12); the stamp is the one write.
  if (notifications) {
    notifications.addEventListener('toggle', function () {
      try {
        localStorage.setItem(OPENED, new Date().toISOString());
      } catch (e) {}
      recount();
    });
  }

  if (notifications || reports) {
    // Delegated from the document, because the lines live inside a live region
    // and are thrown away and built again by every swap (D3), so a listener
    // bound to a × would go with the first change that arrived.
    //
    // The × says "I have read this one" and writes the same mark opening the
    // thread writes, which is what makes it survive a reload. Nothing is sent
    // to the deck: the thread stays open and this is one browser's own view of
    // the panel (L25).
    document.addEventListener('click', function (event) {
      if (!event.target || !event.target.closest) return;
      // A report's × goes into its own key and nowhere else (A4).
      var dropped = event.target.closest('[data-report] .drop');
      if (dropped) {
        hideReport(dropped.closest('[data-report]').dataset.report);
        recount();
        return;
      }
      // Mark all seen marks the open threads here; its form then posts the notices' clearing,
      // and their rows go with the swap that follows, not before (notifications-seen L1, L5).
      if (event.target.closest('.mark-all')) {
        markAllSeen();
        recount();
        return;
      }
      var pressed = event.target.closest('.notice .drop');
      if (!pressed) return;
      var line = pressed.closest('.notice');
      markSeen(line.dataset.thread, saidOn(line));
      recount();
    });
  }

  markThisThread();
  recount();

  return { rehide: rehide, recount: recount, markThisThread: markThisThread };
}
