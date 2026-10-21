# FB Fix round: the deck and the sub-deck

Feature `pilot-branch` · added after the principles review and QA (2026-10-05) · traces to spec 8, 10, 14, 15, 16 and A14, A17 · source: the pilot's verdicts in `run.json` `findings` · moves no locked decision

Every item was judged by the pilot against the code at `60642438`. Line numbers are from that commit.

## Files owned

`deck/store.mjs`, `deck/server.mjs`, `deck/wait.mjs`, `deck/chain.mjs`, `deck/session.mjs`, `deck/run.mjs`, `deck/subdeck.mjs` (one comment), `deck/tabs.mjs`, `deck/ui/render.mjs`, their tests under `deck/test/`. Nothing under `scripts/`, `bin/` or `agents/`: FA owns them and runs at the same time.

## Changes

| # | Where | Change |
|---|---|---|
| F1 | `deck/wait.mjs:135`; `deck/server.mjs:703-707`, `:1039` | `pilot wait`, the listener the pilot's prompt prescribes, sends `{ repo: cwd }` and no `run`. `waiterFilter` and `takePauseNotice` key on `args.run`, so a sub-deck listening with `pilot wait` hears none of its own threads and never the pause, and `wait.mjs` does not print `pause` when it comes. Key both on the waiting directory when no run is named (a directory that is a sub-deck's is one, whoever asks), and make `wait.mjs` print the pause notice and exit. Tests through `wait.mjs` itself, not only MCP `deck_wait`. |
| F2 | `deck/store.mjs:1784-1808`; `deck/server.mjs:1498-1501` | `GET /api/record?repo=<sub-deck dir>&ticket=` throws "no ticket" and `?repo=<sub-deck dir>` returns `record: null`; with the parent's directory the role comes back `main`. Resolve the home inside `recordFor` and `recordForTicket`, so a sub-deck asking in its own directory gets its record, `role: sub` and its budget in one call. A main deck's read is unchanged. |
| F3 | `store.mjs:1453`, `:1757`, `:1052`; `server.mjs:704`, `:827`, `:995`; `chain.mjs:103-105` | One `homeOf(dir)` in the store, which F1, F2, the role, the budget, the record key and the chain call; `roleFor`, `parentFor` and `recordHome` go where it replaces them. Bounded: the client's repo rewrite on `deck_post` (`client.mjs:221-222`) and `render.mjs:1695` stay as they are. If this passes 120 changed lines of product code, stop at F1 and F2 using `homeOf` and report the rest. |
| QA1 | `deck/run.mjs:760-768` | `pilot run --sub` with a sub-deck already live for this main deck runs `openSubdeck`, which checks the live session's worktree out again, and launches a second `claude` there. Refuse before `openSubdeck`, naming the live one (spec 8). The daemon may be down: then there is no live run to ask about and the start goes on as today. |
| F7 | `deck/ui/render.mjs:1260` and the live branch below it | A child tab draws Start when ended, which opens a plain `pilot run` in the sub-deck's worktree (no `dontAsk`, and its registration drops the paused row), and End when live, which cuts a slice off mid-way (L17 rejected that). A child tab draws Pause or Resume and neither Start nor End. |
| A14 | `deck/ui/render.mjs` | The child tab draws its own Chat and Closing reports panels; a message typed there goes to a directory nobody answers. A14: the chat, the closing reports and the open threads are on the main deck's tab only. Do not draw them on a child tab. |
| N1 | `deck/server.mjs` (`waitForReplies`) | A wait already parked hears Pause only at its next poll, up to 120 s. Wake it on the press (S11 removed the `noticed` hook with the mode notice: restore what the pause needs, nothing else). |
| N2 | `deck/session.mjs:69-77`; `/api/runs` in `deck/server.mjs` | The sub start's latch is not released when the sub-deck registers (registration clears the latch for `run.repo`, not the parent), so a sub-deck that exits inside 60 s blocks the next start. Release it for the parent. |
| N4 | `deck/run.mjs:767` | The sub-deck is started with `RESUME_PROMPT`, which says "take the next green ticket". A sub-deck takes yellow: give it a start prompt that says so, or one that names no colour. |
| N7 | `deck/subdeck.mjs:21` | The comment says "(A16, assumed)"; A16 is answered by the user. |
| F11 | tests | The missing assertions on these files: `budget.mjs:22` and `:38` (the floors accepted at exactly 1 and 2; a missing field); `chain.mjs:109`, `:111`, `:114` (Resume chaining at start, pausing with the ticket still live, a sub-deck at start over an unfinished parent record); `tabs.mjs:154-155` (a paused tab kept for Resume); `subdeck.mjs:57` and `run.mjs:764-766` (a failed fetch in `openSubdeck`). |

## Not in this brief, decided

The three pause flags stay three; `storedBudget`'s try/catch stays; `besideParents`' guard stays; no check of `parent` against known decks in `registerRun`; the window's title; `FINISHED_PAUSED`'s place; `chainNext`'s size.

## Done

- **Verification**: `npm test`; the two check scripts; on a scratch deck (port 4451) with a main run and a sub-deck run: `node bin/pilot.mjs wait` run in the sub-deck's directory hears a reply to a thread stamped as its own and prints the pause within seconds of the press; `/api/record` asked in the sub-deck's directory with a ticket; the child tab looked at in a browser, live and paused; a second `run --sub` refused.
- **Prohibited**: no start of a real `claude` session against the real `~/.claude` (set `CLAUDE_CONFIG_DIR` to a scratch directory in every shell that could start one, and inject the spawn in tests); no change to what a main deck's wait or record read returns; no edit outside `deck/`.
- **Done when**: the gate is green, each row has a test that failed before it, and the scratch runs are in the PR body.
