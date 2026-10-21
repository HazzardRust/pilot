/**
 * The thread page's parts, its forms and the per-kind renderers (audit-f1-f7 S16, L9).
 * Moved whole from `deck/ui/render.mjs`, which is now the facade over its siblings; every
 * byte of HTML still passes through `escapeHtml` or `renderMarkdown` (see `render-pages.mjs`).
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  ASSUME_DEFAULT,
  CLOSABLE_KINDS,
  GATED_KINDS,
  HANDOFF_FAILED,
  KIND_AUDIT,
  KIND_CREW_HANDOFF,
  KIND_GATE1,
  KIND_GATE2,
  KIND_HANDOFF,
  KIND_LESSON,
  KIND_QUESTION,
  KIND_REPORT,
  KIND_SIGNOFF,
  KIND_USER,
  KIND_WALKTHROUGH,
  SIGN_OFF,
  NOT_YET,
  TEACH_ME,
  askFor,
  authorKind,
  isBlocking,
  isOpen,
  chosenOf,
  isGate,
  extraFieldsFor,
  lastSaid,
  messagesOf,
  standingOf,
  waitingOn,
  ticketWornBy,
  KIND_TICKET,
  gate2Blockers,
  replyPrompt,
  repoKey,
  stepParts,
  OWNER_KINDS,
} from '../items.mjs';
import { escapeHtml, renderMarkdown, renderMarkdownLine, renderUrl } from './markdown.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));

const readUiFile = (name) => fs.readFileSync(path.join(HERE, name), 'utf8');

/**
 * A template with its `<!--SLOT-->` comments filled in. Substitution is
 * `split`/`join` rather than `String.replace`, which would read `$&` and `$'`
 * in the *replacement* as instructions — and the replacement here is made of
 * text the user typed.
 *
 * The stylesheet belongs to every *page*, so it is filled in here rather than
 * passed by each caller, and it is filled in *first*: a slot name that turned
 * up in the pilot's or the user's own text would arrive in a later value and
 * never be looked at again. The script is not a slot any more: every page
 * loads `/ui/deck.mjs` as a module the daemon serves (ADR 0030, which
 * supersedes D2). A fragment carries no slot, so a template that does not ask
 * for one does not read it: `strips.html` is rendered once per page and would
 * otherwise read the stylesheet a second time for no effect.
 */
const PAGE_FILES = { CSS: 'deck.css' };

export function renderTemplate(name, slots) {
  let html = readUiFile(name);
  for (const [slot, file] of Object.entries(PAGE_FILES)) {
    const marker = `<!--${slot}-->`;
    if (html.includes(marker)) html = html.split(marker).join(readUiFile(file));
  }
  for (const [slot, value] of Object.entries(slots)) {
    html = html.split(`<!--${slot}-->`).join(value);
  }
  return html;
}

/**
 * A moment on the page: the stamp the store holds, in the one element a browser
 * can read a date out of. The text is that same stamp, because it is what a page
 * whose script has not run — or cannot — has to show, and `time.mjs` replaces it
 * with "3 min" the moment the script does run (D11, spec 7).
 *
 * Nothing relative is computed here, on purpose. Under D1 the page is no longer
 * re-rendered on a timer, so a reading rendered on the server would be right the
 * once and wrong from then on with nothing left to correct it.
 */
function renderTime(when) {
  const stamp = escapeHtml(when ?? '');
  return `<time datetime="${stamp}">${stamp}</time>`;
}

// --- the parts of a thread -------------------------------------------------

/**
 * The byline of a crew message: the kind that wrote it, in that kind's colour
 * (spec 1; L3, L4, A4). Read back through `authorKind` so the class is always one
 * of the known kinds whatever is in the store, and `pilot` for a message stored
 * before authors were, which is what it read as then.
 */
function renderByline(author, after = '') {
  const kind = author === undefined ? 'pilot' : authorKind(author);
  return `<span class="who by-${kind}">${kind}${after}</span>`;
}

