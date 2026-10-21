# A finished run hands off only over the context mark

Ticket `itm_22ad234ca009` · thread `itm_46f0fcf94bc3` · slug `handoff-over-mark` · base `pilot` 26547862

## 1. Problem

> the pilot /clear'd itself because a red run finished - i dont want that. i could be working on many small red runs and i might not need to /clear.

> lets have it not post the handoff under the mark maybe?

#445's clean finish made the daemon post the chain hand-off `itm_ba826fc2fd53`, and `pilot run` typed `/clear`,
while the session still held three red tickets and a co-pilot. A finish is not a full context: the session
should clear only when the context guard says it is full.

## 2. Spec

Agreed by the user on `itm_e307ffa50bdc`, line 4 included.

| # | Behaviour | Evidence |
| --- | --- | --- |
| 1 | A clean finish while the session is under the guard's advisory mark posts no hand-off: the chain takes the head ticket live itself, in the same tick as today, and the `deck_status` finish reply tells the same session it holds that ticket. With no hand-off item, `pilot run` types no `/clear`. | `chain.test.mjs`: reading under the mark gives `{ handoff: null, reason: 'under the mark', taken: <id> }`, no item posted, the head live; `status-run.test.mjs`: the reply names the taken id; `run.test.mjs`: `clearOnce` types nothing; QA on a scratch deck: the Tickets tab shows the head live, no new hand-off, the terminal not cleared. |
| 2 | Over the mark, today's behaviour stands: the chain posts "Next run: …", takes the ticket, and the wrapper clears once. | The existing chain and run tests green with the reading over the mark; QA: one hand-off, one `/clear`. |
| 3 | The chain reads the guard's own mark: `hooks/context-size-guard.js` answers "past the advisory here?" for a directory, so the branch and the guard cannot disagree and no number is restated in `deck/`. | A test builds snapshots at the guard's own advisory minus and plus one token and sees the branch flip; a grep pin finds no `225000`/`225,000` under `deck/`. |
| 4 | No reading (no status line, no entry for the directory) counts as over the mark: hand-off as today. | `chain.test.mjs`: a reader returning null posts a hand-off. |

Cannot mean here: a yellow ticket taken in place (`nextTicketOf` never picks yellow, `deck/items.mjs`); the
start path (`chainNext(repo, { atStart: true })`, a fresh `pilot run`) has no context to measure and is unchanged.

## 3. Findings

- `deck/chain.mjs:66` `chainNext(repo, { atStart })`: the one place a finish becomes a hand-off; posts the
  `handoff` and `takeTicket(head.id)` in one synchronous tick. Called from `deck/server.mjs:924` on any
  `deck_status` with `finished`, and `:1673` at `pilot run` start.
