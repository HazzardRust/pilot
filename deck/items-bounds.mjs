/**
 * The bounds and field shapes of the item vocabulary: the most options, screens and
 * slice characters an item may carry, the words the deck itself offers (`SIGN_OFF`,
 * `TEACH_ME`, `NOT_YET` and the rest), the shapes of the fields a kind may carry, and
 * `stepParts`. A leaf of `items.mjs`, which imports it and re-exports its public names:
 * it names no kind, so it imports nothing and no cycle can form (audit-f1-f7 S20).
 */


/**
 * The most options one item may offer. A question with nine answers is a
 * question that has not been thought through, and the page renders them as a
 * row of buttons the user has to read in one glance.
 */
export const MAX_OPTIONS = 8;

/**
 * The most steps one walkthrough may ask for. It was twelve while a walkthrough
 * covered one slice; since 2026-09-15 the QA agent posts one walkthrough for the
 * whole feature, a step-by-step procedure derived from the spec, and forty is
 * room for every behaviour of a feature in the order a user meets them without
 * being a page the user has to scroll to read.
 */
export const MAX_SCREENS = 40;

/**
 * The one thing a walkthrough offers in a click. It is a *reply* and not a
 * resolution (D10): only the pilot closes a thread (§3 Thread, ADR 0004), and
 * the user saying the procedure is done is what the pilot reads next, not the
 * end of the argument. The words live here rather than in the renderer because
 * the button on the page and the reply that comes back must be the same string,
 * and this module is where the deck's vocabulary is kept.
 *
 * It read "Walkthrough complete" until the walkthrough of 2026-09-19, where the
 * user asked for the button to *be* the sign-off — a QA procedure is the last
 * thing between a feature and Gate 2, and "complete" described the reading
 * rather than the verdict. What it means is therefore exact: pressing it with a
 * finding typed beside it sends the finding and signs nothing off, which is
 * `replyFrom` in `server.mjs` and the one place a choice and a typed reply do
 * not both count.
 */
export const SIGN_OFF = 'Sign off';

/** The deck's line on its own report (gate2-frees-lane spec 4): it wakes the pilot to add what only the pilot knows. */
export const REPORT_DUE = 'report due: add the findings and the human steps with a Findings: reply';

/**
 * What a question and a sign-off offer beyond their answers: one click that asks
 * for the decision to be taught before it is made (D22). A reply like any other,
 * for the same reason — the pilot reads it, hands the thread to the teacher and
 * the teaching arrives as a message in it, so nothing here is closed and nothing
 * new is stored. It lives beside `SIGN_OFF` because it is the same
 * kind of thing: words the deck itself offers, which the button on the page, the
 * reply that comes back and the pilot's hand-off rule must all agree on.
 */
export const TEACH_ME = 'Teach me';

/**
 * A blocking question's one-click way out (ticket-states spec 17, L22, S18): the store answers it
 * with the question's recommended option, as the user's reply, and makes it plain.
 */
export const ASSUME_DEFAULT = 'Assume the default';

/**
 * The two things the deck writes into a thread when the user reopens it (spec
 * 21). They are here for the same reason `SIGN_OFF` is: words the deck puts in
 * somebody's mouth have to be one string, because the page renders them, the
 * store writes them and `deck_wait` hands them to the pilot.
 *
 * `CLOSED_WITH` prefixes the pilot's own resolution, which moves into the
 * thread as the pilot's message when the item's `resolution` field is cleared —
 * so the history still reads "closed with X, reopened" and a second closing
 * cannot write over the first one's words. `REOPENED` is the user's line, and it
 * is the user's rather than the deck's because a reopening is the human at the
 * page disagreeing, which is exactly what a reply already is: the state bar, the
 * stop gate and a session parked in `deck_wait` all then read it correctly
 * without learning a third kind of message.
 */
export const CLOSED_WITH = 'Closed with:';
export const REOPENED = 'Reopened.';

/**
 * The resolution `dismissItem` writes (S17, spec 27, A9). Fixed rather than
 * typed, because a dismissal is not an argument settled — it is the human at
 * the item's own page saying "seen, done" about a kind the deck has no
 * rendering for, and there is nothing to explain about that beyond who did it.
 * That is also why the byline no longer names the pilot by default (A9): who
 * closed a thread now lives in these words, not in the byline that reads every
 * closed thread the same way.
 */
export const DISMISSED_BY_USER = 'Dismissed by the user.';

