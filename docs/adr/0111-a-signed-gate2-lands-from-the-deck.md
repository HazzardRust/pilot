---
status: amended
date: 2026-10-10
tags: [gates, deck, git]
supersedes: []
superseded_by: []
paths: [deck/landing.mjs, deck/landing-wait.mjs, deck/store.mjs, deck/server.mjs, deck/daemon.mjs, deck/test/no-open.mjs, bin/pilot.mjs, agents/pilot.md]
---
# A signed gate2 lands the feature from the deck

This amends ADR 0050 and L14 of ADR 0083. ADR 0050 let the daemon start one fixed command, Start's visible `pilot run`; ADR 0083 had step 9 of the pilot run `pilot land` once the user signed Gate 2. On 2026-10-08 Claude Code's auto-mode classifier refused that `pilot land` as "Merge Without Review" (itm_38b3049df6ba): it reads the command text and cannot see the gate. So we decided the user's Sign off press on a gate2 is itself the act that lands, and the daemon starts the landing, so no landing passes through the pilot's tool calls (gate2-lands spec 1, 9).

- **One more fixed command.** After `/reply` has stored a Sign off pressed on a gate2 from the deck's own page, `deck/landing.mjs` runs `spawn(node, [<bin/pilot.mjs>, 'land'], { cwd, shell: false, windowsHide: true })` with the parent session's markers dropped (`sessionEnv`). Nothing from the request or the store reaches argv, and the test command is the repository's, never one the deck passes.
- **The worktree, checked at the press.** `cwd` is the ticket's run-record `worktree`, and only when it is an absolute directory that `repoOf` places in the gate2's repository. No record, no worktree, a worktree that is gone or another repository's checkout is refused on the thread as `NOT landed: …; nothing run`, and nothing runs.
- **The daemon stays live.** `land()` is never called in the daemon, whose `spawnSync` would freeze every page for the length of the suite; the daemon waits on the child asynchronously.
- **The thread says it.** The gate2 carries `landing: { state, startedAt, at?, sha?, line? }`, and each change writes a pilot-kind line with the deck's byline in the same write, which wakes no session: `landing: running pilot land in <worktree>` at once, then land's own stdout, its last 2000 characters, withheld with the exit code when it looks like a credential.
- **Once, and one per repository.** A Sign off on a gate2 that is landed or running is refused on its thread and runs nothing; one on a gate2 whose repository already has a landing running is refused until that one settles. A gate2 that settled NOT landed goes to the lander, with no second Sign off (ADR 0161).
- **The daemon kills only its own landing.** A land still running after 30 minutes has its whole tree killed by the child handle the daemon holds, `taskkill /T /F` on Windows and its process group (spawned `detached`) elsewhere, and settles `NOT landed: timed out after 30 min`. No stored pid is ever killed (ADR 0035).
- **A restart interrupts, it does not resume.** A new daemon holds no handle on the last one's child and cannot wait on it, so at start-up the daemon settles every landing still `running` as `landing interrupted: the deck restarted; check origin/pilot`, before it reads a press; that gate2 goes to the lander, with no second Sign off (ADR 0161).
- **The pilot reads the outcome.** `GET /api/landing?id=<gate2>` answers the stored `{ state, line? }` and marks nothing delivered; `pilot landing <gate2-id>` polls it until the landing settles, prints its line and exits 0 landed, 1 not, 2 no deck or no such gate2, giving up after 40 minutes.
- **No test pushes.** `PILOT_DECK_NO_LAND`, set in `deck/test/no-open.mjs`, makes a press write "landing is turned off on this deck" and run nothing; unit tests inject `spawn`.
- **The trust boundary is unchanged.** A gate's Sign off is already taken only from the deck's own page on a loopback Host (ADR 0064).
- **Step 9 reads, not runs.** The pilot no longer runs `pilot land` after the press; it reads the landing's line. `pilot land` stays a command for the user's own hand.

Rejected:
- A separate Land button: a second press the user did not ask for.
- An MCP tool that lands: an agent could call it.
- Calling `land()` in the daemon process: every page would freeze while the tests ran.
- `cmd /c pilot land`: a shell would parse it.

Amended 2026-10-18 by ADR 0161: a refused landing goes to the lander, and the user gets no second Sign off. The two lines that offered one (the per-repository rule and the restart rule) now read that the refused gate2 goes to the lander. Everything else here stands.
