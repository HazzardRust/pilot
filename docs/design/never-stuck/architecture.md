# never-stuck: a run never stops silently, or sits stuck, and a stale plan is re-cut as standard

Ticket itm_9b7008e91201, with itm_8d89d2230e03 and itm_0a2eca54e2f7 merged in (merge thread itm_452048a4e404,
"Merge these"). Base `origin/pilot` d7569a49. Slug `never-stuck`.
Run 2 (Run B): ticket itm_4be94a7ae00a, slug `never-stuck-2`, merge thread itm_7f1a5d64c8d6 ("merged none"); adds
spec 25-27 (itm_99b65de1e279) and S19. Branch `design/never-stuck-2`, cut from `feat/never-stuck`, rebased onto 0a95356d (A5).

## 1. Problem

The user's words: "make sure to log these things so we fix them at some point, how the system came to stop";
"i thought that if a yellow blocking goes unanswered after a certain amount of time, the next yellow ticket is
started so that the system never gets stuck"; "we can add the 're-cut' behaviour as standard canonical behaviour
... you should figure out the exact mechanics of what happens to a ticket when it needs to be re-cut, and when/who
checks for it (which agent)"; "can we stop the problem at where it even tried to take over the yellow lane when
there was already something on it?"; and from itm_0a2e, a deck restart left a land child running while
`Land again` started a second.

A piloted run keeps ending up stopped or idle with nobody told. A landed gate2 with no closing report reads green.
A planning ticket reads live with no architect. A co-pilot is told to hand back `paused` while its implementers
still run. An unanswered item holds a lane for hours. `pilot wait` exits without saying what could run. A signed
plan goes stale and nothing notices until the build. Each of these must be said aloud or resolved by the system.
Run 2 adds (2026-11-17): "did we catch why the last session didnt /clear on it's own? we need to make sure it doesnt
happen again": a hand-off sat held 8.5 minutes for a co-pilot whose pause was only queued.

## 2. Spec

Status column: what `origin/pilot` d7569a49 already does (read in code, §3). Bars are counts, bounds or minutes.

