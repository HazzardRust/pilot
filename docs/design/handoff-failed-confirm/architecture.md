# One confirmation, no reloads: Handoff failed first

Ticket itm_6d4847d9f1ad, with itm_eb2a0bb4295c merged into it.
- Threads: itm_426f2958ea8e and itm_eb2a0bb4295c.
- Branch: `design/handoff-failed-confirm`, from `pilot` 178c7e5e.
- Merge thread: itm_c19af1182655 (none merged at the architect's step; the user merged itm_eb2a0bb4295c later).

## 1. Problem

The user pressed **Handoff failed** on a hand-off that had already been picked up ("'handoff failed' needs a confirmation step"). That button posts on the first press. A `Handoff failed` reply makes the pilot treat the handed-off session as lost and brief a fresh one, so a stray press is expensive.

The merged thread asks two more things of the deck UI:
- Every confirmation should work the way ticket-start does: the pressed row blanks to a single confirm, and a click anywhere else cancels and reverts. No question written over the old text, or beside it.
- No press reloads the page. Today the notification × does, and so do others.

## 2. Spec

| # | Behaviour | Evidence |
| --- | --- | --- |
| **Part 1** | **Handoff failed** | |
| 1 | On a `handoff` or `crew-handoff` card or thread page, the first press on Handoff failed blanks its row to one sentence naming the consequence, plus **Confirm**. Nothing is posted. | Render test: the row has `data-confirm-row`, the button has `data-confirm`, and a hidden `.step.sure` carries the kind's sentence and a Confirm with `choice=Handoff failed`. Sandbox: the first press is prevented and nothing is fetched. Browser. |
| 2 | Confirm posts the `Handoff failed` reply exactly as today (`pickedUpAt`, a chain ticket back to Tickets, the item left open), with no reload. | Sandbox: Confirm submits through reply.mjs's fetch. `handoff-buttons`, `handoff-ack` and `chain` tests are green; `handoff-buttons.test.mjs:52` flips. Browser. |
| 3 | A click anywhere else, or Escape, restores the row and posts nothing. | Sandbox. Browser. |
| 4 | Tickets' Continue behaves as today, on the same implementation. | `confirm`, `switch-request` and `co-pilot-switch` tests are green. Browser. |
| **Part 3** | **Every confirmation** | |
| 5 | A sign-off's options, gate1/gate2 **Sign off** and **Not yet**, and a walkthrough's **Sign off** confirm by the mechanism. Spec 19's `.choices.asks` row, its No and reply.mjs `asks` are retired. **Teach me** and a question's answers still go in one press. | `signoff.test.mjs` and the spec-19 block of `reply.test.mjs` are rewritten to the mechanism. Browser. |
| 6 | **Close** (thread page, and a user thread's card), **dismiss** a run, **Remove** deck, **Start** session and **End** session confirm by the mechanism. `dismiss.mjs` and confirm.mjs's `.cancel` path are retired. | `close`, `dismiss`, `remove-deck`, `start-session` and `end-session` tests are moved to the mechanism. Browser. |
| 7 | **Create** keeps its own two steps, named in §8a with why. *Assumed* (A1). | The `create` tests' two-step pins are unchanged. |
| **Part 2** | **No reloads** | |
| 8 | The × on a closed thread's notice removes it with no page reload. The clear is stored. | Sandbox: a fetch and no navigation. Browser: scroll unmoved, the notice gone, and still gone after a manual reload. |
| 9 | Every other press acts in place; none reloads. A press that changes which page is shown (Create and its Add twin, Add deck, Remove deck) moves the address and redraws in place (L8). | A sandbox test per press in §8a: a fetch, or a fetch then a `pushState`, and no navigation. QA presses each one in a browser. |

These hold without being said:
- With no script, every press posts as it does today (A3 of deck-workspace).
- A refused press still posts for real, so the user reads the refusal (server.mjs:1170).

The request cannot mean either of these:
- a `confirm()` dialog: the deck has none, by rule (`confirm.mjs` header);
- a server-side two-step: agents never press these buttons.

## 3. Findings

| What | Where |
| --- | --- |
| Ticket-start's in-place confirm: `form.confirm.in-place`, a `.step.name` play button, a hidden `.step.sure` (`<p>` plus Confirm) | `deck/ui/render.mjs:1440-1453` |
| Its behaviour: `show`, `revert`, `taken`, keyed on `form.closest('li')`; any other click or Escape reverts | `deck/ui/js/confirm.mjs:25-87`; pins at `deck/test/confirm.test.mjs:90-140` |
| Its row blanking, Tickets only | `deck/ui/deck.css:351-354`, `:835` |
| Spec 19's ask row (sign-off, gates, walkthrough) | `render.mjs:311-382`; `reply.mjs:155-200`; `signoff.test.mjs:64-99`; `reply.test.mjs:367-427` |
| Handoff kinds' rows: `renderOwnChoices`, no ask | `render.mjs:391-394`, `:422-423`; SPECS at `deck/items.mjs:419-431` |
| Close's and Dismiss-a-run's ask/sure/No | `render.mjs:440-470`, `:880-893`; `deck/ui/js/dismiss.mjs` |
| Create, Remove, Start and End: `form.confirm` with a Cancel | `render.mjs:1207-1310`; `confirm.mjs:60-72` |
| Option presses, the card's Dismiss and `/move` are already fetched in place | `reply.mjs:222-260`, `deck/ui/js/move.mjs:29-60` |
| The rule: the page updates in place and never reloads | `docs/adr/0016-the-page-updates-in-place-and-never-reloads.md`, `deck/ui/js/live.mjs:1-3` |
| The notice × posts `/clear-notice` and gets a 303 | `render.mjs:1655-1667`; `deck/server.mjs` (303s at `:1229-1373`) |
| Moving pages in place today: `pushState`, then `live.mjs`'s `refresh`, for the runs strip and EVERYTHING; the link is blurred so `busy` does not skip the swap | `deck/ui/js/navigate.mjs:33-49` |
| `refresh` fetches `location.href`; `apply` swaps only the regions the **shown** page has, by `data-live` name, and leaves one the fetched page lacks | `deck/ui/js/live.mjs:141-188`, `:282-307` |
| The overview's regions: `tabs` (header), `queue` (`main`), the seven panels. A thread page's: `kind`, `nav`, `position` (header), `thread`, `reply` (in an unmarked `main`), the same panels. No `tabs`, no `queue` | `deck/ui/home.html:22-27`; `deck/ui/thread.html:25-50`; `deck/ui/strips.html:61-85`; `render.mjs:1145`, `:2176-2179` |
| Create (`:1222`), Add deck (`:1156`, inside `tabs`), Remove (`:1257`) and Make tickets (`:1537`) are drawn on the overview only (`.strip.right`, `:1177-1183`) | `deck/ui/render.mjs` |
| Their answers: `/create` 303 to the new thread page; `/remove-deck` 303 to `/`; `/add-deck` 303 to `/?run=`, or to `back?refused=` | `deck/server.mjs:1250-1305` |
| The overview draws `refused` whatever the fetch mode; the thread page only for a navigation | `deck/server.mjs:1129`, `:1170-1176` |

## 4. Ubiquitous language

- **Confirm row**: the element, marked `data-confirm-row`, that blanks while a press is confirmed (a Tickets `li`, a choice row, a `.send` row, a panel row).
- **Trigger**: a submit button marked `data-confirm`. Its first press confirms rather than posts.
- **Confirm**: the one submit in the row's `.step.sure`. It posts what the trigger would have posted.
- **Revert**: the row put back with nothing posted, after any other click or Escape.
- **Post in place**: a form marked `data-in-place`, fetched rather than navigated. The live redraw draws the result.

## 5. Locked decisions

- **L1 One confirmation seam, `confirm.mjs`'s in-place path generalised from the Tickets `li` to any confirm row, keyed on the trigger rather than on a form.** Confirm carries the trigger's `name`, `value` and `form`, so a trigger inside the reply form keeps the typed text and `replyFrom`. Continue moves onto it in S1. *Rejected*: one `form.confirm.in-place` per option. A form cannot nest in the reply form, and a split form loses typed text on a gate sign-off.
- **L2 One post-in-place seam, generalised from reply.mjs's option fetch.** A `data-in-place` form is fetched, the live redraw (ADR 0016) draws the result, and a refusal or a dropped request posts for real. *Rejected*: a handler per route, which repeats reply.mjs's resend logic many times over.
- **L3 Each confirmation's sentence is the deck's own words beside the kind or form that owns it.** Handoff kinds take an `ask` in `SPECS`, beside `note`. *Rejected*: one generic "Are you sure?", which names nothing.
- **L4 reply.mjs ignores a submit that is already `defaultPrevented`,** so a trigger's first press reaches no fetch, whichever listener runs first.
- **L5 Retire what the seam replaces:** spec 19's `asks`, `dismiss.mjs` and the `.cancel` path. *Rejected*: keeping both mechanisms side by side.
- **L6 Slices run in order:** each of the six owns `render.mjs`, so none run in parallel.
- **L7 No ADR beyond amending ADR 0016's consequences in S5:** no press reloads, and there is no exception list.
- **L8 No press reloads the page.** The user's general rule on itm_afdab5a5052e: "i hate having my page reloaded feels janky". A typed reply posts in place: the box clears, the reply is drawn above it, and the `#reply` navigation (reply.mjs:207, server.mjs:1250) goes (S5). Create (and its Add twin), Add deck, and Remove deck of the viewed tab move the page in place the way `navigate.mjs` already does: `history.pushState` to the address the answer landed on, then `live.mjs`'s `refresh` (S6). `overridden: these three change which page is shown and the deck renders pages on the server; answered by navigate.mjs's existing path, which already moves the address and redraws from the server's page with no reload.` *Rejected*: keeping them as navigations.
- **L9 Grilling depth: forks** (itm_44a943a3f6b9). Gate 1 reads this artefact at fork depth, with no walk.
- **L10 QA runs on a scratch deck in a real browser** (itm_6a428e7ca143): the feature's own `pilot deck --scratch` on a free port with a temporary store, seeded with a `handoff` and a `crew-handoff` item. Never the deck on 4321.

## 6. Assumed decisions

- **A1 Create keeps its own name-then-confirm step.** Default: unchanged. Its confirm carries a typed name, and with the mechanism a stray click would revert it and throw the typing away. The tradeoff is one confirmation that looks different. The alternative is to put Create on the seam and keep the typed name across a revert.

## 7. Out of scope

- Wording a confirmation differently for an already-acknowledged hand-off.
- The pilot closing a hand-off on pick-up (itm_f481a236668b).
- Any change to the store, routes' semantics, or the MCP tools. The server only answers fetches as it answers posts today.

## 8. Slices

Width 1; longest stem 6. Each slice comes after the one before it, through `render.mjs` (L6). Reviewers are `pilot:`-prefixed; `security` where a slice fetches an own-page-checked route.

| Slice | Title | Spec | Files owned | After | Reviewers | File |
| --- | --- | --- | --- | --- | --- | --- |
| S1 | Handoff failed confirms in place, on the one seam | 1-4 | `deck/ui/js/confirm.mjs`, `deck/ui/js/reply.mjs`, `deck/ui/render.mjs`, `deck/ui/deck.css`, `deck/items.mjs`, `deck/test/confirm.test.mjs`, `deck/test/handoff-buttons.test.mjs`, `deck/test/handoff-confirm.test.mjs` (new) | – | `typescript` | [S1](slices/S1.md) |
| S2 | Sign-offs, gates and walkthroughs confirm in place | 5 | `deck/ui/render.mjs`, `deck/ui/js/reply.mjs`, `deck/ui/deck.css`, `deck/test/signoff.test.mjs`, `deck/test/reply.test.mjs` | S1 (`render.mjs`, `data-confirm`) | `typescript`, `security` | [S2](slices/S2.md) |
| S3 | Close, dismiss, Remove, Start and End confirm in place | 6, 7 | `deck/ui/render.mjs`, `deck/ui/js/confirm.mjs`, `deck/ui/js/dismiss.mjs` (deleted), `deck/ui/js/deck.mjs`, `deck/ui/deck.css`, `deck/test/{close,dismiss,remove-deck,start-session,end-session,confirm}.test.mjs` | S2 (`render.mjs`, `deck.css`) | `typescript` | [S3](slices/S3.md) |
| S4 | The notice × clears in place | 8 | `deck/ui/js/inplace.mjs` (new), `deck/ui/js/deck.mjs`, `deck/ui/render.mjs`, `deck/server.mjs` (if a fetch needs a non-303 answer), `deck/test/inplace.test.mjs` (new), `deck/test/notices.test.mjs` | S3 (`render.mjs`, `deck.mjs`) | `typescript`, `security` | [S4](slices/S4.md) |
| S5 | Reopen, Dismiss, alerts, Switch and a typed reply post in place | 9 | `deck/ui/render.mjs`, `deck/ui/js/reply.mjs`, `deck/test/inplace.test.mjs`, `deck/test/{reopen,alerts,switch-request}.test.mjs`, `docs/adr/0016-the-page-updates-in-place-and-never-reloads.md` (consequences) | S4 (`render.mjs`, `inplace.mjs`) | `typescript`, `security` | [S5](slices/S5.md) |
| S6 | Create, Add deck and Remove deck change the page in place | 9 | `deck/ui/js/live.mjs`, `deck/ui/js/inplace.mjs`, `deck/ui/js/deck.mjs`, `deck/ui/render.mjs`, `deck/test/{live,inplace,create,make-tickets,add-deck,remove-deck}.test.mjs` | S5 (`render.mjs`) | `typescript`, `security` | [S6](slices/S6.md) |

S1 is the walking skeleton: the shared seam, proved on two consumers (Continue and Handoff failed) in a real browser.

### 8a. Confirmations and reloads, swept

| Press | Today | After | Slice |
| --- | --- | --- | --- |
| Continue (Tickets) | in-place confirm | the seam | S1 |
| Handoff failed | posts at once | the seam | S1 |
| Sign-off / gate options, walkthrough Sign off | spec-19 ask + No | the seam | S2 |
| Close (page, user card) | ask/sure/No | the seam, posted in place | S3, S5 |
| dismiss a run | ask/sure/Yes/No | the seam, posted in place | S3, S5 |
| Remove deck | form.confirm + Cancel | the seam; then pushState to `/` and a redraw in place (L8) | S3, S6 |
| Start / End session | form.confirm + Cancel | the seam, posted in place | S3, S5 |
| Create (and Add) | name, then confirm + Cancel | kept (A1); then pushState to the new thread and a redraw across page kinds (L8) | S6 |
| Notice × (`/clear-notice`) | 303 reload | posted in place | S4 |
| Reopen | 303 reload | posted in place | S5 |
| Thread page Dismiss (`/dismiss-item`) | 303 reload | posted in place | S5 |
| Weekly alerts (`/alerts`) | 303 reload | posted in place | S5 |
| Switch cancel (`/switch-cancel`), Switch Confirm | 303 reload | posted in place | S5 |
| Add deck (`/add-deck`) | 303 reload | pushState to the new tab, or to `?refused=`, and a redraw in place (L8) | S6 |
| Typed reply | navigates to `#reply` | posted in place; box cleared, reply drawn above it (L8) | S5 |
| Chat Send, options, card Dismiss, `/move` | already in place | unchanged | – |

## 9. Acceptance evidence

On a scratch deck in a real browser (L10): `pilot deck --scratch` on a free port with a temporary store, seeded with a `handoff` and a `crew-handoff` item, never the deck on 4321.
1. Press Handoff failed on a `handoff` and a `crew-handoff` card. Each row blanks to its sentence and Confirm. Click elsewhere and it is back with no message. Press again and Confirm: the reply is stored and the page does not reload (spec 1-3).
2. Continue on a Tickets row confirms as before (spec 4).
3. Sign off on a gate, the walkthrough, Close, dismiss a run, Remove, Start and End: each blanks its row to one Confirm, and a click elsewhere reverts (spec 5, 6). Create is unchanged (spec 7).
4. Clear a notice with ×: it goes, the scroll stays, and a reload keeps it gone (spec 8).
5. Reopen, thread-page Dismiss, Weekly alerts, Switch cancel and a typed reply each act without a reload (spec 9).
6. Create a thread on the overview: the address becomes the thread's and its page is drawn, with no reload, and Back returns to the overview. Make tickets does the same. Add a deck by path and its tab is shown; a bad path draws the refusal beside the + box. Remove an ended deck and the overview is shown. None reloads (spec 9).
7. `npm test` is green, and the prompt-budget pins are unmoved.

## 10. Status

| Slice | State | Branch | PR | Worktree | Blocker | Spec |
| --- | --- | --- | --- | --- | --- | --- |
| S1 | planned | – | – | – | – | 1-4 |
| S2 | planned | – | – | – | S1 | 5 |
| S3 | planned | – | – | – | S2 | 6, 7 |
| S4 | planned | – | – | – | S3 | 8 |
| S5 | planned | – | – | – | S4 | 9 |
| S6 | planned | – | – | – | S5 | 9 |
| handoff-failed-confirm | planned | – | – | – | S6 | 1-9 |
