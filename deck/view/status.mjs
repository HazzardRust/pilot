/**
 * The Status panel as data (rune-deck-ui S12): the chosen held ticket's slice rows, as the HTML table
 * (`renderRunStatus`, `deck/ui/render-strip.mjs`) draws them, and the selector over the held lanes'
 * tickets (`renderStatusSelector`, `deck/ui/render-rail.mjs`). The choice is the address's `ticket` and
 * only picks among the held lanes, else the default (three-lanes L8): an id naming none is never echoed.
 */
import { yoursFor, yoursIndex } from '../status.mjs';
import { landingFor, tabFor, tabsOf } from '../tabs.mjs';
import { heldTicketsOf } from '../ui/render-rail.mjs';

const hasTable = (record) => Array.isArray(record?.slices) && record.slices.length > 0;

/** `query` is `{ run, ticket }`; the overview (no tab) has no table and no selector (A6). */
export function statusView(reads, query) {
  const { run = null, ticket: asked = null } = query;
  const tabs = tabsOf(reads.runs, reads.items, reads.numbers, reads.agents, reads.added, reads.lanes);
  const tab = run === null ? landingFor(tabs) : tabFor(tabs, run);
  if (!tab) return { tickets: [], rows: [] };
  const held = heldTicketsOf(tab, reads.items);
  const chosen = (held.find((lane) => lane.ticket.id === asked) ?? held[0])?.ticket;
  // A held ticket with no record has no rows; with no held lane, the newest run that posted a table.
  const slices = chosen
    ? ((tab.records ?? []).findLast((each) => each?.ticket === chosen.id && hasTable(each))?.slices ?? [])
    : (tab.runs.filter(hasTable).at(-1)?.slices ?? []);
  const yours = yoursIndex(reads.items.filter((item) => tab.open.includes(item)));
  const rows = slices.map((row) => {
    const item = yoursFor({ repo: tab.repo }, row, yours);
    return {
      slice: row.slice,
      state: row.state ?? '',
      ...(row.branch && { branch: row.branch }),
      ...(row.pr && { pr: row.pr }),
      ...(item && { href: `/thread/${encodeURIComponent(item.id)}` }),
      after: row.after == null ? [] : [].concat(row.after),
    };
  });
  const tickets =
    held.length < 2
      ? []
      : held.map(({ stage, ticket }) => ({ id: ticket.id, name: ticket.title, lane: stage, chosen: ticket.id === chosen.id }));
  return { tickets, rows };
}

export default ({ reads, query }) => statusView(reads, query);