/**
 * Who has taken a user's reply (crew-waits spec 9, 10; L7): "Seen by qa · <time>" under it, or
 * "Seen by qa and pilot" for a Sign off both kinds took. Drawn from `deliveredTo` and
 * `deliveredAt`, which the store already holds. Every name is read back through
 * `OWNER_KINDS`, so a hand-edited store cannot put markup on the page, and a reply with no
 * known name left draws nothing.
 */
function renderSeenBy(message) {
  if (message.from !== 'user' || !message.deliveredAt) return '';
  const kinds = [...new Set([message.deliveredTo].flat())].filter((kind) => OWNER_KINDS.includes(kind));
  if (kinds.length === 0) return '';
  const names = kinds.length > 1 ? kinds.join(' and ') : `${kinds[0]} · ${renderTime(message.deliveredAt)}`;
  return `<p class="type-note seen-by">Seen by ${names}</p>`;
}

/**
 * One message in the argument, its text as markdown (D8). A `<div>` and no
 * longer a `<p>`: a rendered message is blocks — paragraphs, a list of dot
 * points, a fenced command — and a `<p>` holding a `<p>` is a paragraph the
 * browser closes early, taking the rest of the message out of the box the border
 * is drawn around. The `<br />` after the byline went with it, because the
 * first block already starts a line of its own.
 */
function renderMessage(message) {
  const when = ` · ${renderTime(message.repliedAt)}`;
  // The deck's own line (a yield, a landing line) is the store's, never a crew kind's (blocked-yellow-yields Q4).
  const who = message.from === 'user'
    ? `<span class="who">you${when}</span>`
    : message.from === 'deck' || message.author === 'deck' ? `<span class="who by-deck">deck${when}</span>` : renderByline(message.author, when);
  // A Handoff failed pressed after the pilot acknowledged says when it was picked up (L8).
  const pickedUp = typeof message.pickedUpAt === 'string'
    ? `<p class="type-note">Picked up ${renderTime(message.pickedUpAt)} by the pilot; nothing failed.</p>`
    : '';
  return `<div class="reply md ${message.from === 'user' ? 'from-user' : 'from-pilot'}">` +
    `${who}${renderMarkdown(message.text)}${pickedUp}${renderSeenBy(message)}</div>`;
}

const renderMessages = (item) => messagesOf(item).map(renderMessage).join('');

function renderRow(label, value) {
  return `<dt>${escapeHtml(label)}</dt><dd>${value}</dd>`;
}

/**
 * A walkthrough's steps, as the "do this / correct result" pairs the user asked
 * for (spec 6). The split is `stepParts` — the first arrow in the step, nothing
 * stored and nothing added to the tool schema (D9) — and the two halves are two
 * spans in one grid row, so the instructions read down the left of the list and
 * what should happen reads down the right.
 *
 * A step with no arrow renders one span, and `deck.css` gives it the whole row:
 * "reload" has no correct result worth writing down, and a blank second column
 * beside it would read as one the pilot forgot.
 *
 * The halves go through `renderMarkdownLine`, so a step naming a button as
 * `**Done**` or a command as `npm test` reads the way the body above it does. It
 * is the inline rules only: the shape here is the list's, not the pilot's.
 */
function renderSteps(screens) {
  const items = screens.map((screen) => {
    const { instruction, result } = stepParts(screen);
    return (
      `<li><span class="step do">${renderMarkdownLine(instruction)}</span>` +
      (result === null ? '' : `<span class="step result">${renderMarkdownLine(result)}</span>`) +
      '</li>'
    );
  });
  return `<ol class="steps">${items.join('')}</ol>`;
}

/** What a walkthrough is: where it runs from, where to go, who to be, and what to do there. */
function renderWalkthroughDetail(item) {
  const rows = [
    item.dir === undefined ? '' : renderRow('working directory:', code(item.dir)),
    item.url === undefined ? '' : renderRow('URL', renderUrl(item.url)),
    item.login === undefined ? '' : renderRow('Login', escapeHtml(item.login)),
    item.screens === undefined ? '' : renderRow('Steps', renderSteps(item.screens)),
  ].join('');
  return rows ? `<dl class="detail">${rows}</dl>` : '';
}

