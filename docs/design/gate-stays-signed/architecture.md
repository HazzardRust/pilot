# Gate stays signed

Ticket `itm_c7e30555448b` · feature `gate-stays-signed` · base `pilot` at `023185b9` · branch `feat/gate-stays-signed`

## 1. Problem

On gate2 `itm_0a0c97923957` the user pressed Sign off, and the deck landed the feature on `pilot` at `97b4833`.
Four minutes later they typed "added the rule" into the same thread. From then on the deck read the gate as
unsigned. When they pressed Sign off again, the deck refused it with "is landed at 97b4833; nothing run".
`deck_resolve` then refused the gate as one "the user has not signed", so the pilot could not close it, and the
user was left asking why. A press the user made, and the deck acted on, should not be undone by a sentence they
typed afterwards.

## 2. Spec

| # | Behaviour | Evidence |
| --- | --- | --- |
| 1 | On a gate1 or gate2, a typed reply after the Sign off press leaves the gate signed: `deck_resolve` closes it, and a signed gate1 moves its ticket to yellow in the same write. | Store test: press Sign off on a gate1, add a typed reply, `deck_resolve` closes it and the ticket is yellow with its plan. The same on a gate2: it closes. |
| 2 | On a gate, the choice is the newest *press*. A Not yet pressed after Sign off withdraws the Sign off, and `deck_resolve` is refused. Typed text never withdraws one. *assumed (A1)* | Store test: Sign off, then Not yet, then `deck_resolve` → the "has not signed" refusal. |
| 3 | On a gate2 whose landing is `running` or `landed`, any press (Sign off or Not yet) is refused with the landing's line and nothing is stored. `deck_resolve` then closes the gate on the stored press, and the ticket's closing report posts. | Store test: press, land (stub `landing: landed`), type a reply, press Sign off (refused, `is landed at <sha>`), press Not yet (refused), `deck_resolve` succeeds, a `report` on the ticket posts. |
| 4 | A signed gate's reply box stays open and is labelled to say the press stands and the text is a comment for the pilot. The Sign off button stays drawn pressed after a typed reply. *assumed (A2)* | Render test: `renderThreadPage` of a gate2 with Sign off and then text carries the signed label and the pressed Sign off. QA sees it in Chrome on a scratch deck. |
| 5 | Every other kind keeps today's reading: on a question, lesson, handoff, audit or signoff thread, a typed reply after a press still chooses nothing. | `deck/test/card-history.test.mjs` and `deck/test/lesson.test.mjs` are unchanged and green. |

## 3. Findings

| Where | What exists | What this leans on |
| --- | --- | --- |
| `deck/items.mjs:444` `chosenOf` | Reads the newest `user` message and matches it against `item.options`, either exactly or as option + `NOTE_SEPARATOR` + note. The doc says "a typed reply after the press ... choose[s] nothing" (L2: read back from the reply, never stored). | The one change for spec 1 and 2: on a gate (`isGate`, `items.mjs:45`) the newest user message *that is a press*. The press is already a stored reply, so L2 holds and no field is added. |
| `deck/store-items.mjs:442-447` `resolveItem` | `signed = chosenOf(item) === SIGN_OFF`. On a gate, `!signed` throws "has not signed". A signed gate1 moves its ticket to yellow (`:465`). | Fixed by `chosenOf` alone. |
| `deck/store-items.mjs:261-263` `addReply` | `signing` reads the *incoming* text. `refuseLanding` (`:392`) runs only for a gate2 Sign off, before the repeat check. | Spec 3 widens the guard to any press on a gate2 whose own landing is running or landed. The cross-repository "other gate2 is landing" check stays Sign off only. |
| `deck/store-tickets.mjs:315` | Pivot is refused while a gate2 is signed. | Gets the fix for free. |
| `deck/server-routes.mjs:235` | `/reply` decides `pressed` from the incoming text, enforces the own-page Origin on a gate press, and calls `land` after `addReply`. | Unchanged. A refused press goes to `landRefusedPress` as today. |
| `deck/store-items.mjs:169-175` | A report is refused while the newest gate2 is open, or after it was dismissed unsigned. | Spec 3's report check passes once the gate2 resolves. |
| `deck/ui/render-parts.mjs:330,454` | `renderChoices` draws the press from `chosenOf`. A gate2 whose landing was refused offers Sign off again. `renderReplyForm` takes its label from `replyPrompt(kind)`, which is "Your verdict" for every gate. | Spec 4: the label for a signed gate. |
| `~/.claude/pilot/deck.json` `itm_0a0c97923957` | user "Sign off" 00:49:02 → landing `landed` 97b4833 00:51:13 → user "added the rule" 00:55:41 → the refused press, which stored nothing → `deck_resolve` refused → the user's Dismiss closed it at 01:14. | The reproduction for spec 1 and 3. Its ticket `itm_f323d36f1473` has since closed with report `itm_be3db36dd538`, so no existing data needs repair. |
| `deck/test/gate-resolve.test.mjs`, `press-refused.test.mjs`, `red-grilling.test.mjs` | Pin typed approval refused, a pressed Sign off passing, and Not yet never held back by open questions. | Must stay green. "Not yet is never held back" concerns open questions, not a landing. |

