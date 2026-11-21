/**
 * The header's usage readout as data (rune-deck-ui S16): the readings the page's header draws
 * (`renderUsage`, `deck/ui/render-rail.mjs`), filled with the figures its poll reads from
 * `/api/usage` (`readUsage`, `deck/usage.mjs`), the one path to a number (D16). `ctx` is the chosen
 * deck's and absent on the overview and for a deck with no reading, as the page hides it; a session
 * or weekly figure the deck could not get is absent too, and drawn as "unknown". `resets` is the
 * five-hour limit's reset as the page words it, absent once it is behind us.
 *
 * The one region that reads a file: the state file is the status line's, not the store's, so it is
 * in no `readDeck()`. It is read fresh per view, and the Rune deck reads the view again every 30 s.
 */
import { landingFor, tabFor, tabsOf } from '../tabs.mjs';
import { relative, resetGone } from '../ui/js/time.mjs';
import { readUsage } from '../usage.mjs';

/** `query` is `{ run }`, as the address gave it; null for the overview, or the one live tab. */
export function usageView(reads, query = {}) {
  const { run = null } = query;
  const tabs = tabsOf(reads.runs, reads.items, reads.numbers, reads.agents, reads.added, reads.lanes);
  const tab = run === null ? landingFor(tabs) : tabFor(tabs, run);
  const { ctx, session, weekly } = readUsage(tab?.repo ?? null);
  const at = Date.parse(session?.resetsAt);
  return {
    ...(ctx && { ctx: ctx.pct }),
    ...(session && { session: session.pct }),
    ...(weekly && { weekly: weekly.pct }),
    ...(!resetGone(at) && { resets: relative(Date.now() - at) }),
  };
}

export default ({ reads, query }) => usageView(reads, query);