const code = (value) => `<code>${escapeHtml(value)}</code>`;
const threadLink = (id) => `<a href="/thread/${encodeURIComponent(id)}">${escapeHtml(id)}</a>`;

/** A title the deck places in a line, set off from it (deck-title-prose L2, L8): escaped, in the one `ref` element. */
const setOff = (text) => `<span class="ref">${escapeHtml(text)}</span>`;

/** An item's link (a ticket's, a question's): its title as the text, its id in the address, both from the items the page holds; set off (L2). */
const ticketLink = (ticket, cls = '') =>
  `<a class="ref${cls ? ` ${cls}` : ''}" href="/thread/${encodeURIComponent(ticket.id)}">${escapeHtml(ticket.title)}</a>`;
const ticketNamed = (items, id) => items.find((each) => each.kind === KIND_TICKET && each.id === id);

/**
 * Deck prose that may name items by id, as HTML (deck-title-prose spec 2, 3; L5): escaped first, then each
 * id of an item the page already holds becomes its title in the one `ref` link; an id it does not hold
 * stays as written. Ids are hex, so escaping never touches one.
 */
function withTitles(text, items) {
  // A `/thread/<id>` path is the item's link as a whole (report-record QA F4), not a half path before one.
  return escapeHtml(text).replace(/(\/thread\/)?\b(itm_[0-9a-f]{12})\b/g, (said, _path, id) => {
    const item = items.find((each) => each.id === id);
    return item ? ticketLink(item) : said;
  });
}

/**
 * An item's title as HTML (deck-title-prose L3): a chain hand-off whose stored title is still exactly
 * `Next run: ‹its ticket's title›` sets that ticket off; any other title, a renamed ticket's included, is plain.
 */
function titleOf(item, items) {
  const ticket = item.kind === KIND_HANDOFF ? ticketNamed(items, item.next) : undefined;
  return ticket && item.title === `Next run: ${ticket.title}` ? `Next run: ${setOff(ticket.title)}` : escapeHtml(item.title);
}

/** A card's ticket line (deck-press-feedback spec 5, L5): the ticket's title as a link; nothing when it is absent or merged away. */
function renderTicketOf(item, items) {
  const ticket = ticketNamed(items, item.ticket);
  return ticket && ticket.mergedInto === undefined ? ` · ${ticketLink(ticket, 'ticket')}` : '';
}

/** A thread page's ticket line (ticket-state-accents spec 8): the ticket it wears and where that ticket stands. */
function renderTicketStanding(item, items, lanes) {
  const ticket = item.kind === KIND_TICKET ? undefined : ticketWornBy(item, items);
  if (!ticket) return '';
  // A ticket stored without a repository has no co-pilot entry; `repoKey` would throw on it.
  const coPilot = typeof ticket.repo === 'string' ? lanes.coPilots[repoKey(ticket.repo)] ?? null : null;
  const standing = standingOf(ticket, items, coPilot);
  return ` · ${ticketLink(ticket, 'ticket')} <span class="standing">${standing === 'paused' ? `paused on ${escapeHtml(waitingOn(ticket, items))}` : standing}</span>`;
}

/**
 * How each gate field is drawn (thread-kinds spec 13, L5): its label and its value, every
 * value escaped. The slice table is the pilot's pipe table, drawn through `renderMarkdown`
 * so it reads as a table; a PR posted as `#n` has no repository URL to link to.
 */
const GATE_ROWS = {
  artefact: ['Artefact', code],
  sha: ['SHA', code],
  locked: ['Locked', (count) => escapeHtml(String(count))],
  slices: ['Slices', (table) => `<div class="md">${renderMarkdown(table)}</div>`],
  sliceCount: ['Slice count', (count) => escapeHtml(String(count))],
  surface: ['Surface', () => 'yes: a walkthrough is owed'],
  branch: ['Branch', code],
  pr: ['PR', renderUrl],
  walkthrough: ['Walkthrough', threadLink],
  ticket: ['Ticket', (id, items) => { const ticket = ticketNamed(items, id); return ticket ? ticketLink(ticket) : threadLink(id); }],
};

