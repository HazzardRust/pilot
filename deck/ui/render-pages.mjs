/**
 * The day sections, the queue, and the home, deck and thread pages with refusal capping (audit-f1-f7 S18, L9).
 * Moved whole from `deck/ui/render.mjs`, which is now the facade over its siblings.
 *
 * Nothing reaches the page except through `escapeHtml` or `renderMarkdown`, and a URL the pilot posted
 * becomes an `href` only when it is `http` or `https` (the rules `render-parts.mjs` states for the deck).
 */

import { accentOf, authorKind, isOpen, lastSaidAt, newestSaidFirst, ownerOf } from '../items.mjs';
import { queueOf, shownOf } from '../status.mjs';
import { landingFor, tabFor, tabsOf } from '../tabs.mjs';
import { pilotStateOf } from '../pilot-state.mjs';
import { escapeHtml, renderMarkdown } from './markdown.mjs';
import {
  renderTemplate,
  renderTime,
  renderByline,
  renderMessages,
  code,
  withTitles,
  titleOf,
  renderTicketStanding,
  rendererFor,
  renderReopenForm,
} from './render-parts.mjs';
import {
  renderReplySlot,
  renderResolution,
  OVERVIEW_HREF,
  hrefFor,
  renderThreadState,
  renderKind,
  renderChainNote,
  renderTypeNote,
  renderCard,
  renderRuns,
} from './render-cards.mjs';
import { renderLink, tabCode, renderStrip, renderEverything, renderToggle } from './render-strip.mjs';
import { renderStrips, renderUsage, ENDED_NOTE } from './render-rail.mjs';

// --- the settled threads, a day at a time (spec 35) ------------------------

/**
 * How far back the queue is put away one day at a time. A settled thread older
 * than this is gathered into its month instead — the user, asking for spec 35:
 * "i see it getting pretty lengthy". One constant, because "how old is old" is
 * one question and a second copy of the number is a second answer to it.
 */
export const RECENT_DAYS = 14;

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const pad2 = (n) => String(n).padStart(2, '0');

/**
 * Which local calendar day a moment falls on, and which month. Built from the
 * parts rather than sliced off an ISO string, because an ISO stamp is UTC and
 * the day the user means is the day their own clock was showing.
 */
const dayKey = (at) => `${at.getFullYear()}-${pad2(at.getMonth() + 1)}-${pad2(at.getDate())}`;
const monthKey = (at) => `${at.getFullYear()}-${pad2(at.getMonth() + 1)}`;
const localMidnight = (at) => new Date(at.getFullYear(), at.getMonth(), at.getDate()).getTime();
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * A card with no stamp the deck can read. It is a section of its own rather
 * than being dropped: a card that fell off the page because its date was
 * malformed is an item the user can no longer reach, and no argument about a
 * date is worth losing one for.
 */
const UNDATED = { key: 'undated', label: 'Undated', calendar: false };

function sectionFor(when, today) {
  const at = new Date(when ?? '');
  if (Number.isNaN(at.getTime())) return UNDATED;
  // Whole calendar days apart, rounded, so the hour daylight saving adds to or
  // takes off a day never moves a stamp onto the day next door.
  const age = Math.round((localMidnight(today) - localMidnight(at)) / DAY_MS);
  if (age > RECENT_DAYS) {
    return { key: monthKey(at), label: `${MONTHS[at.getMonth()]} ${at.getFullYear()}`, calendar: false };
  }
  return {
    key: dayKey(at),
    label: `${WEEKDAYS[at.getDay()]} ${at.getDate()} ${MONTHS[at.getMonth()]}`,
    calendar: true,
  };
}

/**
 * Newest section first. Day keys and month keys sort against each other as
 * plain strings and come out right: a month's key is the prefix of every day
 * inside it, so `2026-09` sorts below `2026-09-16` — which is where it belongs,
 * since a month section only ever holds days older than the day sections do.
 * `undated` is forced last, because a stamp we could not read is not a date and
 * would otherwise sort above every year the deck will ever see.
 */
