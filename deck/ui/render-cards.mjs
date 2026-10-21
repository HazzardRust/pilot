/**
 * The cards, the previews and the run list (audit-f1-f7 S16, L9). Moved whole from
 * `deck/ui/render.mjs`, which is now the facade over its siblings.
 */

import {
  CLOSABLE_KINDS,
  KIND_GATE1,
  KIND_GATE2,
  KIND_HANDOFF,
  KIND_USER,
  accentOf,
  isBlocking,
  isGate,
  isKnownKind,
  isRecord,
  noteFor,
  isOpen,
  lastSaidAt,
  threadState,
} from '../items.mjs';
import { escapeHtml, renderMarkdown } from './markdown.mjs';
import { renderTime, code, titleOf, renderTicketOf, renderAsked, renderChoice, renderChoiceRow, rendererFor, renderReplyForm, renderDismissForm, renderCloseForm, renderCardClose } from './render-parts.mjs';

/** The badge a blocking question and its ticket's row carry (ticket-states spec 17, S18). */
const BLOCKING_BADGE = '<span class="blocking">blocking</span>';

/**
 * The reply box together with whatever else an open thread of this kind
 * offers beside it. An unknown kind offers Dismiss (S17): the deck has no
 * rendering, and so no reply, for one of its own. A question and a user
 * thread offer Close (spec 7; 2026-09-28). A signoff and a walkthrough offer nothing: a gate is passed by the
 * user's word (L11). A record offers nothing at all: it takes no reply (ADR 0148).
 */
function renderReplySlot(item) {
  if (isRecord(item)) return '';
  if (CLOSABLE_KINDS.includes(item.kind)) return renderReplyForm(item) + renderCloseForm(item);
  // A gate also offers Dismiss: deck_resolve refuses it unsigned, so this is a stale gate's exit (merge-first L8).
  const dismissable = !isKnownKind(item.kind) || isGate(item.kind);
  return renderReplyForm(item) + (dismissable ? renderDismissForm(item) : '');
}

/**
 * Who closed a thread lives in the resolution's own words now, not in the
 * byline (S17, A9): a resolution the pilot wrote already opens with what it
 * decided, and `DISMISSED_BY_USER` says as much for the one the pilot never
 * saw. Naming the pilot here regardless was true only while the pilot was the
 * thread's only closer.
 */
function renderResolution(item) {
  return isOpen(item)
    ? ''
    : `<p class="resolved"><span class="who">closed · ${renderTime(item.resolvedAt)}</span>` +
        `<br />${escapeHtml(item.resolution ?? '')}</p>`;
}

// --- the pages -------------------------------------------------------------

/**
 * The overview's own address, which is `/?run=` and not a bare `/`: a blank
 * `run` always resolves to no tab, where a bare `/` falls to `landingFor`
 * instead and, with one run live, lands on that run's tab (D11 of run-tabs).
 *
 * The heading of every page the deck serves is a link to it (spec 1). The
 * three templates carry a `<!--HOME-->` slot for it rather than the address
 * written out, so the one constant is the sole place that address lives and
 * `hrefFor` below cannot drift from what the heading links to.
 */
export const OVERVIEW_HREF = '/?run=';

/**
 * Whether the page is also showing what is settled, spelled as the query it
 * lives in. It is in the URL for the reason the tab selection is (D1 of
 * run-tabs): the in-place swap re-fetches the address the page is at, so a view
 * that is in the address needs nothing carried across a change and nothing
 * remembered. It cannot be anywhere else either — the home page does not ship a
 * settled thread to the browser until it is asked to (spec 2), so turning this
 * on is a question for the deck and not for the stylesheet.
 */
const ALL = '&all=1';

/**
 * A page of the deck's, as written in the strip, on the cards the overview
 * labels, on the toggle itself, and as the page a card's quick answer comes
 * back to. No tab is the overview, which is the page a card carrying no tab was
 * drawn on. Every one of them keeps the toggle the user chose, or picking a tab
 * would quietly put the settled threads away again.
 */
const hrefFor = (tab, all = false) =>
  `${tab ? `/?run=${encodeURIComponent(tab.repo)}` : OVERVIEW_HREF}${all ? ALL : ''}`;

/**
 * The run a card came from, on the overview, where the cards are every run's:
 * the tab's name, and the way to that tab. The label is the tab's and never the
 * item's — an item carries `repo` and no name, and nothing new is stored on one
 * to draw this. An item whose repository no run has registered belongs to no tab
 * and carries no label, which is the same answer `tabsOf` gives.
 */
function renderCardRun(tab, all) {
  return tab
    ? `<a class="run" href="${escapeHtml(hrefFor(tab, all))}">${escapeHtml(tab.name)}</a> · `
    : '';
}

