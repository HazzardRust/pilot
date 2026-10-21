/**
 * The ticket rows and queue, reports, agents, notices, chat and the usage readout (audit-f1-f7 S17, L9).
 * Moved whole from `deck/ui/render.mjs`, which is now the facade over its siblings.
 */

import {
  KIND_CHAT,
  KIND_GATE2,
  KIND_REPORT,
  KIND_USER,
  isBlocking,
  isLanding,
  isOpen,
  isPaused,
  isShortPath,
  newestSaidFirst,
  noticesOf,
  isQueued,
  isStanding,
  laneOfState,
  stateOf,
  pilotWrites,
  coPilotStateOf,
  nextTicketOf,
  openQuestionsOf,
  repoKey,
  sameRepo,
  ticketQueueOf,
} from '../items.mjs';
import { laneOf, runnableYellowOf } from '../lanes.mjs';
import { yoursIndex } from '../status.mjs';
import { tabFor } from '../tabs.mjs';
import { escapeHtml, renderMarkdown } from './markdown.mjs';
import { renderTemplate, renderTime, renderMessages, setOff, withTitles, titleOf } from './render-parts.mjs';
import { BLOCKING_BADGE, hrefFor } from './render-cards.mjs';
import { renderRunStatus, renderRunGraph } from './render-strip.mjs';

/** A run draws a panel when it has posted a table, and otherwise nothing (D7 of run-tabs). */
const hasTable = (run) => Array.isArray(run.slices) && run.slices.length > 0;

/**
 * One tab's rows, put away behind its name — how the overview holds several at
 * once. The name is on the element as well as in it: served shut every time, a
 * section the user opened would be shut again by the next region swap, and
 * `live.mjs` puts it back by this key. Its own attribute, beside `data-day`.
 */
const inSection = (name, rows) =>
  `<details class="run-section" data-section="${escapeHtml(name)}">` +
  `<summary>${escapeHtml(name)}</summary>${rows}</details>`;

/** A standing item's title as the way into its thread (L6). */
const renderStandingLink = (item) =>
  `<a href="/thread/${encodeURIComponent(item.id)}">${escapeHtml(item.title)}</a>`;

/** One arrow of a ticket's move form (ticket-making spec 7): a submit carrying its direction, drawn disabled mid-switch (ticket-state-accents spec 14). */
const renderMoveButton = (direction, glyph, locked) =>
  `<button type="submit" name="direction" value="${direction}" title="Move ${direction}" aria-label="Move ${direction}"${locked ? ' disabled' : ''}>${glyph}</button>`;

/**
 * A ticket's up and down arrows: no up on the head, no down on the tail, and no form at
 * all for a queue of one. A plain post, so a page with no script still moves it. Carries
 * a hidden `back`, the same as the deck's other forms (`renderAuto`), so `/move`
 * redirects to the tab the arrow was pressed on without trusting the Referer header (N4).
 */
function renderMoveForm(item, index, count, back, locked) {
  const buttons = (index > 0 ? renderMoveButton('up', '&uarr;', locked) : '') + (index < count - 1 ? renderMoveButton('down', '&darr;', locked) : '');
  if (!buttons) return '';
  return (
    `<form class="move" method="post" action="/move"><input type="hidden" name="id" value="${escapeHtml(item.id)}" />` +
    `<input type="hidden" name="back" value="${escapeHtml(back)}" />${buttons}</form>`
  );
}

/** What the page calls each ticket state (ticket-states L8): the phase names, so the badge takes the phase's colour. */
const STATE_LABEL = { red: 'planning', yellow: 'implementing', green: 'concluding' };
/** What a ticket that is not live says in its state's colour (QA D2): where it stands, not what is happening now. */
const PARKED_LABEL = { ...STATE_LABEL, yellow: 'planned', green: 'awaiting sign-off' };

/** A ticket's label: a parked green ticket awaits sign-off only while an open gate2 names it; turned green by `need`, it needs you. */
function ticketLabelOf(item, state, items) {
  // A signed ticket holds no lane, whatever its stored `live` (gate2-frees-lane spec 1, L1).
  if (isLanding(item, items)) return 'landing';
  if (item.live === true) return STATE_LABEL[state];
  if (isPaused(item)) return 'paused';
  if (state === 'green' && !items.some((other) => other.kind === KIND_GATE2 && other.ticket === item.id && isOpen(other))) return 'needs you';
  return PARKED_LABEL[state];
}

/**
 * A planned ticket's slice count, never minutes (ticket-states spec 7 as amended at Gate 2),
 * and its artefact, linked to the gate1 that carries it.
 */