const newestFirst = (a, b) => {
  if (a.key === UNDATED.key) return 1;
  if (b.key === UNDATED.key) return -1;
  if (a.key === b.key) return 0;
  return a.key < b.key ? 1 : -1;
};

/**
 * The settled cards, gathered into the sections they are drawn behind: one per
 * local calendar day for the recent ones, one per month for anything older,
 * newest first, with today's the only one served open.
 *
 * `label` is the absolute form and `calendar` says whether the browser may read
 * it as Today or Yesterday. Nothing relative is decided here, for the reason
 * `renderTime` gives (D11): the page is not re-rendered on a timer, so a
 * relative reading written on the server is right the once and wrong from then
 * on — a page left open across midnight would head yesterday's section `Today`.
 *
 * The clock is an argument so the boundaries can be pinned by a test.
 *
 * Both are read off the newest message and not the posting (L13): a thread
 * replied to today is filed under today, and within a section the one heard
 * from last is first.
 */
export function daySections(items, now = Date.now()) {
  const today = new Date(now);
  const todayKey = dayKey(today);
  const sections = new Map();
  for (const item of items) {
    const where = sectionFor(lastSaidAt(item), today);
    const section = sections.get(where.key) ?? { ...where, open: where.key === todayKey, items: [] };
    section.items.push(item);
    sections.set(where.key, section);
  }
  for (const section of sections.values()) section.items.sort(newestSaidFirst);
  return [...sections.values()].sort(newestFirst);
}

/**
 * One section's heading. A day carries its date in a `<time>` marked for
 * `time.mjs`, which writes `Today` or `Yesterday` over it on this browser's own
 * clock; the words the server chose ride along on the element, so the reading is
 * computed from them every minute and never from itself — a heading rewritten to
 * `Yesterday` and then left alone would still say `Yesterday` the day after. A
 * month has no relative reading to make, so it is marked as nothing and is
 * plain text.
 *
 * The count is text in a span of its own and not generated content, so it can be
 * read out, selected and asserted. Its own class, because the strip's per-tab
 * counts are already `count` and a fourth number in that class would read as the
 * toggle having changed a tab's queue.
 */
function renderDayHeading(section) {
  const label = escapeHtml(section.label);
  const named = section.calendar
    ? `<time datetime="${escapeHtml(section.key)}" data-calendar="${label}">${label}</time>`
    : label;
  return `<summary>${named}<span class="tally">${section.items.length}</span></summary>`;
}

/**
 * The queue: what is waiting on the user, then what this scope has settled.
 *
 * Only the settled half is grouped (spec 35, the user's option 1). What is
 * waiting stays flat at the top whether Everything is on or off, because a
 * question from three days ago that is still waiting is the next thing to do,
 * and folding it away by its age is the opposite of what the toggle is for.
 *
 * `data-day` is the fold key, its own attribute beside `data-section`
 * because a day is served open for today and shut for the rest — a polarity
 * the section's list cannot hold.
 *
 * `now` is which day the server is standing on, and it is an argument all the
 * way up rather than read here, so a test can pin it. Nothing *relative* is
 * written from it — `renderTime`'s rule holds and the headings stay absolute
 * (D11) — but which day a card belongs to and which section arrives open are
 * decided on the server's clock, and a page that read it from the wall would be
 * asserted against a different calendar on every day the suite ran.
 */
function renderQueue(waiting, done, cardOf, now) {
  if (!waiting.length && !done.length) return '<p class="empty">Nothing is waiting on you.</p>';
  const sections = daySections(done, now).map(
    (section) =>
      `<details class="day" data-day="${escapeHtml(section.key)}"${section.open ? ' open' : ''}>` +
      renderDayHeading(section) +
      section.items.map(cardOf).join('') +
      '</details>',
  );
  return waiting.map(cardOf).join('') + sections.join('');
}

