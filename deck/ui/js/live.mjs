/*
 * The page updates **in place** and never reloads (D1); why, and what was
 * rejected, is docs/adr/0016-the-page-updates-in-place-and-never-reloads.md.
 * A fold the user has made is part of that: it is put back on the page each
 * change fetched before the two are compared (deck-workspace spec 24).
 *
 * Moved unchanged out of `legacy.mjs` (S6 of deferred-ledger, ADR 0030, L12).
 * `install(env, notices, sizes, stamp, resent, chat)` reads the page's
 * globals off `env` and nothing else (L11). The other five are what the rest
 * of the page hands it to run on each fetched page and after each swap:
 * `notices` is what `notifications.mjs`'s `install` hands back, `sizes` what
 * `size.mjs`'s does, `stamp` is `time.mjs`'s, `resent` is `reply.mjs`'s and
 * `chat` is `chat.mjs`'s. It hands back `settle`, which a reply sent in place
 * calls, and `refresh`, which navigation calls.
 *
 * Written in the language the deck's pages have always been written in — `var`,
 * functions, no `await` — because that is how it was written when it was
 * inlined into a page, and moving it changes nothing it does (L12).
 */

import { refoldTickets, rememberTicketFold } from './bookmarks.mjs';
import { forEach } from './dom.mjs';