function renderPlan({ plan }) {
  return (
    renderSlices(plan.sliceCount) +
    `<a class="artefact" href="/thread/${encodeURIComponent(plan.gate1)}">${escapeHtml(plan.artefact)}</a>`
  );
}

/** A ticket's size in slices: the plan's once signed, the posted count before (slice-estimates L4); none without one. */
function renderSlices(count) {
  if (!Number.isInteger(count)) return '';
  return `<span class="ticket-slices">${count} slice${count === 1 ? '' : 's'}</span>`;
}

/** How many questions wait on a ticket, and how many of them block it (ticket-states spec 17, S18): nothing at none. */
function renderQuestionCount(asked) {
  const blocking = asked.filter(isBlocking).length;
  if (asked.length === 0) return '';
  return `<span class="questions">${asked.length} question${asked.length === 1 ? '' : 's'}` +
    `${blocking > 0 ? ` (${blocking} blocking)` : ''}</span>${blocking > 0 ? BLOCKING_BADGE : ''}`;
}

/**
 * A ticket's open threads (overview-one-ticket spec 6; ticket-states spec 20, B5): every queued thread
 * naming it, questions, walkthrough, gate1 and gate2, each as the way into its thread; nothing
 * when none is open. On every row, so a thread behind the ticket in hand is a press away.
 */
function renderPreviews(ticket, items) {
  const links = items.filter((item) => item.ticket === ticket.id && isQueued(item)).map((item) => `<p>${item.kind} ${renderStandingLink(item)}</p>`);
  return links.length ? `<details class="previews"><summary>threads</summary>${links.join('')}</details>` : '';
}

/** A row's top-right group (walkthrough of ticket-state-accents): the play button, then the arrows. */
const renderControls = (move, play) => (move || play ? `<span class="controls"${play ? ' data-confirm-row' : ''}>${play}${move}</span>` : '');

/**
 * A ticket: its state on the row and as a badge (ticket-states spec 1, L8), its title, `next` on
 * the ticket the chain takes (spec 11), the count of its open questions (spec 17), its arrows,
 * its open threads (overview-one-ticket spec 6), and its spec text shut under it. The ticket in hand,
 * live or next, carries `in-hand` (overview-one-ticket spec 10), and so does every other live ticket; no other
 * row does. The yellow ticket a live co-pilot holds carries `co-pilot-held` instead, with its sideways
 * `co-pilot` label (ticket-state-accents spec 1, 21): the co-pilot's lane, never the main slot's `in-hand`.
 */
function renderTicketRow(item, index, count, isHead, isInHand, back, items, isCoPilot = false, isYellowHead = false, swap = '', locked = false) {
  const state = stateOf(item);
  const asked = openQuestionsOf(items, item.id);
  const mark = isCoPilot ? ' class="co-pilot-held"' : isInHand ? ' class="in-hand"' : '';
  return (
    `<li data-state="${state}"${mark}>${isCoPilot ? '<span class="lane-label">co-pilot</span>' : ''}${isHead ? '<span class="next">next</span>' : ''}${isYellowHead ? '<span class="next" data-lane="co-pilot">next</span>' : ''}${renderStandingLink(item)}` +
    `${item.live === true && !isLanding(item, items) ? '<span class="live">live</span>' : ''}` +
    `<span class="ticket-state" data-state="${state}">${ticketLabelOf(item, state, items)}</span>` +
    renderQuestionCount(asked) +
    `${item.plan ? renderPlan(item) : renderSlices(item.sliceCount)}` +
    `${isShortPath(item) ? '<span class="short-path">short path</span>' : ''}` +
    renderControls(renderMoveForm(item, index, count, back, locked), swap === 'pending' ? '' : renderSwitchForm(item, swap, back)) +
    (swap === 'pending' ? renderSwitchForm(item, swap, back) : '') +
    renderPreviews(item, items) +
    `<details class="body"><summary>spec</summary>${renderMarkdown(item.body)}</details></li>`
  );
}

/** Continue's play glyph, text-presented, and the name it keeps for a screen reader and on hover. */
const PLAY = '&#9654;&#xFE0E;';
const PLAY_LABEL = 'title="Continue" aria-label="Continue"';

/**
 * Continue (ticket-state-accents spec 11, 15; L9, L13 as amended): `swap` is `idle` on an open red or green row not in
 * hand, an icon-only play button beside the arrows, a trigger whose first press blanks the row to its confirm step alone
 * (`confirm.mjs`, handoff-failed-confirm L1; the confirm row is the controls, and the CSS blanks the row around them); Confirm posts `/switch`, a click anywhere else puts the row back. The pending row's
 * button is lit `pending` and reads "switching…" until the pilot's take completes it, Cancel beside it, and every other
 * Continue is `locked` (spec 14). Nothing on any other row. Both post `to`, whose state names the lane: a yellow
 * row's is the co-pilot's (spec 17, 18).
 */
