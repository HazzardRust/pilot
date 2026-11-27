/**
 * The deck's view (rune-deck-ui L2, L5): one object per region of a screen, computed from one
 * `readDeck()` by the derivations the HTML deck already uses, with every display string resolved
 * here so the Rune deck draws a new kind with no Rust change (spec 11). It reads no file but the
 * status line's usage state, in `usage.mjs`.
 */
import { landingFor, tabFor, tabsOf } from '../tabs.mjs';
import agents from './agents.mjs';
import archive from './archive.mjs';
import archiveDetail from './archive-detail.mjs';
import chat from './chat.mjs';
import graph from './graph.mjs';
import history from './history.mjs';
import notifications from './notifications.mjs';
import queue from './queue.mjs';
import reply from './reply.mjs';
import reports from './reports.mjs';
import status from './status.mjs';
import strip from './strip.mjs';
import tabs from './tabs.mjs';
import thread from './thread.mjs';
import tickets from './tickets.mjs';
import usage from './usage.mjs';

/** Every region by name, one module each (L5), so a region slice owns its own file. */
export const REGIONS = { agents, archive, archiveDetail, chat, graph, history, notifications, queue, reply, reports, status, strip, tabs, thread, tickets, usage };

export const SCREENS = new Set(['home', 'thread', 'items', 'archive']);

/** `query` is `{ screen, run, all, ticket, id }`, each as the URL gave it; null for the overview. */
export function viewOf(reads, query) {
  const { screen, run = null, all = false } = query;
  const theTabs = tabsOf(reads.runs, reads.items, reads.numbers, reads.agents, reads.added, reads.lanes);
  const tab = run === null ? landingFor(theTabs) : tabFor(theTabs, run);
  const scope = { reads, query, tabs: theTabs, tab, all };
  const regions = Object.fromEntries(Object.entries(REGIONS).map(([name, region]) => [name, region(scope)]));
  return { screen, seq: reads.seq, regions };
}