/**
 * The state line (pilot-state-line spec 1, 8; L7): the pilot's state, the live ticket or `no live ticket`, and
 * the state's time as an absolute `<time>` the page's `time.mjs` shows relative. `name`, when given,
 * prefixes the line with a tab's name. Every word reaches the page through `escapeHtml`.
 */
export function renderStateLine(line, name) {
  const parts = [
    ...(name ? [escapeHtml(name)] : []),
    escapeHtml(line.state),
    line.ticket ? escapeHtml(line.ticket) : 'no live ticket',
    ...(line.since ? [renderTime(line.since)] : []),
  ];
  return `<p class="pilot-state" data-pilot-state="${escapeHtml(line.state)}">${parts.join(' · ')}</p>`;
}

/**
 * The home screen, which is one of two pages: a run's, or the overview.
 *
 * A run's page is the queue in the main column and that run's bookmarks at the
 * edges (D9 of deck-tree). L4 fuses the table and the queue — the `Yours` column *is* the
 * queue — and L14 decides what the queue holds: the open items, with every item
 * the deck has ever held kept for ever and one click away at `/items`.
 *
 * The overview is the same column and nothing else: every open thread on the
 * deck, oldest first, each card naming the run it came from and linking to that
 * run's tab, and no table, no tree and no bookmark (D6 of run-tabs). The strip above it,
 * names and counts, is the overview of runs; the labelled queue is the overview
 * of threads.
 *
 * Which page this is is the whole of spec 1. `selected` is the `run` the URL
 * named, `null` when it named none. When it resolves to a tab the page is that
 * tab and nothing else. When it resolves to nothing, and when the URL named
 * none and `landingFor` finds no sole live run, the page is the overview
 * (D2 and D11 of run-tabs).
 *
 * `numbers` is `listDeckNumbers()`, read once by the route that serves this
 * page and handed in, because this file opens nothing but its own templates.
 * It is the strip that draws them (spec 10), and the strip is this page's; the
 * thread page is handed the same map for the deck its nav names between the
 * arrows (spec 15), and `/items`, which names no one deck, is handed none.
 *
 * `all` is the second half of that address: the same scope, with what it has
 * already settled listed after what is waiting on it. The user asked for it as
 * a toggle over the tabs they already had rather than as a page of its own —
 * "instead of showing a new log of all past and present threads, it instead
 * shows the same categorical logs … just it will include all of the previous
 * threads". Waiting first, in both cases, because the queue is what the page is
 * for and a settled thread is there to be looked up, not to be worked through.
 *
 * `now` is which day the server is standing on, which is what decides the day a
 * settled card is filed under and which section arrives open (spec 35). It is an
 * argument rather than a reading taken here so that a test can pin a calendar;
 * every caller but a test leaves it as the clock.
 *
 * `held` is the held-wait map, `{ [repoKey]: since }`, that a repo tab's state line reads beside the items
 * and the tab (pilot-state-line L1): the line is derived here at every render and stored nowhere.
 * A repo tab draws its own line unnamed; the overview draws one per tab, named, in strip order (spec 11).
 *
 * `ticket` is the `?ticket=` the browser sent, whose record the Status tab draws (three-lanes L8); `renderStrips` uses it
 * only when it names a held lane's ticket and never draws it.
 */