/**
 * How much of a body a card shows: the first six lines or 400 characters of it,
 * whichever comes first (D6). A card is for recognising an item, not for
 * reading it, and the bound is applied here rather than with a `max-height`
 * because a stylesheet still ships the whole sixty lines to the browser, where
 * Ctrl-F finds text nobody can see and a screen reader reads all of it.
 *
 * Rendered as markdown, the same way the thread renders it (D8). D6 kept it
 * plain — "half a rendered heading in a body cut mid-line is worse than none" —
 * and the walkthrough of 2026-09-19 overruled that from the page: "i thought
 * that part of the spec was to render the mark-down syntax, such as **bold**
 * and ## Title". A card showing the markers a body was written with is a card
 * showing the pilot's typing rather than what the pilot said.
 *
 * The cut is made in the pilot's text and the *excerpt* is then rendered, never
 * the other way round. `renderMarkdown` closes every block it opens whatever it
 * is given — an unterminated fence is the rest of the excerpt as code, a list
 * ends where its items do — so no cut of the source can leave an element
 * unclosed. A cut of the rendered HTML would sooner or later land inside a tag
 * or between a `<ul>` and its `</ul>`, and half a tag is not something escaping
 * can repair.
 */
const PREVIEW_LINES = 6;
const PREVIEW_CHARS = 400;

function renderPreview(body) {
  // Trailing blank space is not content, and most posted bodies end in a
  // newline: without this, six lines and a newline are seven to `split` and the
  // card would mark a body it is showing whole as having more to read.
  const text = String(body ?? '').replace(/\s+$/, '');
  const lines = text.split('\n').slice(0, PREVIEW_LINES).join('\n');
  // By character, not by code unit. An emoji is one character and two of those,
  // and a cut that landed between them would put half of one on the page, which
  // is a replacement character by the time the browser has it.
  const preview = [...lines].slice(0, PREVIEW_CHARS).join('');
  // The elision is the card's own mark and not the pilot's text, so it is a
  // block of the card's own after the excerpt rather than a line rendered with
  // it, which would put it inside the last paragraph and read as the pilot's
  // own sentence trailing off.
  const more = preview === text ? '' : '<p class="more">…</p>';
  return `<div class="preview md">${renderMarkdown(preview)}${more}</div>`;
}

/**
 * The options, on the card itself: a question answered in one click from the
 * list it is waiting in, without the trip into the thread and the trip back
 * (spec 3). It is the thread page's own `/reply` form with the box left off —
 * the same route, the same `choice` field, the same `replyFrom` joining it —
 * plus the page to come back to, because the 303 to the thread that a typed
 * reply wants is exactly the navigation this removes (D7).
 *
 * `back` is the deck's own address for the page being rendered and never the
 * `run` the browser sent, and `backPath` in the server checks it again as a
 * deck-local path before it reaches a `Location` (D7).
 *
 * A kind with no options, and a thread the pilot has closed, render no form:
 * there is nothing to click and an empty one would be a box asking for a reply
 * the card has no room to take.
 */
/**
 * What a card offers for an item of a kind the deck does not know — amended by
 * the user at Gate 2, 2026-09-23, where spec 27 read "the home-page card is
 * unchanged: a hand-off card has no form today and gains none". The deck has
 * no rendering and so no reply for such an item, so its card was the one thing
 * on the queue the user could do nothing with; Dismiss was on its thread page,
 * a page they had to open first for an item they were only ever going to be
 * finished with.
 *
 * Dismiss posts to the route the thread page's own Dismiss has always posted
 * to, unchanged, and acts at once with no confirm, because Reopen is the undo
 * (L26). The button is an option like any other — `name="choice"`, which the
 * route ignores — so the card marks itself taken through the mechanism spec 18
 * already has, and there is no second way of saying "this answer went".
 *
 * Reply is a plain link, not a box. A card is what the user skims and typing
 * belongs on the thread; `#reply` lands them under its newest message, at the box. It
 * is inside the row but is not a button, so `reply.mjs` disabling the row after a
 * press leaves it live — the thread is still worth reading once dismissed, and
 * Reopen is on it.
 */
const DISMISS = 'Dismiss';

const renderReplyLink = (item) => `<a class="to-thread" href="/thread/${encodeURIComponent(item.id)}#reply">Reply</a>`;

function renderCardQuick(item) {
  return [
    '<form method="post" action="/dismiss-item">',
    `<input type="hidden" name="id" value="${escapeHtml(item.id)}" />`,
    renderChoiceRow([renderChoice(DISMISS), renderReplyLink(item)]),
    '</form>',
  ].join('');
}

