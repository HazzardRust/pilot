/**
 * The thread screen's `reply` region as data (rune-deck-ui S9, spec 3, 5, 6c): what the page's `REPLY` slot
 * offers (`renderReplySlot`, `renderReopenForm`), as the options the user can press, which of them confirm in
 * place, and whether the thread can be dismissed. `replyView` is pure; the posts are the Rune deck's `Action`s.
 */
import {
  ASSUME_DEFAULT, GATED_KINDS, HANDOFF_FAILED, KIND_AUDIT, KIND_CREW_HANDOFF, KIND_HANDOFF, KIND_LESSON, KIND_QUESTION,
  KIND_WALKTHROUGH, SIGN_OFF, TEACH_ME, isBlocking, isGate, isKnownKind, isOpen, isRecord,
} from '../items.mjs';

const NONE = { mode: 'none', options: [], dismiss: false };

const plain = (label) => ({ label, confirm: false });

/** `renderChoices`: the pilot's answers, a verdict's each confirmed; Assume the default on a blocking thread; Teach me last. */
function choices(item) {
  const verdict = GATED_KINDS.includes(item.kind);
  return [
    ...(Array.isArray(item.options) ? item.options : []).filter((o) => o !== TEACH_ME).map((label) => ({ label, confirm: verdict })),
    ...(isBlocking(item) ? [plain(ASSUME_DEFAULT)] : []),
    plain(TEACH_ME),
  ];
}

/** An item's own options as they stand (`renderOwnChoices`); a handoff's Handoff failed confirms (`renderHandoffChoices`). */
const own = (item) => (Array.isArray(item.options) ? item.options : []).map((label) => ({ label, confirm: label === HANDOFF_FAILED }));

/** Each kind's options, as `KIND_RENDERERS` draws them; a kind not there offers none. */
function optionsOf(item) {
  if (item.kind === KIND_QUESTION || GATED_KINDS.includes(item.kind)) return choices(item);
  if (item.kind === KIND_WALKTHROUGH) return [{ label: SIGN_OFF, confirm: true }];
  if ([KIND_AUDIT, KIND_LESSON, KIND_HANDOFF, KIND_CREW_HANDOFF].includes(item.kind)) return own(item);
  return [];
}

/**
 * `query` is `{ id }`, the page's `REPLY` slot: an id the live deck does not hold (archived, or gone) offers
 * nothing; a closed thread offers Reopen; an open record nothing; an open thread its reply box, its options,
 * and Dismiss on a gate or an unknown kind.
 */
export function replyView(reads, { id }) {
  const item = reads.items.find((each) => each.id === id);
  if (!item) return NONE;
  if (!isOpen(item)) return { mode: 'reopen', options: [], dismiss: false };
  if (isRecord(item)) return NONE;
  return { mode: 'reply', options: optionsOf(item), dismiss: !isKnownKind(item.kind) || isGate(item.kind) };
}

export default ({ reads, query }) => (query.screen === 'thread' ? replyView(reads, query) : null);