function renderSwitchForm(item, swap, back) {
  if (!swap) return '';
  // Locked (spec 14): no form to post, so only the server's refusal is left behind it for a press that slips through.
  if (swap === 'locked') return `<button type="submit" data-switch="locked" ${PLAY_LABEL} disabled>${PLAY}</button>`;
  const fields =
    `<input type="hidden" name="repo" value="${escapeHtml(item.repo)}" /><input type="hidden" name="to" value="${escapeHtml(item.id)}" />` +
    `<input type="hidden" name="back" value="${escapeHtml(back)}" />`;
  // The lit button is no confirm form: its one other press is Cancel (spec 13), posted at once.
  if (swap === 'pending') {
    return (
      `<form class="switch" method="post" action="/switch-cancel" data-in-place>${fields}` +
      '<button type="submit" data-switch="pending" disabled>switching…</button><button type="submit" data-switch="cancel">Cancel</button></form>'
    );
  }
  return (
    `<form class="switch" method="post" action="/switch" data-in-place>${fields}<button type="submit" data-switch="idle" ${PLAY_LABEL} data-confirm>${PLAY}</button>` +
    `<div class="step sure" hidden><p>Switch to ${setOff(item.title)}?</p><button type="submit">Confirm</button></div></form>`
  );
}

/** The Tickets panel's three queues, in this order and under these headings (ticket-states spec 3); closed tickets are in none. */
const QUEUES = [
  ['red', 'Red'],
  ['yellow', 'Yellow'],
  ['green', 'Green'],
];

/**
 * One queue: a fold served shut, its heading and count the summary (overview-one-ticket spec 12-14,
 * L9), its tickets in deck order inside, the arrows moving a ticket within it only. `data-repo` keys
 * the open set `bookmarks.mjs` keeps per repository. The fold holding the co-pilot's ticket is served
 * open too, under the same `data-in-hand` that keeps `refoldTickets` from shutting it.
 */
function renderTicketQueue([state, heading, tickets], head, marked, back, items, repo, coPilot = null, yellowHead = undefined, pendingTo = null, coPilotPendingTo = null) {
  // Only an open yellow row can be the co-pilot's (`deckLanes`' rule), so only this fold is checked.
  const isCoPilot = (ticket) => state === 'yellow' && ticket.id === coPilot;
  const held = tickets.some((ticket) => marked.includes(ticket) || isCoPilot(ticket));
  // Continue on main-lane rows not in hand (spec 11), and on yellow rows the co-pilot does not hold (spec 17): each
  // lane reads its own pending `to` and locks its own rows only (spec 19, L17), arrows included. A paused row is on
  // no lane (blocked-yellow-yields A6), and a landing one is held by none (gate2-frees-lane S12; a switch is refused `already live`), so each offers none, but keeps the Cancel of a switch already pending to it.
  const swapOf = (ticket) =>
    state === 'yellow'
      ? ticket.id === coPilot ? '' : ticket.id === coPilotPendingTo ? 'pending' : coPilotPendingTo ? 'locked' : 'idle'
      : marked.includes(ticket) || isLanding(ticket, items) ? '' : ticket.id === pendingTo ? 'pending' : isPaused(ticket) ? '' : pendingTo ? 'locked' : 'idle';
  const fold =
    `<details class="ticket-queue" data-queue="${state}" data-repo="${escapeHtml(repoKey(repo))}"${held ? ' data-in-hand open' : ''}><summary>${heading} <span class="count">${tickets.length}</span></summary>` +
    renderStandingPanel(
      tickets.map((ticket, index) => renderTicketRow(ticket, index, tickets.length, ticket === head, marked.includes(ticket), back, items, isCoPilot(ticket), ticket === yellowHead, swapOf(ticket), state !== 'yellow' && pendingTo !== null)),
      'none',
      'tickets-list',
    ) +
    '</details>';
  return fold;
}

/**
 * A closing report: its title, marked while the pilot has not closed it, and the
 * × a notice carries (deck-polish spec 6, A4). The × is this browser's alone —
 * `notifications.mjs` keeps it under `deck.hiddenReports` — so the report stays
 * open on the deck and its thread still opens at its address.
 */
const renderReportRow = (item) =>
  `<li data-report="${escapeHtml(item.id)}">${renderStandingLink(item)}` +
  `${isOpen(item) ? '<span class="open">open</span>' : ''}` +
  `<button type="button" class="drop" title="Take this off the panel">×</button></li>`;

