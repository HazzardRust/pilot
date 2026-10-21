# idle-main-lane: an idle main lane is a refused state while a red or green ticket is queued

Ticket `itm_5717249cf87a` · base `pilot` 64906d40 · branch `design/idle-main-lane`

## 1. Problem

A session's hand-off and the SessionStart notice described only the co-pilot's lane ("the main session
holds no run of its own; a co-pilot may be live on ticket X"). Nothing said the main lane was empty while
a green ticket sat queued, and `pilot wait` parked the idle main lane without complaint. The rule ("take
nextTicketOf's pick") was prose that nothing enforced. The user wants an idle main lane refused by the
tools, not remembered, with one correction: an idle main lane is fine while no red or green ticket is queued.

## 2. Spec

Agreed by the user as proposed (itm_746764eedd72).

| # | Behaviour | Evidence |
| --- | --- | --- |
| 1 | `pilot wait` as the pilot (the default kind) prints `main lane empty; itm_X is queued <red\|green> — deck_ticket take it first` and exits 0 at once when this directory has no live ticket, no pending main switch, and `nextTicketOf` has a pick (red or asked first, the order it already has). It checks again after each empty poll, so a ticket queued mid-wait ends the wait one poll later. With nothing red or green queued it parks as today; `--as architect\|qa\|teacher\|auditor` never refuses. | `deck/test/wait-idle-lane.test.mjs`: red queued, green queued, none queued, `--as architect` with green queued. |
| 2 | The Stop hook refuses the main session's turn end with the same line in the same case, once per stop like every Stop refusal (`stop_hook_active` lets the next stop through). A crew agent's turn (`agent_id`) is never refused. | `hooks/test/stop-gate-idle-lane.test.js`: red, green, none, and an `agent_id` payload. |
| 3 | Neither refuses while an open `handoff` item is in this directory, so the session that ran `pilot handoff` stops for its `/clear`. | A wait test and a stop-gate test with an open handoff and a green ticket queued: no refusal. |
| 4 | The item `pilot handoff` posts, and the SessionStart notice wherever it already speaks (hand-off pickup, recovery, yellow re-brief), carry two lane lines: `main: itm_X` or `main: empty → next <red\|green> itm_X` or `main: empty`, beside `co-pilot: itm_Y` or `co-pilot: none`. | `scripts/test/handoff-lanes.test.mjs` and `hooks/test/session-handoff-lanes.test.js`: an empty main lane with a green ticket queued shows both lines. |
| 5 | `deck_ticket co-pilot` and `deck_ticket release` answer with the main lane on the same line: `Co-pilot X: live. Main: empty, next green itm_Z` (or `Main: itm_Z live`, `Main: empty`). | `deck/test/ticket-tool-lanes.test.mjs`: one assertion per action and lane state. |

## 3. Findings

- `nextTicketOf(items, repo)` (`deck/items.mjs:568`) already is "the queued red or green ticket, red first":
  red or asked (non-yellow) first in deck order, else the green head; never yellow, never live. Its only
  states are red and green (`stateOf`, `deck/items.mjs:82`).
- `deckStateOf(items, repo, switching)` (`deck/items.mjs:596`) already answers `'queued'` for exactly
  "no live ticket, no main switch, a pick": the refusal condition. Only the rail (`deck/ui/render-rail.mjs:492`) reads it.
- The chain (`deck/chain.mjs` `chainNext`) takes the head live on a clean finish, in place under the mark
  or with a hand-off, so a run that finishes cleanly never leaves the lane empty with a pick.
- `GET /api/record?repo=` (`deck/server-routes.mjs:588`) answers `{ record, yellow, budget, co-pilot }` and
  is read by `scripts/handoff.mjs:104`, `hooks/session-handoff.js:379` (`recordFor`, through
  `hooks/lib/deck.js:171` `record`), `deck/run.mjs:353` and `hooks/context-size-guard.js`. It marks
  nothing delivered, so the Stop hook and a wait may read it freely.
- `pilot wait` (`deck/wait.mjs:165`) reads the deck once before its loop (`isKnownRepo`) and polls
  `deck_wait`; it has no lane read today. `--as` kinds are `OWNER_KINDS` (`deck/items.mjs:366`).
- The Stop hook (`hooks/stop-gate.js:256` `run`) blocks on an answered thread, then a held hand-off,
  then holds for the pilot's open question; it stands aside on `stop_hook_active` and `agent_id`.
- `deck_ticket co-pilot|release` answer in `deck/server-tools.mjs:319-325` from `setCoPilot`
  (`deck/store-runs.mjs:372`); `coPilotFor` (`:348`) says whether the co-pilot is live.
- `scripts/handoff.mjs:114` is the sentence the user quoted: the co-pilot-only body.

### Seams

| Seam | Interface | Folded behind it | Category |
| --- | --- | --- | --- |
| `deck/lanes.mjs` (new) | `lanesFrom(items, repo, { switching, co-pilot }) → Lanes`; `lanesOf(repo) → Lanes`; `Lanes = { main, co-pilot, mainClause, refusal }` | `deckStateOf`, `nextTicketOf`, `liveTicketOf`, the main switch, `coPilotFor`'s liveness, the open-hand-off exemption, and every spelling (lane lines, `Main:` clause, refusal line) | in-process |
| `GET /api/record` | adds `lanes: Lanes` to its answer | one more field from `lanesOf` | local-substitutable (a test deck on a port) |
| `wait()` (`deck/wait.mjs`) | unchanged signature; a refused wait prints `Lanes.refusal` and answers 0 | the lane read beside `isKnownRepo` and after each empty poll | local-substitutable |
| Stop hook `run(input)` | unchanged; may answer `{ decision: 'block', reason: Lanes.refusal }` | the lane read through `deck.record` | local-substitutable |

Deletion test: deleting `lanes.mjs` puts the rule and its spelling back into five consumers across two
module systems (the hooks are CommonJS and cannot import `deck/items.mjs`); it earns its keep. The
consumers stay shallow on purpose: each prints a string the daemon spelled. No existing module is
shallow enough to fold, so there is no fold slice.

## 4. Ubiquitous language

- **Main lane**: the directory's red-or-green work: its live ticket, else empty. A yellow ticket is never in it.
- **Pick**: `nextTicketOf`'s answer, the ticket the main lane takes next.
- **Idle main lane**: no live ticket, no pending main switch, and a pick (`deckStateOf` = `queued`).
- **Lane line**: `main: …` or `co-pilot: …`, as `lanesFrom` spells it.
- **Refusal line**: `main lane empty; itm_X is queued <red|green> — deck_ticket take it first`.

## 5. Locked decisions

| # | Decision | Rationale | Rejected |
| --- | --- | --- | --- |
| L1 | Grilling depth is forks: no walk before the gate1 (user, itm_8c5ab7315737). | The user's call. | A full walk. |
| L2 | The rule lives once, in `deck/lanes.mjs`, built on `deckStateOf` and `nextTicketOf`; every surface prints its strings. | One spelling; the hooks cannot import the ESM items module. | Recomputing in each hook from `deck_read`, which caps at the open-read limit and would drift. |
| L3 | It reaches clients on `GET /api/record` as `lanes`. | Every client already reads that route; it marks nothing delivered. | A new route: one more contract. |
| L4 | Only the pilot's wait is refused; architect, QA, teacher and auditor waits never. | Only the main session holds the main lane. | Refusing every kind, which ends crew waits on a lane they cannot take. |
| L5 | The wait checks at start and after each empty poll, never mid-poll. | No new wake path in the daemon. | A daemon wake on ticket state, a larger change. |
| L6 | A deck that does not answer refuses nothing in the Stop hook, and is the wait's existing exit 1. | A dead deck must not trap the pilot (the Stop hook's own rule). | Refusing on unknown state. |
| L7 | An open `handoff` item in the directory exempts both refusals (spec 3, agreed). | The session told "stop here" for its `/clear` must stop. | No exemption. |
| L8 | One ADR, `docs/adr/0123-an-idle-main-lane-is-refused.md`, written in S1. | A standing structural rule. | None. |
| L9 | QA runs against a scratch deck (`pilot deck --scratch` on a scratch repository, `claude --plugin-dir <worktree>`), never the live inbox (user, itm_11661041ed41). | A refusal test on the live deck would refuse the user's own sessions. | The live deck. |

## 6. Assumed decisions

None is fork-grade (L1); these are defaults taken and listed.

| # | Default taken | Tradeoff |
| --- | --- | --- |
| A1 | A refused wait exits 0 with the line, like `NO REPLY`. | A new exit code would let a script tell it apart, at the cost of one more code to learn. |
| A2 | Lane lines spell `main: empty → next green itm_X` in the hand-off and the notice; the `deck_ticket` clause keeps the user's `Main: empty, next green itm_X`. | Two spellings as the user wrote them, against one everywhere. |
| A3 | The Stop hook checks the lane after answered threads and the held hand-off, before the hold on an open question. | An answer to act on comes first; a pick beats a nine-minute hold. |

## 7. Out of scope

- Any prose change in `agents/pilot.md` (prompt-budget pins); the refusal line teaches itself.
- Refusing in the co-pilot's lane, or an empty co-pilot lane with a yellow ticket queued.
- A daemon-side wake when a ticket turns red or green mid-poll (L5).
- The deck page's rail, which already draws `queued`.

## 8. Slices

Width 4; longest stem 2

| Slice | Title | Spec | Files owned | After | Reviewers | File |
| --- | --- | --- | --- | --- | --- | --- |
| S1 | `pilot wait` refuses an idle main lane (walking skeleton) | 1, 3 | `deck/lanes.mjs` (new), `deck/server-routes.mjs` (`/api/record` adds `lanes`), `deck/wait.mjs`, `deck/test/lanes.test.mjs` (new), `deck/test/wait-idle-lane.test.mjs` (new), `docs/adr/0123-an-idle-main-lane-is-refused.md` (new), `docs/adr/README.md` | – | `pilot:typescript-reviewer`, `pilot:security-reviewer` | [S1](slices/S1.md) |
| S2 | The Stop hook refuses an idle main lane | 2, 3 | `hooks/stop-gate.js`, `hooks/test/stop-gate-idle-lane.test.js` (new) | S1 (`/api/record` `lanes`) | `pilot:typescript-reviewer`, `pilot:security-reviewer` | [S2](slices/S2.md) |
| S3 | `pilot handoff` names both lanes | 4 | `scripts/handoff.mjs`, `scripts/test/handoff-lanes.test.mjs` (new) | S1 (`/api/record` `lanes`) | `pilot:typescript-reviewer`, `pilot:security-reviewer` | [S3](slices/S3.md) |
| S4 | The SessionStart notice names both lanes | 4 | `hooks/session-handoff.js`, `hooks/test/session-handoff-lanes.test.js` (new) | S1 (`/api/record` `lanes`) | `pilot:typescript-reviewer`, `pilot:security-reviewer` | [S4](slices/S4.md) |
| S5 | `deck_ticket co-pilot` and `release` say the main lane | 5 | `deck/server-tools.mjs`, `deck/test/ticket-tool-lanes.test.mjs` (new) | S1 (`lanesOf`) | `pilot:typescript-reviewer` | [S5](slices/S5.md) |

Every slice but S5 hits the security trigger: a CLI's output (S1, S3) or a hook's (S2, S4).

## 9. Acceptance evidence

1. On a scratch deck with no live ticket and a green ticket queued, `pilot wait` prints the refusal line naming it and exits at once; `pilot wait --as architect` parks.
2. With a red ticket queued too, the line names the red one.
3. Ending the pilot's turn there shows the Stop hook's refusal once; the next stop goes through.
4. With nothing red or green queued, `pilot wait` parks and the turn ends silently.
5. After `pilot handoff` in that state, the posted item reads `main: empty → next green itm_X` and `co-pilot: …`, the turn ends unrefused, and the fresh session's SessionStart context carries both lines.
6. `deck_ticket co-pilot itm_Y` answers `Co-pilot itm_Y: live. Main: empty, next green itm_X`.

## 10. Status

| Slice | State | Branch | PR | Worktree | After | Spec |
| --- | --- | --- | --- | --- | --- | --- |
| S1 | planned | | | | – | 1, 3 |
| S2 | planned | | | | S1 | 2, 3 |
| S3 | planned | | | | S1 | 4 |
| S4 | planned | | | | S1 | 4 |
| S5 | planned | | | | S1 | 5 |
| idle-main-lane | planned | | | | S1–S5 | 1–5 |
