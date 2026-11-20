/**
 * The thread screen's `reply` region as data (rune-deck-ui S9, spec 3, 5, 6c): what the page's `REPLY` slot
 * offers (`renderReplySlot`, `renderReopenForm`), as the options the user can press, which of them confirm in
 * place, which the page draws disabled (`locked`), whether Close sits beside Reply, and whether the thread can be
 * dismissed. `replyView` is pure; the posts are the Rune deck's `Action`s.
 */
import {
  ASSUME_DEFAULT, CLOSABLE_KINDS, GATED_KINDS, HANDOFF_FAILED, KIND_AUDIT, KIND_CREW_HANDOFF, KIND_HANDOFF, KIND_LESSON,
  KIND_QUESTION, KIND_WALKTHROUGH, NOT_YET, SIGN_OFF, TEACH_ME, chosenOf, isBlocking, isGate, isKnownKind, isOpen, isRecord,
  lastSaid,
} from '../items.mjs';

const NONE = { mode: 'none', options: [], dismiss: false };

/**
 * An option as the page draws it (`renderChoice`): `locked` is its `disabled`, set once the thread holds a press;
 * `recommended` its quiet "(recommended)" mark, which only the pilot's own answers carry.
 */
const option = (label, confirm, chosen, recommended = false) => ({ label, confirm, locked: chosen !== null, recommended });

/** `renderChoices`: the pilot's answers, a verdict's each confirmed; Assume the default on a blocking thread; Teach me last. */
function choices(item) {
  const verdict = GATED_KINDS.includes(item.kind);
  const chosen = chosenOf(item);
  // A signed gate keeps Not yet pressable until its landing is under way; after a Not yet, Sign off stays pressable.
  const withdrawable = isGate(item.kind) && chosen === SIGN_OFF && !['queued', 'running', 'landed', 'refused'].includes(item.landing?.state);
  const reopened = isGate(item.kind) && chosen === NOT_YET;
  const chosenFor = (label) => ((withdrawable && label === NOT_YET) || (reopened && label === SIGN_OFF) ? null : chosen);
  return [
    ...(Array.isArray(item.options) ? item.options : []).filter((o) => o !== TEACH_ME).map((label) => option(label, verdict, chosenFor(label), label === item.recommended)),
    ...(isBlocking(item) ? [option(ASSUME_DEFAULT, false, chosen)] : []),
    option(TEACH_ME, false, chosen),
  ];
}

/** An item's own options as they stand (`renderOwnChoices`); a handoff's Handoff failed confirms (`renderHandoffChoices`). */
function own(item) {
  // A lesson's trial press locks its row only until an agent answers it (`renderLessonChoices`).
  const chosen = item.kind !== KIND_LESSON || lastSaid(item)?.from === 'user' ? chosenOf(item) : null;
  return (Array.isArray(item.options) ? item.options : []).map((label) => option(label, label === HANDOFF_FAILED, chosen));
}

/** Each kind's options, as `KIND_RENDERERS` draws them; a kind not there offers none. */
function optionsOf(item) {
  if (item.kind === KIND_QUESTION || GATED_KINDS.includes(item.kind)) return choices(item);
  if (item.kind === KIND_WALKTHROUGH) return [option(SIGN_OFF, true, chosenOf({ ...item, options: [SIGN_OFF] }))];
  if ([KIND_AUDIT, KIND_LESSON, KIND_HANDOFF, KIND_CREW_HANDOFF].includes(item.kind)) return own(item);
  return [];
}

/**
 * `query` is `{ id }`, the page's `REPLY` slot: an id the live deck does not hold (archived, or gone) offers
 * nothing; a closed thread offers Reopen; an open record nothing; an open thread its reply box, its options,
 * Close on a question or a user thread (`renderSend`), and Dismiss on a gate or an unknown kind. A box that posts
 * carries its thread's `id`, the page's form `action`: a press posts there, never to a thread the window moved to.
 */
export function replyView(reads, { id }) {
  const item = reads.items.find((each) => each.id === id);
  if (!item) return NONE;
  if (!isOpen(item)) return { mode: 'reopen', id, options: [], dismiss: false };
  if (isRecord(item)) return NONE;
  const view = { mode: 'reply', id, options: optionsOf(item), dismiss: !isKnownKind(item.kind) || isGate(item.kind) };
  return CLOSABLE_KINDS.includes(item.kind) ? { ...view, close: { confirm: true } } : view;
}

export default ({ reads, query }) => (query.screen === 'thread' ? replyView(reads, query) : null);