/**
 * The blocking items a gate2 waits on (deck-press-feedback spec 4, L4), each a link to its thread,
 * read from `gate2Blockers`, the rule its press reads (yellow-lane L3), so one that closes leaves
 * the list. Nothing for any other kind, or a gate2 with no ticket or none open.
 */
function renderAsked(item, items) {
  if (item.kind !== KIND_GATE2) return '';
  const blocking = gate2Blockers(items, item.ticket);
  const asked = items.filter((each) => blocking.includes(each.id));
  if (!asked.length) return '';
  // One the user has answered last is still open until its owner closes it, so it says so.
  const answered = (question) => (lastSaid(question)?.from === 'user' ? ' (answered, waiting on the pilot)' : '');
  const links = asked.map((question) =>
    `${ticketLink(question)}${answered(question)}`);
  return `<div class="asked">Waits on: ${links.join(', ')}</div>`;
}

/** A gate's evidence, in its kind's SPECS order, as the block a walkthrough's fields are drawn in. */
function renderGateDetail(item, items) {
  const rows = extraFieldsFor(item.kind)
    .filter((name) => Object.hasOwn(GATE_ROWS, name) && item[name] !== undefined)
    .map((name) => renderRow(GATE_ROWS[name][0], GATE_ROWS[name][1](item[name], items)))
    .join('');
  return (rows ? `<dl class="detail">${rows}</dl>` : '') + renderAsked(item, items);
}

/**
 * One reply, offered as a button. `formnovalidate` so that picking it is not
 * blocked by the empty reply box beside it; the box stays required for a reply
 * typed by hand. `className` is how a button the deck offers itself is told
 * apart from an answer the pilot wrote; an answer carries none.
 */
function renderChoice(option, recommended, className = '', chosen = null, trigger = false) {
  const mark = option === recommended ? ' <span class="quiet">(recommended)</span>' : '';
  // A remembered press is drawn the way `reply.mjs`'s `markTaken` draws a live one:
  // that option `sent`, and the whole row disabled until the thread closes (L11).
  const names = [className, option === chosen ? 'sent' : ''].filter(Boolean).join(' ');
  const classes = names ? ` class="${names}"` : '';
  const locked = chosen === null ? '' : ' disabled';
  return `<button type="submit" name="choice" value="${escapeHtml(option)}"${classes}${locked}${trigger ? ' data-confirm' : ''} formnovalidate>` +
    `${escapeHtml(option)}${mark}</button>`;
}

const renderChoiceRow = (buttons) => `<div class="choices">${buttons.join('')}</div>`;

/**
 * A verdict's option, confirmed in place (handoff-failed-confirm spec 5, L1): the option as a trigger in a
 * confirm row of its own, whose hidden step names it and carries a Confirm posting it. "add a confirmation
 * step to any sign off button, i can see myself easily accidentally clicking it" — the user, 2026-09-21.
 * Hidden, so with no script one press posts (A3). Its own row because `confirm.mjs` confirms the row's one
 * `.step.sure`, and each option's Confirm carries that option.
 */
const renderConfirmed = (option, chosen, recommended = null) =>
  `<div data-confirm-row>${renderChoice(option, recommended, '', chosen, true)}` +
  `<div class="step sure" hidden><p>Send “${escapeHtml(option)}”?</p>` +
  `<button type="submit" name="choice" value="${escapeHtml(option)}"${chosen === null ? '' : ' disabled'} formnovalidate>Confirm</button></div></div>`;

/**
 * What a question or a sign-off offers in one click: the pilot's answers, and
 * then the deck's own "Teach me" (spec 17, D22). The teaching is last and
 * carries `teach`, because it is not one of the answers — picking it asks for
 * the decision to be explained and leaves the decision unmade — and it is
 * offered even when the pilot attached no options at all, since every decision
 * put to the user is one they may not understand yet.
 *
 * A verdict's options confirm in place and a question's do not (handoff-failed-confirm spec 5):
 * an answer to a question is a decision the pilot acts on and can be answered
 * again, and a verdict is the end of something. Teach me never confirms: it answers nothing.
 */
