# A held hand-off is bounded, visible, and the press re-arms it

Feature `held-handoff` · ticket `itm_8a85a7dbe884` · base `pilot` at `fe4969ee` · amends
`clear-waits-co-pilot` (ADR 0089) · rebases on mac-linux (#819)

## 1. Problem

Last session's hand-off did not happen. `pilot run` held the `/clear` because a co-pilot was live, and
the hand-off card still read "A fresh session picks this up". The user pressed "Handoff failed" and the
deck answered "Picked up 57 mins ago by the pilot; nothing failed", although no session had picked
anything up. The run sat for 72 minutes until the user typed `/clear` by hand.

## 2. Spec

| # | Behaviour | Evidence |
| --- | --- | --- |
| 1 | While `pilot run` holds a `/clear` for a live co-pilot, the hand-off's card and thread page read `held: /clear waits on <ticket>'s co-pilot` in place of "A fresh session picks this up…". Handoff failed stays on the card. | `deck/test/handoff-hold.test.mjs`: a render test on a held hand-off; `run.test.mjs`: the `run: held <id> for the co-pilot on <ticket>` line in wrapper.log names the same ticket the card does. |
| 2 | A hold is not a pick-up. The wrapper posts no reply on the thread. A Handoff failed press on a held hand-off carries no `pickedUpAt`, and the page draws no "Picked up … nothing failed". The thread state reads `held`, and the tab shows no `unacknowledged` while the hold stands. | `handoff-hold.test.mjs`: a held hand-off has no pilot message; the press has no `pickedUpAt`; `threadState` is `held`; `isUnacknowledged` is false. |
| 3 | Pressing Handoff failed on any held hand-off in a directory re-arms the `/clear` there. The wrapper types it at the session's next turn end, co-pilot live or not, and then the first prompt as usual. The card reads `re-armed: /clear at the next turn end`. | `run.test.mjs`: with a live co-pilot reader, a re-armed hand-off makes `clearOnce` type `/clear`. wrapper.log: `run: re-armed by the user, typed /clear for <id>`. |
| 4 | A hold is bounded. Twenty minutes after the first hold on any open hand-off in the directory, with the co-pilot still live, the wrapper types `/clear` at the next turn end. No deck change is needed to trigger it. | `run.test.mjs` with a faked clock: nothing at 19:59, `/clear` at 20:00, fired by `watch`'s timer and not by a change event. wrapper.log: `run: hold on <id> past 20 min, typed /clear with the co-pilot on <ticket> live`. |
| 5 | When a fresh session starts while the deck's co-pilot entry for the directory is live, its hand-off notice names that ticket. The session sends that co-pilot a `SendMessage` and spawns none. If it gets no answer, it runs `deck_ticket release` and then spawns. | `hooks/test/session-handoff-yellow.test.js`: the notice reads `a co-pilot is live on <ticket>` when `/api/record`'s `coPilot.live` is true, and "may have survived" otherwise. A wording pin on `agents/pilot.md`'s first-turn rule. |
| 6 | clear-waits-co-pilot's ADR is amended for the bound. | `docs/adr/0089` carries an `Amended 2026-10-…` paragraph, its "A time bound on the hold. Rejected" option reversed with the reason; `npm run adr-index` is clean. |

Implied but never stated: lines 2 and 3 work on a **superseded** held hand-off. Last session the user
pressed the two older ones (`itm_0a9fa92cd367`, `itm_dde1063d8030`), not the newest. That is why the
re-arm and the bound apply to the whole directory, not to one item.

What the draft says that cannot hold here: "the wrapper's held reply does not count as the pick-up". The
fix removes the reply itself, so there is nothing left to count (L2). Spec 1's evidence therefore pairs
the card with the wrapper.log line, not with a reply.

## 3. Findings

The ticket's cause holds, with these corrections:

- **The cause, confirmed.** `deck/run.mjs:363-371` `sayHeld` posts `held: the co-pilot on <t> is live…`
  through `/api/tool` `deck_reply` with no `author`. `deck/store-items.mjs:512` `writerKind(undefined)` is
  `'pilot'`, so the reply is stored as `from: 'pilot'`. On the press, `store-items.mjs:346-348` (at
  fe4969ee; the ticket's 341-342 is older) takes the first `from: 'pilot'` message as the pick-up and
  sets `pickedUpAt`. `deck/ui/render-parts.mjs:142-143` then draws "Picked up … nothing failed". The same
  message also makes `deck/items.mjs:516` `isUnacknowledged` false, so the tab never said
  `unacknowledged` either.
- **The timeline**, from `~/.claude/pilot/wrapper.log:406-409` and `deck.json`:
  - 05:01, 05:16 and 05:26: three hand-offs (`0a9f`, `dde1`, `c36e`) were each held for the co-pilot on
    `itm_1d6f74c3861a`. The pilot posted each new one without pausing the co-pilot.
  - 06:06: the two superseded hand-offs were pressed. The press woke the old session, which answered
    "type /clear yourself".
  - 06:13: `lane: handed itm_c36e4aff3beb` with no `run: typed /clear`, so the user typed `/clear` by hand.
- **A co-pilot survives a `/clear`.** After 06:13, mac-linux S7 was integrated (log
  `20261018T064702404Z-slice-mac-linux-s7.log`), and the 06:53 hand-off reads `mac-linux (paused …)`.
  So the bound's forced `/clear` costs a slice only sometimes (exit 137 on 2026-10-05, ADR 0089).
- **Every hold is a change-event retry**, with no timer (`clearOnce` :315-322, ADR 0089 "A hold, not a
  timed wait"). `watch` (:487-525) has one cooldown timer, `lookWhenCool`, which is the pattern the bound
  reuses.
- **A fresh session's yellow notice** (`hooks/session-handoff.js:318-330`) already says "a co-pilot … may
  have survived: if one is live … `SendMessage` and spawn none". It never reads the deck's entry, so it
  cannot say *is* live. `GET /api/record` already returns `coPilot` (`run.mjs:353-357`).
- **"Held" has two meanings.** `hooks/test/held-handoff.test.js` uses "held" for the stop gate's
  delivered hand-off (handoff-closed-on-pickup), and this feature's item field is `hold` (§4).
- **Wrapper writes.** The wrapper writes to the deck through loopback POST routes guarded by
  `isTrustedOrigin` (`/api/chain`, `server-routes.mjs:718-724`). `/api/hold` sits beside it.

### Seams

| Seam | Interface | Folded behind it | Category |
| --- | --- | --- | --- |
| `holdFor` (`deck/run.mjs`, new, exported) | `holdFor(items, cwd, coPilot, now) -> { clear: true, why, since } \| { clear: false, until }` | the inline `now?.live === true` check (:317-321), the re-arm read and the bound clock: every reason to type or hold | in-process (pure) |
| `markHold` (`deck/store-items.mjs`) | `markHold(id, ticket) -> boolean` behind `POST /api/hold` | `sayHeld`'s reply and its `clear-held-<id>` claim: a hold becomes item state, written once | local-substitutable (the deck file) |
| `addReply`'s Handoff failed branch (`store-items.mjs`) | the existing press; a held hand-off gets `hold.rearmedAt` and no `pickedUpAt` | `pickedUpAt`'s first-pilot-message reading, now skipped on a hold | local-substitutable |
| `noteFor` / `threadState` (`deck/items.mjs`) | existing signatures; `hold` read off the item | the card line and the `held` state, so render and tab read one field | in-process |
| `yellowNotice` (`hooks/session-handoff.js`) | existing; takes `/api/record`'s `coPilot` | "may have survived" or "is live on <ticket>" | remote-but-owned (the deck over HTTP) |

The deletion test: deleting `holdFor` brings back three inline checks spread across `clearOnce`'s loop
and `watch`. It earns its place, and the bound's faked-clock test needs it. `sayHeld` fails the test once
the hold is item state, so it is deleted rather than kept.

## 4. Ubiquitous language

- **hold**: `pilot run` declines to type `/clear` because the directory's co-pilot is live. It is stored
  on the hand-off as `hold: { ticket, at, rearmedAt? }`. This is not the stop gate's "held" marker.
- **re-arm**: a user's Handoff failed press on a held hand-off. From then on the directory's next turn end
  gets a `/clear`, co-pilot or not.
- **bound**: 20 minutes from the earliest `hold.at` among the directory's open hand-offs.
- **adopt**: a fresh session sends a surviving co-pilot a `SendMessage` and spawns none.
- **pick-up**: the first message a session writes on a hand-off with `author` set. A hold is never one.

## 5. Locked decisions

| # | Decision | Rationale | Rejected |
| --- | --- | --- | --- |
| L1 | Grilling depth is *forks*: only fork decisions reach the user, and Gate 1 is the one gate1 item (the user, itm_c7c1eda03cb7, relayed by main, 2026-10-18). | The user's call; the default. | A full walk of every branch. |
| L2 | A hold is item state (`hold: { ticket, at }`), written by `POST /api/hold` → `markHold`, with no reply. `markHold` keeps the first `at` and returns false on a repeat, and the route announces a change only when it wrote. | Nothing reads a hold as a message any more, so `pickedUpAt`, `isUnacknowledged` and `threadState` need no exceptions. The card note shows the hold on both card and page (`noteFor`). | Keeping the reply with `author: 'run'` or `from: 'deck'`: every `from === 'pilot'` reader (5 sites) and `threadState`'s deck branch ("landing ended short") would need an exception. |
| L3 | The re-arm is `hold.rearmedAt` on the pressed item. `holdFor` clears when *any* open hand-off in the directory is re-armed, and `clearOnce` waits for a turn end after `rearmedAt`. | The user pressed superseded items. A press wakes the pilot, so a turn end follows. | Re-arming only the newest: the press the user actually made would do nothing. |
| L4 | The bound starts at the earliest `hold.at` among the directory's open hand-offs, and `holdFor` returns `until`. `clearOnce` hands it to `watch` through an injected `wake(at)`, and `watch` keeps one timer, the same way as `lookWhenCool`. The bound waits for a turn end after the post, not after the deadline. | A pilot re-posting hand-offs never resets the clock. An idle session gets its `/clear` at once. | A clock per hand-off: last session it would have restarted at 05:16 and 05:26. |
| L5 | `holdFor` takes `now` and `clearOnce` takes `now = Date.now`, so the bound is tested on a faked clock with no `setTimeout` in the pure part. | Spec 4's evidence. | Mocking timers globally. |
| L6 | A forced `/clear` asks the co-pilot nothing first. The wrapper has no channel to it, so adoption (spec 5) is the recovery. | ADR 0089's pause is the pilot's job, and the wrapper cannot send it. | Holding past the bound until a pause lands: that is today's bug. |
| L7 | The hook's notice says `is live on <ticket>` only when `/api/record`'s `coPilot.live` is true. In every other case it keeps "may have survived". | A read the hook already makes (`hooks/lib/deck.js:172`). | A new route. |
| L8 | Superseded hand-offs are not closed by this feature. | Not asked for, and a re-arm on any of them works anyway (L3). | Closing older hand-offs on a new post (§7). |

## 6. Assumed decisions

- **A1 Whether the hold also writes a line on the hand-off's thread** (thread `itm_06a44ad5d196`). Default: No line. The hold shows only as the card and page note (`held: /clear waits on <ticket>'s co-pilot`), plus wrapper.log. Tradeoff: The thread loses its "held" message, and its history no longer shows when the hold began. In return no message can count as a pick-up. Rejected: A `deck`-authored thread line, which needs an exception at every pick-up reader.
  Answer: "No thread line (default)", the user, 2026-10-18.
  Verdict: stands — the user took the default; no other run reads a hand-off thread's lines, and the pick-up readers stay exception-free.

## 7. Out of scope

- Closing superseded hand-offs, and the pilot posting a second hand-off while one is held.
- Making the pilot pause its co-pilot before a hand-off (the guard's advisory, ADR 0089 A3). Last session
  that pause was skipped; the bound covers for it, and enforcing the pause is another ticket.
- A landing queued past the hand-off cap (itm_439d37064018). It will read `holdFor`'s `{ clear, why }`,
  and nothing is built for it here.

## 8. Slices

Width 2; longest stem 3

| Slice | Title | Spec | Files owned | After | Reviewers | File |
| --- | --- | --- | --- | --- | --- | --- |
| S1 | A held hand-off says so on its card, and is not a pick-up (walking skeleton) | 1, 2 | `deck/store-items.mjs` (`markHold`), `deck/server-routes.mjs` (`POST /api/hold`), `deck/items.mjs` (`noteFor`, `isUnacknowledged`, `threadState`), `deck/ui/render-cards.mjs` (`held` label), `deck/run.mjs` (`sayHeld` → `/api/hold`), `deck/test/handoff-hold.test.mjs` (new), `deck/test/run.test.mjs` | – | `pilot:typescript-reviewer`, `pilot:security-reviewer` | [S1](slices/S1.md) |
| S2 | Handoff failed on a held hand-off re-arms the /clear | 3 | `deck/store-items.mjs` (press branch), `deck/items.mjs` (re-armed note), `deck/run.mjs` (`holdFor`, `clearOnce`), `deck/test/handoff-hold.test.mjs`, `deck/test/run.test.mjs` | S1 (`deck/store-items.mjs`, `deck/run.mjs`, `hold`) | `pilot:typescript-reviewer` | [S2](slices/S2.md) |
| S3 | A hold past 20 minutes types the /clear anyway | 4, 6 | `deck/run.mjs` (`holdFor` bound, `clearOnce` `now`/`wake`, `watch` timer), `deck/test/run.test.mjs`, `docs/adr/0089-a-chain-hand-off-waits-for-the-co-pilots-release.md`, `docs/adr/README.md` | S2 (`holdFor`) | `pilot:typescript-reviewer` | [S3](slices/S3.md) |
| S4 | A fresh session adopts a live co-pilot | 5 | `hooks/session-handoff.js` (`yellowNotice`), `agents/pilot.md` (first-turn rule), `hooks/test/session-handoff-yellow.test.js`, `scripts/test/held-handoff-pilot.test.mjs` (new) | – | `pilot:typescript-reviewer`, `pilot:security-reviewer` | [S4](slices/S4.md) |

## 9. Acceptance evidence

In a scratch deck (`PILOT_DECK_DIR`, `PILOT_DECK_PORT`) under `pilot run`, with a yellow ticket whose
co-pilot entry is set live:

1. Post a hand-off. Its card reads `held: /clear waits on <ticket>'s co-pilot`, and wrapper.log names the same ticket (spec 1).
2. Its thread has no pilot message, its state reads `held`, and the tab shows no `unacknowledged` (spec 2).
3. Press Handoff failed. No "nothing failed" line appears, the card reads `re-armed…`, and `/clear` is typed at the next turn end with the co-pilot still live (specs 2, 3).
4. On a second run, wait 20 minutes. `/clear` is typed with no press (spec 4).
5. The fresh session's notice reads `a co-pilot is live on <ticket>`, and the session messages that co-pilot rather than spawning one (spec 5).
6. `docs/adr/0089` reads amended, and `npm run adr-index` is clean (spec 6).

## 10. Status

| Slice | State | Branch | PR | Worktree | After | Spec |
| --- | --- | --- | --- | --- | --- | --- |
| S1 | planned | | | | – | 1, 2 |
| S2 | planned | | | | S1 | 3 |
| S3 | planned | | | | S2 | 4, 6 |
| S4 | planned | | | | – | 5 |
| held-handoff | planned | | | | S1-S4 | 1-6 |