| # | Behaviour | Evidence, bar | Status |
|---|---|---|---|
| 1 | A landed gate2 whose ticket is still open is owed `report owed`: the SessionStart notice names it, and the ticket card reads "report owed". | Deck and hook tests: 1 landed gate2 with no report gives exactly 1 owed row and the card label. itm_09a7f609e937 sat green 2.5 h. | no |
| 2 | After a hand-off, each live red ticket with no open gate1 is owed `architect owed` in the first prompt. | session-handoff-owed test: 1 live red ticket gives 1 row; with an open gate1, 0. | no |
| 3 | A yield never makes a co-pilot hand back while slices are in flight: the ticket stays implementing and holds the slot until the co-pilot hands back `paused` with 0 children live. | Yield test: at 20 min the ticket is still yellow and the slot is held; after `release` it is green and paused. Happened 4 times on 2026-11-16/17 (handoff-mod S2, S3 live). | no |
| 4 | pilot-lander and pilot-teacher reach the deck when its MCP failed at start, by ToolSearch. | Frontmatter test: both `tools:` lines name ToolSearch, 0 crew agents with a deck tool lack it. | no |
| 5 | On `landed`, the deck closes every open blocking question on that ticket authored by the deck or the lander as `Moot: landed <sha7>`, then closes the gate2. | Deck test: 1 conflict question open at landing is closed within the same write; itm_47b9b7122ca6 was not. | no |
| 6 | A signed ticket goes back to planning (`deck_ticket recut`): it turns red with a `recut` mark, takes a fresh gate1, and the press replaces its plan field. | Ticket test: yellow to red in 1 call; the gate1 Sign off writes the new sha. itm_37c47ae69a4a, itm_2f4fa531782f went up as signoffs. | partly: the press already writes the plan on a red ticket |
| 7 | `pilot wait` prints the idle-lane refusal at most once and keeps listening; the Stop hook stays the enforcer. | wait-yellow-lane test: refusal printed once, the wait exits only on a reply. | no (ADR 0143 L2 exits) |
| 8 | Any blocking item on the held yellow ticket, a walkthrough as much as a question, unanswered 20 minutes, yields its ticket. | Yield test with a blocking walkthrough reads `Paused <id>` at 20 min. itm_056242cf4239 held the lane 10 h. | partly: questions only |
| 9 | With nothing runnable, each lane line names why for every queued ticket it skipped (at most 5): `blocked on <q>`, `orphaned`, `draining`, `re-cut`. | Lanes test: 1 line per reason. other-host read "next" with a dead plan. | no |
| 10 | A non-blocking question with a `recommended` option, unanswered 20 minutes, is answered by the deck with that option and closed as `Assumed:`; proposals and `Merging tickets` are never. | Deck timer test at 20 min; a proposal at 60 min stays open. itm_42b44bf83d2a idled overnight. | no |
| 11 | Every `NO REPLY` exit of `pilot wait` prints the lane lines and owed rows; pilot.md says act on them before listening again. | Wait test reads at least 3 lane lines; pilot.md within its pin. 4 bare exits in a row on 2026-11-16. | no |
| 12 | One trusted live root, `~/.claude/pilot/live`, set up once by the user through a walkthrough; live checks run in a plain subdirectory of it or in a worktree of a trusted repository, never in a fresh git repository (a nested repository always prompts). | `pilot live-root` prints `trusted` in 1 line after the walkthrough; a second slice's live check shows 0 trust screens. | no |
| 13 | At a ticket's first co-pilot grant the deck checks the plan: its sha must be on `origin/<plan.branch>` and 0 owned files may have changed on `origin/pilot` since the plan's base; else the grant answers `re-cut check due: <sha gone \| files>` and the ticket goes red in the same call. | Deck test with a temp repo: a moved owned file reads `re-cut check due` and the path; an untouched plan is granted. | no |
| 14 | After `landed`, the deck runs the same check over every signed, never-granted yellow ticket and sends each drifted one red for a re-cut check, naming them in 1 deck line on the gate2. | Landing test with a queued plan owning a landed file reads its id. | no |
| 15 | The architect judges each re-cut check: it reads the landed change against the plan and decides whether the nature of the functionality changed (L3). It re-cuts on the existing artefact: locked L‹n› kept, 0 questions re-posted for them, only touched slices re-cut. When `docs/design/<slug>/` is textually unchanged, `deck_ticket replan` restores the signed plan at the new sha with no press (sticky approval); else the gate1 body carries `Changed since <sha7>:`. | Deck tests: a gate1 on a recut ticket without the line is refused; replan with 0 changed files is yellow, with 1 is refused. | no |
| 16 | pilot.md, pilot-architect.md and pilot-co-pilot.md name the re-cut (who checks, when, what happens to the ticket) and the drain, each within its prompt pin. | `node scripts/measure-prompt.mjs`: headroom at least 0 for every pinned agent. | no |
| 17 | `deck_ticket co-pilot` on a second ticket while the holder is live, open and yellow is refused, naming the holder and the 2 ways through (`release`, or a switch whose `to` it is). | co-pilot test: 2 yellow tickets, grant 1, the second refused, the slot unchanged. | no (store-runs.mjs:380 overwrites) |
| 18 | A switch's grant names the holder it replaced (`Co-pilot <to>: live, replaced <from>`) and writes 1 deck.log line. | Switch test reads the id in the answer and the log. | no |
| 19 | An open yellow ticket once granted and held by nobody is never offered as next; the lane line names it `orphaned`. | Lanes test: 1 orphan, 0 picks. | no |
| 20 | pilot.md: a short-path ticket holds the yellow lane like any other; a Gate 1 Sign off while yellow is held queues the ticket; every `deck_ticket` answer's lane line reads `Yellow: held by <id>`. | Deck test reads `held by`; pilot.md within its pin. | no |
| 21 | The deck records its land child's pid on the landing; on restart a live pid is re-adopted (its line read on exit) or stopped, before any `landing interrupted`. | Deck test with a stub child: 0 `interrupted` while the pid lives. | no (pid in memory only) |
| 22 | `Land again` is refused while a process holds the land dir, naming the pid and the dir, in 1 line. | Deck test: refused with a live stub; lands after its exit. | no |
| 23 | pilot-lander.md: after "the deck restarted", confirm the old land has exited before `Land again`. | Lander prompt test; 1 line. | no |
| 24 | A user's answer on an agent-owned thread that no wait of the owner is parked on is handed to the pilot within 30 seconds and named `unheard by <owner>`, however busy the owner is. | Fallback test: architect active, no parked wait, the reply is the pilot's at 30 s. itm_f923919ee292: 2 answers sat "not picked up yet". | no |
| 25 | *Added.* When the pilot's pause to a live co-pilot answers `Message queued for delivery`, the pilot runs `deck_ticket release` at once; the hand-off's `/clear` follows the next turn end, never the 20-minute bound. | run-look test: hold, release, turn reads `clear` at 1 min, 0 `past 20 min` lines; the guard's advisory and `pilot handoff`'s line each name "queued" and the release (2 pins). Held 8.5 min on 2026-11-17. | no: both texts say "release it on its hand-back" only |
| 26 | *Added.* `pilot handoff` with a live co-pilot prints, in its one line, that the `/clear` is held, for which ticket, and the bound (`up to 20 minutes`, read from `HOLD_BOUND_MS`); with none, no held clause. | handoff test reads both lines. | partly: names the ticket, not the hold or the bound |
| 27 | *Added.* The deck shows the hand-off held on the hand-off item while it is held: `held: /clear waits on <ticket>'s co-pilot`, with the ask "Stop waiting for the co-pilot". | Existing test, 2 asserts (note, ask) in `deck/test/handoff-hold.test.mjs`; QA sees 1 held card. | yes: `deck/items.mjs:311, :325`, in 0.9.8; no slice |

