/** The queue region (S7, L2): the page's cards and state lines, every string from the page's renderers (spec 11). */
import { accentOf, coPilotStateOf, isOpen, lastSaidAt, livePhaseOf, threadState } from '../items.mjs';
import { pilotStateOf } from '../pilot-state.mjs';
import { queueOf, shownOf } from '../status.mjs';
import { landingFor, tabFor, tabsOf } from '../tabs.mjs';
import {
  BLOCKING_BADGE, PREVIEW_CHARS, PREVIEW_LINES, STATE_BUCKETS, hrefFor, renderCardAnswers, renderKind,
} from '../ui/render-cards.mjs';
import { renderByline, renderCardClose } from '../ui/render-parts.mjs';
import { ENDED_NOTE } from '../ui/render-rail.mjs';
import { tabCode } from '../ui/render-strip.mjs';

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'", '#x27': "'" };
const unescape = (text) => text.replace(/&(amp|lt|gt|quot|#39|#x27);/g, (_, name) => ENTITIES[name]);

/** The words a renderer's HTML shows, tags dropped: the label the page's reader sees. */
const plain = (html) => unescape(html.replace(/<[^>]*>/g, '')).trim();

/** The confirm step a trigger's row shows in place (`confirm.mjs`): the next `.step.sure`'s sentence and button. */
const SURE = /<div class="step sure" hidden><p>([\s\S]*?)<\/p><button\b[^>]*>([\s\S]*?)<\/button>/;

/** The `choice` values the card's `/reply` form posts, read off the page's own form, each once; no other form's. */
function optionsOf(item, back) {
  const form = renderCardAnswers(item, back);
  if (!form.startsWith('<form method="post" action="/reply">')) return [];
  const options = new Map();
  for (const { 1: attrs, index } of form.matchAll(/<button\b([^>]*)>/g)) {
    const value = attrs.match(/\bname="choice" value="([^"]*)"/)?.[1];
    if (value === undefined) continue;
    const label = unescape(value);
    if (options.get(label)?.confirm) continue;
    const sure = /\bdata-confirm\b/.test(attrs) && form.slice(index).match(SURE);
    options.set(label, sure ? { label, confirm: true, ask: plain(sure[1]), yes: plain(sure[2]) } : { label, confirm: false });
  }
  return [...options.values()];
}

/** The body as the card's preview cuts it (D6): six lines or 400 characters, kept as markdown (L8). */
function excerptOf(body) {
  const text = String(body ?? '').replace(/\s+$/, '');
  return [...text.split('\n').slice(0, PREVIEW_LINES).join('\n')].slice(0, PREVIEW_CHARS).join('');
}

function cardOf(item, { items, tab, back, all }) {
  const state = threadState(item);
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
    excerpt: excerptOf(item.body),
    ...(tab ? { tab: { code: tabCode(tab), href: hrefFor(tab, all) } } : {}),
    options: isOpen(item) ? optionsOf(item, back) : [],
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
  const { run = null, all = false } = query;
  const { items } = reads;
  const tabs = tabsOf(reads.runs, items, reads.numbers, reads.agents, reads.added, reads.lanes);
  const tab = run === null ? landingFor(tabs) : tabFor(tabs, run);
  const back = hrefFor(tab, all);
  const cards = shownOf(tab ? tab.open : queueOf(items), items)
    .map((item) => cardOf(item, { items, tab: tab ? null : tabFor(tabs, item.repo), back, all }));
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
