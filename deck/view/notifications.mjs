/**
 * The Notifications panel as data (rune-deck-ui S10): the closed threads still carrying a notice, newest
 * close first, then every open thread on the deck, newest first, as `renderNotifications`
 * (`deck/ui/render-rail.mjs`) draws them. Deck-wide, never the tab's (spec 26 of the page). Each open
 * thread carries `writes`, the pilot's write count its seen mark is kept against; the seen marks
 * themselves are the window's own prefs (A4), never the store's.
 */
import { isQueued, noticesOf, pilotWrites } from '../items.mjs';
import { tabFor, tabsOf } from '../tabs.mjs';
import { titled } from './thread.mjs';

const href = (item) => `/thread/${encodeURIComponent(item.id)}`;

/** A closed notice reads `kind · title · resolution's first line`, as `renderClosedNotice` draws it. */
export function notificationsView(reads) {
  const notices = noticesOf(reads.items).map((item) => ({
    id: item.id,
    kind: String(item.kind ?? ''),
    title: item.title,
    resolution: titled(String(item.resolution ?? '').split('\n')[0], reads.items),
    href: href(item),
    at: Date.parse(item.resolvedAt) || 0,
  }));
  const tabs = tabsOf(reads.runs, reads.items, reads.numbers, reads.agents, reads.added, reads.lanes);
  const open = reads.items
    .filter(isQueued)
    .reverse()
    .map((item) => ({ id: item.id, title: item.title, href: href(item), writes: pilotWrites(item), tab: tabFor(tabs, item.repo)?.name ?? '' }));
  return { notices, open };
}

export default ({ reads, query }) => notificationsView(reads, query);