/**
 * A rail bookmark's own `<summary>`, badged with a plain count (`deck.css`'s
 * `[data-count]`). Rendered server-side: what counts here is a fact the deck
 * already knows when it serves the page. Notifications' is its notices alone
 * (deck-press-feedback L8); `notifications.mjs` adds the open threads only this
 * browser can say it has not seen. No attribute at all past zero — an empty
 * `[data-count]` would still draw a bare space.
 */
const renderTabSummary = (name, count) =>
  `<summary${count > 0 ? ` data-count="${count}"` : ''}>${escapeHtml(name)}</summary>`;

/**
 * A standing kind's own panel content (spec 2, 6; L6, L13; QA F1, and the walkthrough
 * that replaced it): the list, or the words for having none — never the `<details>`
 * around it, because that is now `strips.html`'s own bookmark and not a section
 * nested inside one. Folding the two sections into their own panes, the way
 * Notifications already stands in one, is what ended a ticket's own spec opening by
 * overlaying the rail instead of a pane of its own, and its rows running together
 * with none of the Notifications list's spacing (`deck.css` gives `.tickets-list` and
 * `.reports-list` the same row rule `.notice` already has).
 */
const renderStandingPanel = (rows, none, listClass, after = '') =>
  rows.length ? `<ol class="${listClass}">${rows.join('')}</ol>${after}` : `<p class="nobody">${none}</p>`;

/** What the Closing reports panel says once this browser has hidden every row (`notifications.mjs`). */
const ALL_HIDDEN = '<p class="nobody" data-all-hidden hidden>all hidden</p>';

/** The name every ticket-making thread carries (ticket-making spec 1, 2; A6). */
export const TICKET_MAKING_TITLE = 'Add';

/**
 * The button that opens a ticket-making thread for this repository (spec 1; A6):
 * a second form on `/create`, with the name fixed and nothing to type.
 */
function renderMakeTickets(repo) {
  return [
    '<form method="post" action="/create" class="make-tickets" data-in-place="move">',
    `<input type="hidden" name="name" value="${escapeHtml(TICKET_MAKING_TITLE)}" />`,
    `<input type="hidden" name="repo" value="${escapeHtml(repo)}" />`,
    `<button type="submit">${escapeHtml(TICKET_MAKING_TITLE)}</button>`,
    '</form>',
  ].join('');
}

/**
 * This repository's closing reports, newest message first (L13), the ones the pilot has not
 * closed yet marked `open` — and it is that count, not the total, the badge
 * shows: a report already closed is history, not something waiting on anyone.
 */
function reportsOf(items, repo) {
  return items
    .filter((item) => item.kind === KIND_REPORT && isStanding(item) && sameRepo(item.repo, repo))
    .reverse()
    .sort(newestSaidFirst);
}

/**
 * One live agent: what it is, and how long it has been live (spec 9, A2). Not
 * what it is working on — the hook payload does not carry that — and not its
 * id, which is bookkeeping between the hook and the daemon and tells the user
 * nothing they can act on.
 *
 * The stamp is when the deck first saw it, rendered the way every other moment
 * on the page is, so `time.mjs` reads it as "3 min ago" and keeps it current on
 * its own minute tick — the panel says how long without the deck redrawing it.
 */
const renderAgent = (agent) =>
  `<div class="agent"><span class="run">${escapeHtml(agent.agentType)}</span>` +
  `<span class="who"> · started ${renderTime(agent.since)}</span></div>`;

/**
 * One deck's agents, or the words for having none.
 *
 * This drew nothing at all with an empty roster, on the grounds that an empty
 * panel under a standing bookmark is the deck saying it has nobody for this
 * tab. The user overruled it at Gate 2 on 2026-09-23, from the other end:
 * every panel has a floor under it (`min-height` in `deck.css`), so an empty
 * one is not a small blank space but a box the height of that floor with
 * nothing whatever inside it, which reads as broken rather than as empty.
 * Spec 33's label names the panel directly above this line, so the two
 * together are a panel that says what it is and that it holds nothing.
 */
const renderAgents = (agents = []) =>
  agents.length
    ? `<section class="agents">${agents.map(renderAgent).join('')}</section>`
    : '<p class="nobody">no agents live</p>';