function renderCardAnswers(item, back) {
  if (!isOpen(item)) return '';
  if (!isKnownKind(item.kind)) return renderCardQuick(item);
  const renderer = rendererFor(item.kind);
  const choices = renderer.choices(item, renderer.cardReply ? [renderReplyLink(item)] : []);
  if (!choices) return '';
  return [
    '<form method="post" action="/reply">',
    `<input type="hidden" name="id" value="${escapeHtml(item.id)}" />`,
    `<input type="hidden" name="back" value="${escapeHtml(back)}" />`,
    choices,
    '</form>',
  ].join('');
}

/**
 * One item on a list: enough to recognise it, its options if it has any, and a
 * way into its thread. That way in is the title and only the title: the card
 * ended with an "open the thread" line as well, and the user asked at the
 * walkthrough of 2026-09-19 for it to go — "made redundant we can just click
 * the title of the thread instead". Two controls doing one thing is one of them
 * too many. Not the argument — the messages and the resolution are
 * the thread, and a card that carried them made a home page that was three
 * sixty-line threads long, which is what spec 2 is about. They are one click
 * away, whole, on the page that exists to hold them.
 *
 * The bar is the first thing on it, and the first thing on the line the card was
 * already opening with: five states in the spec's own words (line 4, A7), read
 * off the thread by `threadState`. It replaces the `open`/`closed` that line
 * used to end with, which is the same question answered with less of the answer
 * — `resolved` is that `closed`, and the other four are what the user could not
 * tell apart. Every list of cards gets it, and each one is inside the region the
 * page swaps in place, so it moves the moment a session picks the reply up
 * without the page being thrown away under whatever is half-typed (D1).
 */

/**
 * Which of three colours a state reads in: "the status in the preview of
 * 'the pilot has it' needs to be colour coded and also needs to be visible
 * inside the actual thread, not just the preview." Bucketed rather than given
 * five colours of their own, because the five words are one axis (who last
 * said something) and the user is asking about a coarser one (who has to act):
 * `posted` and `the pilot replied` both mean the user has not answered the
 * newest word yet, `the pilot has it` and `not picked up yet` both mean the
 * question is with the pilot either way, and `resolved` is simply closed.
 */
const STATE_BUCKETS = {
  posted: 'waiting',
  'the pilot replied': 'waiting',
  'qa replied': 'waiting',
  'teacher replied': 'waiting',
  'the pilot has it': 'pilot',
  'qa has it': 'pilot',
  'teacher has it': 'pilot',
  'not picked up yet': 'pilot',
  // A hand-off nobody has picked up (thread-kinds spec 19): a colour of its own, since it waits on neither.
  unacknowledged: 'unacknowledged',
  // A hand-off whose `/clear` waits on a live co-pilot (held-handoff spec 2): with the pilot's side, not unacknowledged.
  held: 'pilot',
  resolved: 'resolved',
};

/**
 * The bar's label, drawn from one function so a card and the thread page it
 * opens can never say the same state two different ways (spec: "colour coded
 * and also needs to be visible inside the actual thread"). `deck.css` colours
 * it by `data-state`, one of the three buckets above.
 */
function renderThreadState(item) {
  const state = threadState(item);
  return `<span class="state" data-state="${STATE_BUCKETS[state] ?? 'waiting'}">${escapeHtml(state)}</span>`;
}

/**
 * What a card and a thread's kind line call the item. A thread the user made
 * with Create is a user thread, named for who made it: "user generated",
 * styled as the kind line it sits in; a gate is "Gate 1" or "Gate 2".
 */
function renderKind(item) {
  if (item.kind === KIND_USER) return '<span data-kind="user">user generated</span>';
  if (Object.hasOwn(GATE_NAMES, item.kind)) return `<span data-kind="${item.kind}">${GATE_NAMES[item.kind]}</span>`;
  // A blocking question says so on its card and its page (ticket-states spec 17, S18).
  return escapeHtml(item.kind) + (isBlocking(item) ? BLOCKING_BADGE : '');
}

/** A gate's kind line says the gate as its note does (thread-kinds QA 5). */
const GATE_NAMES = { [KIND_GATE1]: 'Gate 1', [KIND_GATE2]: 'Gate 2' };

/**
 * A chain hand-off's own line (QA F2): it carries a stored ticket's spec
 * verbatim (`deck/chain.mjs`), so nothing in the body itself says what makes
 * this one different from the pilot's own context stash — that typing
 * `/clear` in the repository's terminal is what starts the run it names.
 * Only a chain hand-off carries `next`, so this sits beside the type note
 * every hand-off draws rather than in its `KIND_RENDERERS` entry.
 */