practitioner: SRE on-call: a hold is shown with its owner and its deadline, and a page that cannot be delivered is
escalated at once, not after its timeout (lines 25, 26). Raw material: the pilot transcript's own SendMessage
answer, the string line 25's rule keys on.
practitioner: release engineer (GitHub merge queue, Gerrit, Mergify): staleness is checked by the system on every
base move, never by a person, and an approval survives a trivial rebase (lines 13-15).
practitioner: SRE on-call: an unacknowledged page escalates on a timer, and a silent stop is an incident (lines 1, 8, 10, 24).

## 3. Findings

- Ticket states `red, yellow, green, closed` (`deck/items.mjs:73`); nothing writes `red` after the post
  (`deck/store-items.mjs:157`). The plan is written only on a gate1 Sign off on a red ticket
  (`store-items.mjs:596-598`, `planOf` :651 holds artefact, branch, sha, slug, sliceCount, gate1, surface). A gate1
  on a yellow ticket is refused (`store-items.mjs:190`). A signoff touches no plan.
- `setCoPilot` (`deck/store-runs.mjs:369-387`) checks open, yellow and no chain hand-off, no plan; overwrites the
  slot at :380. No parser of `## Files owned` exists; `check-slices.mjs` `section()` (:47) is generic.
- Yield: `YIELD_MS` 20 min (`deck/lanes.mjs:15`), `yieldsDue` (:22) questions only, `armYields`
  (`deck/server-wait.mjs:481`), `yieldTicket` (`deck/store-tickets.mjs:361`) flips green and releases at once.
  `agents/pilot-co-pilot.md:112-115` hands back after "the slice in flight"; :119-123 never ends a turn with a child
  live. No hook forces a hand-back: `hooks/stop-gate.js:277` skips crew agents and no SubagentStop exists. The
  Claude Code docs: a subagent with background subagents waits for them, woken by their completion.
- `pilot wait` (`deck/wait.mjs`): refusal exits 0 at :265 (ADR 0143 L2); `NO REPLY` prints only :271. Lane line
  built at `lanes.mjs:83-97`; the SessionStart hook drops every lane unless each matches its regex
  (`hooks/session-handoff.js:370-386`).
- Owed rows: `owedThreadsOf` (`deck/owed.mjs:20`), reasons `unanswered`, `promised`
  (`session-handoff.js:395`), served on `/api/record` (`deck/server-routes.mjs:615`). `landerDue`
  (`deck/landing-replies.mjs:89`) is said only at press time.
- `closeLanded` (`deck/closing-report.mjs:117-125`) leaves the gate2 open while any blocking item names the
  ticket. `scripts/land.mjs:398` holds no file list. `beginLanding` (`store-items.mjs:447`) stores no pid;
  `interruptLandings` (:507) settles every running landing at start.