export function renderHomePage(
  items,
  runs = [],
  selected = null,
  all = false,
  numbers = {},
  agents = {},
  now = Date.now(),
  added = [],
  refused = null,
  wrapped = {},
  sessionRefused = null,
  alerts = { weekly: true },
  lanes = { coPilots: {}, switches: {} },
  held = {},
  ticket = null,
) {
  const tabs = tabsOf(runs, items, numbers, agents, added, wrapped, lanes);
  const tab = selected === null ? landingFor(tabs) : tabFor(tabs, selected);
  const shown = (queue) => shownOf(queue, items);
  const queue = shown(queueOf(items));
  const waiting = tab ? shown(tab.open) : queue;
  // What this scope has settled, which is only asked for when the toggle is on:
  // the page ships nothing it is not showing (spec 2). Membership is `tabFor`'s
  // answer and not a comparison of our own, so a settled thread lands under the
  // same tab its open siblings do, separators, case and all. The overview's
  // scope is the deck, so there every settled thread belongs to it.
  const inScope = (item) => tab === null || tabFor(tabs, item.repo) === tab;
  const done = all ? items.filter((item) => !isOpen(item) && inScope(item)) : [];
  // Where a quick answer comes back to: this page. It is the selected tab's own
  // address, or the overview's, and so it is built from what the deck holds
  // rather than echoed from `selected`, which is the browser's (D2 of run-tabs, and D7).
  const back = hrefFor(tab, all);
  const cardOf = (item) =>
    renderCard(item, { tab: tab ? null : tabFor(tabs, item.repo), back, all, items });
  return renderTemplate('home.html', {
    HOME: OVERVIEW_HREF,
    USAGE: renderUsage(tab),
    TABS: renderStrip(tabs, tab, queue, all, refused, shown),
    STRIPS: renderStrips(tab, tabs, items, { ticket }),
    EVERYTHING: renderEverything(tab, all, tabs, numbers, sessionRefused, alerts),
    QUEUE:
      (tab?.ended && (tab.runs.length || !tab.added) ? ENDED_NOTE : '') +
      renderQueue(waiting, done, cardOf, now) +
      (tab
        ? renderStateLine(pilotStateOf(tab, items, held, now))
        : tabs.map((each) => renderStateLine(pilotStateOf(each, items, held, now), each.name)).join('')),
  });
}

/**
 * Every item the deck has ever held — the history behind the home screen, which
 * is what `/items` serves: the open queue in `queueOf`'s order, then the rest
 * newest message first (L13). Server-rendered like every other page here: no
 * build step, no client framework (A3).
 *
 * This page names no run, so its panels are the landing tab's — the same answer
 * the home page gives a bare URL (D11 of run-tabs): the sole live run's, or none.
 */
export function renderDeckPage(items, runs = [], agents = {}, lanes = { coPilots: {}, switches: {} }) {
  const theTabs = tabsOf(runs, items, {}, agents, [], {}, lanes);
  // One answer to "which deck is this page", read by the panels and by the
  // readout: whichever tab this page resolved. Asking it twice is how the two
  // would come to say different things.
  const tab = landingFor(theTabs);
  const queue = queueOf(items);
  const ordered = [...queue, ...items.filter((item) => !queue.includes(item)).sort(newestSaidFirst)];
  const body = items.length
    ? ordered.map((item) => renderCard(item, { back: '/items', items })).join('')
    : '<p class="empty">Nothing is waiting on you.</p>';
  return renderTemplate('index.html', {
    HOME: OVERVIEW_HREF,
    USAGE: renderUsage(tab),
    ITEMS: renderRuns(runs) + body,
    STRIPS: renderStrips(tab, theTabs, items),
  });
}

/**
 * One arrow of the header's centre: a link to the thread one step along the
 * queue, or, at either end, a glyph that goes nowhere and says so. No wrap: the
 * last thread's › is the end of the queue, not its start again (L20).
 */
const threadHrefFor = (item, all = false) => `/thread/${encodeURIComponent(item.id)}${all ? '?all=1' : ''}`;

function renderStep(step, glyph, label, all) {
  if (!step) return `<span aria-disabled="true">${escapeHtml(glyph)}</span>`;
  return (
    `<a href="${escapeHtml(threadHrefFor(step, all))}" title="${escapeHtml(label)}" ` +
    `aria-label="${escapeHtml(label)}">${escapeHtml(glyph)}</a>`
  );
}