function renderChoices(item) {
  const options = Array.isArray(item.options) ? item.options : [];
  const chosen = chosenOf(item);
  const verdict = GATED_KINDS.includes(item.kind);
  // A signed gate keeps Not yet pressable (gate-stays-signed spec 2, L5) until its landing is queued, runs, lands or is refused (then the lander lands it again, lander L7).
  const withdrawable = isGate(item.kind) && chosen === SIGN_OFF && !['queued', 'running', 'landed', 'refused'].includes(item.landing?.state);
  // After a Not yet, Sign off stays pressable: only a Sign off press locks a gate's row.
  const reopened = isGate(item.kind) && chosen === NOT_YET;
  const chosenFor = (option) => ((withdrawable && option === NOT_YET) || (reopened && option === SIGN_OFF) ? null : chosen);
  return renderChoiceRow([
    // The deck appends its own teaching below, so an option spelled the same way is
    // dropped rather than drawn a second time as one of the answers.
    ...options
      .filter((option) => option !== TEACH_ME)
      .map((option) => (verdict ? renderConfirmed(option, chosenFor(option), item.recommended) : renderChoice(option, item.recommended, '', chosen))),
    // A blocking question's way to make it plain (ticket-states spec 17, S18).
    ...(isBlocking(item) ? [renderChoice(ASSUME_DEFAULT, null, 'assume', chosen)] : []),
    renderChoice(TEACH_ME, null, 'teach', chosen),
  ]);
}

/**
 * A walkthrough's one option: "Sign off", posted as the reply in a
 * click (D10). The same mechanism as a question's options and deliberately not a
 * new one — the same `/reply` route, the same `choice` field, the same
 * `replyFrom` joining it to anything typed as well — because the user who
 * followed the procedure and saw it all work should not have to type "it all
 * worked" to say so.
 *
 * It is not in `item.options`: a walkthrough takes no options from the pilot
 * (`items.mjs` SPECS) and this is the deck's own offer, not the pilot's.
 *
 * It confirms in place (handoff-failed-confirm spec 5), like a sign-off item's options — more
 * plainly than any of them, in fact, because this is the button that carries
 * the words the user named, and it is the last thing between a feature and
 * Gate 2.
 *
 * A sent Sign off is remembered as an option's press is (L11): drawn pressed and
 * locked until the thread closes, or a press that landed reads as one that did not.
 */
const renderWalkthroughChoices = (item) =>
  renderChoiceRow([renderConfirmed(SIGN_OFF, chosenOf({ ...item, options: [SIGN_OFF] }))]);

const nothing = () => '';

/**
 * An item's options as they stand, no Teach me and no confirm: an audit's `none`, picked
 * from rather than decided (L16), and a handoff's Handoff failed (thread-types-phase L4).
 * `extra` is whatever the row carries after them, a card's Reply link.
 */
const renderOwnChoices = (item, extra = [], chosen = chosenOf(item)) => {
  const options = Array.isArray(item.options) ? item.options : [];
  return renderChoiceRow([...options.map((option) => renderChoice(option, null, '', chosen)), ...extra]);
};

/**
 * A handoff's row (handoff-failed-confirm spec 1, L1, L3): Handoff failed is a trigger, and the row confirms in
 * place with the kind's sentence and a Confirm posting the same choice. Hidden, so with no script one press posts.
 */
const renderHandoffChoices = (item, extra = []) => {
  const ask = askFor(item.kind, item);
  if (!item.options?.includes(HANDOFF_FAILED)) return renderOwnChoices(item, extra);
  const chosen = chosenOf(item);
  const buttons = item.options.map((option) => renderChoice(option, null, '', chosen, option === HANDOFF_FAILED));
  return `<div class="choices" data-confirm-row>${[...buttons, ...extra].join('')}` +
    `<div class="step sure" hidden><p>${escapeHtml(ask)}</p>` +
    `<button type="submit" name="choice" value="${escapeHtml(HANDOFF_FAILED)}" formnovalidate>Confirm</button></div></div>`;
};

/** A lesson's trial press locks its row only until an agent answers it, so the next can be tried (ADR 0053). */
const renderLessonChoices = (item) => renderOwnChoices(item, [], lastSaid(item)?.from === 'user' ? chosenOf(item) : null);

