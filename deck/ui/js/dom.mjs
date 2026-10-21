/*
 * Walking a DOM list — a `NodeList` or an `HTMLCollection` — the way the
 * page's script always has: those have no `forEach` of their own in every
 * browser the deck has run in, so it is borrowed off `Array.prototype`.
 * Shared by every module of the page (ADR 0030); moved unchanged out of
 * `legacy.mjs` (S6 of deferred-ledger, L12).
 */

var forEach = function (list, each) {
  Array.prototype.forEach.call(list, each);
};

export { forEach };
