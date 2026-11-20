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

/**
 * `query` is `{ run, ticket }`. The overview (no run named and no landing tab, or an empty run) draws no single table and no selector
 * (A6), but one `{ tab, tickets, rows }` group per tab that has anything to show, in the strip's order, each its
 * default lane's rows, as `renderStrips` draws its sections (S22). A run naming no tab has nothing.
 */
export function statusView(reads, query = {}) {
  const { run = null, ticket: asked = null } = query;
  const tabs = tabsOf(reads.runs, reads.items, reads.numbers, reads.agents, reads.added, reads.lanes);
  const tab = run === null ? landingFor(tabs) : tabFor(tabs, run);
  if (tab) return tableOf(tab, reads.items, asked);
  // An empty `run` is the page's `/?run=`, the overview; only a run naming no tab has nothing.
  if (run !== null && run !== '') return { tickets: [], rows: [] };
  // A tab with a held ticket but no record still has a section on the page ("no slice table yet").
  const groups = tabs
    .map((each) => ({ each, table: tableOf(each, reads.items, null) }))
    .filter(({ each, table }) => table.rows.length > 0 || heldTicketsOf(each, reads.items).length > 0)
    .map(({ each, table }) => ({ tab: each.name, ...table, tickets: [] }));
  return { tickets: [], rows: [], groups };
}

/** A stamp as the hour and minute on this machine's clock, `09:05`; '' for one that is no date. */
function clock(stamp) {
  const at = new Date(stamp ?? '');
  if (Number.isNaN(at.getTime())) return '';
  return [at.getHours(), at.getMinutes()].map((n) => String(n).padStart(2, '0')).join(':');
}

/** One tab's table: the chosen held lane's record (`asked` only picks among them), and its selector. */
function tableOf(tab, items, asked) {
  const held = heldTicketsOf(tab, items);
  const chosen = (held.find((lane) => lane.ticket.id === asked) ?? held[0])?.ticket;
  // A held ticket with no record has no rows; with no held lane, the newest run that posted a table.
  const record = chosen && (tab.records ?? []).findLast((each) => each?.ticket === chosen.id && hasTable(each));
  const run = chosen ? null : tab.runs.filter(hasTable).at(-1);
  const slices = (record || run)?.slices ?? [];
  const yours = yoursIndex(items.filter((item) => tab.open.includes(item)));
  const rows = slices.map((row) => {
    const item = yoursFor({ repo: tab.repo }, row, yours);
    return {
      slice: row.slice,
      state: row.state ?? '',
      ...(row.branch && { branch: row.branch }),
      ...(row.pr && { pr: row.pr }),
      // The page's Yours cell: the thread's title, its kind on hover (`renderYours`).
      ...(item && { href: `/thread/${encodeURIComponent(item.id)}`, yours: item.title, kind: item.kind }),
      after: row.after == null ? [] : [].concat(row.after),
    };
  });
  const tickets =
    held.length < 2
      ? []
      : held.map(({ stage, ticket }) => ({ id: ticket.id, name: ticket.title, lane: stage, chosen: ticket.id === chosen.id }));
  if (rows.length === 0) return { tickets, rows };
  // The heading `renderStrips` gives the table and its graph: the record's own feature, else the tab's name,
  // and when the newest run started (QA F1).
  const heading = record?.feature || tab.name;
  const started = clock(record ? (tab.runs.at(-1)?.startedAt ?? record.updatedAt) : run.startedAt);
  return { tickets, rows, heading, started };
}

export default ({ reads, query }) => statusView(reads, query);