- Nothing auto-answers a question; `ASSUME_DEFAULT` is the user's press (`store-items.mjs:298-302`).
- Fallback: `fallbackDue` (`store-runs.mjs:252`) waits for `quietAt(owner)` (`deck/agents.mjs:246`): any tool
  call by any agent of that kind keeps it live, so a busy architect whose wait never started (auto mode "gave no
  verdict" on the Bash call, seen in this session) holds its answers forever. Line 24 is that cause.
- ToolSearch is absent from `agents/pilot-lander.md:5` and `agents/pilot-teacher.md:5`, both with deck tools.
  This session's deck MCP reported CONNECTION_CLOSED at start and loaded through ToolSearch.
- Trust (permissions docs): in a repository trust keys on its root; outside one it covers subdirectories except
  a nested git repository; `projects[<path>].hasTrustDialogAccepted` in `~/.claude.json` records it.
- Held `/clear` (run 2, on `origin/feat/handoff-books` 291d4301): `holdFor` (`deck/run-look.mjs:143`) holds while
  `coPilot.live`, up to `HOLD_BOUND_MS` (:62); a released co-pilot reads `free`. Card note `noteFor` (`deck/items.mjs:325`).
  The pause: `handoffNowIfIdle` (`hooks/context-size-guard.js:355`), `scripts/handoff.mjs:199-202`, both "release it on
  its hand-back"; `agents/pilot.md:542` reads queued as undelivered but says check back "after a few minutes".
- Cause of 2026-11-17 (was unproven): the pause at 10:22:14 answered `Message queued for delivery to a7c834c628e241cca
  at its next tool round` (pilot transcript dd5757d8, line 2079): the co-pilot was in its full-gate call (done 10:23:35)
  with a slice to integrate. wrapper.log:617-618: held 10:23:14, `/clear` 10:31:51 after the pilot's release.

### Seams

Deepening pass: every touched module survives the deletion test (each hides logic its N callers would repeat).
None is shallow enough to fold, so no fold slice. One new module, `deck/recut.mjs`, keeps git out of the store.

| Seam | Interface | Folded behind it | Category |
|---|---|---|---|
| `deck/recut.mjs` (new) | `planDrift(repoDir, plan)`, `planChanges(repoDir, fromSha, toSha, slug)`, `ownedFiles(text)`, `neverGranted(ticket)`, `SHA` | git ancestry, merge-base, diff, slice parsing | local-substitutable (temp git repo) |
| ticket transitions `deck/store-tickets.mjs` | `recutTicket`, `replanTicket`, `yieldTicket`, `finishYieldIn` (the release, through `setCoPilot(id, false)`) | state, mark and queue writes | in-process |
| co-pilot slot `deck/store-runs.mjs` | `setCoPilot`, `fallbackDue` | holder rule, first-grant stamp, fallback timing | in-process |
| lanes `deck/lanes.mjs` | `lanesFrom`, `yieldsDue`, `runnableYellowOf` | lane lines and reasons | in-process |
| owed `deck/owed.mjs` | `owedThreadsOf` | the owed reasons | in-process |
| landing `deck/landing.mjs` | `startLanding`, `adoptLandings` | child pid, re-adopt, post-landing sweep | local-substitutable (stub child) |
| wait `deck/wait.mjs` | `waitForReply` | refusal, `NO REPLY` lines | remote but owned (deck HTTP) |
| timers `deck/server-wait.mjs` | `armYields`, `armDefaults` | 20-minute clocks | in-process |
| hand-off claims `deck/run-claim.mjs` | `HOLD_BOUND_MS`, `notePosted`, `postedFile` | the bound's one owner, read by the look and `pilot handoff` (run 2) | in-process |
| hand-off line `scripts/handoff.mjs` | `handoff(opts) -> { ok, line }` | the held clause (run 2) | remote but owned (deck HTTP) |

Run 2 deepening: run-look and handoff.mjs pass the deletion test; the bound moves to `run-claim.mjs`. No fold slice.

## 4. Ubiquitous language

- **Re-cut**: a signed ticket sent back to red with a `recut { from, why, files, at }` mark, re-planned by an architect.
- **Drift**: `planDrift`'s answer: `gone` (plan sha not on its branch) or `moved` (owned files changed on pilot since the plan's base).
- **First grant**: a ticket's first `deck_ticket co-pilot`, stamped `plan.grantedAt`; drift is checked only there and at landings.
- **Sticky approval**: a re-cut whose `docs/design/<slug>/` is textually unchanged keeps its signature through `replan`.
- **Drain**: a yielded ticket's co-pilot starts nothing and waits on every live child before handing back `paused`.
- **Held clear**: a hand-off whose `/clear` the mod holds for a live co-pilot, up to `HOLD_BOUND_MS`; a queued pause ends it by `release`.
- **Owed row**: one `/api/record` `owed` entry the SessionStart notice and the NO REPLY exit both print.

## 5. Locked decisions

ADR 0187 (`docs/adr/0187-never-stuck.md`) records L2-L7.