/** The thread a lesson teaches, as a link to it: its body names the id (ADR 0053). */
const renderLessonSource = (item) => {
  const id = String(item.body ?? '').match(/\bitm_[0-9a-f]+\b/)?.[0];
  return id ? `<p class="quiet">Teaches <a href="/thread/${id}">${id}</a></p>` : '';
};

/**
 * The item-kind rendering boundary. A kind that is not in this table renders
 * generically — no detail block and no options — which is what A11 asks for and
 * what every kind invented after this slice gets without touching this file.
 */
const KIND_RENDERERS = {
  [KIND_QUESTION]: { detail: nothing, choices: renderChoices },
  [KIND_SIGNOFF]: { detail: nothing, choices: renderChoices },
  [KIND_GATE1]: { detail: renderGateDetail, choices: renderChoices },
  [KIND_GATE2]: { detail: renderGateDetail, choices: renderChoices },
  [KIND_WALKTHROUGH]: { detail: renderWalkthroughDetail, choices: renderWalkthroughChoices, detailFirst: true },
  // A closing report is a walkthrough's shape with nothing to sign off (spec 6).
  [KIND_REPORT]: { detail: renderWalkthroughDetail, choices: nothing },
  [KIND_AUDIT]: { detail: nothing, choices: renderOwnChoices },
  // A lesson's trial options, with no Teach me of its own (ADR 0053).
  [KIND_LESSON]: { detail: renderLessonSource, choices: renderLessonChoices },
  // A handoff's card carries Reply beside Handoff failed, as an unknown kind's card does.
  [KIND_HANDOFF]: { detail: nothing, choices: renderHandoffChoices, cardReply: true },
  [KIND_CREW_HANDOFF]: { detail: nothing, choices: renderHandoffChoices, cardReply: true },
};

const GENERIC_RENDERER = { detail: nothing, choices: nothing };

const rendererFor = (kind) => KIND_RENDERERS[kind] ?? GENERIC_RENDERER;

/**
 * Close, on an open question, beside Reply in the reply form's own last row
 * (spec 14, L17), confirmed in place (handoff-failed-confirm spec 6, L1): Close
 * is a trigger, the `.send` row its confirm row, and the hidden step its
 * sentence and a Confirm posting the close form. Hidden, so with no script
 * the trigger is a submit and one press posts (spec 14).
 *
 * Both buttons carry `form="close-<id>"` rather than sitting
 * inside the reply `<form>` a nested form cannot be: it ties each one to the
 * separate, otherwise empty form `renderCloseForm` writes after this one, so
 * the required textarea beside them can never block a Close and a Close can
 * never be read as whatever the reply box held (`renderDismissForm`'s rule).
 */
function renderCloseConfirm(item) {
  const to = `close-${escapeHtml(item.id)}`;
  // The pilot's default is one of the item's options, so it is named only where there are any (QA, 2026-10-10).
  const sentence = item.options?.length ? 'Close this thread? The pilot goes with its default.' : 'Close this thread?';
  return (
    `<button type="submit" form="${to}" data-confirm>Close</button>` +
    `<div class="step sure" hidden><p>${sentence}</p><button type="submit" form="${to}">Confirm</button></div>`
  );
}

/** The reply form's last line: Reply, and Close beside it on an open question or user thread. */
function renderSend(item) {
  const close = CLOSABLE_KINDS.includes(item.kind) ? renderCloseConfirm(item) : '';
  return `<div class="send"${close ? ' data-confirm-row' : ''}><button type="submit">Reply</button>${close}</div>`;
}

/** A gate's reply box once its Sign off stands (gate-stays-signed spec 4, A2): still a box, now for a comment. */
const SIGNED_GATE_LABEL = 'Signed off. The press stands; what you type is a comment for the pilot.';
const SIGNED_GATE_PLACEHOLDER = 'A comment for the pilot.';

