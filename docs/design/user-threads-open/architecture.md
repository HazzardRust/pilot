# User-made threads stay open until the user closes them

Ticket itm_5feb313ba8de · branch `design/user-threads-open` from `origin/pilot` 178c7e5 · merge: none (itm_72ecc40ebcec) · grilling depth: Forks (locked)

## 1. Problem

The user opened a thread with Create (itm_38b3049df6ba). The pilot answered it and closed it with
`deck_resolve`, so the user's follow-up landed on a closed thread. In their words: "hey can you
leave user generated threads open, no closing, make that a ticket. Users can close their own threads."

## 2. Spec

Agreed by the user on itm_042ab542360d.

| # | Behaviour | Evidence |
| --- | --- | --- |
| 1 | An agent's `deck_resolve` on a thread the user opened (kind `user`: Create, and the Tickets tab's `Add`) is refused by the deck with a line saying the user closes it and `deck_reply` answers it; the thread stays open and queued. The chat already refuses. | store test: `resolveItem` as `pilot` on a `createThread` item throws the line, the item has no `resolvedAt`, `isQueued` is true; the same call through the daemon's `deck_resolve` returns the refusal |
| 2 | The user's Close, on the thread page or the thread's card, is the only way a user thread closes (Reopen, and the user's own Remove of a deck tab, stay). | `close.test.mjs` 287 and 342 green unchanged; `create.test.mjs` 95 and 309 rewritten to the refusal and to `closeItem` |
| 3 | No hook tells the pilot to `deck_resolve` a user thread: the Stop gate's reason and the inbox notice give it the user-thread sentence instead, and a `deck_reply` alone ends the hold. | hook test: a user reply on a user thread blocks with the sentence and asks no close for it; after a `deck_reply` the stop passes; `inbox.test.js` 981 rewritten to `deck_reply` |
| 4 | The pilot's definition and the `deck_resolve` tool description say the same: a user thread is answered with `deck_reply`, never `deck_resolve`, and the user closes it. | wording pin in `scripts/test/pilot-agents.test.mjs`; `measure-prompt.test.mjs` green with its pins unmoved |

## 3. Findings

| Where | What |
| --- | --- |
| `deck/store.mjs:859` `resolveItem` | The one close an agent makes. Already refuses the chat (`NEVER_CLOSED`, :692), a non-owner, an unanswered blocking question, an unsigned gate. A `user` thread's owner is always `pilot` (`deck/items.mjs:552`), so today the pilot may close it. |
| `deck/server.mjs:885` | `deck_resolve` reaches `resolveItem` only here; a `DeckRefusal` returns to the agent as the tool's error. |
| `deck/store.mjs:1028` `closeItem` | The user's Close: `CLOSABLE_KINDS = [question, user]` (`deck/items.mjs:666`); writes `Closed.` with a seq so a parked wait wakes. |
| `deck/ui/render.mjs:465, 549, 561` | Close on the thread page and on a user thread's card, two-step confirm. Spec 2 needs no render change. |
| `deck/store.mjs:1782` `createThread` | Create and Add both make kind `user`; an agent cannot post one (:576). |
| `deck/store.mjs:2073` `removeDeck` | Archives every open item of a removed tab, user threads included: the user's press, kept. |
| `deck/store.mjs:756` `addReply` | A reply on a closed thread reopens it first: the follow-up was kept, but on a thread the pilot had ended. |
| `hooks/lib/deck.js:296, 321` | `awaitsPilot`/`unanswered`: a thread waits on the pilot only while the user spoke last, so a `deck_reply` already releases the Stop gate. |
| `hooks/stop-gate.js:136-180` | `reasonFor` tells the pilot to "close the thread with deck_resolve" for every non-gate thread, user threads included; gates get `GATE_SENTENCE` (`hooks/lib/deck.js:244`), the pattern to copy. |
| `hooks/inbox-alert.js:70-100, 174-178` | `notToClose` and the still-unanswered line carry the same `deck_resolve` sentence. |
| `agents/pilot.md:50-55` | "The chat ... Answer it with `deck_reply`, never `deck_resolve`." and "A thread the user opened with Create is queued until you `deck_resolve` it or the user closes it". |
| `deck/tools.mjs:234` | `deck_resolve`'s description: "Close a thread you own". |
| tests closing a user thread as an agent | `deck/test/create.test.mjs:95, 309`, `deck/test/notices.test.mjs:50-58`, `hooks/test/inbox.test.js:981`. |
| `skills/ticket-making/SKILL.md:18-21` | In an `Add` thread a *ticket* is closed with `deck_resolve`, not the thread: unaffected. |
| `scripts/adr-index.mjs` | `docs/adr/README.md` is generated; `adr-index.test.mjs` fails an ADR added without regenerating it. |

## 4. Ubiquitous language

- **User thread**: an item of kind `user`, made by Create or Add; never an agent's to post or close.
- **The chat**: kind `chat`, one per repository, closed by nobody.
- **Close**: the user's press (`closeItem`), resolution `CLOSED_BY_USER`.
- **Resolve**: an agent's `deck_resolve` (`resolveItem`).
- **User-thread sentence**: the one hook line saying a user thread is answered with `deck_reply` and closed by the user.

## 5. Locked decisions

| # | Decision | Rationale | Rejected |
| --- | --- | --- | --- |
| L1 | The refusal lives in `resolveItem`, beside the chat's, for every writer kind. | The one place every agent close passes; hooks and prompt only echo it. | A prompt-only rule: the incident was the pilot following its prompt. |
| L2 | The refusal is one `DeckRefusal` in the chat's shape: "item X is a thread the user opened: the user closes it from its page; answer it with deck_reply". | Same shape as `NEVER_CLOSED`; names the next move. | A new error class or code: nothing branches on it. |
| L3 | No change to `closeItem`, `CLOSABLE_KINDS` or the renderer. | Spec 2 is already true there. | Re-rendering Close: no gap found. |
| L4 | The hooks get `USER_THREAD_SENTENCE` in `hooks/lib/deck.js`, used exactly where `GATE_SENTENCE` is, and a user thread leaves the `deck_resolve` count. | Mirrors the gate pattern already pinned. | Leaving the wording: the hook would demand a call the deck refuses. |
| L5 | `pilot.md` folds the Create sentence into the chat's: both answered with `deck_reply`, never `deck_resolve`; the user closes a user thread. | Shorter than today; budget pins unmoved. | A new paragraph: costs tokens. |
| L6 | ADR 0109, "A user thread is closed only by the user". | Structural rule on who closes; 0105-0108 are taken. | Editing ADR 0033: accepted ADRs are not edited. |
| L7 | Two parallel stems with no shared file: S1 the deck, S2 the hooks and the prompt. | Disjoint files; S2's test needs no S1 behaviour. | One slice: two dominant risks (store rule, prompt budget). |
| L8 | Grilling depth: Forks. | Set by the user for this run. | – |
| L9 | An agent's `deck_resolve` on a user thread errors with the refusal (L2) and the thread stays open (itm_36b3537b21b0). | The user's choice: a wrong prompt shows at once; costs one wasted call. | Silent keep-open: reports a close that did not happen. |

## 6. Assumed decisions

| # | Decision | Default taken | Tradeoff |
| --- | --- | --- | --- |
| A2 | QA environment. | A scratch deck daemon on a port of its own (never 4321 or 4399) with its own `PILOT_DECK_DIR`, driven through the DOM. | The live deck is more real but writes into the user's deck. |
| A3 | User threads agents already closed. | Left closed; Reopen, or a reply, reopens one. | A migration reopening them would revive threads the user may consider done; irreversible for their queue. |
| A4 | Removing a deck tab still archives its user threads. | Kept: it is the user's press. | Refusing Remove while a user thread is open would block tidying. |

## 7. Out of scope

The pilot closing a user thread on the user's typed word; a timeout or auto-close; the chat (already
never closed); questions, gates and every other kind; showing a refusal on the thread page
(itm_6b7801fce544); tickets closed in an `Add` thread.