/**
 * What `closeItem` writes when the user presses Close on an open question
 * (spec 7, L12): the resolution, and the user's own line with a sequence
 * number, which is how a session parked in `deck_wait` hears it. The pilot
 * reads `CLOSED` as "go with your recommended default" (L23).
 */
export const CLOSED_BY_USER = 'Closed by you.';
export const CLOSED = 'Closed.';

/**
 * Either arrow, because the pilot writes whichever its keyboard reaches: a step
 * is "do this → this should happen" or "do this -> this should happen" (D9).
 * Matched without `g`, so it is the *leftmost* arrow of either kind that splits
 * the step and not whichever one this pattern happens to name first. A later
 * arrow belongs to what should happen, which is prose.
 */
const STEP_ARROW = /→|->/;

/**
 * A walkthrough step as the pair it reads as: what to do, and what should
 * happen once you have (D9). No arrow means one instruction and no expectation,
 * which is what most steps are — "reload" has no correct result worth writing
 * down. A trailing arrow with nothing after it is the same thing: the pilot
 * started a pair and did not finish it, and an empty second column would be the
 * deck rendering that as though it meant something.
 *
 * Derived, never stored. Nothing about this reaches `store.mjs` or the tool
 * schema, so every walkthrough already on a deck keeps rendering and a step
 * written before this existed simply has no result (A4).
 */
export function stepParts(step) {
  const text = String(step ?? '');
  const arrow = STEP_ARROW.exec(text);
  const result = arrow === null ? '' : text.slice(arrow.index + arrow[0].length).trim();
  return {
    instruction: (arrow === null ? text : text.slice(0, arrow.index)).trim(),
    result: result === '' ? null : result,
  };
}

/**
 * The most an item's `slice` may be. It is the bound a row of the status table
 * is held to as well (`deck/status.mjs` re-exports this one rather than keeping
 * a second number): the two are joined on, so a name one side would take and the
 * other would refuse could never match. It lives here because `status.mjs` reads
 * this module and not the other way round.
 */
export const MAX_SLICE_CHARS = 80;

/**
 * A field a kind carries beyond its title and body. `list` is the bound when
 * the field is a list of strings, and absent when it is one string.
 */
const URL_FIELD = { name: 'url' };
const LOGIN_FIELD = { name: 'login' };
const SCREENS_FIELD = { name: 'screens', list: MAX_SCREENS };

/**
 * The one field every kind carries: which slice of the run this item belongs to
 * (§3 — an item is "optionally attached to a slice"). Optional everywhere,
 * because the pilot's first questions are asked before there are any slices to
 * attach them to, and an item without one is still on the deck and still in the
 * queue. Slice 4's `Yours` column is the join on it, in `deck/status.mjs`.
 */
const SLICE_FIELD = { name: 'slice', most: MAX_SLICE_CHARS };

/**
 * The other half of what `Yours` is joined on: the repository the session that
 * posted this item was open in. The agent never writes it and is never asked
 * for it — `deck/client.mjs` adds it on the way out, the way it adds the run to
 * `deck_status` — because a slice called "4 status table" is the same four
 * words in every repository on this machine, and a join on the name alone puts
 * one feature's sign-off in every other feature's table.
 */
const REPO_FIELD = { name: 'repo' };

/** The ticket a chain hand-off starts, by id; how the lane tells a new run from a resumed one. */
const NEXT_FIELD = { name: 'next' };

/** The worktree whose deck a ticket is filed under (run-chaining spec 7); the store makes it the ticket's `repo`. */
const DIR_FIELD = { name: 'dir' };

/** The same `dir` on a walkthrough or a report: the absolute working directory its steps run from (L10). */
const WORKDIR_FIELD = { ...DIR_FIELD, shape: /^([/\\]|[A-Za-z]:[/\\])/, means: 'an absolute path' };

/** A gate's commit, case-blind; also the shape `deck/gate2-base.mjs` checks before git sees it. */
const SHA_FIELD = { name: 'sha', required: true, shape: /^[0-9a-f]{7,40}$/i, means: 'a commit sha' };

/** A sign-off's second button (A6): the verdict that keeps a gate open (A9). */
export const NOT_YET = 'Not yet';

export { SHA_FIELD, URL_FIELD, LOGIN_FIELD, SCREENS_FIELD, SLICE_FIELD, REPO_FIELD, NEXT_FIELD, DIR_FIELD, WORKDIR_FIELD };
