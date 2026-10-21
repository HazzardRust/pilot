/*
 * Moving about the deck without throwing the page away. Moved unchanged out of
 * `legacy.mjs` (S6 of deferred-ledger, ADR 0030, L12); `install(env, refresh)`
 * reads the page's globals off `env` and nothing else (L11), and `refresh` is
 * `live.mjs`'s, the same one a change from the deck runs.
 */

export function install(env, refresh) {
  var document = env.document;
  var history = env.history;
  var location = env.location;
  var addEventListener = env.addEventListener;

  /**
   * The strip's links and the EVERYTHING toggle stay real links: a browser
   * running no script follows them, and the address still names the view, which
   * is where both of them keep their state (D30). What changes is what this
   * browser does with a press — "pressing 'everything' reloads the page, unsure
   * if this was still supposed to be a thing?" (the user, walkthrough #2). A
   * reload throws away everything the page was holding, down to the scroll, for
   * a page that differs by a few cards.
   *
   * So the address moves and the page is read again in place, by the same
   * `refresh` a change from the deck uses; `popstate` does the same, which is
   * what makes Back and Forward work. Anything the browser would rightly do
   * itself — a middle click, a modified click, a new tab — is left to it.
   *
   * This is only safe because every page carrying either control carries the
   * queue those controls redraw (a thread page, the arrows and X/N its
   * toggle picks the walk of): a page with tabs but nothing for them to swap
   * would move its address and change nothing on screen. `live.test.mjs` holds
   * that to the rendered markup rather than this guessing at it here.
   */
  document.addEventListener('click', function (event) {
    if (event.defaultPrevented || event.button || event.metaKey) return;
    if (event.ctrlKey || event.shiftKey || event.altKey) return;
    if (!event.target || !event.target.closest) return;
    var link = event.target.closest('.runs-strip a, a.everything');
    if (!link || !link.getAttribute('href')) return;
    event.preventDefault();
    // The press left the focus on the link, and a region holding the focus is
    // one `apply` skips — so the tab the user just picked would not light, and
    // neither would the toggle, until they clicked somewhere else entirely.
    // Same reason the reply button lets go of the focus when it posts.
    link.blur();
    // On a thread the toggle swaps the walk, not the place: an entry per press would make Back
    // (and the arrow) land on the same thread (back-arrow, decision itm_498a61106fc8).
    var onThread = location.pathname.indexOf('/thread/') === 0 && event.target.closest('a.everything') === link;
    history[onThread ? 'replaceState' : 'pushState'](null, '', link.getAttribute('href'));
    refresh();
  });

  addEventListener('popstate', refresh);
}