- **L1 Depth is forks** (itm_5ad979d05f47, the user's press): only forking decisions were posted, each alone. Run 2: forks again (itm_2ad862b30840, the user's press 2026-11-18); A7 was the one forking assumption posted.
- **L2 The deck checks drift, at the first grant and after every landing** (F1, user: "The deck, at grant and
  landing", itm_73468bff78b8). Rationale: the check costs no agent tokens and can't be skipped. Rejected: the
  co-pilot's first act or the architect per landing.
- **L3 Files trigger, the architect judges** (F2, itm_62728409062c, resolved by the pilot). The user typed: "it has to
  be conceptual, we cant be deterministic with this one. if the nature of the functionality changes, then that is
  probably gonna be a re-cut". After the pilot's one pushback they pressed "Any file a slice owns". The press was
  read as choosing the trigger, not as a return to a purely deterministic re-cut.
  - Trigger: any file under a slice's "Files owned" changed on `merge-base(plan.sha, origin/pilot)..origin/pilot`.
    It never decides.
  - Judgement: the architect reads the landed change against the plan. Nature unchanged: rebase and `replan` (L5,
    no press). Nature changed: a real re-cut with a `Changed since` gate1.
  - Overridden: a judgement costs an architect pass per triggered ticket, and two passes can disagree; a file diff
    is free and repeatable.
  - Rejected: the deck deciding alone; any change on pilot as the trigger (an architect pass per landing).
- **L4 Only before the first slice** (F3, user: "No: only before its first slice", itm_9363c2a980f7): a successor's
  grant skips the check; `pilot integrate` and the gate carry later drift. Rejected: re-cutting a live ticket's
  unbuilt slices.
- **L5 Always re-cut; an unchanged plan keeps its signature** (F4, user, itm_1c41aa874abf): `replan` restores
  yellow at the new sha with no Sign off press when `git diff --quiet old new -- docs/design/<slug>/`. A gone old sha
  can never be proven unchanged, so it always takes a gate1. Rejected: re-sign always; co-pilot slice edits.
- **L6 Drain, then free the lane** (user, itm_817d76754d6f): a yield marks `yielding`, the slot stays held, the flip
  to green and paused happens on the co-pilot's release. Rejected: free at once (2 co-pilots, one unseen).
- **L7 A drift re-cuts in the same call that finds it**: the grant or the landing moves the ticket red itself;
  the pilot reads `re-cut check due` and spawns an architect to judge it (L3). Rejected: a mark the pilot must act on (it can be missed).
- **L8 `pilot wait` listens through a refusal** (line 7, amends ADR 0143 L2): the Stop hook still refuses idling.
- **L9 Line 24 is a fallback rule, not a new channel**: an owner with no wait parked on the item counts as quiet.
- **L10 Git failures fail open**: a `planDrift` that cannot run git (timeout 20 s) grants, and its answer says
  `drift unchecked: <reason>`. Rejected: refusing the lane on a fetch error.
- **L11 QA environment**: QA runs on a scratch deck (`pilot deck --scratch`) against temp git repos with a bare
  remote; the user's walkthrough opens that deck in a browser for the card and lane lines, runs one real
  `pilot wait` against it, and sets up the live root once (line 12). The deck on 4321 is never written. User: "Scratch deck + temp repos" (itm_25a65521c8dd).
- **L12 The runs, in sequence on this deck** (user: "In sequence on this deck", itm_b23ef1941624, was A5): two
  runs, re-cut first; §8's Runs table. Rejected: one run of 18; Run B on another deck.
  Verdict: stands - handoff-mod holds the yellow lane and handoff-books, blocked-steps are queued on the same files; in sequence keeps Run B behind them; the user's press on itm_b23ef1941624 decides

## 6. Assumed decisions

- **A1 Line 8, yellow only.** Default: a blocking walkthrough yields like a question, on the held yellow ticket
  only. Trades away: a red or green ticket's blocking item still holds its stage lane (the main session works
  there). Rejected: all three lanes (parks the pilot's own ticket).
  Verdict: stands — the planning and concluding lanes are the main session's; parking its own ticket would stop the session that answers the yield
- **A2 Line 10's exclusions.** Default: proposals, `Merging tickets` (a merge is irreversible), blocking items
  (they yield) and gates are never auto-answered. Trades away: an excluded question waits on the user.
  Verdict: stands — the user's recorded rule: a default taken is no yes for a proposal, a merge or a gate
- **A3 Line 12's root.** Default `~/.claude/pilot/live`. Changes the request: a nested git repository under it
  still prompts, so live checks use a plain subdirectory or a worktree.
  Verdict: stands — beside the other pilot state under ~/.claude/pilot; no queued ticket claims the path
- **A4 Line 4's refusal half dropped.** ToolSearch reconnects a failed MCP (seen this session).
  Verdict: stands — seen again by the pilot this session: deck reported CONNECTION_CLOSED, ToolSearch loaded it and every call worked
- **A5 Run 2's base is Run 1** (main's call): `design/never-stuck-2` is cut from `feat/never-stuck` (c19395e7, rebased onto 0a95356d; the only
  branch with this artefact) and `feat/never-stuck-2` is cut from the design tip at Gate 1, base `feat/never-stuck` (built on feat/<N>);
  both rebase onto `origin/pilot` once Run 1 lands. Trades away: a rebase when Run 1 lands; slices citing S6 wait for it (§8).
  Rejected: `pilot base`'s `feat/handoff-books`, which holds neither the artefact nor S1-S5.
  Verdict: stands — Run 1 is green at 0a95356d awaiting its walkthrough; no other branch holds the artefact and S1-S6