/**
 * One line of the Notifications panel: the thread's title as the way into it,
 * the deck it came from beside it, and the × that takes the line off this
 * panel (A10).
 *
 * The label is the tab's and never the item's, for the reason `renderCardRun`
 * gives: an item carries `repo` and no name. A thread whose repository no run
 * has registered belongs to no tab and so carries no label, which is the same
 * answer every other cross-deck list on these pages gives.
 *
 * The × is a `<button type="button">` and not a form: it closes nothing and
 * dismisses nothing (L25). Destruction behind a small mark on a panel is the
 * control L10 took *off* a panel earlier in this same feature, and a thread the
 * user has finished with is closed on its own page, where its words are. So
 * there is nothing here for a browser running no script to post, and what the
 * press does — mark this thread read in this browser's own key — is
 * `notifications.mjs`'s.
 *
 * The id is on the row rather than on the link, because the row is what the
 * script hides and what it counts; the link already carries it in its href.
 *
 * `data-said` is how many times the pilot has written on the thread (spec 26,
 * amended at Gate 2, 2026-09-23): the browser keeps its "seen" mark against
 * that number, so a thread it has looked at stays hidden until the pilot says
 * something else. It is the one fact the client needs that it cannot work out
 * from the list, and it is a number and not a stamp, because the pilot's own
 * messages carry no sequence number on purpose (`items.mjs`).
 */
const renderNotice = (item, tab, items) =>
  `<div class="notice" data-thread="${escapeHtml(item.id)}" data-said="${pilotWrites(item)}">` +
  `<a href="/thread/${encodeURIComponent(item.id)}">${titleOf(item, items)}</a>` +
  (tab ? `<span class="who"> · ${escapeHtml(tab.name)}</span>` : '') +
  `<button type="button" class="drop" title="Take this off the panel">×</button>` +
  '</div>';

/**
 * The one panel that is not a scope's: every open thread on the deck, whichever
 * repository it came from, newest first (L25, A10).
 *
 * Deck-wide is the whole of spec 26 — "a new question reaches you while you sit
 * inside a walkthrough thread" — so this is built from the deck's queued items (`isQueued`), which
 * are the deck's own queue and already exist, rather than from the selected
 * tab's `open`. It is also why it takes the items and not the scope the other
 * three panels are drawn from: narrowing it to the tab would lose exactly the
 * thread it exists to announce.
 *
 * The list is stable and the count over it is the marker, not the other way
 * round (L25): a panel that listed only the unseen would empty itself the
 * moment it was read, and the × would have nothing left to press.
 *
 * Newest first because the count is about what has just arrived. The store
 * appends, so its queued items are oldest first and this is them reversed; not
 * `queueOf`, which puts user threads last, since arrival is the order here.
 *
 * Above them, the threads an agent closed that the user has not looked at since
 * (deck-press-feedback spec 7-9, L6), newest close first.
 */
const renderNotifications = (items, tabs, back) => {
  const rows =
    noticesOf(items).map((item) => renderClosedNotice(item, back, items)).join('') +
    items
      .filter(isQueued)
      .reverse()
      .map((item) => renderNotice(item, tabFor(tabs, item.repo), items))
      .join('');
  // Mark all seen heads a panel with a row, and only then (notifications-seen spec 5, L1): a form, so no script still clears.
  return rows && (
    '<form method="post" action="/clear-notices" data-in-place class="mark-all-form">' +
    `<input type="hidden" name="back" value="${escapeHtml(back)}" />` +
    '<button type="submit" class="mark-all">Mark all seen</button></form>' + rows
  );
};

/**
 * One agent-closed thread's notice (spec 7-9, L6): its kind, its title as the way in, and the
 * resolution's first line. Its × is a form: it posts, and the deck sends the page back with the
 * Notifications tab open.
 */
const renderClosedNotice = (item, back, items) =>
  `<div class="notice" data-notice="${escapeHtml(item.id)}" data-at="${Date.parse(item.resolvedAt) || ''}">` +
  `<span class="who">${escapeHtml(item.kind)} · </span>` +
  `<a href="/thread/${encodeURIComponent(item.id)}">${titleOf(item, items)}</a>` +
  `<span class="who"> · ${withTitles(String(item.resolution ?? '').split('\n')[0], items)}</span>` +
  '<form method="post" action="/clear-notice" data-in-place>' +
  `<input type="hidden" name="id" value="${escapeHtml(item.id)}" />` +
  `<input type="hidden" name="back" value="${escapeHtml(back)}" />` +
  '<button type="submit" class="drop" title="Clear this notice">×</button></form>' +
  '</div>';

/**
 * The Chat panel: the selected deck's chat, its messages with the bylines every
 * thread draws, and a box to send the next one (spec 4, L9, ADR 0031). Nothing
 * on a page that names no deck, and the empty region is what `deck.css` hides the
 * bookmark on, so a move to the overview in place takes it off the rail.
 *
 * The form is `/reply`'s, so the route and the reply path are every thread's.
 * Send is a submit named `choice` with no value, which is what `reply.mjs` sends in
 * place over `fetch` rather than posting the page away, and what `replyFrom`
 * drops, leaving the typed text alone. With no script it posts and comes back to
 * this tab through `back`.
 */