/**
 * The header's centre on a thread: `‹ D3 ›` (spec 15). The arrows walk every
 * deck's open threads in the overview's own order — `queueOf`, which is what
 * the overview lists and which never holds a chat (L6) — so the code between them is this thread's deck and changes as the walk crosses from one run to
 * the next (L20). The code is the tab's own link, spelled by `tabCode` and
 * addressed by `hrefFor`, so the centre and the strip cannot disagree; a thread
 * with no tab shows the arrows and no code.
 *
 * A thread that is not in the queue — settled, or a chat — has no place in it:
 * › is the queue's first, and ‹ goes nowhere for a chat (see `all` below for
 * a settled thread). The `<nav>` is a live region, so
 * a thread posted or settled while this page is open moves the arrows through
 * the generic swap, with no script of its own.
 *
 * "there is whitespace on the right side of the header section at the top of
 * the thread, put an X/N there, so as you move it goes 1/3, 2/3, 3/3." The
 * grid below reserves a column there already, to mirror the kind line's on
 * the left and keep the arrows on the header's true centre (spec 15) — empty
 * until now. `queue.length` is `N` and `at + 1` is `X`, from the very list the
 * arrows above already walk, so what each renders agrees at the moment this
 * runs; a thread with no place in that list (settled, a chat) draws no
 * position either, the same reasoning as both arrows drawing disabled rather
 * than a wrong number. `.position` is its own live region, a sibling of
 * `<nav>` rather than inside it (`deck/test/thread-nav.test.mjs`), so a swap
 * that skips one because the reader's focus is on the other (`live.mjs`'s
 * `busy`) can show them a step apart on screen until the next swap catches
 * up — a render-time guarantee, not an on-screen one.
 *
 * `all` is the toggle, carried in the thread's address as in the tab's: under
 * it the walk is the overview's whole list — the queue, then what is settled
 * in its day sections — so a settled thread has its place and its X/N. The
 * queue is that list's head, so a settled thread under Open steps back to the
 * queue's last and on to its first: either arrow lands on an open thread.
 */
function renderThreadNav(item, items, tab, all = false) {
  const open = shownOf(queueOf(items), items);
  const full = [...open, ...daySections(items.filter((each) => !isOpen(each))).flatMap((day) => day.items)];
  const list = all ? full : open;
  const same = (each) => each.id === item.id;
  const at = list.findIndex(same);
  const prev = at !== -1 ? list[at - 1] : full.some(same) ? list.at(-1) : undefined;
  const next = at !== -1 ? list[at + 1] : list[0];
  const code = tab ? renderLink(hrefFor(tab, all), tabCode(tab)) : '';
  const position = at === -1 ? '' : `<span class="position" data-live="position">${at + 1}/${list.length}</span>`;
  const which = all ? 'thread' : 'open thread';
  return (
    '<nav class="threads" data-live="nav">' +
    renderStep(prev, '‹', `Previous ${which}`, all) +
    code +
    renderStep(next, '›', `Next ${which}`, all) +
    '</nav>' +
    position
  );
}

/**
 * One item, its argument so far, and the box the next message is typed into —
 * with the panels, because this is the page a `Yours` link lands on and the
 * user asked at Gate 2 to take the tree and the table with them when it does.
 *
 * Whose panels is not a question this page has to ask the URL: a thread belongs
 * to a repository, and a repository is a tab (D3 of run-tabs), so the run on
 * screen here is the run the thread came from. A thread whose repository no run
 * has registered belongs to no tab and shows no panels, which is the same
 * answer `tabFor` gives everywhere else.
 *
 * `numbers` is `listDeckNumbers()`, handed in by the route exactly as the home
 * page's is: this page draws no strip, but spec 15 puts the deck's code at the
 * header's centre, and a tab resolved without them is a deck without one.
 *
 * `refused` is a refused press's reason (`landRefusedPress`), drawn above the reply slot.
 */