### Seams

| Seam | Interface | Folded behind it | Category |
| --- | --- | --- | --- |
| `chosenOf` (`deck/items.mjs`) | `chosenOf(item) -> string \| null` | Gate-aware press reading. No new export. | in-process |
| The reply store (`deck/store-items.mjs`, via `deck/store.mjs`) | `addReply(id, said)`, `resolveItem(id, resolution, author)`, `postItem(item)` | The landing guard over any press on a gate2 (`refuseLanding`, private) | local-substitutable (temp deck dir) |
| The thread page (`deck/ui/render.mjs`) | `renderThreadPage(item, items) -> html` | The signed-gate label inside `renderReplyForm` (private) | in-process |

Deletion test: `chosenOf` has 12 callers across store, server and UI. Delete it and the parsing of option + note
reappears in each, so it stays and takes the change. `refuseLanding` has a single caller and is a private helper of
`addReply`; it stays private. No fold is needed, so no fold slice.

## 4. Ubiquitous language

- **Press**: a user reply whose text is one of the thread's options, or that option, a blank line and a note (`replyFrom`). It is stored like any other reply.
- **Typed reply**: a user reply that is not a press.
- **Signed**: a gate whose newest press is Sign off.
- **Landing**: a gate2's `landing` record (`running`, `landed`, `refused`), written by `deck/landing.mjs`.
- **Withdraw**: a later press of Not yet on a signed gate that has not started landing.

## 5. Locked decisions

| # | Decision | Rationale | Rejected |
| --- | --- | --- | --- |
| L1 | On a gate, `chosenOf` reads the newest press, not the newest user message. | The press is already stored, so reading it keeps L2 ("read back, never stored") and fixes every caller at once. | A stored `signedAt` field, which is a second source of truth beside the reply and needs a migration story. Hiding the reply box after the press, which takes a needed channel away (A2). |
| L2 | Only `isGate` kinds (gate1, gate2) change. | Only gates pass on the press (merge-first L12). For questions, a typed answer after a press really is a new answer, and spec 5 pins that. | All `GATED_KINDS`, which would include `signoff`, a verdict with no ticket move and no landing. Widen it later if a case shows up. |
| L3 | Any press on a gate2 whose own landing is running or landed is refused, with that landing's line. | A Not yet after landing would un-sign a feature already on `pilot`, the same trap from the other side. | Refusing Sign off only, as today. |
| L4 | No repair of existing data. | The incident's ticket has since closed with a report. Every other gate's reading only becomes more permissive (a press is found where it was hidden). | A one-off rewrite of `deck.json`. |
| L5 | (was A1; decided on itm_499c69f5ac77) The newest press wins: a Not yet pressed after Sign off withdraws it before landing starts; typed text never withdraws a press; every press on a landing or landed gate2 is refused. | The recommended default, taken by the user. A mis-press has a way back without Dismiss. | First Sign off is final (Not yet after it a comment). |
| L6 | (itm_cb6b7ee88780) Grilling depth: forks. | Only decisions whose paths differ materially reach the user; A2 is no fork. | every: a Gate 1 walk, one item per locked decision. |
| L7 | (itm_223c6dc8cccf) QA runs against a scratch daemon on a spare port (`pilot deck --scratch --port <spare>`, `PILOT_DECK_NO_START=1`), seeded through the store module with `PILOT_DECK_DIR`. | The live deck at 4321 is the user's own and its items are real gates. | The live deck at :4321. |