function renderChat(tab, items) {
  const ours = tab ? items.filter((item) => sameRepo(item.repo, tab.repo)) : [];
  const chat = ours.find((item) => item.kind === KIND_CHAT);
  // The threads Create opened here, listed under the repository's own (spec 3).
  const created = ours
    .filter((item) => item.kind === KIND_USER)
    .map((item) => `<li><a href="/thread/${encodeURIComponent(item.id)}">${escapeHtml(item.title)}</a></li>`)
    .join('');
  const threads = created ? `<ul class="threads-created">${created}</ul>` : '';
  if (!chat) return threads;
  return [
    threads,
    renderMessages(chat) || '<p class="nobody">Nothing said here yet.</p>',
    '<form class="chat" method="post" action="/reply">',
    `<input type="hidden" name="id" value="${escapeHtml(chat.id)}" />`,
    `<input type="hidden" name="back" value="${escapeHtml(hrefFor(tab))}" />`,
    '<textarea name="text" rows="3" aria-label="Message the pilot" placeholder="Say anything to the pilot." required></textarea>',
    '<button type="submit" name="choice" value="">Send</button>',
    '</form>',
  ].join('');
}

/**
 * Every held lane's `{ stage, ticket }` (three-lanes spec 12, 13; A5), the first the one the Status tab draws by default:
 * the implementing ticket its live co-pilot holds, then the concluding lane's, then the planning lane's. Held lanes only:
 * a queued or switching lane names none.
 */
function heldTicketsOf(tab, items) {
  if (!tab) return [];
  const implementing =
    coPilotStateOf(items, tab.repo, tab.coPilot, tab.switching) === 'held'
      ? ticketQueueOf(items, tab.repo, 'yellow').find((ticket) => ticket.id === tab.coPilot)
      : undefined;
  const held = (lane) => {
    const { state, ticket } = laneOf(items, tab.repo, lane, { switching: tab.switching });
    return state === 'held' ? ticket : undefined;
  };
  return [
    { stage: 'implementing', ticket: implementing },
    { stage: 'concluding', ticket: held('concluding') },
    { stage: 'planning', ticket: held('planning') },
  ].filter((lane) => lane.ticket);
}

/**
 * The Status selector (three-lanes spec 13, L8): one link per held lane's ticket, its stage and title, the chosen one
 * `aria-current`; nothing with one held lane. Plain links built from the store's own ids, so the address is the view
 * state, no script runs, and no `ticket` from the browser is drawn.
 */
function renderStatusSelector(tab, items, chosen) {
  const held = heldTicketsOf(tab, items);
  if (held.length < 2) return '';
  const link = ({ stage, ticket }) =>
    `<a href="${escapeHtml(`${hrefFor(tab)}&ticket=${encodeURIComponent(ticket.id)}`)}"${ticket.id === chosen?.id ? ' aria-current="true"' : ''}>` +
    `${stage} · ${escapeHtml(ticket.title)}</a>`;
  return `<nav class="status-select" aria-label="Whose record">${held.map(link).join('')}</nav>`;
}

/**
 * The bookmarks in the blank space beside the column: the status
 * table and the agents that are live in this deck, each a `<details>` the
 * platform opens with no script of ours.
 *
 * This is where the two halves of this feature meet. `main` drew these for
 * every run the deck holds and put them on every page, because the user widened
 * spec 5 at Gate 2 — the panels vanished the moment a `Yours` link was followed,
 * which is the one thing the table is for. Run-tabs drew them for the selected
 * run only, because a page that stacks every run is what tabs exist to end.
 *
 * The walkthrough of 2026-09-19 settled what was left between those two. The
 * panels went with the tab, so dismissing the run you were on took the tree and
 * the table off the screen with it: "the 'tree' and 'status' tabs disappeared.
 * They should always be visible." Every page state draws both bookmarks now,
 * which replaces run-tabs' "no tab, no panels" — and what they hold answers the
 * other half, that a page stacking every run is what tabs exist to end: on a
 * run's own tab they are that run's rows, drawn straight, and everywhere else
 * they are one *shut* section per tab, in the strip's own order. Nothing is
 * stacked until the user opens it, and the bookmarks are wherever they are.
 *
 * The rows are the scope's own: the graph is `graphOf` them and the table is
 * the same rows unchanged, with a `yoursIndex` built from that scope's items,
 * which is correct for it because the `Yours` join is repo and slice.
 *
 * A scope with no rows contributes no section; a page with no rows anywhere
 * draws the bookmarks around an empty panel, which is the deck saying it has
 * nothing for this tab rather than saying nothing at all. That is the case a
 * tab built from items alone is always in: the run that would have posted a
 * table has no record left (D4 of run-tabs).
 *
 * The tree and the table are one Status bookmark since three-lanes S5 (spec 12):
 * the table, then its graph, of the record of the first held lane `heldTicketsOf` names.
 */
