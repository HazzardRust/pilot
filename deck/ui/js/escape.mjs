/*
 * Esc and the arrow leave a thread one way (spec 17, ADR 0118). Moved out of
 * `legacy.mjs` (S6 of deferred-ledger, ADR 0030, L12); `install(env)` reads
 * the page's globals off `env` and nothing else (L11).
 */

export function install(env) {
  var document = env.document;
  var location = env.location;
  var history = env.history;

  /**
   * The one way off a thread, for Esc and for the arrow. Only the thread page
   * has an arrow, so only the thread page listens: `arrow` is the whole
   * condition, and the overview and the items list take no key at all.
   *
   * Where it goes is the arrow's question, asked twice. A thread reached from a
   * deck page (the overview or a tab, not another thread) goes *back* to it — the browser's own Back, so the tab
   * the reader left comes back with its scroll and its open bookmarks, which an
   * href cannot do, because the arrow names one address, the owning deck's,
   * for every reader.
   * Otherwise the arrow's own href is the answer, and two different tabs are in
   * that case: one the deck opened itself (D14), which has no referrer, and one
   * the reader middle-clicked a card into, which *keeps* the referrer of the
   * page the link was on but has a single entry behind it. `history.back()`
   * there is a silent no-op — the key would do nothing at all — so both halves
   * are asked: where the reader came from, and whether this tab can go there.
   *
   * Not while a reply is being typed. Esc in a text box is the key a user
   * presses to dismiss something, and a draft thrown away by it is
   * unrecoverable — the one thing on this page that is. Nor on the repeats of a
   * held key, which would walk back through the history a page per tick.
   */
  // Looked up on each press: a move in place (handoff-failed-confirm S6) draws a thread's header, or the overview's.
  document.addEventListener('keydown', function (event) {
    var arrow = document.querySelectorAll('a.back')[0];
    if (!arrow || event.key !== 'Escape' || event.defaultPrevented || event.repeat) return;
    var typing = document.activeElement;
    if (typing && (typing.tagName === 'TEXTAREA' || typing.tagName === 'INPUT')) return;
    leave(arrow);
  });

  // The arrow is the same way off with a second trigger (ADR 0118, L3): one
  // `leave` keeps the two from drifting. Delegated, for the same redraw. Its
  // href stays real and names the owning deck, so a modified or middle click —
  // a new tab — is the browser's, as on the strip (`navigate.mjs`), and lands on that deck.
  document.addEventListener('click', function (event) {
    if (event.defaultPrevented || event.button || event.metaKey) return;
    if (event.ctrlKey || event.shiftKey || event.altKey) return;
    if (!event.target || !event.target.closest) return;
    var arrow = event.target.closest('a.back');
    if (!arrow) return;
    event.preventDefault();
    leave(arrow);
  });

  function leave(arrow) {
    // The trailing slash is what keeps another origin that merely starts the
    // same — a second deck on a longer port number — from reading as this one.
    var deckRoot = location.origin + '/';
    // A thread is not a page to go back to: Back from one thread to another is no way off.
    var cameFromADeckPage =
      document.referrer.indexOf(deckRoot) === 0 && document.referrer.indexOf('thread/', deckRoot.length) !== deckRoot.length;
    if (cameFromADeckPage && history.length > 1) history.back();
    else location.assign(arrow.href);
  }
}