export function renderThreadPage(item, items = [], runs = [], agents = {}, numbers = {}, all = false, added = [], refused = null, lanes = { coPilots: {}, switches: {} }, archived = false) {
  const theTabs = tabsOf(runs, items, numbers, agents, added, {}, lanes);
  // The same one answer the panels are drawn from, and the reason L32 puts the
  // deck token on the readout rather than reading it off the address: a thread
  // page has no `?run=` and is still a page of exactly one deck.
  const tab = tabFor(theTabs, item.repo);
  const { detail: renderDetail, detailFirst: qaFirst } = rendererFor(item.kind);
  const detail = renderDetail(item, items);
  // Only QA's walkthrough leads with its steps; a wizard's keeps its body first (spec 9, L3).
  const detailFirst = qaFirst && authorKind(item.author) === 'qa';
  return renderTemplate('thread.html', {
    HOME: OVERVIEW_HREF,
    // The arrow names the deck that owns the thread, the resolved tab and never the raw repo (ADR 0118, L1-L2).
    BACK: escapeHtml(hrefFor(tab, all)),
    USAGE: renderUsage(tab),
    STRIPS: renderStrips(tab, theTabs, items),
    // Plain for the tab's `<title>`; the heading's own slot may set a ticket off (deck-title-prose L4).
    TITLE: escapeHtml(item.title),
    HEADING: titleOf(item, items),
    ID: escapeHtml(item.id),
    // The header's line of provenance — what this item is and when it arrived,
    // now led by the same coloured state a card draws (`renderThreadState`),
    // so it reads inside the thread and not only on the way in. Whose deck it
    // came from is the centre's to say now (spec 15), as the code between the
    // arrows, so the line no longer says "on" anything. Then whose thread it is
    // (ADR 0041), on a line of its own and drawn as a message's byline, in its
    // kind's colour with no label (the user's words at Gate 2, itm_8dc56c0d58cd).
    // A fallback to the pilot (spec 5) is that name changing, with no note.
    // Led by the ticket's accent mark and closed by its ticket line (ticket-state-accents spec 3, 8), both
    // inside the `kind` region (L5) so the region swap recolours them.
    KIND: `<span class="accent" data-accent="${accentOf(item, items)}"></span>` +
      `${renderThreadState(item)}${archived ? ' · archived' : ''} · ${renderKind(item)} · ${renderTime(lastSaidAt(item))}${renderTicketStanding(item, items, lanes)}` +
      `<span class="owner">${renderByline(ownerOf(item))}</span>`,
    NAV: renderThreadNav(item, items, tab, all),
    EVERYTHING: `<aside class="strip right">${renderToggle(threadHrefFor(item, !all), all)}</aside>`,
    THREAD: [
      // The thread page is where the body is read whole. The card's excerpt of
      // it renders the same way now (`renderPreview`), so the two agree and D8
      // is the one path a body reaches a page by. The type note sits above it, as on the card.
      renderTypeNote(item),
      // A QA walkthrough's detail leads, so the table its body carries sits under the steps.
      detailFirst ? detail : '',
      `<div class="body md">${renderByline(item.author)}${renderMarkdown(item.body)}</div>`,
      renderChainNote(item),
      detailFirst ? '' : detail,
      renderMessages(item),
      renderResolution(item),
    ].join(''),
    REFUSED: renderRefusal(refused, items),
    // An archived thread is read-only (store-durability spec 8): it says so, and offers no press to refuse.
    REPLY: archived ? '' : isOpen(item) ? renderReplySlot(item) : renderReopenForm(item),
  });
}

/** The most of a refusal's reason the deck carries in a URL or draws (L3). */
const REFUSAL_CAP = 300;

/** Cut by code point, so a cap never splits a surrogate pair `encodeURIComponent` would throw on. */
export const capRefusal = (reason) => [...String(reason)].slice(0, REFUSAL_CAP).join('');

/**
 * A refused press's reason above the reply box (deck-press-feedback spec 1, L3). `?refused=`
 * is caller-supplied, so the line is capped, escaped, and always says it is the deck's refusal; an id
 * in it reads as its title (deck-title-prose spec 2).
 */
function renderRefusal(reason, items) {
  if (!reason) return '';
  // Capped before the swap (L6): the cap measures what the store said, not the titles drawn for it.
  return `<p class="refused" role="alert">The deck refused that press: ${withTitles(capRefusal(reason), items)}</p>`;
}