function renderStrips(tab, tabs = [], items = [], { ticket: chosenId } = {}) {
  const scopes = tab ? [tab] : tabs;
  const rows = scopes.map((scope) => {
    // The chosen held ticket's newest record with a table (three-lanes spec 12, 13, S5 A-f6), found by the record's
    // `ticket` in `deck.records`, drawn as a row of this tab. `chosenId` is the browser's and only picks among the held
    // lanes, else the default (L8); the overview draws each tab's default with no selector (A6). A held ticket with no
    // record says so. With no held lane, the newest row that posted a table: a tab is a deck and not a session, so two
    // sessions in one directory are one table, the way the tab's name is the newest feature named in it (`featureOf`).
    const held = heldTicketsOf(scope, items);
    const ticket = ((tab && held.find((lane) => lane.ticket.id === chosenId)) ?? held[0])?.ticket;
    const record = ticket && (scope.records ?? []).findLast((each) => each?.ticket === ticket.id && hasTable(each));
    const shown = record
      ? [{ repo: scope.repo, startedAt: scope.runs.at(-1)?.startedAt ?? record.updatedAt, slices: record.slices }]
      : ticket ? [] : scope.runs.filter(hasTable).slice(-1);
    // Store order, not the queue's: the last one posted is the one `Yours` names.
    const yours = yoursIndex(items.filter((item) => scope.open.includes(item)));
    // The chosen record's own feature heads it (QA F1): the tab's name is the newest feature, not this ticket's.
    const head = record?.feature || scope.name;
    return {
      name: scope.name,
      status:
        (tab ? renderStatusSelector(scope, items, ticket) : '') +
        (ticket && !record ? '<p class="empty">no slice table yet</p>' : '') +
        shown.map((run) => renderRunStatus(run, yours, head) + renderRunGraph(run, head)).join(''),
      agents: renderAgents(scope.agents),
    };
  });
  // Each panel drops the scopes it has nothing for, which is now a question per
  // panel rather than one for the strip: a deck can have a table and nobody
  // live, or somebody live and no table posted yet (spec 9).
  const panel = (which) =>
    rows
      .filter((row) => row[which] !== '')
      .map((row) => (tab ? row[which] : inSection(row.name, row[which])))
      .join('');
  // A repository tab's own tickets and closing reports; the overview names none, so
  // both are empty lists here rather than the panel's own decision (spec review,
  // MEDIUM). The <summary> is drawn either way, the way Chat's own always is —
  // only the panel goes empty, which is what `deck.css` hides the bookmark on.
  const ticketRepo = tab?.repo;
  const queues = QUEUES.map(([state, heading]) => [state, heading, tab ? ticketQueueOf(items, ticketRepo, state) : []]);
  const tickets = queues.flatMap(([, , queue]) => queue);
  // Each stage's lane from `laneOf` (three-lanes spec 6): its state, its live ticket and its pending switch, by queue.
  const switching = tab?.switching;
  const lanes = tab ? Object.fromEntries(['red', 'green'].map((state) => [state, laneOf(items, ticketRepo, laneOfState(state), { switching })])) : {};
  // The rows marked (overview-one-ticket spec 10, L2; three-lanes spec 6): every live ticket, else each stage's next. A next
  // beside a live ticket stays unmarked, so it keeps the Continue that takes it into its own lane.
  const live = Object.values(lanes).map((lane) => lane.ticket).filter(Boolean);
  const marked = live.length ? live : Object.values(lanes).map((lane) => lane.next).filter(Boolean);
  const back = tab ? hrefFor(tab) : '';
  // Every lane's word (spec 10, 16; ADR 0106), inside the live region (L5); a `queued` co-pilot lane's yellow head gets the blue `next` (L22).
  const coPilotState = tab ? coPilotStateOf(items, ticketRepo, tab.coPilot, tab.switching) : '';
  const yellowHead = coPilotState === 'queued' ? runnableYellowOf(items, ticketRepo)[0] : undefined; // the lane's next (spec 2)
  const coPilotPendingTo = coPilotState === 'switching' ? tab.switching.coPilot.to : null;
  // Each stage's queue chips its own head, beside a live ticket too (three-lanes A-f5), and locks on its own lane's pending `to` (spec 5).
  const renderQueue = (queue) =>
    renderTicketQueue(queue, lanes[queue[0]] && nextTicketOf(items, ticketRepo, queue[0]), marked, back, items, ticketRepo, tab.coPilot, yellowHead, lanes[queue[0]]?.pending ?? null, coPilotPendingTo);
  const reports = tab ? reportsOf(items, tab.repo) : [];
  const openReports = reports.filter(isOpen).length;
  return renderTemplate('strips.html', {
    CHAT: renderChat(tab, items),
    // Deliberately not one of the three below: those are the scope's rows,
    // sectioned per tab on the overview, and this one is the deck entire
    // whichever page it is drawn on (L25).
    NOTIFICATIONS: renderNotifications(items, tabs, back || '/'),
    // The notices' count at first paint (spec 9, L8); `notifications.mjs` adds the unseen open threads.
    NOTIFICATIONS_SUMMARY: renderTabSummary('Notifications', noticesOf(items).length),
    TICKETS_SUMMARY: renderTabSummary('Tickets', tickets.length),
    TICKETS: tab
      ? `<div class="tickets-state" data-planning-state="${lanes.red.state}" data-concluding-state="${lanes.green.state}" data-co-pilot-state="${coPilotState}">` +
        renderMakeTickets(ticketRepo) +
        (tickets.length ? queues.map(renderQueue).join('') : renderStandingPanel([], 'no tickets')) +
        '</div>'
      : '',
    REPORTS_SUMMARY: renderTabSummary('Closing reports', openReports),
    REPORTS: tab ? renderStandingPanel(reports.map(renderReportRow), 'no reports', 'reports-list', ALL_HIDDEN) : '',
    STATUS: panel('status'),
    AGENTS: panel('agents'),
  });
}

