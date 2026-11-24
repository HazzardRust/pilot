/**
 * The right strip as data (rune-deck-ui S17): the Open/All toggle, Create with the overview's choice of
 * numbered decks, Start or Resume and Close on an ended tab, Weekly alerts, each drawn exactly where
 * `renderEverything` (`deck/ui/render-strip.mjs`) draws it. The tab's repository is the one every press
 * posts; a refused Start's reason is said only where the page says it, beside a Start.
 */
import path from 'node:path';

import { isWindows } from '../../hooks/lib/platform.js';
import { sameRepo } from '../items.mjs';
import { queueOf } from '../status.mjs';
import { landingFor, tabFor, tabsOf } from '../tabs.mjs';
import { tabCode } from '../ui/render-strip.mjs';

/** `query` is `{ screen, run, all, sessionRefused }`; no tab is the overview, where Create asks which deck. */
export function stripView(reads, query = {}) {
  const { run = null, all = false, sessionRefused = null, screen = 'home' } = query;
  const tabs = tabsOf(reads.runs, reads.items, reads.numbers, reads.agents, reads.added, reads.lanes);
  const tab = run === null ? landingFor(tabs) : tabFor(tabs, run);
  // `readAlertSwitch` always answers a boolean; anything else reads as the page's button does, off.
  const weekly = reads.alerts?.weekly === true;
  // The way to `/items`, counting the open queue as the overview tab's link does (`renderStrip`);
  // `here` on the items page itself, where it is the way back.
  const items = { count: queueOf(reads.items).length, here: screen === 'items' };
  // The way to the archive screen (archive-page spec 1), beside Items; `here` on it, where it leads back.
  const archive = { here: screen === 'archive' };
  const view = { all: all === true, items, archive, create: {}, close: Boolean(tab?.ended), alerts: { weekly } };
  if (!tab) {
    // Named as their tabs are (`renderCreate`'s options), or `D<n> <dir>` for a deck with no tab.
    view.create.repos = Object.entries(reads.numbers ?? {}).map(([repo, number]) => {
      const known = tabs.find((each) => sameRepo(each.repo, repo));
      return { repo, label: known ? (known.number ? `${tabCode(known)} ${known.name}` : known.name) : `D${number} ${path.basename(repo)}` };
    });
    return view;
  }
  view.tab = { repo: tab.repo, code: tabCode(tab) };
  if (tab.ended && isWindows()) {
    view.start = tab.holding ? 'resume' : 'start';
    if (typeof sessionRefused === 'string' && sessionRefused) view.sessionRefused = sessionRefused;
  }
  return view;
}

export default ({ reads, query }) => stripView(reads, query);