## 8. Slices

Width 2, longest stem 1.

| Slice | Title | Spec | Files owned | After | File |
| --- | --- | --- | --- | --- | --- |
| S1 | An agent's deck_resolve on a user thread is refused; the user's Close is the only close | 1, 2 | `deck/store.mjs`, `deck/tools.mjs`, `deck/test/create.test.mjs`, `deck/test/notices.test.mjs`, `hooks/test/inbox.test.js`, `docs/adr/0109-a-user-thread-is-closed-only-by-the-user.md` (new), `docs/adr/README.md` | – (walking skeleton) | [S1](slices/S1.md) |
| S2 | The hooks and the pilot's definition answer a user thread with deck_reply | 3, 4 | `hooks/lib/deck.js`, `hooks/stop-gate.js`, `hooks/inbox-alert.js`, `hooks/test/user-thread-reply.test.js` (new), `agents/pilot.md`, `scripts/test/pilot-agents.test.mjs` | – | [S2](slices/S2.md) |

S1 owns `hooks/test/inbox.test.js` because its refusal is what breaks that file's line 981.
`agents/pilot.md` is also edited by the yellow run co-pilot-successor (feat/co-pilot-successor); S2
touches only lines 50-55, so expect at most a one-paragraph rebase.

## 9. Acceptance evidence

On a scratch deck (A2), in the order the user meets it:

1. Create a thread "Side question": it shows "user generated" and Close (spec 2).
2. Reply in it: a session's Stop is held with the user-thread sentence and no `deck_resolve` asked (spec 3).
3. The pilot answers with `deck_reply`: the stop passes; the thread is still open and queued (spec 3).
4. `deck_resolve` on it through the daemon returns the refusal; the page still shows it open (spec 1).
5. Press Close and confirm: the thread closes, lands on its page, offers Reopen (spec 2).
6. `agents/pilot.md` lines 50-55 read; `npm test` green with the prompt budget pins unmoved (spec 4).

## 10. Status

| Slice | State | Branch | PR | Worktree | Blocker | Spec |
| --- | --- | --- | --- | --- | --- | --- |
| S1 | planned | | | | – | 1, 2 |
| S2 | planned | | | | – | 3, 4 |
| feature user-threads-open | planned | | | | S1, S2 | 1-4 |
