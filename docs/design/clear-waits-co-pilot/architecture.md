# The wrapper types no /clear while a co-pilot is live

Feature `clear-waits-co-pilot` · ticket `itm_f8661e31d5f7` · base `pilot` at `b5270c0e` · follow-up of
`yellow-agent` (PR #345), from itm_2a18cf6abdc0 ("Ship as built, follow-up ticket")

## 1. Problem

When the main session finishes a ticket cleanly, `pilot run` types `/clear` so the next ticket starts
in a fresh session. If the main session has a co-pilot building a yellow ticket in the background,
that `/clear` sometimes kills it mid-slice (2026-10-05, exit 137) and sometimes does not (QA,
2026-10-06). Every ticket the user concludes while a yellow ticket builds can cost the co-pilot its
slice in flight. a51f1cc3 only stops a fresh session spawning a second co-pilot beside a survivor.

## 2. Spec

| # | Behaviour | Evidence |
| --- | --- | --- |
| 1 | While the deck holds a live co-pilot for this directory, `pilot run` types no `/clear` for a **chain hand-off**; once the co-pilot is released and the main session has ended a turn after the release, it types the `/clear` and the first prompt as today. | `deck/test/run.test.mjs`: "a chain hand-off with a live co-pilot types nothing"; "a released co-pilot lets the /clear through after the next turn end". |
| 2 | The main session tells the deck: `deck_ticket co-pilot` on the ticket before it spawns its co-pilot, `deck_ticket release` when one stops without a hand-back; the hand-back's own write (`deck_ticket need`, or the `gate2` post that turns a yellow ticket red) releases it too. One new store key, `co-pilots`, and no other. | `deck/test/co-pilot.test.mjs` (new): set by `co-pilot`, cleared by `need`, by the gate2 post and by `release`; the stored deck gains only `co-pilots`. |
| 3 | A `/clear` the user types by hand reaches the session unchanged, co-pilot or none. | `run.test.mjs`: "a /clear typed by hand reaches the pty while a co-pilot is live". |
| 4 | *assumed (A1)*: while a chain hand-off is open in the directory, `deck_ticket co-pilot` is refused, naming the hand-off: the session after the `/clear` spawns the next co-pilot (yellow-agent spec 6). So the `/clear` lands at the first hand-back, not after the whole yellow queue. | `co-pilot.test.mjs`: "a co-pilot is refused while a chain hand-off is open". |
| 5 | A stale flag never outlives the wrapper: `pilot run` starting (`/api/chain` at start) releases its directory's co-pilot. | `co-pilot.test.mjs`: "a pilot run start releases the directory's co-pilot". |
| 6 | The pilot's own context hand-off (`pilot handoff`, no `next`) is held like a chain hand-off while its co-pilot is live, and the co-pilot finishes the slice in flight first: at the advisory mark (225,000 tokens) the guard tells the pilot to send its live co-pilot a **pause**; the co-pilot integrates the slice in flight, starts no other, and hands back `paused`; the pilot `deck_ticket release`s it; the `/clear` goes in after that release and the next turn end. `pilot handoff`'s answer repeats the pause while the deck still says a co-pilot is live. Changed by the user, itm_6ddd197ab21f. | `run.test.mjs`: "a context hand-off with a live co-pilot types nothing until the release"; `hooks/test/context-size.test.js`: "the pilot's advisory names the pause"; `scripts/test/handoff.test.mjs`: "a hand-off with a live co-pilot says to pause it"; `scripts/test/yellow-co-pilot.test.mjs`: "a paused co-pilot integrates the slice in flight and hands back". |
| 7 | *assumed (A2)*: while held, the chain hand-off's thread gets one reply, once: `held: the co-pilot on <ticket> is live; /clear after its hand-back`. | `run.test.mjs`: "a held hand-off says so once on its thread". |

Not meant: "a Gate 1 parked" types no `/clear` today. `finished: "planned"` does not chain
(`deck/chain.mjs` `chainNext` chains only `FINISHED_CLEAN`) and the pilot takes the next ticket in
the same session (`agents/pilot.md:353`). The two typed `/clear`s are the chain hand-off (a
closing report, or `pilot run` starting) and the pilot's context hand-off.

The marks the user named as 230k and 285k are 225,000 (advisory: "Finish the step you are on and
start nothing new ... no new child agent") and 260,000 (hard: "Hand off now"), flat for a window
over the small-window ceiling (`hooks/context-size-guard.js:68-69`). Both are "advice and never a
block": past the hard mark the session still runs, and a main session waiting on a background
co-pilot spends almost no context.

## 3. Findings

| Where | What exists | What this leans on |
| --- | --- | --- |
| `deck/run.mjs:376` `clearOnce` | The one place the wrapper types `/clear`: picks the newest open `handoff` in its directory, takes a claim, waits until `lastTurnEnded() >= postedAt`, re-reads, types `/clear`, then the prompt on the lane's marker. Returns false and gives the claim back on any no. | The hold goes here, as two more "no"s; a false return is retried on the next change event (`watch`, `run.mjs:542`). |
| `deck/run.mjs:542` `watch` | Calls `clearOnce` on every `changed` event; `deck_ticket` is a writing tool (`server.mjs:940`), so a release fires one. | The release itself is the retry: no timer, no poll. |
| `deck/chain.mjs:72` `chainNext` | Posts a `handoff` with `next: <ticket id>` and takes the ticket live, on a clean finish (`server.mjs:898`) and at `pilot run` start (`server.mjs:1530`). | A chain hand-off is told from a context one by `next`, as `isChainHandoff` does. |
| `scripts/handoff.mjs` | `pilot handoff` posts a `handoff` with no `next`. | Spec 6: left as it is. |
| `deck/server.mjs:1432` `GET /api/record` | Per-directory read the hook uses; marks nothing delivered; already returns `yellow` and `budget`. | Gains `co-pilot`; the wrapper reads it here, never through `deck_read` (which marks replies when it names a repo, `run.mjs` `openItems`). |
| `deck/store.mjs:1420` `storedBudget` | `deck.budgets[repoKey]`: per-directory state beside the items. | `deck.coPilots[repoKey]` copies the shape. |
| `deck/store.mjs:623`, `:1128` | The gate2 post on a yellow ticket and `needTicket` turn it red. | Both release the directory's co-pilot when it names that ticket. |
| `deck/tools.mjs:344` `deck_ticket` | Actions `up down take park merge need pivot`. | Gains `co-pilot`, `release`; its schema is in the pilot's prompt pin. |
| `scripts/test/measure-prompt.test.mjs:121` | Pilot's own share pinned at 10124; measured 10124 on `b5270c0e` (no headroom). | S2 pays: `agents/pilot.md:353-354` still says "The gate1's `deck_resolve` says whether the sub-deck is starting", stale since yellow-agent S9. |
| `agents/pilot.md:136-145` "Yellow" | Spawn with no live co-pilot; on hand-back `need` or `gate2`, then spawn the next. | One clause: tell the deck first; refused, spawn none; `release` one that stops. |
| `hooks/lib/deck.js:499` `markTurnEnded` | Stop gate stamps the wrapper's turn end per pid. | The release-then-turn-end order of spec 1. |
| `hooks/context-size-guard.js:304-318` `whatComesNext`, `handoffNowIfIdle` | The pilot-on-deck advisory text; the hard text lists `deck_status` then `pilot handoff` (:375-396). Not in the pilot's prompt pin. | The pause clause joins the pilot's advisory, so the slice has the 35,000-token buffer to finish in. |
| `scripts/handoff.mjs:99-126` `handoff` | Reads `GET /api/record` already, posts the `handoff`, answers one line ending "`pilot run` types `/clear` ... stop here". | With S1's `co-pilot` in that read, the line names a live co-pilot and the pause. |
| `agents/pilot-co-pilot.md:54` "Hand-back" | Stops only on red (ADR 0066): walkthrough, blocked, nothing to walk. No pause; yellow-agent L15 stops it by `TaskStop` "after the slice in flight is integrated". | Gains the pause and the outcome `paused`; the ticket stays yellow. `deck_ticket park` and `finished: "paused"` do not fit: `park` takes a ticket out of the main slot, and the co-pilot never sends `finished`. |
| `deck/test/run.test.mjs` | `deckHolding` fake deck answering `/api/tool`; `keyboard`, `atRest`, `fakePty`. | New tests reuse them; the `co-pilot` reader is injected, so the fake needs no new route. |

## 4. Ubiquitous language

- **Chain hand-off**: a `handoff` item with `next`, posted by the daemon to start a ticket in a fresh session.
- **Context hand-off**: a `handoff` with no `next`, posted by `pilot handoff` when the pilot's context fills.
- **Live co-pilot**: the directory's `co-pilots` entry says `live` and names a ticket that is open and yellow.
- **Release**: the write that ends a live co-pilot: `release`, `need`, the yellow gate2 post, or `pilot run` starting.
- **Hold**: `clearOnce` declining a hand-off because a co-pilot is live, to try again on the next change.
- **Pause**: `main`'s message to its co-pilot to integrate the slice in flight, start no other, and hand back `paused`, its ticket still yellow.

## 5. Locked decisions

| # | Decision | Rationale | Rejected |
| --- | --- | --- | --- |
| L1 | Grilling depth is *forks*: only fork decisions reach the user; Gate 1 is the one `gate1` item. No audit runs alongside (the user, via `main`, 2026-10-07). | The user's call. | |
| L2 | The green queue is not merged in (itm_7a59a9cbf459). | None of the four green tickets touches the wrapper's `/clear`. | |
| L3 | The flag is a per-directory entry `deck.coPilots[repoKey] = { ticket, live, at }`: one co-pilot per main session per directory (yellow-agent L2). | Matches `budgets`; one read answers "is this directory's co-pilot live", without scanning tickets the 20-item `deck_read` window may not reach. | A field on the ticket item: the wrapper would have to find yellow tickets outside its read window. |
| L4 | Liveness is read, never inferred: `live`, and the named ticket still open and yellow (a guard against a missed release, not a heartbeat). No agent id, no roster (yellow-agent L3). | A co-pilot waiting on children is silent; the roster would drop it after 90 s. | Roster liveness. |
| L5 | Hold, not a timed wait: `clearOnce` returns false while live; the release's own change event retries it. The turn wait becomes `lastTurnEnded() >= max(postedAt, co-pilot.at)`. | No new timer; a release mid-turn is followed by the turn end the `/clear` needs, so a `/clear` never lands inside the hand-back turn. | Waiting inside `clearOnce`: holds the watch loop and the claim for hours. |
| L6 | Superseded by L11 (the user, itm_6ddd197ab21f). Was: only a chain hand-off is held. | | |
| L7 | The wrapper reads the flag from `GET /api/record?repo=` as `co-pilot: { ticket, live, at } \| null`, injected into `clearOnce` as a `co-pilot` reader for tests. | A read that marks nothing delivered, already per directory. | `deck_read`: marks the user's replies delivered when it names a repo. |
| L8 | Releases: `release`, `needTicket`, the yellow gate2 post (each only for the entry's ticket), and `chainNext` at start (whatever the ticket). A co-pilot that ends in an error is the main session's to `release` on the failed-agent notice. | Every way a co-pilot ends has one write; the wrapper start bounds a stale flag to one wrapper's life. | A TTL: a co-pilot legitimately runs for hours. |
| L9 | Two slices, about 320 changed lines with spec 6's change, serial (both touch `deck/server.mjs`). | Under the 400-line limit; one run. | One slice: the prompt-pin payment is its own risk. |
| L10 | QA runs in a scratch worktree with its own deck daemon on a scratch port (`PILOT_DECK_DIR`, `PILOT_DECK_PORT`), a real pty session under `pilot run`, a yellow ticket and a co-pilot that hands back; seed folder `C:/Users/Hazzard/qa-crew-voice-scratch` (the user, itm_72e727256a01). | A test `/clear` on the live deck would hit the session the user is using. | The live deck on 4321. |
| L11 | Every hand-off is held while the directory's co-pilot is live, a context one as a chain one (the user, itm_6ddd197ab21f: "let the co-pilot keep going until its slice has ended for the session to /clear"). `clearOnce` no longer tells the two apart. | The 35,000 tokens between the advisory (225,000) and the hard mark (260,000) are enough for a slice; the marks are advice, not a block, and the waiting main session is idle. | Clearing at once (old L6): costs the co-pilot its slice in flight. |
| L12 | The pause is a `SendMessage` from `main` to its co-pilot, and the co-pilot's own definition carries what it does: integrate the slice in flight through its gate and review, bring its rows current, start nothing else, hand back with outcome `paused`. The pilot releases on that hand-back (the ticket stays yellow, so no `need` releases it). | The co-pilot listens to `main` only; the deck cannot message a subagent. Reuses yellow-agent L15's "after the slice in flight is integrated". | `deck_ticket park` or `finished: "paused"`: `park` is the main slot's, and the co-pilot never sends `finished`. `TaskStop`: kills the slice. |

## 6. Assumed decisions

| # | Default taken | Tradeoff | Alternative |
| --- | --- | --- | --- |
| A1 | While a chain hand-off is open, `deck_ticket co-pilot` is refused, naming it; the pilot spawns none and the session after the `/clear` spawns the next co-pilot from the yellow lane (spec 4). | The `/clear` lands at the first hand-back and the next green ticket starts then; each later co-pilot starts under a fresh main session. Under plain `claude` the next co-pilot waits until the user types `/clear`. | Spawn as today: the `/clear`, and the next green ticket, wait until the whole yellow queue has drained (hours). |
| A2 | While held, one reply on the chain hand-off's thread, once (a claim `clear-held-<id>`), plus a `wrapper.log` line (spec 7). | One more line on a thread the user sees anyway. | Log only: the open "Next run" card is the only sign. |
| A3 | The pilot sends the pause, told at the advisory by the guard (a clause in `handoffNowIfIdle`'s pilot-on-deck text), and told again by `pilot handoff`'s answer line when the deck still says a co-pilot is live. | The slice gets the whole 225,000 to 260,000 buffer; neither text is in the pilot's prompt pin, so `agents/pilot.md` gains nothing for it. A pilot that ignores both still has its hand-off held, only later. | `pilot handoff` alone, at the hard mark: the slice finishes past 260,000 with the main session idle. The deck sending it: the deck cannot message a subagent. |
| A4 | No time bound on the hold. A co-pilot that never hands back is released by the main session on its failed-agent notice (L8), by `pilot run` restarting (spec 5), or passed over by the user typing `/clear` (spec 3), which the held reply names. | A hung co-pilot leaves the session at rest past the hard mark until someone looks; nothing is lost, since the record and the co-pilot's pushed branches hold the state. | A bound (say 90 min after the hand-off) after which the `/clear` goes in anyway: needs a timer in `watch`, and kills exactly the slice this feature exists to save. |

## 7. Out of scope

- The pause for anything but the pilot's context hand-off: a closing report's chain hand-off waits for the ordinary hand-back.
- Telling a fresh session whether a co-pilot survived its `/clear` (a51f1cc3's notice stays).
- A hand-typed `/clear` with a live co-pilot: the user's choice (spec 3).
- The co-pilot calling `deck_ticket`: it never does; its pause is a hand-back to `main`.

## 8. Slices

| Slice | Title | Spec | Files owned | After | File |
| --- | --- | --- | --- | --- | --- |
| S1 | A hand-off waits for the co-pilot's release (walking skeleton) | 1, 2, 3, 5, 6 (wrapper half), 7 | `deck/store.mjs` (`co-pilots`), `deck/server.mjs` (`deck_ticket co-pilot`/`release`, `/api/record` `co-pilot`), `deck/chain.mjs` (release at start), `deck/run.mjs` (`clearOnce` hold), `deck/test/co-pilot.test.mjs` (new), `deck/test/run.test.mjs` | – | [S1](slices/S1.md) |
| S2 | The pilot tells the deck, pauses its co-pilot, and is refused while a `/clear` is due | 2, 4, 6 (pause half) | `deck/server.mjs` (refusal), `deck/tools.mjs` (`deck_ticket` enum), `agents/pilot.md` (Yellow clause, stale gate1 line), `agents/pilot-co-pilot.md` (pause, `paused`), `hooks/context-size-guard.js` (advisory clause), `scripts/handoff.mjs` (answer line), `scripts/test/measure-prompt.test.mjs`, `scripts/test/pilot-agents.test.mjs`, `scripts/test/yellow-co-pilot.test.mjs`, `scripts/test/handoff.test.mjs`, `hooks/test/context-size.test.js`, `deck/test/co-pilot.test.mjs` | S1 | [S2](slices/S2.md) |

## 9. Acceptance evidence

On a scratch deck in a scratch repository (`PILOT_DECK_DIR`, its own `PILOT_DECK_PORT`), never the
live daemon on 4321:

1. `pilot run` in the scratch repo with one yellow and one green ticket: the session runs
   `deck_ticket co-pilot` on the yellow one and spawns a co-pilot (spec 2).
2. The session posts its closing report: the "Next run" card opens, the terminal gets no
   `/clear`, the card's thread says `held: ...` once, and the co-pilot's rows keep moving (1, 7).
3. Typing `/clear` by hand clears at once (spec 3).
4. The co-pilot hands back (`need`): `deck_ticket co-pilot` for the next yellow ticket is refused; after
   that turn ends the terminal gets `/clear` and the first prompt, and the fresh session spawns
   the next co-pilot (1, 4).
5. With a co-pilot mid-slice, the pilot past the advisory sends it the pause; `pilot handoff`'s
   line names the live co-pilot; the terminal gets no `/clear` until the co-pilot has integrated
   its slice, handed back `paused` and been released, then one turn end later it does, and the
   fresh session re-spawns a co-pilot at the next slice (spec 6).
6. Restarting `pilot run` releases the entry, `GET /api/record` showing `live: false` (spec 5).

## 10. Status

| Slice | State | Branch | PR | Worktree | Blocker | Spec |
| --- | --- | --- | --- | --- | --- | --- |
| S1 | planned | | | | – | 1, 2, 3, 5, 6, 7 |
| S2 | planned | | | | S1 | 2, 4, 6 |
| clear-waits-co-pilot | planned | feat/clear-waits-co-pilot | | | – | 1-7 |

## 11. Principles review

| Finding | Verdict | Reason |
| --- | --- | --- |
| F1 `clearOnce`'s first co-pilot look | kept | the post-turn look covers it |
| F2 the A1 refusal in `server.mjs` | kept | one rule in one place: `setCoPilot` refuses, `isChainHandoff` in `items.mjs` |
| F3 `release` of a ticket the entry does not name | kept | a false "released" holds the `/clear` unbounded |
| F4 `sayHeld`'s catch, `coPilotAt`'s non-ok throw, `setCoPilot`'s state refusal | kept | uncovered paths |
| N1 `sameRepo` in `coPilotFor` | kept | as found: the entry is keyed by `repoKey(ticket.repo)` |
| N2 `coPilotFor` in `run.mjs` | kept | as found: renamed `coPilotAt` |
| N3 S2's payment | kept | as found: the step-3 tail cut is named |
| N4 the handoff guard | dropped | it stands on its own, as `yellowTicket` does |
| N5 `noCoPilot` placement | kept | as found |
| N6 | dropped | moot after F3 |
| SubagentStop as a release | dropped | rejected in yellow-agent L3, ADR 0024: a killed agent never fires Stop |