- `deck/server.mjs:924-928`: the finish reply is one line, `D<n>: <k> slices saved; <mirror>.` (spec 22.2: paid in the pilot's context).
- `deck/run.mjs:372` `clearOnce`: types `/clear` only for a `handoff` item `pickup` finds (`:382`); no item, no clear. No code change needed.
- `hooks/context-size-guard.js:68-127`: `ADVISORY_TOKENS`, `HARD_TOKENS`, `marksFor(size)`; `:249` `deckReading`
  reads `~/.claude/context-usage-state.json` `decks[<dir>]` (`ctx` %, `session_id`), written by
  `hooks/context-usage-statusline.js:128` `decksWith`; `:269` `reading` converts % with `PILOT_REFERENCE_WINDOW`.
  Exports today: `mainRepoOf, ownTranscript, safeAgentType, run, statusRows`. Tests: `hooks/test/context-size.test.js`.
- Precedent for ESM deck code importing CJS hook code: `deck/audit.mjs:12` imports `hooks/lib/atomic-write.js`.
- `agents/pilot.md:186` "With no ticket live, `deck_ticket take` the deck's next"; `:351` Gate 1 sign-off "take the next
  ticket, same session": the in-place behaviour this extends to a finish. `:68` the finish call.
- ADRs: 0010 (guard advises, never blocks), 0060 (the chain takes a ticket instead of resolving it), 0089 (a hand-off waits for the co-pilot's release).

### Seams

| Seam | Interface | Folded behind it | Category |
| --- | --- | --- | --- |
| `hooks/context-size-guard.js` | `pastAdvisoryAt(dir, snapshot?) -> boolean \| null` | the snapshot path, the `decks` lookup by `samePath`, % to tokens, `marksFor(...).advisory` | Local-substitutable (a JSON file under the home directory) |
| `deck/chain.mjs` | `chainNext(repo, { atStart?, pastMark? }) -> { handoff, reason?, taken? }` | the under-mark branch and its take; `pastMark` defaults to the guard's `pastAdvisoryAt` | In-process |
| `deck/server.mjs` `deck_status` | the finish reply line | appends `took <id> live here` when `taken` | In-process |
| `deck/run.mjs` `clearOnce` | unchanged | nothing (pinned only) | In-process |

Deletion test: `chainNext` earns its keep (the rule in one place); `pastAdvisoryAt` keeps the marks in the
guard's one file, its reason to exist. No fold slice: nothing shallow to merge.

## 4. Ubiquitous language

- **The mark**: the guard's advisory mark for the pilot's session, `marksFor(PILOT_REFERENCE_WINDOW).advisory`; owned by `hooks/context-size-guard.js` alone.
- **Reading**: the status line's `decks[<dir>].ctx` for the main checkout, as the guard converts it.
- **Hand-off**: the `handoff` item the chain posts; the only thing `pilot run` clears on.
- **In place**: the head ticket taken live in the session that finished, no `/clear`.
- **Finish**: a `deck_status` call setting `finished` to the clean value.

## 5. Locked decisions

| # | Decision | Rationale | Rejected |
| --- | --- | --- | --- |
| L1 | The chain still takes the head ticket under the mark; only the hand-off post is skipped. | One take, one tick, one place (ADR 0060); the Tickets tab shows it at once. | The pilot takes it by `deck_ticket take`: a clause in `agents/pilot.md` (0.25 tokens headroom) and a step that can be forgotten. |
| L2 | The session learns it from the finish reply line, not a definition clause. | Zero bytes in `agents/pilot.md`; the reply is already read on that call. | A pilot.md "Ending a run" clause. |
| L3 | The guard exports `pastAdvisoryAt`; the chain imports it through `createRequire`. | Spec 3: the number lives once; `deck/audit.mjs` already imports hook code. | Copying the constant into `deck/`; the guard writing a verdict file on every tool call. |
| L4 | The daemon reads the directory's entry without a session check. | The daemon does not know the finishing session's id; the main checkout's entry is written by the session working there every turn. Worst case (two sessions in one directory) picks between two recoverable outcomes. | Carrying the session id on the finish call: a new `deck_status` field and author-hook work. |
| L5 | The start path (`atStart`) is untouched. | A starting session has no context to measure. | Gating the start too. |
| L6 | Grilling depth: recommended forks (user, `itm_a5e614cbb377`). | The user's answer. | The full tree. |
| L7 | QA environment: a scratch deck on a free port with a temporary store, a seeded red ticket with a queued head ticket behind it; the finish driven under the mark (no hand-off, head taken by the same session) and over it (hand-off, one `/clear`). Never the deck on 4321 (user, `itm_a8e61cc82080`). | The user's answer. | The live deck. |
| L8 | ADR "A finish hands off only over the context mark", amending 0060's chain; numbered next free at landing (0113, 0114 taken; 0115 expected). | Structural change to the chain. | No ADR. |
| L9 | No reading counts as over the mark: hand off as today (spec 4; agreed on `itm_e307ffa50bdc`). | With no reading the guard is silent too, so in place would mean nothing ever clears that session; the cost is one `/clear` in the rare no-reading case. | Always in place. |

## 6. Assumed decisions

None open. A1 (no reading counts as over the mark, spec 4) was put in `itm_e307ffa50bdc` and agreed with the spec: L9.

## 7. Out of scope

The guard's numbers and notices; `pilot handoff` at the hard mark; the co-pilot's hold (ADR 0089); the
`needed` finish (already no chain); any `agents/pilot.md` text; the start path.

## 8. Slices

Width 1; longest stem 1

One slice: spec 2 and 4 are today's path, kept by the under-branch firing only on `pastMark(repo) === false`, so a separate slice would have no red step.

| Slice | Title | Spec | Files owned | After | Reviewers | File |
| --- | --- | --- | --- | --- | --- | --- |
| S1 | A finish under the mark takes the next ticket in place | 1-4 | `hooks/context-size-guard.js`, `hooks/test/context-size.test.js`, `deck/chain.mjs`, `deck/server.mjs`, `deck/test/chain.test.mjs`, `deck/test/status-run.test.mjs`, `deck/test/run.test.mjs`, ADR (new), `docs/adr/README.md` | – | `pilot:typescript-reviewer`, `pilot:security-reviewer` | [S1](slices/S1.md) |

## 9. Acceptance evidence

On a scratch deck (L7), a red ticket finishing with a green head queued behind it:
1. Under the mark: the finish reply reads `took <id> live here`; the Tickets tab shows the head live; no "Next run:" item; the `pilot run` terminal is not cleared.
2. Over the mark: one "Next run: …" hand-off; the wrapper types one `/clear` and the first prompt.
3. Snapshot entry removed: as 2.
4. `git grep -n "225000\|225,000" deck/` prints nothing.

## 10. Status

| Slice | State | Branch | PR | Worktree | After | Spec |
| --- | --- | --- | --- | --- | --- | --- |
| S1 | planned | – | – | – | – | 1-4 |
| handoff-over-mark | planned | design/handoff-over-mark | – | `C:/Users/Hazzard/Projects/pilot-design-handoff-over-mark` | – | 1-4 |

Successor: spec agreed (`itm_e307ffa50bdc`); nothing assumed; post Gate 1 from this branch's tip.
