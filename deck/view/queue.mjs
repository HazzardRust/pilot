/** The queue region (S7, L2): the page's cards and state lines, every string from the page's renderers (spec 11). */
import { accentOf, coPilotStateOf, isOpen, lastSaidAt, livePhaseOf, threadState } from '../items.mjs';
import { pilotStateOf } from '../pilot-state.mjs';
import { queueOf, shownOf } from '../status.mjs';
import { landingFor, tabFor, tabsOf } from '../tabs.mjs';
import {
  BLOCKING_BADGE, PREVIEW_CHARS, PREVIEW_LINES, STATE_BUCKETS, hrefFor, renderKind,
} from '../ui/render-cards.mjs';
import { renderByline, renderCardClose } from '../ui/render-parts.mjs';
import { ENDED_NOTE } from '../ui/render-rail.mjs';
import { tabCode } from '../ui/render-strip.mjs';
import { confirmWords, optionsOf } from './reply.mjs';
import { ticketLineOf } from './thread.mjs';

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'", '#x27': "'" };
const unescape = (text) => text.replace(/&(amp|lt|gt|quot|#39|#x27);/g, (_, name) => ENTITIES[name]);

/** The words a renderer's HTML shows, tags dropped: the label the page's reader sees. */
const plain = (html) => unescape(html.replace(/<[^>]*>/g, '')).trim();

/** The `choice` options the card's `/reply` form offers: the reply box's own, each confirming one with its words. */
const cardOptions = (item) => optionsOf(item).map(({ label, confirm }) => (confirm ? { label, confirm, ...confirmWords(item, label) } : { label, confirm }));

/** The body as the card's preview cuts it (D6): six lines or 400 characters, kept as markdown (L8). */
function excerptOf(body) {
  const text = String(body ?? '').replace(/\s+$/, '');
  return [...text.split('\n').slice(0, PREVIEW_LINES).join('\n')].slice(0, PREVIEW_CHARS).join('');
}

/** `lanes` is `readDeck()`'s: the ticket line reads where the card's ticket stands from it, as the thread page's does. */
export function cardOf(item, { items, lanes, tab, back, all }) {
  const state = threadState(item);
  const ticket = ticketLineOf(item, items, lanes);
  return {
    id: item.id,
    title: String(item.title ?? ''),
    href: `/thread/${encodeURIComponent(item.id)}`,
    accent: accentOf(item, items),
    state,
    // Which of the page's state colours the bar reads in: `renderThreadState`'s bucket.
    tone: STATE_BUCKETS[state] ?? 'waiting',
    kind: plain(renderKind(item).replace(BLOCKING_BADGE, ' · blocking')),
    by: plain(renderByline(item.author)),
    at: lastSaidAt(item) ?? null,
    // Every card that belongs to a ticket names it, as the HTML card does (A2).
    ...(ticket ? { ticket } : {}),
    excerpt: excerptOf(item.body),
    ...(tab ? { tab: { code: tabCode(tab), href: hrefFor(tab, all) } } : {}),
    options: isOpen(item) ? cardOptions(item) : [],
    closable: renderCardClose(item, back) !== '',
  };
}

const PHASES = ['red', 'yellow', 'green'];
/** A tab's phase: its live ticket's state, else implementing while its co-pilot holds a ticket (three-lanes). */
const phaseRank = (tab, items) => {
  const held = coPilotStateOf(items, tab.repo, tab.coPilot, tab.switching) === 'held' ? 'yellow' : null;
  const rank = PHASES.indexOf(livePhaseOf(items, tab.repo) ?? held);
  return rank === -1 ? PHASES.length : rank;
};

/**
 * `reads` is `readDeck()`; `query` is `{ run, all }` as `viewOf` takes it. The cards are the scope's waiting
 * queue (settled cards are the history region's, S18); the state lines are `pilotStateOf`'s, one for a tab, and
 * on the overview one per tab, named and stably sorted planning, implementing, concluding, then the rest.
 */
export function queueView(reads, query = {}, now = Date.now()) {
  const { run = null, all = false, screen = 'home' } = query;
  // The queue is the home page's: the thread page and `/items` draw none of its cards or lines.
  if (screen !== 'home') return { cards: [], stateLines: [] };
  const { items } = reads;
  const tabs = tabsOf(reads.runs, items, reads.numbers, reads.agents, reads.added, reads.lanes);
  const tab = run === null ? landingFor(tabs) : tabFor(tabs, run);
  const back = hrefFor(tab, all);
  const cards = shownOf(tab ? tab.open : queueOf(items), items)
    .map((item) => cardOf(item, { items, lanes: reads.lanes, tab: tab ? null : tabFor(tabs, item.repo), back, all }));
  const line = (each, name) => {
    const { state, ticket, since } = pilotStateOf(each, items, reads.held, now);
    return { state, ...(name ? { name } : {}), ...(ticket ? { ticket } : {}), ...(since ? { since } : {}) };
  };
  const stateLines = tab
    ? [line(tab)]
    : tabs
        .map((each, i) => ({ each, i, rank: phaseRank(each, items) }))
        .sort((a, b) => a.rank - b.rank || a.i - b.i)
        .map(({ each }) => line(each, each.name));
  const ended = tab?.ended && (tab.runs.length || !tab.added) ? plain(ENDED_NOTE) : undefined;
  return { ...(ended ? { ended } : {}), cards, stateLines };
}

export default ({ reads, query }) => queueView(reads, query);