- **A6 Line 25 releases at once** (itm_fca79242f7ff): no grace wait. Trades away: the `/clear` may kill the slice in
  flight (ADR 0089's reason); the fresh session re-adopts the ticket. Rejected: a 5-minute grace for the hand-back. User: "Release at once" (itm_fca79242f7ff, 2026-11-18).
  Verdict: stands — the user chose Release at once on itm_fca79242f7ff
- **A7 Line 25 is a prose rule, not a hook**: the guard's advisory and `pilot handoff`'s line say it; `agents/pilot.md`
  carries it in one line (S18), within its 28 tokens of headroom. Trades away: a pilot ignoring the line waits out the bound. Rejected: a
  PostToolUse hook releasing on a queued SendMessage (wider; the user said "the pilot releases"). User: "Prose rule, bound as backstop" (itm_b3f95cb4736d, 2026-11-18).
  Verdict: stands — the user chose the prose rule with the bound as backstop on itm_b3f95cb4736d
- **A8 QA environment for Run 2** (itm_ca7057034e89): L11's scratch deck and temp repos, plus `pilot handoff` there
  with a co-pilot granted and the held card looked at; no real `/clear`. Trades away: the wrapper's real `/clear`
  after a release is seen only at the next real hand-off. Rejected: the live deck. User: "Scratch deck + temp repos" (itm_ca7057034e89, 2026-11-18).
  Verdict: stands — the user chose the scratch deck and temp repos on itm_ca7057034e89
- red team (run 2): S19's first red step meets `scripts/test/handoff.test.mjs:179, :198`, pinning today's clause
  word for word; S19 owns that file. Importing the bound from `run-look.mjs` would pull the look's CLI into
  `pilot handoff`; it moves to `run-claim.mjs`, which both import. S19 shares no file or seam with S7-S18.
- red team: S2's first red step walked against `store-runs.mjs:369`: `setCoPilot` is synchronous and git is not,
  so the check sits in the `deck_ticket` handler (`server-tools.mjs:411`) before it, and S2 owns that handler after S1.
- red team: S8's new lane shapes would make `lanesNotice` drop all three lanes silently (`session-handoff.js:370`); S8 now owns the regexes.
- red team: S5's `yielding` ticket would re-fire `yieldsDue` every tick and be refused as idle; S5 owns both skips in `lanes.mjs`, and Run B's S8, S9 come after it.
- red team: S4's replan on other-host (old sha ecdd81f4 gone) can't diff; L5 makes that a gate1, never a silent restore.

## 7. Out of scope

Re-cutting a part-built ticket (L4). Stage-lane yields (A1). A deck-side MCP fallback (A4). Repairing other-host's
record by hand: its first grant after Run A answers `re-cut check due: ecdd81f4 gone`. Interface-level drift. The
spec-driven crew rewrite (itm_6de487e1f2c4) follows this run's prose. Run 2: a hook that releases on a queued
pause (A7); saving a slice the `/clear` kills (A6); line 27's card, already shipped; the hold's bound itself.

## 8. Slices

Width 8; longest stem 4 (S1 → S2 → S5 → S6). Runs in sequence; Run B starts after Run A lands.

| Run | Slices | Spec lines | After | Estimate |
|---|---|---|---|---|
| A re-cut | S1-S6 | 3, 6, 13, 14, 15, 16 | – | 6 slices, about 1 day |
| B never stuck | S7-S19 | 1, 2, 4, 5, 7-12, 16-27 | A (`lanes.mjs`, `store-tickets.mjs`, prose) | 13 slices, about 2 days |

Run B's base (A5): its slices stand on Run A's S1-S5 code and S6's names, so `feat/never-stuck-2` is cut from the design
tip on `feat/never-stuck` (0a95356d) and rebases onto `origin/pilot` once Run A lands. Run B alone: width 8 (S7, S8,
S10, S11, S13, S15, S17, S19), longest stem 3 (S10 → S16 → S18). Line 27 has no slice (shipped).

| # | Title | Spec | Files owned | After | Reviewers | File |
|---|---|---|---|---|---|---|
| S1 | Walking skeleton: a signed ticket goes back to planning | 6 | `deck/store-tickets.mjs`, `deck/server-tools.mjs`, `deck/tools.mjs`, `deck/test/recut.test.mjs` (new) | – | ts, security | [S1](slices/S1.md) |
| S2 | The first grant answers `re-cut check due` | 13 | `deck/recut.mjs` (new), `deck/test/plan-drift.test.mjs` (new), `deck/store-runs.mjs`, `deck/server-tools.mjs` | S1 (`server-tools.mjs`) | ts, security | [S2](slices/S2.md) |
| S3 | A landing re-cuts the plans it drifted | 14 | `deck/landing.mjs`, `deck/test/landing-recut.test.mjs` (new) | S2 (`planDrift`) | ts | [S3](slices/S3.md) |
| S4 | The re-cut gate1 says what changed; an unchanged plan keeps its signature | 15 | `deck/store-items.mjs`, `deck/recut.mjs`, `deck/store-tickets.mjs`, `deck/server-tools.mjs`, `deck/tools.mjs`, `deck/test/replan.test.mjs` (new) | S2 (`recut.mjs`, `server-tools.mjs`) | ts, security | [S4](slices/S4.md) |
| S5 | A yield drains its co-pilot before it frees the lane | 3 | `deck/store-tickets.mjs`, `deck/store-runs.mjs`, `deck/lanes.mjs`, `deck/test/yield.test.mjs` | S4 (`store-tickets.mjs`) | ts | [S5](slices/S5.md) |
| S6 | Prose: the re-cut and the drain | 16 | `agents/pilot.md`, `agents/pilot-architect.md`, `agents/pilot-co-pilot.md`, `docs/adr/0187-never-stuck.md` (new), `docs/adr/README.md`, `docs/adr/0153-*.md`, `scripts/test/recut-prose.test.mjs` (new) | S3, S4, S5 (the names it cites) | ts, security | [S6](slices/S6.md) |
| S7 | A second co-pilot is refused | 17, 18 | `deck/store-runs.mjs`, `deck/server-tools.mjs`, `deck/test/co-pilot-holder.test.mjs` (new) | – | ts, security | [S7](slices/S7.md) |
| S8 | Lane lines say why nothing runs | 9, 19 | `deck/lanes.mjs`, `hooks/session-handoff.js`, `deck/test/lanes-why.test.mjs` (new) | – | ts, security | [S8](slices/S8.md) |
| S9 | A blocking walkthrough yields too | 8 | `deck/lanes.mjs`, `deck/test/yield-walkthrough.test.mjs` (new) | S8 (`lanes.mjs`) | ts | [S9](slices/S9.md) |
| S10 | A plain question's default is taken at 20 minutes | 10 | `deck/server-wait.mjs`, `deck/store-items.mjs`, `deck/test/default-taken.test.mjs` (new) | – | ts | [S10](slices/S10.md) |
| S11 | A landing closes its own questions | 5 | `deck/closing-report.mjs`, `deck/test/landed-closes.test.mjs` (new) | – | ts | [S11](slices/S11.md) |
| S12 | The notice names an owed report and an owed architect | 1, 2 | `deck/owed.mjs`, `deck/ui/render-cards.mjs`, `hooks/session-handoff.js`, `hooks/test/session-handoff-owed.test.js`, `deck/test/owed.test.mjs` | S8 (`session-handoff.js`) | ts, security | [S12](slices/S12.md) |
| S13 | `pilot wait` listens and says what could run | 7, 11 | `deck/wait.mjs`, `deck/test/wait-yellow-lane.test.mjs`, `deck/test/wait-no-reply.test.mjs` (new) | – | ts, security | [S13](slices/S13.md) |
| S14 | An unheard answer goes to the pilot | 24 | `deck/server-wait.mjs`, `deck/test/unheard.test.mjs` (new) | S10 (`server-wait.mjs`) | ts | [S14](slices/S14.md) |
| S15 | The lander and the teacher load the deck by ToolSearch | 4 | `agents/pilot-lander.md` (line 5), `agents/pilot-teacher.md` (line 5), `scripts/test/crew-toolsearch.test.mjs` (new) | – | ts, security | [S15](slices/S15.md) |
| S16 | A deck restart re-adopts its land child | 21, 22 | `deck/store-items.mjs`, `deck/landing.mjs`, `deck/daemon.mjs`, `deck/test/land-adopt.test.mjs` (new) | S10 (`store-items.mjs`) | ts, security | [S16](slices/S16.md) |
| S17 | One trusted live root | 12 | `scripts/live-root.mjs` (new), `bin/pilot.mjs`, `scripts/test/live-root.test.mjs` (new) | – | ts, security | [S17](slices/S17.md) |
| S18 | Prose: the lane holder, the wait, the land, the live root | 11, 16, 20, 23 | `agents/pilot.md`, `agents/pilot-lander.md` (body), `agents/pilot-implementer.md`, `agents/pilot-architect.md`, `docs/adr/0143-*.md`, `scripts/test/stuck-prose.test.mjs` (new) | S7, S13, S15, S16, S17 (the names it cites) | ts, security | [S18](slices/S18.md) |
| S19 | A queued pause does not hold the hand-off | 25, 26 | `deck/run-claim.mjs`, `deck/run-look.mjs`, `hooks/context-size-guard.js` (`handoffNowIfIdle`), `scripts/handoff.mjs`, `scripts/test/handoff.test.mjs`, `hooks/test/context-size.test.js`, `deck/test/run-look.test.mjs` | – | ts, security | [S19](slices/S19.md) |

Outside this ticket: S8, S12 wait for handoff-books S1 and handoff-mod on pilot (`session-handoff.js`); S13 waits
for handoff-mod (`wait.mjs`); S6, S15, S18 wait for blocked-steps S2 and handoff-books S3 (`agents/*.md`).
red team: S16 and S10 both write `store-items.mjs`; S16 moved after S10 instead of sharing `beginLanding`.

## 9. Acceptance evidence

On a scratch deck with temp repos (L11), in the order a user meets it. Recipe: `pilot deck --scratch`, and every probe
run with `CLAUDE_PID` set to a dummy and `HOME`/`USERPROFILE` to a temp dir, or its claims stamp the live session.
1. A ticket signed, an owned file landed on pilot: its card turns red with `re-cut` (13, 14), the planning line
   reads `(re-cut)` (9); an unchanged re-plan goes yellow with no press (15); a changed one shows `Changed since`.
2. A yield at 20 min with 2 stub slices live: the ticket stays implementing until release (3); a walkthrough yields
   the same (8). A plain question closes itself `Assumed:` at 20 min (10).
3. A landing with its conflict question open: both close (5); with no report the card reads `report owed` and the
   next SessionStart names it, and a live red ticket reads `architect owed` (1, 2).
4. `pilot wait` with the lane idle prints the refusal once and listens; its `NO REPLY` prints lanes and owed (7, 11).
5. A second `deck_ticket co-pilot` is refused naming the holder (17-20). A deck restart mid-landing re-adopts the
   stub child; `Land again` is refused while it lives (21-23). An unheard answer reaches the pilot at 30 s (24).
6. `pilot live-root` reads `trusted` after the walkthrough (12); the lander loads the deck by ToolSearch (4).
7. Run 2: `pilot handoff` on the scratch deck with a co-pilot granted prints `/clear held for the co-pilot on
   <ticket>, up to 20 minutes` and the queued rule (25, 26); the hand-off card reads `held: /clear waits on
   <ticket>'s co-pilot` (27); after `deck_ticket release` the look answers `clear` well inside the bound (25).

## 10. Status

| Slice | State | Branch | PR | Worktree | After | Spec |
|---|---|---|---|---|---|---|
| S1 | planned | | | | – | 6 |
| S2 | planned | | | | S1 | 13 |
| S3 | planned | | | | S2 | 14 |
| S4 | planned | | | | S2 | 15 |
| S5 | planned | | | | S4 | 3 |
| S6 | planned | | | | S3, S4, S5 | 16 |
| S7 | planned | | | | – | 17, 18 |
| S8 | planned | | | | – | 9, 19 |
| S9 | planned | | | | S8 | 8 |
| S10 | planned | | | | – | 10 |
| S11 | planned | | | | – | 5 |
| S12 | planned | | | | S8 | 1, 2 |
| S13 | planned | | | | – | 7, 11 |
| S14 | planned | | | | S10 | 24 |
| S15 | planned | | | | – | 4 |
| S16 | planned | | | | S10 | 21, 22 |
| S17 | planned | | | | – | 12 |
| S18 | planned | | | | S7, S13, S15, S16, S17 | 11, 16, 20, 23 |
| S19 | planned | | | | – | 25, 26 |
| never-stuck | planned | feat/never-stuck | | | S1-S19 | 1-27 |