export function install(env, notices, sizes, stamp, resent, chat) {
  var document = env.document;
  var location = env.location;
  var fetch = env.fetch;
  var setTimeout = env.setTimeout;
  var DOMParser = env.DOMParser;
  var EventSource = env.EventSource;

  var rehide = notices.rehide;
  var recount = notices.recount;
  var markThisThread = notices.markThisThread;
  var rescope = sizes.rescope;

  // --- the page updates in place --------------------------------------------

  /** The newest page fetched that some region was too busy to take, or null. */
  var owed = null;

  var regionsIn = function (root) {
    var found = {};
    forEach(root.querySelectorAll('[data-live]'), function (region) {
      found[region.dataset.live] = region;
    });
    return found;
  };

  /**
   * Whether replacing this region would take something out from under the user:
   * the element they are in, or a box they have typed into and not sent. An
   * empty box nobody is in carries no state worth keeping, so it is replaced
   * like anything else.
   */
  var busy = function (region) {
    if (region.contains(document.activeElement)) return true;
    var boxes = region.querySelectorAll('textarea');
    for (var index = 0; index < boxes.length; index += 1) {
      if (boxes[index].value !== '') return true;
    }
    return false;
  };

  /*
   * A run's section on the overview is the same element and the opposite
   * polarity: `render.mjs` serves one per tab and serves them all shut, so what
   * is worth remembering is which the user *opened*. A key of its own on the element.
   */
  var opened = [];

  /*
   * A day of settled threads on the queue (spec 35) is the third polarity, and
   * the list above cannot hold it: the server serves today's section open and
   * every earlier one shut, so a key in `opened` would mean "open" where it
   * meant "shut". What is worth
   * remembering here is the user's own choice, either way, by day — and a day
   * they have not touched keeps whatever the server served it as.
   *
   * A map and not a list, because "the user chose shut" and "the user chose
   * nothing" are different answers. The keys are dates (`2026-09-22`), a month
   * (`2026-09`) or `undated`, so none of them is a name on `Object.prototype`
   * and a missing one really does read as `undefined`.
   *
   * Keyed on the date and never on "today", so it is still right after midnight:
   * the section the user opened is the 21st's, not "yesterday's".
   */
  var days = {};

  document.addEventListener(
    'toggle',
    function (event) {
      var details = event.target;
      var keys = details && details.dataset ? details.dataset : {};
      // A bookmark carries none of these keys and is nothing to do with the lists.
      if (keys.section !== undefined) {
        var at = opened.indexOf(keys.section);
        if (details.open && at === -1) opened.push(keys.section);
        if (!details.open && at !== -1) opened.splice(at, 1);
      }
      if (keys.day !== undefined) days[keys.day] = details.open;
      // A ticket group, kept across reloads per repository (overview-one-ticket spec 13).
      if (keys.queue !== undefined && keys.repo !== undefined) rememberTicketFold(env, details);
    },
    true,
  );

  /**
   * The page a change fetched, folded the way the user left this one — run
   * before the two are compared rather than after the swap, and that order is
   * the whole of it. `apply` replaces a region whenever the server's bytes
   * differ from the screen's, and a fold *is* a difference: compared against
   * the server's open tree, every fold counts as a change, so the region would
   * be rewritten on refreshes that changed nothing and every fold would be
   * wiped by the next status change. Folded first, a refresh that changed
   * nothing compares equal and swaps nothing, and one that did change something
   * arrives already folded, with no frame of it flat open.
   *
   * Opening a section here announces itself in the fetched page and not in this
   * one, which has no listener of ours on it — so nothing this sets is read
   * back as the user's doing.
   *
   * The overview's sections are the same thing said the other way up: the
   * server serves each of them shut, so what rides in with the swap is the one
   * the user opened.
   */
  var refold = function (fresh) {
    forEach(fresh.querySelectorAll('details.run-section'), function (section) {
      section.open = opened.indexOf(section.dataset.section) !== -1;
    });
    // And the queue's days, where the server's own state stands wherever the
    // user has expressed no choice — so today keeps arriving open.
    forEach(fresh.querySelectorAll('details.day'), function (day) {
      var chosen = days[day.dataset.day];
      if (chosen !== undefined) day.open = chosen;
    });
    // And the ticket groups, served shut like the sections: the ones this browser opened.
    refoldTickets(env, fresh);
  };

  /**
   * Which page this is: the thread its body names, and the regions its `<main>` holds. Two
   * pages of one kind differ region by region; the overview's queue has no place on a thread
   * page, nor one thread's heading on another's (handoff-failed-confirm S6). The header's own
   * regions are not counted, because a thread page's position comes and goes with its list.
   */
  var kindOf = function (root) {
    var main = root.querySelector('main');
    var names = main ? Object.keys(regionsIn(main)) : [];
    if (main && main.dataset.live) names.push(main.dataset.live);
    return [root.body ? root.body.getAttribute('data-item') : null].concat(names.sort()).join(' ');
  };

  /**
   * The readings `usage.mjs` filled, carried onto a fetched header, which the server draws
   * saying "unknown": the account's, never one deck's context window onto another's page.
   */
  var carryUsage = function (here, there) {
    forEach(['data-usage', 'data-resets'], function (attr) {
      forEach(there.querySelectorAll('[' + attr + ']'), function (reading) {
        var key = reading.getAttribute(attr);
        var shown = key === 'ctx' ? null : here.querySelector('[' + attr + '="' + key + '"]');
        if (shown) reading.outerHTML = shown.outerHTML;
      });
    });
  };

  /**
   * A move to another kind of page: `<header>`, `<main>`, the title and the body's thread are
   * taken whole, whoever is in them, because the address has already moved. The panels and
   * `.strip.right`, which every page draws, go region by region after it, as on any change.
   */
  var swapKind = function (fresh) {
    forEach(['header', 'main'], function (tag) {
      var here = document.querySelector(tag);
      var there = fresh.querySelector(tag);
      if (tag === 'header') carryUsage(here, there);
      here.outerHTML = there.outerHTML;
    });
    document.title = fresh.title;
    var item = fresh.body.getAttribute('data-item');
    if (item === null) document.body.removeAttribute('data-item');
    else document.body.setAttribute('data-item', item);
  };

  var apply = function (fresh) {
    refold(fresh);
    // Same order and for the same reason: a line for a thread already read is a
    // difference from the server's panel, so it is hidden on the fetched page
    // before the two are compared or every change would bring it back.
    rehide(fresh);
    // And the third: an option this browser has answered comes back marked and
    // unpressable, or the answer's own announcement would redraw the question.
    resent(fresh);
    // A refusal or an error page has no `<main>`, and must move nothing, title and thread included.
    if (fresh.querySelector('main') && kindOf(fresh) !== kindOf(document)) swapKind(fresh);
    var next = regionsIn(fresh);
    var skipped = false;
    // Which live region's swap was left for `settle` to take later, by name —
    // read below to hold the Tickets and Reports badge back exactly as long as
    // the list beside it: the two are one claim, and letting the badge move
    // first would say a count the list on the same screen does not yet show.
    var busyIds = {};
    // Where the reader of a chat panel this swap redraws was, or null (L5).
    var chatWas = null;
    forEach(document.querySelectorAll('[data-live]'), function (region) {
      var replacement = next[region.dataset.live];
      // A region the answer does not carry is left exactly where it is, showing
      // what the deck last said. There used to be a second case here — a
      // bookmark whose panel a fresh page had stopped drawing was hidden — and
      // it went with the reason for it at the walkthrough of 2026-09-19: every
      // page state draws both panels now (`render.mjs`'s `renderStrips`), so
      // the only answer that carries no region at all is one that is not a page
      // of the deck's, and a refusal must move nothing.
      if (replacement === undefined) return;
      if (busy(region)) {
        skipped = true;
        busyIds[region.dataset.live] = true;
        return;
      }
      if (region.innerHTML !== replacement.innerHTML) {
        // The chat panel keeps its place or follows (L5). The compare above is
        // always different for it, because `time.mjs` has rewritten each
        // byline's time as "n min ago" and the server's page still says the
        // instant (F4), so this runs on every change any deck announces. Where
        // the reader was is read before the swap, because after it the
        // panel's height is already the new one; it is put back after
        // `stamp()` below, because until then every byline holds the longer
        // instant and the lines above the reader stand taller than they will.
        if (chat && region.dataset.live === 'chat') {
          chatWas = { region: region, follow: chat.atBottom(), scrollTop: region.scrollTop };
        }
        region.innerHTML = replacement.innerHTML;
      }
    });
    // The EVERYTHING toggle sits outside every live region on purpose: what it
    // says is the address's business, not the deck's, so a change arriving
    // underneath must not move it. A move between pages is the one thing that
    // does change it, and what is fetched is always `location.href`'s own page,
    // so on a change this finds the same bytes and does nothing.
    var here = document.querySelector('.strip.right');
    var there = fresh.querySelector('.strip.right');
    if (here && there && !busy(here) && here.innerHTML !== there.innerHTML) {
      here.innerHTML = there.innerHTML;
    }
    // The Tickets and Reports bookmarks' badge is the same claim again: `data-count`
    // sits on the `<summary>` itself (`render.mjs`'s `renderTabSummary`), outside
    // the `[data-live="tickets"]` / `[data-live="reports"]` panel beside it, so the
    // loop above swaps the list and never the number on the bookmark — which was
    // the bug: the badge kept saying what the page loaded with, while the list it
    // sat next to had already moved. Copied across rather than recomputed, unlike
    // `notifications.mjs`'s own badge: what counts as open here is a fact the deck
    // decided server-side, not one only this browser's history can answer. Only
    // the attribute moves, never the `<summary>` or the `<details>` around it, so
    // this cannot fold a bookmark shut or take a drag or a keystroke with it.
    //
    // Held back exactly where its own list is: a region left `busy` above is a
    // list the user is still in, and a badge that moved on ahead of it would
    // show a count the list beside it does not agree with yet. `settle` takes
    // both together the moment the region stops being busy, the same way it
    // takes the list alone today.
    forEach(['tickets', 'reports'], function (id) {
      if (busyIds[id]) return;
      var freshBadge = fresh.querySelector('#' + id + ' > summary');
      var ownBadge = document.querySelector('#' + id + ' > summary');
      if (!freshBadge || !ownBadge) return;
      var count = freshBadge.getAttribute('data-count');
      if (count === null) {
        if (ownBadge.getAttribute('data-count') !== null) ownBadge.removeAttribute('data-count');
      } else if (ownBadge.getAttribute('data-count') !== count) {
        ownBadge.setAttribute('data-count', count);
      }
    });
    // The swap puts the server's ISO stamps back, so they are read again — after
    // the whole loop rather than per region, because one pass over the page is
    // one `Date.now()` and the stamps then agree with each other.
    stamp();
    // A reader at the newest message follows to the new one; a reader
    // scrolled up to reread keeps the line they were on.
    if (chatWas !== null) {
      if (chatWas.follow) chat.toBottom();
      else chatWas.region.scrollTop = chatWas.scrollTop;
    }
    // And the count, off the panel the swap has just put on the page: a thread
    // posted on another deck raises it here with nothing reloaded, which is the
    // whole of "a new question reaches you while you sit inside a walkthrough
    // thread" (spec 26). The `changed` event stays the bare ping it was.
    //
    // The thread the user is reading is marked first, so that a pilot message
    // arriving on the very page they are looking at moves the mark up with it
    // instead of flagging the thread in front of them as unread.
    markThisThread();
    recount();
    owed = skipped ? fresh : null;
  };

  /**
   * A skipped region is taken when the user's attention moves, or when they
   * click something that takes no focus at all — a paragraph, the
   * background — which is a way of leaving a region that announces itself
   * nowhere else.
   *
   * Deliberately not on `focusout`: that fires on the mousedown that *starts* a
   * click, so settling there would replace a form between the press and the
   * release and swallow the click that caused it. `click` is the same gesture
   * from the other end, and it is still deferred a turn, because a click on a
   * submit button propagates before the browser acts on it and a form removed
   * in between is a form that never submits.
   */
  var settle = function () {
    if (owed !== null) apply(owed);
  };

  document.addEventListener('focusin', settle);
  document.addEventListener('click', function () {
    setTimeout(settle);
  });

  /**
   * Which fetch is the current one. Two changes announced together are two
   * requests in flight, and the deck answers them in whatever order it
   * finishes; without this the slower of the two would land last and put the
   * page back to what the deck had stopped saying, leaving any skipped region
   * owed that stale page until the next change arrived.
   */
  var latest = 0;

  /** Go and read the page the address now names, and swap what changed into this one. */
  var refresh = function () {
    // The address is already where it is going — a tab's press pushes it, and
    // Back has moved it before this runs — so the panels take the new deck's
    // sizes now rather than when its page arrives (spec 5).
    rescope();
    var mine = (latest += 1);
    fetch(location.href)
      .then(function (answer) {
        return answer.text();
      })
      .then(function (html) {
        // The deck's own page, from the deck's own origin, is the only HTML
        // this script ever assigns. A refusal has no `data-live` regions of
        // its own, so `apply` finds nothing to replace and touches nothing —
        // the guard above is what drops it, not a check here.
        if (mine === latest) {
          apply(new DOMParser().parseFromString(html, 'text/html'));
        }
      })
      .catch(function () {
        // The daemon went away mid-fetch. There is nothing to tell the user
        // that the page will not tell them better: the same daemon feeds the
        // event stream, so a deck that is gone stops announcing changes, and
        // one that comes back announces the next and this runs again.
      });
  };

  // A change is announced only to the pages already listening, so whatever was
  // written between this page being served and its stream connecting — an
  // agent's answer to the reply whose 303 loaded it, milliseconds later — was
  // announced to nobody. Reading once on every open catches that, and what a
  // dropped stream missed too.
  var stream = new EventSource('/events');
  stream.addEventListener('changed', refresh);
  stream.addEventListener('open', refresh);

  return { settle: settle, refresh: refresh };
}
