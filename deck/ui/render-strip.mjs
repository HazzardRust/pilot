/**
 * The status table, the git graph and the tab strip with its forms (audit-f1-f7 S17, L9). Moved whole
 * from `deck/ui/render.mjs`, which is now the facade over its siblings.
 */

import path from 'node:path';

import { isWindows } from '../../hooks/lib/platform.js';
import { sameRepo } from '../items.mjs';
import { graphOf, yoursFor } from '../status.mjs';
import { escapeHtml, renderUrl } from './markdown.mjs';
import { renderTime, nothing } from './render-parts.mjs';
import { hrefFor } from './render-cards.mjs';

// --- the status table, which is the home screen (L4) -----------------------

/**
 * A URL the pilot typed inside a `State` cell, as something the user can click.
 * The evidence this slice is judged on is a live URL in `State` — "walkthrough
 * on http://localhost:3260/jobs" is a place the user has to get to, and making
 * them select and paste it is the deck putting a step in their way.
 *
 * The token is matched rather than the whole cell parsed, and it still goes
 * through `safeHref`, so the only schemes that ever become an `href` are the
 * two `safeHref` allows and everything else is the text the pilot posted.
 */
const URL_IN_TEXT = /(https?:\/\/[^\s<]*[^\s<.,;:!?)\]}'"])/gi;

function renderState(state) {
  return String(state ?? '')
    .split(URL_IN_TEXT)
    .map((part, index) => (index % 2 === 0 ? escapeHtml(part) : renderUrl(part)))
    .join('');
}

/**
 * The `Yours` cell: the user's next action for this slice, or nothing. It is
 * rendered from the slice's open item and never typed (L4), so a thread the
 * pilot has closed empties the cell without the pilot posting a new table.
 */
function renderYours(run, row, index) {
  const item = yoursFor(run, row, index);
  if (!item) return '';
  return `<a href="/thread/${encodeURIComponent(item.id)}" title="${escapeHtml(item.kind)}">${escapeHtml(item.title)}</a>`;
}

function renderSliceRow(run, row, index) {
  return [
    '<tr>',
    `<td class="slice">${escapeHtml(row.slice)}</td>`,
    `<td>${renderState(row.state)}</td>`,
    `<td class="yours">${renderYours(run, row, index)}</td>`,
    '</tr>',
  ].join('');
}

/**
 * One run and its table, headed by the name of the tab it is in rather than by
 * the run's own: the strip says "deck-tree" the moment the pilot names its run,
 * and a heading still reading "Hazzard" underneath it would be the same run
 * called two things on one page (spec 4). `run.name` is the directory and stays
 * the fallback the tab's name falls back to, never a second name. Two sessions
 * on one repository are one tab (D3 of run-tabs), so their two tables carry one name, which
 * is what tells the user they are two halves of one piece of work.
 *
 * The panel carries no dismiss. It did, beside the rows it takes off the
 * screen, and spec 8 is the user asking for it to stop: this is the panel they
 * read most, and the control that empties it is on `/items`, a page reached on
 * purpose (L10).
 */
function renderRunStatus(run, index, name) {
  const rows = Array.isArray(run.slices) ? run.slices : [];
  const table = rows.length
    ? [
        '<table class="slices">',
        '<thead><tr><th>Slice</th><th>State</th><th>Yours</th></tr></thead>',
        `<tbody>${rows.map((row) => renderSliceRow(run, row, index)).join('')}</tbody>`,
        '</table>',
      ].join('')
    : '';
  return [
    '<section class="run-status">',
    `<span class="run" title="${escapeHtml(run.repo)}">${escapeHtml(name)}</span>`,
    `<span class="who"> · started ${renderTime(run.startedAt)}</span>`,
    table,
    '</section>',
  ].join('');
}

/** A link that escapes its own text, as `renderStripLink` above does with its. */
const renderLink = (href, text, title = '') =>
  `<a href="${escapeHtml(href)}"${title ? ` title="${escapeHtml(title)}"` : ''}>` +
  `${escapeHtml(text)}</a>`;

// --- the same run, drawn as a git graph (slice-graph spec 1-3, 6, 7) --------

