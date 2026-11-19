/**
 * The tab strip as data: Overview, then one entry per tab, counted and labelled as the HTML strip
 * (`renderStrip`, `deck/ui/render-strip.mjs`) counts and labels them. Nothing is derived here that
 * `tabsOf`, `shownOf` and `tabCode` do not already decide.
 */
import { queueOf, shownOf } from '../status.mjs';
import { hrefFor } from '../ui/render-cards.mjs';
import { tabCode } from '../ui/render-strip.mjs';

export default function tabsRegion({ reads, tabs, tab, all }) {
  const shown = (queue) => shownOf(queue, reads.items);
  const overview = {
    code: 'Overview',
    name: 'Overview',
    href: hrefFor(null, all),
    count: shown(queueOf(reads.items)).length,
    ended: false,
    unacknowledged: false,
    selected: tab === null,
  };
  const each = tabs.map((one) => ({
    code: tabCode(one),
    name: one.name,
    href: hrefFor(one, all),
    count: shown(one.open).length,
    ended: one.ended,
    unacknowledged: one.unacknowledged,
    selected: one === tab,
  }));
  return { tabs: [overview, ...each] };
}
