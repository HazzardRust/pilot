/** The history region (S18, L2): settled threads by day under Everything, and the items screen: the page's own order. */
import { isOpen, newestSaidFirst } from '../items.mjs';
import { liveRuns } from '../runs.mjs';
import { queueOf } from '../status.mjs';
import { landingFor, tabFor, tabsOf } from '../tabs.mjs';
import { hrefFor } from '../ui/render-cards.mjs';
import { daySections } from '../ui/render-pages.mjs';
import { cardOf } from './queue.mjs';

/**
 * `query` is `{ run, all, screen }`. Home: with `all`, the scope's settled cards in `daySections`' sections, today open
 * (nothing is shipped without it). `items`: one section of every item, the open queue then the rest newest first, and
 * the live runs, each with the dismiss the page offers.
 */
export function historyView(reads, query = {}, now = Date.now()) {
  const { run = null, all = false, screen = 'home' } = query;
  const { items } = reads;
  const tabs = tabsOf(reads.runs, items, reads.numbers, reads.agents, reads.added, reads.lanes);
  if (screen === 'items') {
    const queue = queueOf(items);
    const ordered = [...queue, ...items.filter((item) => !queue.includes(item)).sort(newestSaidFirst)];
    const cards = ordered.map((item) => cardOf(item, { items, tab: null, back: '/items', all: false }));
    const runs = liveRuns(reads.runs).map(({ id, name }) => ({ id, name, dismissable: true }));
    return { days: cards.length ? [{ key: 'items', heading: 'Everything', open: true, cards }] : [], runs };
  }
  if (!all) return { days: [] };
  const tab = run === null ? landingFor(tabs) : tabFor(tabs, run);
  const back = hrefFor(tab, all);
  const done = items.filter((item) => !isOpen(item) && (tab === null || tabFor(tabs, item.repo) === tab));
  const days = daySections(done, now).map(({ key, label, open, items: each }) => ({
    key, heading: label, open,
    cards: each.map((item) => cardOf(item, { items, tab: tab ? null : tabFor(tabs, item.repo), back, all })),
  }));
  return { days };
}

export default ({ reads, query }) => historyView(reads, query);
