/**
 * The Chat panel opens scrolled to its newest message, not the top. `renderChat`
 * (render.mjs) draws every message top to bottom, oldest first — a transcript —
 * and nothing in that markup says where the panel should land. A user with more
 * messages than room to show them met the oldest one first and had to scroll
 * past every reply already read to find the one that mattered.
 *
 * `.panel` is the live region itself and its own `overflow: auto` (deck.css),
 * so there is no separate "messages" element inside it: scrolling the panel to
 * its own `scrollHeight` is scrolling to the newest message. This is proved
 * against the least DOM the module touches, the way `deck/test/notifications.test.mjs`
 * and `deck/test/resize.test.mjs` prove their own modules: the bookmark, its
 * panel, and the `toggle` event the platform fires with no script of ours.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { aSandbox } from '../testUtils.mjs';
import { install as installChat } from '../ui/js/chat.mjs';

/**
 * The Chat `<details>` and its panel: a scrollable region whose `scrollTop`
 * and `scrollHeight` a real browser sets, stood in as plain numbers a test can
 * read back. `toggles` collects the handler bound to `toggle`, the way
 * `deck/test/notifications.test.mjs`'s own `aBookmark` does, since `toggle`
 * does not bubble and nothing here dispatches a real event.
 */
const aChatBookmark = ({ open = true, scrollHeight = 400, clientHeight = 200 } = {}) => {
  const toggles = [];
  const panel = { dataset: { live: 'chat' }, scrollTop: 0, scrollHeight, clientHeight };
  const bookmark = {
    id: 'chat',
    open,
    querySelector: (selector) => (selector === '[data-live="chat"]' ? panel : null),
    addEventListener(type, handler) {
      if (type === 'toggle') toggles.push(handler);
    },
  };
  return { bookmark, panel, toggles };
};

const aDocument = (bookmarks) => ({
  querySelectorAll: (selector) => (selector === 'details.tab' ? bookmarks : []),
});

test('the panel is scrolled to its newest message on arrival, with no toggle needed', () => {
  const { bookmark, panel } = aChatBookmark({ scrollHeight: 733 });
  installChat(aSandbox({ document: aDocument([bookmark]) }));

  assert.equal(panel.scrollTop, 733, 'the panel opens at its own scrollHeight, i.e. the bottom');
});

test('reopening the bookmark scrolls to the newest message again', () => {
  const { bookmark, panel, toggles } = aChatBookmark({ scrollHeight: 200 });
  installChat(aSandbox({ document: aDocument([bookmark]) }));

  panel.scrollTop = 0;
  panel.scrollHeight = 950; // messages arrived while the panel was shut
  bookmark.open = false;
  toggles.forEach((toggle) => toggle());
  assert.equal(panel.scrollTop, 0, 'closing the bookmark does not scroll a panel nobody can see');

  bookmark.open = true;
  toggles.forEach((toggle) => toggle());
  assert.equal(panel.scrollTop, 950, 'opening it again lands on the newest message, not where it was left');
});

test('toBottom is handed back so a live swap of the panel can call it too', () => {
  const { bookmark, panel } = aChatBookmark({ scrollHeight: 60 });
  const chat = installChat(aSandbox({ document: aDocument([bookmark]) }));

  panel.scrollTop = 0;
  panel.scrollHeight = 500; // a fresh reply just landed
  chat.toBottom();

  assert.equal(panel.scrollTop, 500);
});

test('a page with no Chat bookmark at all installs and scrolls nothing', () => {
  assert.doesNotThrow(() => installChat(aSandbox({ document: aDocument([]) })).toBottom());
});

// --- deck-polish S3: keep-or-follow, and tables (spec 3, 4, L5, L6) -----------

test('atBottom says whether the reader is at the newest message, within a few pixels', () => {
  const { bookmark, panel } = aChatBookmark({ scrollHeight: 900, clientHeight: 200 });
  const chat = installChat(aSandbox({ document: aDocument([bookmark]) }));

  panel.scrollTop = 700;
  assert.equal(chat.atBottom(), true, 'exactly at the end');
  panel.scrollTop = 694;
  assert.equal(chat.atBottom(), true, 'a few pixels short still counts: a browser rounds its scroll');
  panel.scrollTop = 600;
  assert.equal(chat.atBottom(), false, 'scrolled up to reread is not the bottom');
});

test('a page with no Chat bookmark is never at the bottom of it', () => {
  assert.equal(installChat(aSandbox({ document: aDocument([]) })).atBottom(), false);
});

test("a chat message's table scrolls sideways with its columns sized to their content", () => {
  const css = fs.readFileSync(
    path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'ui', 'deck.css'),
    'utf8',
  );
  const holder = /#chat .md:has\(> table\) {([^}]*)}/.exec(css);
  assert.ok(holder, 'a rule for a chat message holding a table');
  assert.match(holder[1], /overflow-x: auto/, 'it scrolls sideways inside its message');
  const wide = /#chat .md table:has\(th:nth-child\(3\)\) {([^}]*)}/.exec(css);
  assert.ok(wide, 'a table of three or more columns');
  assert.match(wide[1], /min-width/, 'is given room as a whole, so a cell is not squeezed to a few characters');
  assert.doesNotMatch(css, /#chat .md (th|td)[^{]*{[^}]*min-width/, 'and no cell has a floor, so a short column fits its content');
  assert.doesNotMatch(css, /--panel: (?!19rem)/, 'the panel is not widened for it');
});