## 6. Assumed decisions (awaiting the user)

| # | Question | Default taken | Tradeoff |
| --- | --- | --- | --- |
| A1 | Locked as L5 on itm_499c69f5ac77. | | |
| A2 | Does a signed gate's reply box stay open? | Yes, labelled "Signed off. The press stands; what you type is a comment for the pilot." | Hiding it prevents the incident by construction, but the user could no longer tell the pilot anything there ("added the rule" was needed). |

## 7. Out of scope

- The `signoff` kind, walkthrough Sign off and every non-gate kind (L2).
- Whether the user's Dismiss should be refused on a landed gate2. In the incident it closed a landed gate unsigned. Once spec 1 holds, the pilot can close the gate, so the user has no reason to Dismiss. Raised to `main` as a possible ticket.
- The pilot's wrong explanation in the incident ("records your Sign off as typed"). A typed "Sign off" and a pressed one are byte-identical (`replyFrom`, `deck/server-wait.mjs:99`), and that stays so.

## 8. Slices

Width 1; longest stem 2

| Slice | Title | Spec | Files owned | After | Reviewers | File |
| --- | --- | --- | --- | --- | --- | --- |
| S1 | A typed reply leaves a gate signed; a landed gate2 refuses every press and still closes (walking skeleton) | 1, 2, 3, 5 | `deck/items.mjs`, `deck/store-items.mjs`, `deck/test/gate-stays-signed.test.mjs` (new) | – | `pilot:typescript-reviewer`, `pilot:security-reviewer` | [S1](slices/S1.md) |
| S2 | A signed gate's reply box says the press stands | 4 | `deck/ui/render-parts.mjs`, `deck/test/gate-signed-render.test.mjs` (new) | S1 (`chosenOf`) | `pilot:typescript-reviewer` | [S2](slices/S2.md) |

Estimated about 70 changed lines in total, inside the 200-line limit.

## 9. Acceptance evidence

On a scratch deck (`pilot deck --scratch --port <spare>`, never 4321) opened in Chrome, with a seeded green ticket and
its gate1, and a yellow ticket with its gate2 whose `landing` is seeded `landed`. The seeding is QA's.

1. On the gate1, press Sign off, then type "one more thing" and Reply. The Sign off button stays pressed and the reply box reads "Signed off. The press stands; …" (spec 1, 4).
2. The pilot's `deck_resolve` on that gate1 closes it, and the ticket shows yellow (spec 1).
3. On a second gate1, press Sign off, then Not yet. `deck_resolve` is refused as unsigned (spec 2).
4. On the landed gate2, type a reply, then press Sign off. The page shows "The deck refused that press: … is landed at <sha>; nothing run", and the Sign off button is still drawn pressed (spec 3, 4).
5. `deck_resolve` closes that gate2, and a `report` on its ticket posts (spec 3).
6. On a question, press an option, then type a reply. The option is no longer drawn chosen (spec 5).

## 10. Status

| Slice | State | Branch | PR | Worktree | After | Spec |
| --- | --- | --- | --- | --- | --- | --- |
| S1 | planned | | | | – | 1, 2, 3, 5 |
| S2 | planned | | | | S1 | 4 |
| gate-stays-signed | planned | feat/gate-stays-signed | | | S1, S2 | 1-5 |
