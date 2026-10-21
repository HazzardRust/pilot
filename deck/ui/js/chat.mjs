/*
 * The Chat panel opens scrolled to its newest message, not the top.
 * `renderChat` (render.mjs) draws every message oldest first, a transcript,
 * and nothing in that markup says where the panel should land on arrival. A
 * panel with more messages than room to show them arrived at the top, which
 * put the reply the user is here to read behind every message already read.
 *
 * `.panel` is the live region itself and its own `overflow: auto`
 * (`deck.css`), so there is no separate "messages" element inside it to find:
 * scrolling the panel to its own `scrollHeight` is scrolling to the newest
 * message.
 *
 * `install(env)` reads the page's globals off `env` and nothing else (L11):
 * the window in the browser, `aSandbox(...)` in `deck/test/chat-scroll.test.mjs`.
 * It hands back `toBottom` and `atBottom`: `live.mjs` asks `atBottom` before
 * a swap redraws the chat panel and calls `toBottom` after it only if the
 * reader was there (L5). It calls `toBottom` once itself so the panel opens at
 * the bottom on first paint too.
 */

import { forEach } from './dom.mjs';

export function install(env) {
  var document = env.document;

  // Found among the bookmarks rather than asked for by id, the way
  // `notifications.mjs` finds its own: this one is one of them, and the
  // group is the only place it can be. Null on a page with no such
  // bookmark — the daemon's error page, a refusal — so everything below is
  // guarded on it.
  var chat = null;
  forEach(document.querySelectorAll('details.tab'), function (bookmark) {
    if (bookmark.id === 'chat') chat = bookmark;
  });

  var panel = function () {
    return chat ? chat.querySelector('[data-live="chat"]') : null;
  };

  /** Scrolls the panel to its newest message, if there is a panel to scroll. */
  var toBottom = function () {
    var region = panel();
    if (region) region.scrollTop = region.scrollHeight;
  };

  /**
   * Whether the reader is at the newest message: within a few pixels of the
   * end, because a browser rounds a scroll at a fractional zoom and a reader
   * who scrolled to the end should not be judged a pixel short of it.
   */
  var atBottom = function () {
    var region = panel();
    return region ? region.scrollHeight - region.scrollTop - region.clientHeight <= 8 : false;
  };

  if (chat) {
    // Opening or closing the bookmark is the platform's own doing (D5, as
    // every other bookmark): this only notices, the way `layout.mjs` notices
    // a toggle to restack the column. A user who shut Chat and reopens it
    // wants the newest message again, not wherever the panel had scrolled to
    // before, which is why this runs on open and not on close.
    chat.addEventListener('toggle', function () {
      if (chat.open) toBottom();
    });
  }

  toBottom();

  return { toBottom: toBottom, atBottom: atBottom };
}