// --- the usage readout -----------------------------------------------------

/**
 * The three readings, in the words spec 11 uses for them: how full the context
 * window is, and how much of the five-hour and weekly limits is gone. A `null`
 * reading is the reading the deck could not get, and the page says "unknown".
 *
 * Every page renders this the same, and renders it *unknown*: `usage.mjs` polls
 * `/api/usage` and patches the figures in, so there is one path to a number
 * rather than two (D16, reasoned in full in `usage.mjs`).
 *
 * It goes in the `<header>`, which is the one part of every page that no live
 * region covers, so a change replaces the queue underneath it and the readout is
 * not touched (D1). It carries no `data-live` of its own for the same reason.
 *
 * `ctx` has no reset line. A context window is compacted when it fills, not
 * reset on a clock, and there is no time to show. The other two hide their line
 * until there is a stamp to put in it: "resets" with nothing after it reads as a
 * time the deck lost rather than one it never had.
 *
 * `ctx` is also the one reading that belongs to a *deck* rather than to the
 * account (spec 31): it is the context window of the session working in that
 * directory, and the five-hour and weekly limits are the user's one allowance
 * spent by every session at once. So the block carries the deck it is a page of
 * and the script polls with it (L32), and a page of no deck — the overview —
 * carries no token and renders no `ctx` span at all rather than one that could
 * only ever say "unknown".
 */
const READINGS = [
  ['ctx', 'ctx', false],
  ['session', 'session', true],
  ['weekly', 'weekly', true],
];

function renderUsage(tab = null) {
  const readings = READINGS.filter(([key]) => key !== 'ctx' || tab !== null).map(
    ([key, label, resets]) =>
      `<span>${label} <b data-usage="${key}">unknown</b>` +
      (resets ? `<small data-resets="${key}" hidden> resets <time></time></small>` : '') +
      '</span>',
  );
  const token = tab === null ? '' : ` data-run="${escapeHtml(tab.repo)}"`;
  return `<p class="usage"${token}>${readings.join('')}</p>`;
}

/**
 * What an ended tab's page says, once, above the queue: the strip's "ended" is
 * three letters at a glance, and the user standing on the page is owed the
 * consequence of them. It is inside the queue's live region, so the line goes
 * the moment the run's last thread is resolved and the tab goes with it.
 *
 * A reply typed here is still worth typing: it is read by the next session
 * opened in this repository, which re-adopts the tab because a tab is a
 * repository (A3, D3 of run-tabs).
 */
const ENDED_NOTE =
  '<p class="ended-note">This session has ended. Its tab stays while these threads are open, ' +
  'and the next session in this repository picks them up.</p>';


export { renderStrips, renderUsage, ENDED_NOTE };
