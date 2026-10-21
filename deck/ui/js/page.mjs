/*
 * Every region of the page installed against `env`, in the order the old
 * script ran them (L11). `deck.mjs` installs it against the window, and
 * `loadPage` in `deck/testUtils.mjs` against a sandbox, so the two cannot
 * drift. It reads nothing from `window`. The rail's modules go first; what
 * they hand back is what the rest of the page calls on a live update and on a
 * change of deck.
 *
 * `live.mjs` and `reply.mjs` each call the other: a swap puts back the answers
 * this browser sent, and a sent answer takes whatever the swap skipped. `live`
 * is installed first because its listeners were registered first, so the
 * answers it puts back are looked up when a page arrives, by which time
 * `replies` stands. `move.mjs` takes `live`'s `settle` the same way.
 */

import { install as installBookmarks } from './bookmarks.mjs';
import { install as installChat } from './chat.mjs';
import { install as installConfirm } from './confirm.mjs';
import { install as installEscape } from './escape.mjs';
import { install as installGraphName } from './graph-name.mjs';
import { install as installInPlace } from './inplace.mjs';
import { install as installLayout } from './layout.mjs';
import { install as installLive } from './live.mjs';
import { install as installMove } from './move.mjs';
import { install as installNavigate } from './navigate.mjs';
import { install as installNotifications } from './notifications.mjs';
import { install as installReply } from './reply.mjs';
import { install as installSize } from './size.mjs';
import { install as installTime } from './time.mjs';

export const install = (env) => {
  installBookmarks(env);
  const notices = installNotifications(env);
  const sizes = installSize(env);
  installLayout(env);
  const times = installTime(env);
  const chat = installChat(env);
  const live = installLive(env, notices, sizes, times.stamp, (fresh) => replies.resent(fresh), chat);
  const replies = installReply(env, live.settle);
  installInPlace(env, live.refresh, live.settle);
  installMove(env, live.settle);
  installNavigate(env, live.refresh);
  installEscape(env);
  installConfirm(env);
  installGraphName(env);
};