/** L6's geometry: lanes 14px apart, rows 22px, and room for a dot at the edge. */
const LANE = 14;
const ROW = 22;
const EDGE = 7;
const laneX = (lane) => EDGE + lane * LANE;
const rowY = (row) => EDGE + 4 + row * ROW;

/** A vertical S-bend between two points, the half row a fork or convergence takes. */
const bend = (x1, y1, x2, y2) => `C${x1} ${(y1 + y2) / 2} ${x2} ${(y1 + y2) / 2} ${x2} ${y2}`;

/**
 * One edge as a path: out of its dot onto the lane it runs down (a fork bends
 * in the half row below the dot), down that lane, and into its target (a
 * convergence bends in the half row above it). Geometry only: no row text.
 */
function renderEdge(edge, laneAt) {
  const [x1, y1] = [laneX(laneAt(edge.from)), rowY(edge.from)];
  const [x2, y2] = [laneX(laneAt(edge.to)), rowY(edge.to)];
  const x = laneX(edge.lane);
  const out = x === x1 ? `L${x} ${y1 + ROW / 2}` : bend(x1, y1, x, y1 + ROW / 2);
  const into = x === x2 ? `L${x2} ${y2}` : bend(x, y2 - ROW / 2, x2, y2);
  return `<path d="M${x1} ${y1} ${out} L${x} ${y2 - ROW / 2} ${into}"/>`;
}

/**
 * One slice: its dot, filled by phase (A5), and its identifier in the column
 * right of the lanes (spec 6). The rest of the full name follows the
 * identifier, undrawn, for `graph-name.mjs` to show in a box over the page the
 * moment the row is hovered: the user at Gate 2 found a `<title>` tooltip (A1)
 * too slow, and its 8px dot too small a target, so a transparent band the
 * graph's width makes the whole row the target. Row text reaches this markup
 * through `escapeHtml` and nowhere else, and never an attribute (L10).
 */
function renderDot(dot, textX, width) {
  const [x, y] = [laneX(dot.lane), rowY(dot.row)];
  const core = dot.phase === 'doing' ? `<circle class="core" cx="${x}" cy="${y}" r="2"/>` : '';
  return [
    `<g class="dot ${dot.phase ?? 'none'}">`,
    `<rect class="hit" x="0" y="${y - ROW / 2}" width="${width}" height="${ROW}"/>`,
    `<circle cx="${x}" cy="${y}" r="4"/>${core}`,
    `<text x="${textX}" y="${y}">${escapeHtml(dot.id)}<tspan class="rest">${escapeHtml(dot.name.trim().slice(dot.id.length))}</tspan></text>`,
    '</g>',
  ].join('');
}

/**
 * One run as a git graph (`graphOf`): the tab's name as the label, then lanes,
 * forks, convergences and the unlabelled end point (A4) as inline SVG, laid
 * out on the server so the page needs no script to draw it (L6). The
 * stylesheet scales it to the panel's width (the user at Gate 2).
 */
