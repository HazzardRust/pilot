/**
 * The Reports panel as data (rune-deck-ui S14): this repository's closing reports, newest said first, as the
 * page's Reports tab lists them (`reportsOf`); the overview names none, as on the page. The × that hides one
 * is the window's own pref (A4), never the store's.
 */
import { isOpen, lastSaidAt } from '../items.mjs';
import { landingFor, tabFor, tabsOf } from '../tabs.mjs';
import { reportsOf } from '../ui/render-rail.mjs';

export function reportsView(reads, query = {}) {
  const { run = null } = query;
  const tabs = tabsOf(reads.runs, reads.items, reads.numbers, reads.agents, reads.added, reads.lanes);
  const tab = run === null ? landingFor(tabs) : tabFor(tabs, run);
  const reports = tab ? reportsOf(reads.items, tab.repo) : [];
  // `open` is the page's "open" mark (`renderReportRow`): the pilot has not closed the report yet.
  return {
    reports: reports.map((item) => ({ id: item.id, title: String(item.title ?? ''), href: `/thread/${encodeURIComponent(item.id)}`, at: lastSaidAt(item) ?? null, open: isOpen(item) })),
  };
}

export default ({ reads, query }) => reportsView(reads, query);