function renderChainNote(item) {
  if (item.kind !== KIND_HANDOFF || typeof item.next !== 'string') return '';
  return '<p class="chain-note">Typing <code>/clear</code> in this repository\'s terminal starts this run.</p>';
}

/** The type note (thread-types-phase spec 2): one line of the deck's own words, on card and page. */
function renderTypeNote(item) {
  const note = noteFor(item);
  return note ? `<p class="type-note">${escapeHtml(note)}</p>` : '';
}

function renderCard(item, { tab = null, back = OVERVIEW_HREF, all = false, items } = {}) {
  return [
    // A settled thread is only ever on a page the toggle is on, and it is there
    // to be looked up rather than worked through, so it is drawn a step back
    // from the queue it is listed under (`deck.css`). The bar already says
    // `resolved`; this is so that which is which is one glance and not a read.
    // Its ticket's accent (ticket-state-accents spec 3, L11): the stripe. The card sits inside the queue region, never one.
    `<article${isOpen(item) ? '' : ' class="settled"'} data-accent="${accentOf(item, items)}">`,
    `<span class="kind">${renderThreadState(item)} · ` +
      `${renderCardRun(tab, all)}${renderKind(item)} · ${renderTime(lastSaidAt(item))}${renderTicketOf(item, items)}</span>`,
    `<h2><a href="/thread/${encodeURIComponent(item.id)}">${titleOf(item, items)}</a></h2>`,
    renderChainNote(item),
    renderTypeNote(item),
    renderPreview(item.body),
    renderAsked(item, items),
    renderCardAnswers(item, back),
    renderCardClose(item, back),
    '</article>',
  ].join('');
}

/**
 * The control that takes a run off the deck by hand (spec 7, D13): the run's id
 * in the deck's own form post, behind the same trusted-origin guard as a reply.
 * It sends no `back` — `/dismiss` answers the front door, which is the one
 * address that is always somewhere.
 *
 * It is drawn on `/items` and nowhere else (L10). It used to stand in the status
 * panel as well, beside the rows it takes off the screen, and that is the
 * complaint this run began with: "A button that wipes a run sits in the panel
 * the user reads most". A page reached on purpose is where a control like this
 * belongs; the panel is where the work is read.
 *
 * The title is the whole of what dismissing means, because a button on a page
 * whose runs come and go on their own would otherwise read as deleting
 * something, and this deletes nothing: the run is back the moment it writes
 * anything, and its items are kept for ever (L14).
 *
 * It asks before it does it. "i pressed dismiss on 2 sessions, i want a
 * confirmation stage so that i dont accidentally end something early" — the
 * walkthrough of 2026-09-19. It confirms in place (handoff-failed-confirm L1): the run's
 * row blanks to the hidden step, and a browser running no script has the button
 * it always had, posting the form it always posted. The question is
 * the page's own and not `confirm()`: a dialog cannot stand in the line where
 * the button was, and the deck has no way to style or test one.
 *
 * The question names what goes (spec 8, A4). What goes is not the items — they
 * are on the very page the button is on — but the run's own rows: the status
 * table and the tree drawn from it leave the deck until the run posts again.
 * Saying so is the difference between a control the user can weigh and one they
 * have to guess at, and guessing is what "wipes a run" was.
 */
function renderDismiss(run) {
  return [
    '<form class="dismiss" method="post" action="/dismiss" data-in-place>',
    `<input type="hidden" name="id" value="${escapeHtml(run.id)}" />`,
    '<button type="submit" title="Take this run off the deck until it posts again" data-confirm>dismiss</button>',
    '<div class="step sure" hidden><p>Dismiss this run? Its status rows and tree leave the deck; ' +
      'its items stay on this page and it is back the moment it posts again.</p>',
    '<button type="submit">Confirm</button></div>',
    '</form>',
  ].join('');
}

/** The runs live on this deck right now — the answer to "whose questions are these?". */
function renderRuns(runs) {
  if (!runs.length) return '';
  const rows = runs
    .map(
      (run) =>
        `<li title="${escapeHtml(run.repo)}" data-confirm-row><span class="run">${escapeHtml(run.name)}</span>` +
        `<span class="who"> · started ${renderTime(run.startedAt)}</span>${renderDismiss(run)}</li>`,
    )
    .join('');
  return `<section class="runs"><span class="kind">${runs.length} run${runs.length === 1 ? '' : 's'}</span><ul>${rows}</ul></section>`;
}

export {
  BLOCKING_BADGE, renderReplySlot, renderResolution, hrefFor, renderThreadState, renderKind, renderChainNote, renderTypeNote,
  renderCard, renderRuns,
};