function renderRunGraph(run, name) {
  const graph = graphOf(run.slices);
  const label = `<span class="run" title="${escapeHtml(run.repo)}">${escapeHtml(name)}</span>`;
  if (graph.dots.length === 0) return `<section class="tree">${label}</section>`;

  const end = graph.dots.length;
  const laneAt = (row) => (row === end ? 0 : graph.dots[row].lane);
  const textX = laneX(graph.lanes - 1) + LANE;
  const width = textX + 4 * LANE;
  const height = rowY(end) + EDGE;
  return [
    '<section class="tree">',
    label,
    `<svg class="graph" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    `<g class="edges">${graph.edges.map((edge) => renderEdge(edge, laneAt)).join('')}</g>`,
    graph.dots.map((dot) => renderDot(dot, textX, width)).join(''),
    `<circle class="end" cx="${laneX(0)}" cy="${rowY(end)}" r="3"/>`,
    '</svg>',
    '</section>',
  ].join('');
}

// --- the strip that says which run is on screen (spec 2) -------------------

/**
 * One link in the strip, and the number of open items waiting behind it. With
 * no script these are links and not ARIA tabs, so the selected one says so with
 * `aria-current="page"` — the honest markup for a page that is one of a set, and
 * the only thing a screen reader needs to be told (D10 of run-tabs).
 *
 * The count is the length of the very list the link leads to, passed in rather
 * than counted again here, so the two cannot drift apart (D8 of run-tabs). A quiet tab says
 * "0" rather than saying nothing: the number is how the strip is read, and a
 * tab with no number would be a tab whose queue length the user has to open it
 * to learn.
 *
 * A run whose sessions have all gone says "ended" inside its own link rather
 * than in a badge or a second row, because the strip is a line of words and
 * this is one more of them (spec 6). It is quiet: an ended run with a thread
 * still open is a run the user has work on, not a warning.
 *
 * A live run says no phase (ticket-state-accents L7; ADR 0105): the ticket's state lives on
 * its threads, so the tab reads its name and count, and `ended` once its sessions have gone.
 */
function renderStripLink(href, text, count, current, ended, unacknowledged = false) {
  return (
    `<a href="${escapeHtml(href)}"${current ? ' aria-current="page"' : ''}>` +
    `${escapeHtml(text)}${ended ? '<span class="ended">ended</span>' : ''}` +
    (unacknowledged ? '<span class="unacked" data-state="unacknowledged">unacknowledged</span>' : '') +
    `<span class="count">${count}</span></a>`
  );
}

/**
 * A deck's code: `D4`, the one spelling of it anywhere (L20). A deck that has
 * no number — one that has not registered since numbering arrived (A5) — is
 * called by its name instead, rather than by a code nobody has given it yet.
 */
const tabCode = (tab) => (tab.number ? `D${tab.number}` : tab.name);

/**
 * What a tab reads: `D4 deck-workspace` — the deck's code, then the name it
 * already had (spec 10). Two words of one label rather than a badge of its own,
 * because the strip is a line of words and this is the deck's own name for
 * itself said in front of the pilot's. An unnumbered deck's code already is its
 * name, so it reads exactly as it did before numbering.
 */
const tabLabel = (tab) => (tab.number ? `${tabCode(tab)} ${tab.name}` : tab.name);

/**
 * The strip: Overview, then one link per run, in registration order. A tab's
 * link carries the repository the deck holds and never the `run` the browser
 * sent, so an unresolvable one is not echoed back into the page in any branch
 * (D2 of run-tabs) and the only new user-controlled input reaches nothing.
 *
 * The Overview link is `/?run=` and not bare `/`. A blank `run` is refused by
 * `tabFor`'s guard (`deck/tabs.mjs:61`) and so always resolves to no tab, but
 * a bare `/` carries no `run` at all and so falls to `landingFor` instead
 * (D11 of run-tabs): with exactly one run live, that lands back on the run's own tab, and
 * the Overview link the user is looking at would go nowhere it doesn't
 * already show.
 *
 * Overview's count is the whole open queue, which is what the overview lists;
 * a tab's is its own open items. Between them the strip is the overview of
 * runs, which is what the user asked the overview to be. The count is the
 * queue's whichever way the `all` toggle is: it is how much is waiting on the
 * user, and a number that meant two different things depending on a toggle
 * elsewhere would be worse than no number.
 *
 * The strip is one of the page's live regions (D1): the counts move as items
 * arrive, and a run registered while the user is reading gets its tab without
 * anything being reloaded. The `<nav>` itself is never replaced, only what is
 * inside it (D3).
 */
function renderStrip(tabs, current, queue, all, refused, shown) {
  const overview = renderStripLink(
    hrefFor(null, all),
    'Overview',
    queue.length,
    current === null,
    false,
  );
  const links = tabs.map((tab) =>
    renderStripLink(hrefFor(tab, all), tabLabel(tab), shown(tab.open).length, tab === current, tab.ended, tab.unacknowledged),
  );
  const plus = renderAddDeck(hrefFor(current, all), refused);
  return `<nav class="runs-strip" data-live="tabs">${overview}${links.join('')}${plus}</nav>`;
}

/**
 * The strip's last tab, `+`: a directory path and Add (deck-polish spec 5, L4). A
 * `<details>` and a plain form, so it needs no script; the path is checked by the
 * server alone, because the page is not a trust boundary. A refusal lands back on
 * `back`, the page it was pressed on, with the box open and the reason beside it.
 */
const renderAddDeck = (back, refused) =>
  `<details class="add-deck"${refused ? ' open' : ''}><summary aria-label="Add a deck by path">+</summary>` +
  '<form method="post" action="/add-deck" data-in-place="move">' +
  `<input type="hidden" name="back" value="${escapeHtml(back)}">` +
  '<input type="text" name="path" placeholder="Absolute path of a directory" aria-label="Directory path" required>' +
  '<button type="submit">Add</button></form>' +
  (refused ? `<p class="refused" role="alert">${escapeHtml(refused)}</p>` : '') +
  '</details>';

/**
 * The toggle, as a bookmark at the right edge where the status table's used to
 * be: press it and the page also lists what it has already settled, press it
 * again and it is the queue alone. "since it is a toggle behavior, i would
 * rather just put it off to one of the sides as a tab that becomes highlighted
 * when it is turned on" — the walkthrough of 2026-09-19, which also moved the
 * status table over to the tree's side to make room for it.
 *
 * A link and not a control: it names the same page with the view flipped, so it
 * is the address bar that holds which view this is and the browser's own Back
 * goes back through them. It is drawn like the bookmarks it stands among
 * (`deck.css`), highlighted the way an open one is, because what it does is the
 * same kind of thing: it shows more of what the page is already about.
 */
function renderEverything(tab, all, tabs = [], numbers = {}, sessionRefused = null, alerts) {
  return (
    `<aside class="strip right">${renderToggle(hrefFor(tab, !all), all)}` +
    `${renderCreate(tab, tabs, numbers)}${renderSession(tab, sessionRefused)}${renderRemove(tab)}` +
    `${renderAlerts(hrefFor(tab, all), alerts.weekly)}</aside>`
  );
}

/**
 * Weekly alerts (spec 15, L9): one press flips the usage hook's weekly warning, and the
 * button says the state it is in. A plain form, so it needs no script; back to this page.
 */
const renderAlerts = (back, on) =>
  '<form class="alerts" method="post" action="/alerts" data-in-place>' +
  `<input type="hidden" name="weekly" value="${on ? 'off' : 'on'}">` +
  `<input type="hidden" name="back" value="${escapeHtml(back)}">` +
  `<button type="submit" class="${on ? 'on' : 'off'}" aria-pressed="${on}" ` +
  `title="Warn agents at 95% of the weekly limit">Weekly alerts ${on ? 'on' : 'off'}</button></form>`;

/** The toggle's own link, which a thread page draws too, pointed at itself. */
function renderToggle(href, all) {
  const says = all ? 'List only what is waiting on you' : 'Also list what this page has settled';
  // Named for what it lists, not for what pressing it does (spec 21).
  return (
    `<a class="everything${all ? ' on' : ''}" ` +
    `href="${escapeHtml(href)}" title="${says}">${all ? 'All' : 'Open'}</a>`
  );
}

/**
 * Create, under the toggle (independence spec 1, 2, 3a): a name, then a confirm
 * step that `js/confirm.mjs` shows in place, then one POST. On a tab the thread
 * goes to that tab's repository; on the overview the confirm step asks which of
 * the repositories the deck numbers (A6), named as their tabs are.
 */
function renderCreate(tab, tabs, numbers) {
  const option = ([key, number]) => {
    const known = tabs.find((each) => sameRepo(each.repo, key));
    return `<option value="${escapeHtml(key)}">${escapeHtml(known ? tabLabel(known) : `D${number} ${path.basename(key)}`)}</option>`;
  };
  const where = tab
    ? `<input type="hidden" name="repo" value="${escapeHtml(tab.repo)}" />`
    : `<select name="repo" required>${Object.entries(numbers).map(option).join('')}</select>`;
  return [
    '<details class="create"><summary>Create</summary>',
    '<form class="create confirm" method="post" action="/create" data-in-place="move">',
    '<div class="step name">',
    '<input name="name" required maxlength="60" pattern="[A-Za-z0-9 _\\-]+" autocomplete="off" ',
    'aria-label="Thread name" placeholder="Name the thread" />',
    '<button type="submit" class="next">Next</button><button type="button" class="cancel">Cancel</button>',
    '</div>',
    '<div class="step sure" hidden>',
    `<p>Open <b class="named"></b> ${tab ? `on ${escapeHtml(tabCode(tab))}?` : 'on which deck?'}</p>`,
    tab ? '' : where,
    '<button type="submit">Create</button><button type="button" class="cancel">Cancel</button>',
    '</div>',
    tab ? where : '',
    '</form></details>',
  ].join('');
}

/**
 * Remove, at the foot of the rail (independence spec 18, A7). Drawn only for an ended
 * tab — a live one offers no way in here at all, which is the whole of what
 * keeps the prohibited case (a control CSS alone hides on a live tab, while
 * the server still allows it) from being possible: there is no markup to
 * un-hide, because `removeDeck` is what refuses it and this simply never
 * renders the form for a repository it would refuse.
 *
 * Confirmed in place, the form its confirm row (handoff-failed-confirm L1,
 * `js/confirm.mjs`); with no script one press posts straight
 * to `/remove-deck`, as every confirm on the deck does. Nothing here names
 * what the confirm does beyond what A7 promises: archived, not deleted, and
 * still listed under Everything.
 */
function renderRemove(tab) {
  if (!tab || !tab.ended) return '';
  const repoField = `<input type="hidden" name="repo" value="${escapeHtml(tab.repo)}" />`;
  return [
    '<details class="remove"><summary>Close</summary>',
    '<form class="remove" method="post" action="/remove-deck" data-confirm-row data-in-place="move">',
    repoField,
    '<button type="submit" data-confirm>Close</button>',
    '<div class="step sure" hidden>',
    `<p>Close ${escapeHtml(tabCode(tab))}? Its open items are archived and its tab leaves the strip; ` +
      'nothing is deleted, and they still list under Everything.</p>',
    '<button type="submit">Confirm</button>',
    '</div>',
    '</form></details>',
  ].join('');
}

/**
 * Start or End, above Close (start-end-session spec 1, 2, 5, 8; L6, A7): one control.
 * Start for an ended tab on Windows, where `start` can open the window. End for a live
 * tab with a `pilot run` wrapper to tell (`tab.wrapped`); a plain `claude` session has
 * none, so its tab draws nothing. Confirmed in place, as Close is. A refused press
 * lands back here with its reason (`refused`), drawn in the control, opened (L6). With no
 * control to draw it in, the tab's own state is the answer: a bare line would widen the rail.
 */
function renderSession(tab, refused = null) {
  const reason = refused ? `<p class="refused" role="alert">${escapeHtml(refused)}</p>` : '';
  // Resume when the deck holds a ticket, Start when it does not (FF).
  if (tab?.ended && isWindows()) {
    const verb = tab.holding ? 'Resume' : 'Start';
    return renderSessionForm(tab, verb, 'A terminal window opens running pilot run.', reason);
  }
  if (tab && !tab.ended && tab.wrapped) {
    return renderSessionForm(tab, 'End', 'Its pilot run window closes, mid-turn or not.', reason);
  }
  return '';
}

/** The one shape Start and End share: a verb, what pressing it does, and a refusal. */
function renderSessionForm(tab, verb, what, reason) {
  return [
    `<details class="session"${reason ? ' open' : ''}><summary>${verb}</summary>`,
    `<form class="session" method="post" action="/${verb === 'End' ? 'end' : 'start'}-session" data-confirm-row data-in-place>`,
    reason,
    `<input type="hidden" name="repo" value="${escapeHtml(tab.repo)}" />`,
    `<button type="submit" data-confirm>${verb}</button>`,
    '<div class="step sure" hidden>',
    `<p>${verb} ${escapeHtml(tabCode(tab))}? ${escapeHtml(what)}</p>`,
    '<button type="submit">Confirm</button>',
    '</div>',
    '</form></details>',
  ].join('');
}

export { renderRunStatus, renderLink, renderRunGraph, tabCode, renderStrip, renderEverything, renderToggle };