function renderReplyForm(item) {
  const prompt = isGate(item.kind) && chosenOf(item) === SIGN_OFF
    ? { ...replyPrompt(item.kind), label: SIGNED_GATE_LABEL, placeholder: SIGNED_GATE_PLACEHOLDER }
    : replyPrompt(item.kind);
  return [
    '<form method="post" action="/reply" data-in-place>',
    `<input type="hidden" name="id" value="${escapeHtml(item.id)}" />`,
    `<label for="reply-text">${escapeHtml(prompt.label)}</label>`,
    `<textarea id="reply-text" name="text" rows="${prompt.rows}" placeholder="${escapeHtml(prompt.placeholder)}" required></textarea>`,
    rendererFor(item.kind).choices(item),
    renderSend(item),
    '</form>',
  ].join('');
}

/**
 * What a closed thread offers where the reply box was: one button, one click,
 * no confirm (spec 21). Dismissing a run asks first because it takes a tab away
 * from under somebody; reopening adds a thread back and the way out of it is
 * the pilot closing it again, so a confirm here would be a second press for
 * nothing.
 *
 * It goes in the `REPLY` slot rather than beside the resolution because that
 * slot is exactly "what the user may do on this thread next", and because the
 * slot is the thread page's alone — a card on the home page draws neither, and
 * so cannot reopen anything.
 */
function renderReopenForm(item) {
  return [
    '<form class="reopen" method="post" action="/reopen" data-in-place>',
    `<input type="hidden" name="id" value="${escapeHtml(item.id)}" />`,
    '<button type="submit">Reopen</button>',
    '</form>',
  ].join('');
}

/**
 * What an unknown kind's thread offers beside its reply box: one button, one
 * click, no confirm (S17, spec 27, A11). A kind the deck does not know gets no
 * reply from the pilot, so without this the item waited on the home queue and
 * in the status line's count until the pilot happened to read it — for a kind
 * it never replies to, that could be never. No confirm for the same reason
 * `renderReopenForm`'s own comment gives one none: the way back is that same
 * Reopen button, which spec 21 already gives every closed thread.
 *
 * Beside the reply form and not inside it, because the two are separate
 * actions on separate forms — the deck must not read a dismissal as whatever
 * the reply box happened to hold.
 */
function renderDismissForm(item) {
  return [
    '<form class="dismiss-item" method="post" action="/dismiss-item" data-in-place>',
    `<input type="hidden" name="id" value="${escapeHtml(item.id)}" />`,
    '<button type="submit">Dismiss</button>',
    '</form>',
  ].join('');
}

/**
 * The other half of Close (spec 7, spec 14, L17): an otherwise empty form,
 * named by id so `form=` on the buttons `renderCloseConfirm` drew inside the
 * reply form has somewhere of its own to post to. The pilot hears `Closed.`
 * and goes with its recommended default (L23); the undo is Reopen. Never
 * drawn on a signoff or walkthrough (L11). A card passes `back`, the page it
 * is on, so `/close` lands the user where they pressed it (L9); the thread
 * page passes none and lands on the thread.
 */
function renderCloseForm(item, back = null) {
  const backField = back ? `<input type="hidden" name="back" value="${escapeHtml(back)}" />` : '';
  return (
    `<form id="close-${escapeHtml(item.id)}" class="close" method="post" action="/close" data-in-place>` +
    `<input type="hidden" name="id" value="${escapeHtml(item.id)}" />${backField}</form>`
  );
}

/**
 * A user thread's card closes it without opening it (deck-polish spec 9, L9):
 * the thread page's own Close, confirm and all, posting `/close` with the
 * card's page as `back`. A user thread only: a question's Close stays on its
 * page, where the recommended default it hands the pilot can be read first.
 */
function renderCardClose(item, back) {
  if (item.kind !== KIND_USER || !isOpen(item)) return '';
  return `<div class="send" data-confirm-row>${renderCloseConfirm(item)}</div>${renderCloseForm(item, back)}`;
}

export {
  renderTime, renderByline, renderMessages, code, setOff, withTitles, titleOf, renderTicketOf,
  renderTicketStanding, renderAsked, renderChoice, renderChoiceRow, nothing, rendererFor, renderReplyForm,
  renderReopenForm, renderDismissForm, renderCloseForm, renderCardClose,
};
