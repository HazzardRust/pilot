# Independence — architecture artefact

Feature: **independence** · slug `independence` · integration branch `feat/independence` · base `main` at `e85f301`
(PR #103, deck-detached) · architect branch `design/independence`. Source: `~/vault/to-do now.md`, section "Pilot".

## 1. Problem

The user wants the deck to be the primary interface, so a new spec or a question should start from the page and not
from the CLI. The pilot has also grown heavy: "some small changes have just taken WAY too long and have burnt through
tokens". They asked to choose a run's rigour at its start, then withdrew it (L18); the heaviness is cut through prompt cost instead. They want a full-auto mode
for non-commercial, non-user-facing work. They want a QA step that is quicker and judges taste ("what information is
unnecessary, is there enough feedback … it FEELS quality") as well as function. The status line also names the wrong
deck once a session `cd`s (line 15).

## 2. Spec

| # | Behaviour | Evidence |
|---|---|---|
| 1 | A **Create** button sits directly under Everything in the right strip, on every page with that strip | seen in the browser on the overview and on a tab |
| 2 | Create asks for a thread name and then shows a confirm step. Cancelling at either step writes nothing | `deck.json` is byte-identical before and after a cancel; a test pins it |
| 3 | Confirming opens a new general named thread on that deck; it is not classified as spec or question. If an unbound pilot session is live on the repository, the thread goes to it; if not, the daemon starts one headless (hidden pty, `--permission-mode auto`, no window). Either way the pilot's first message appears in the thread and the user types nothing into a terminal | click to first pilot message, seen live both ways, with no window opening |
| 3a | The session runs in the tab's repository; from the overview the confirm step asks which known repository *(assumed, A6)* | the new run's tab is that repository's |
| 3b | A cross-origin page cannot create a thread or launch a session | a POST with a foreign `Origin`, or with none, is refused 403 |
| 3c | A thread bound to a session the daemon started delivers its replies to that session only, and that session receives no other thread's replies | two sessions on one repository; a reply on each wakes only its own `deck_wait` (test) |
| 3d | A thread with a headless session carries a Stop control. When the session exits, by Stop or on its own, the thread shows "session ended" with the exit code | Stop pressed live; the pid is gone (`Get-Process`); the notice is in the thread |
| 3e | On a thread routed to a live pilot, a question is answered in the thread by an explorer the pilot spawns. For new work, one spec or several, the pilot recommends in the thread handing each to a fresh headless session on a new thread, and nothing launches until the user agrees | live: an explorer-stamped answer; a two-spec message gets an in-thread question, and on "yes" two new threads each start a session |
| 4, 11 | *Withdrawn by the user (L18)* | – |
| 5 | A **Full auto** toggle sits under Create. Turning it on shows a confirm that warns it is for non-commercial, non-user-facing work only, with an unticked "may merge to main" box. Cancel leaves it off *(assumed, A2, A3)* | seen live; the state survives a reload |
| 6 | With full auto on, every new question, spec, signoff and walkthrough the pilot posts is closed by the deck at once as `auto`. The pilot takes its own default, records it as assumed, and passes both gates itself. It merges to main only when the box was ticked | a run completes with zero waiting items; `gh pr view` shows a merge only when allowed |
| 7 | `node scripts/measure-prompt.mjs` prints each crew agent's initial prompt cost: definition, preloaded skills, unconditional rules, tool schemas and hook injections. §8 carries the before and after tables | the script's output at `main` and at the feature tip |
| 8 | The mechanical rules named in L7 are enforced in code, and their prose is deleted | each has a test that fails without the code; `grep` finds no prose copy |
| 9 | Deck tool descriptions, GateGuard's message and QA's preloaded skills shrink | per-firing and per-turn bytes before and after, from the S1 script |
| 10 | The Tree tab's drill-down links are gone: clicking in the Tree never changes the URL or resets page state, and expanding or collapsing a node in place is its only interaction (user, A1 resolved) | no drill-down `<a>` in the tree's DOM; render test updated; expanding a node live keeps the URL |
| 12 | QA runs a taste pass covering unnecessary information, missing feedback on actions, and polish. Each finding carries a screenshot | the QA report's taste table, with screenshots |
| 13 | The taste checklist is adapted from a vetted published skill, prompt content only, and carries a provenance header and a ledger row | `check-provenance` green; vetting recorded in L12 |
| 14 | QA is quicker: the time from the QA agent's spawn to its walkthrough post drops against the baseline | transcript timestamps from deck-detached and run-record, compared with this feature's own QA |
| 16 | The package stops shipping `rules/common`; `install-rules` deletes a `~/.claude/rules/common` file only when it is byte-identical to a shipped copy. A trimmed `CLAUDE.md` is proposed as a separate PR on `~/environment` (user, A4 resolved) | install test for the byte-identical guard; S1 script shows the saving; the `~/environment` PR link |
| 17 | The pilot's `spec` deck item follows one layout, stated in `skills/pilot/SKILL.md` step 1: lines grouped under the areas of the request, each a short behaviour with its evidence inline in italics, numbers kept stable from the artefact, and withdrawn lines named at the bottom. The artefact keeps its full table | the SKILL text, pinned by `scripts/test/pilot-rules.test.mjs` |
| 18 | The user can remove an old deck tab (e.g. D3): a Remove control on the tab, then a confirm. It archives that deck's open items and the tab leaves the strip; nothing is deleted, and `/items` still lists them. It is refused while a live session is registered on that repository, and the refusal says so *(assumed, A7)* | the tab is gone after a reload; `deck.json` still holds every item; with a live session the refusal is shown |
| 19 | While a run is live the pilot keeps listening on the deck's chat, including with nothing of its own open: it re-parks `deck_wait` every 55 minutes (inside the 1-hour prompt-cache lifetime, verified in this session's transcript as `ephemeral_1h_input_tokens`) and stops at the closing report (user, in chat) | a chat message answered with nobody at the terminal; transcript shows cache reads, not writes, on re-arm |
| 20 | Every `deck_wait` parks at most 55 minutes (the daemon clamps longer timeouts). The pilot stops listening once 10 hours pass with no user reply on any item of its deck, or once the run record says `finished`: `deck_wait` returns "stop listening: <reason>", the pilot posts one chat line and ends, and a later chat message starts a fresh headless session handed the run record. `finished` = closing report posted, or the user abandoned the run, stored in the run record so it survives `/clear` (user, in chat) | tests: a 4h timeout is clamped to 55m; the cap trips at 10h of no user reply and resets on one; a finished record returns stop; live: a chat message after a stop starts a session |
| 21 | The Everything bookmark is renamed: it reads **Open** while it lists only what is waiting, and **All** once pressed (it lists settled items too). Its link, highlight, title and behaviour are otherwise unchanged (user, in chat) | render test pins both labels; seen live flipping Open → All → Open |
| 22 | Orchestration plumbing costs the pilot fewer calls and tokens: (1) `pilot integrate <slice-branch>` merges, installs if the lockfile changed, tests, writes the run record, commits and pushes, returning one line; (2) `deck_status` accepts only changed rows, returns a one-line ack, and the daemon writes `run.json` into the feature worktree; (3) `deck_read` advances the delivery cursor and a repeated identical reply is not delivered twice; (4) a generated `docs/design/<slug>/brief.md` carries the run's standing brief facts; (5) the implementer's required report shrinks to PR, SHA, one gate line, decisions, out-of-slice files; (6) the skill says small artefact edits after the first cut are the pilot's, not a resumed architect's; (7) GateGuard skips `docs/**` and `*.md` (user, in chat, from the pilot's session review) | one integrate call per slice seen live; `deck_status` ack under 200 bytes; a duplicate reply test; GateGuard test on a `.md` path |
| 23 | Agent efficiency of the target repo is part of the product's philosophy. Every crew report carries a short **friction** section (what in the repo cost it time or tokens, with evidence); the pilot collects the rows during the run, and the closing report ends with a ranked "make agents cheaper here" section (restructure code, add a script, fix a tool or config), each with evidence and a proposed fix, for the user to pick from. Nothing changes automatically; no separate audit pass (user) | README philosophy paragraph and an ADR; each crew definition's report shape names friction; SKILL's closing report names the section; seen in this run's own closing report |
| 24 | `pilot run` types its pick-up prompt only after the `/clear` has taken effect, never into the session that posted the hand-off. The wrapper waits for a marker the `SessionStart` hand-off lane writes for the fresh session, rather than assuming the prompt queues behind `/clear`. Found live 2026-09-25: Claude Code surfaced "Pick up the hand-off on the deck." inside the posting session's running turn (deck/run.mjs:23-28's queueing assumption no longer holds) (user) | a test with a fake pty: no prompt is written before the marker; live: hand-off posted mid-turn, the prompt arrives only in the fresh session |
| 15 | The status line's D-number and waiting count describe the deck this session's items are posted to | a session started in `C:\Users\Hazzard` that `cd`s into `Projects/pilot` shows D1 and D1's count |

## 3. Findings

- **Everything lives in the right strip, not the rail.** `renderEverything` is at `deck/ui/render.mjs:975`, in the
  `<aside class="strip right">` at `deck/ui/home.html:36`, styled at `deck/ui/deck.css:601-644`. The left rail
  (`deck/ui/strips.html:46-67`) holds Notifications, Chat, Tree, Status and Agents.
- **Confirm idiom**: second-press-confirms, used by `renderCloseConfirm` (`render.mjs:288`) and the signoff `ASK_FIRST`
  (`render.mjs:186-205`). No `<dialog>`, `confirm()` or text prompt exists anywhere. Every write is a `<form>` POST.
- **Writes are Origin- and Host-checked** (`deck/server.mjs:288-306,661-663`). An absent Origin passes, for curl and
  the stdio client.
- **The daemon never starts a session.** `pilot run` (`deck/run.mjs`) wraps `claude --agent pilot:pilot`, under the
- **Probes for headless launch (2026-09-25).** `claude --help` on 2.1.282 lists `--permission-mode` with `auto` among its choices. A windowless, detached node process (the daemon's own spawn shape, `deck/client.mjs:113`) started `powershell` under `node-pty` 1.1.0 (ConPTY), and the child's `MainWindowHandle` was `0`: it had no window.
  optional `node-pty` or as a plain spawn. The daemon is detached and windowless (`deck/client.mjs:113`). The Agent SDK
  is metered (`run.mjs` header), so a CLI in a terminal is the only subscription path.
- **Replies route by repository only.** `deck_wait` filters with `forRun(reply, repo)` (`server.mjs:626`). Items carry
  `repo` and no run. A chat is one per `repoKey`, made by `registerRun` (ADR 0031). A per-item wait filter was recorded
  as future work in deck-usability D23.
- **The run record** (ADR 0028) is `RECORD_ORDER` at `deck/runs.mjs:209`, has one writer (`deck_status`,
  `deck/tools.mjs:244-351`), and is read by `hooks/session-handoff.js`. Grilling depth is *not* stored. It lives in
  the artefact (ADR 0021).
- **The Tree draws no thread links.** `renderLeaves` (`render.mjs:743`) is plain text, pinned by
  `deck/test/tree.test.mjs:343`. The only links in the tree go to a sub-tree (`render.mjs:785`). The Status tab's
  `Yours` column links a slice's open thread (`render.mjs:677`).
- **Status line**: `deckNumberFor(deck, workspaceDir(data))` at `hooks/context-usage-statusline.js:309` uses
  `workspace.current_dir`, which drifts with `cd`. The MCP client registers `process.cwd()` at launch
  (`deck/client.mjs:153`). `deckOpenCount` (line 89) counts every deck's waiting items.
- **Cycle time** (deck store, git history, transcripts): implementer spawns run about 2 per slice (run-record: 22 for 11
  slices; deferred-ledger: 24 for 12). deck-workspace used 108 spawns. The one small run, deck-detached, had the main
  session write the code and spawned only QA, finishing in 1h46m. The walkthrough took 20 to 25 minutes on small runs
  and 1h43m to 2h39m on large ones. Wall time on multi-day runs is dominated by plan-limit pauses and by the user's
  wait, not by agent work.
- **Taste sources**, vetted per `CLAUDE.md`:
  - `OneRedOak/claude-code-workflows` `design-review` is MIT and markdown only, with no hooks, `.mcp.json` or
    telemetry. It is a seven-phase live review with a Blocker/High/Medium/Nitpick triage and screenshots.
  - `vercel-labs/agent-skills` `web-design-guidelines` has no licence and fetches its rules remotely on every use.
  - `ui-ux-pro-max` is a generation database with a CLI.
  - `anthropics/skills` `frontend-design` (Apache-2.0) is for building UI, not reviewing it.
- **Current QA** (`agents/pilot-qa.md`, `skills/browser-qa/SKILL.md`): console and network errors, Core Web Vitals,
  flows, screenshot diffs at 3 breakpoints plus dark mode, axe, and every spec line live. It has no heuristic or taste
  pass.

### Token baseline (`node scripts/measure-prompt.mjs` at `e85f301`, tokens = bytes ÷ 4)

| Agent | Definition | Preloaded skills | Unconditional rules | Deck tool schemas | Total |
|---|---|---|---|---|---|
| pilot | 3429 | 8046 | 11677 | 2070 | 25222 |
| pilot-architect | 1702 | 4684 | 11677 | 0 | 18063 |
| pilot-explorer | 777 | 1701 | 11677 | 0 | 14155 |
| pilot-fundamentalist | 3495 | 1592 | 11677 | 0 | 16764 |
| pilot-implementer | 2179 | 2190 | 11677 | 0 | 16046 |
| pilot-qa | 3131 | 3512 | 11677 | 1204 | 19523 |
| pilot-teacher | 1544 | 2205 | 11677 | 144 | 15569 |

It replaces the hand count, which took whole files: definitions and skills now exclude frontmatter (explorer −16%,
teacher −11%), rules add `~/.claude/rules/README.md` (+4%), and deck tools are the JSON of the schemas each agent is
granted rather than the size of `deck/tools.mjs` (pilot −50%, qa −71%, as qa has no `deck_status`).

**After S3** (deck tool schemas, `node scripts/measure-prompt.mjs`): pilot 2070 → 1378 tokens (8280 → 5510 bytes,
−33.5%), qa 1204 → 867, teacher 144 → 105. Description text alone fell from 5434 to 2710 bytes (−50%):

| Tool | Description bytes before → after | Schema bytes before → after |
|---|---|---|
| `deck_post` | 1230 → 827 | 1892 → 1489 |
| `deck_read` | 613 → 199 | 881 → 467 |
| `deck_reply` | 309 → 156 | 574 → 421 |
| `deck_resolve` | 278 → 223 | 557 → 502 |
| `deck_status` | 2325 → 950 | 3465 → 2044 |
| `deck_wait` | 679 → 355 | 911 → 587 |

**After S4** (L8, each agent's own share: definition + preloaded skills + deck tools, tokens):

| Agent | Before (after S3) | After S4 | Change | L8 target | Met |
|---|---|---|---|---|---|
| pilot | 12853 | 8507 | −33.8% | ≤ 9000 | yes |
| pilot-qa | 7510 | 5143 | −31.5% | ≤ 5500 | yes |
| pilot-architect | 6386 | 5117 | −19.9% | ≤ 5109 | 8 tokens short |
| pilot-explorer | 2478 | 1944 | −21.5% | ≤ 1982 | yes |
| pilot-teacher | 3854 | 3051 | −20.8% | ≤ 3083 | yes |
| pilot-implementer | 4369 | 3925 | −10.2% | ≤ 3495 | no |
| pilot-fundamentalist | 5087 | 4920 | −3.3% | ≤ 4069 | no |

The implementer and the fundamentalist stop at their restatement floor: what is left is text that lives in one place
only. On-demand loading was rejected: the implementer runs `verification-loop` on every slice and the
fundamentalist's whole pass is framed by `codebase-design`, so it would fire every run and move the cost rather than
cut it. Trimming `codebase-design` was also rejected: it would reverse the ledger's "verbatim" decision and still miss
the target. The 20% figure was set without measuring the floor. The architect met it at 5102, then gave back 15 tokens
when the S4 review found two rules the cut had lost (never ask `main` what a grep would answer; never touch a branch
but `design/<slug>`), which went back in.

GateGuard, bytes per firing (a 30-character path, recovery hint included where it is sent):

| Denial | Before | After |
|---|---|---|
| first Edit | 669 | 316 |
| first Write | 681 | 338 |
| destructive Bash | 273 | 121 |
| first Bash | 396 | 193 |

Unconditional rules are 46.7 KB:

| File | Size |
|---|---|
| `~/.claude/CLAUDE.md` | 7.5 KB |
| `orchestration.md` | 10.6 KB |
| `vertical-execution.md` | 7.2 KB |
| `rules/common/*.md` | 19.4 KB |
| `rules/README.md` | 2.0 KB |

The `rules/common` files are 10 ECC files shipped verbatim. They contradict the crew: `common/agents.md` prescribes
`planner`, `tdd-guide` and `code-reviewer`, and none of those agents exist.

**Conditional rules** carry `paths:` frontmatter and load on the first matching read:

| Directory | Size | Globs that fire in this repository |
|---|---|---|
| `react/` | 32.7 KB | `**/hooks/**/*.js` fires in this non-React repository |
| `web/` | 17.4 KB | `*.html`, `*.css` |
| `typescript/` | 7.8 KB | `*.js` |

A session touching `hooks/`, `deck/ui` and a `.js` file here pays about 14.5k tokens more. The other 19 directories
never fire here.

Hooks, per firing:

| Hook | Cost |
|---|---|
| `session-handoff` | up to about 6k tokens, only on a hand-off |
| `inbox-alert` | 100 to 550 tokens, per reply |
| `stop-gate` | 100 to 500 tokens |
| `gateguard` | 150 to 225 tokens, per first edit of each file, plus a denied round trip |
| other hooks | negligible |

## 4. Ubiquitous language

| Term | Means |
|---|---|
| **Full auto** | A per-repository switch set in the deck. While it is on, the deck closes each new decision item as `auto` and the pilot decides. |
| **Created thread** | A named chat made by Create or by the pilot's hand-off, never classified. It is *unbound* (routed to the repository's live pilot) or *bound* to the headless session launched for it. It is distinct from a repository's own chat (ADR 0031). |
| **Headless session** | A pilot the daemon started in a hidden pty with `--permission-mode auto`, bound to one created thread, ended by Stop or by exiting. |
| **Prompt cost** | The tokens an agent carries before its first tool call: definition, preloaded skills, unconditional rules and tool schemas. |
| **Taste pass** | QA's heuristic review of the finished UI, adapted from `design-review`. |

## 5. Locked decisions

| # | Decision | Rationale; rejected alternative |
|---|---|---|
| L1 | Create never classifies. `/create` makes the thread, then asks `listLiveRuns` for an **unbound** run on that `repoKey`. If one exists, the thread stays unbound and routes as every item does today. If none does, the daemon launches a headless session bound to the thread (L2). `/create` and the `deck_launch` tool (L16) share one module, `deck/launch.mjs` | The user's decision (2026-09-25). A bound run hears only its own thread, so it does not count as the live pilot. Rejected: always launching (two pilots would compete for one repository's chat and worktrees); a visible `wt.exe` window (replaced by the user's choice of headless) |
| L2 | `deck/launch.mjs` spawns, from the daemon, `claude --agent pilot:pilot --permission-mode auto "<first prompt>"` under `node-pty` in the repository, with `PILOT_THREAD=<id>`. The first prompt carries only the thread id. Names are 1 to 60 characters from `[A-Za-z0-9 _-]` and never reach the pty. Output is discarded except its last 4 KB, which is kept for the exit notice. Without `node-pty` the thread gets "cannot start a session here: node-pty is not installed" and nothing is spawned | The spawn shape was probed (§3). Rejected: `claude -p` (one turn, it cannot hold a thread); the Agent SDK (metered); making `node-pty` a hard dependency (install would fail without a compiler, `deck/run.mjs` header) |
| L3 | A bound run registers `{repo, pid, thread}` (`deck/client.mjs` reads `PILOT_THREAD`), and every item it posts carries that `thread`. `forRun` gives a bound run only its own thread's replies, and an unbound run never receives a bound thread's. **ADR 0033** amends 0031's "one chat per repoKey" to "one repository chat, plus created threads" | It is the smallest routing change that lets two sessions share a repository: one field on the item, one on the run, one filter. Rejected: a new item kind; D23's general per-item wait filter |
| L4 | `/create`, `/thread/<id>/stop` and `/auto` require an Origin that is **present** and matches the Host, stricter than other writes | These routes start or stop processes, or remove the human gates. curl and the stdio client never need them. Rejected: a page token (the Origin and Host pair already covers browsers) |
| L5 | Full auto is a daemon-written `auto` map in the store, keyed by `repoKey` as `{merge, at}`. `recordFor` returns it beside the record, and the toggle is drawn only on a tab, never on the overview. While a repo is in the map, `postItem` of `question`, `spec`, `signoff` or `walkthrough` stores the item already resolved as `auto` and returns `full auto: decide it yourself and record it as assumed; merge to main is <allowed/not allowed>`. Items already open when it is switched on stay the user's. **ADR 0034** | The rule becomes code (spec line 8) and the pilot's prose shrinks to one paragraph. It is outside the record because the record has one writer, the pilot (ADR 0028). Rejected: the pilot polling a flag before each post |
| L7 | These rules move from prose to code: `deck_status` refuses a call without `slug` (`agents/pilot.md:184`), and `deck_post` refuses a `question` body over a screen (1,200 characters, deck-usability line 18). The spawn ceiling stays in prose | Each is a check a validator can make exactly. The ceiling needs a live count the roster only approximates, so the daemon would guess. Rejected: a PreToolUse hook on `Agent` (a guess that blocks) |
| L8 | Prompt diet targets, measured by S1 on each agent's own share (definition + preloaded skills + deck tools; the unconditional rules are S12's): pilot ≤ 9k (from 12.8k after S3), pilot-qa ≤ 5.5k (from 7.5k), every other crew agent at least 20% below its S1 row. **Reset by the user on 2026-09-25 (deck itm_03fbc81c2d0a) after S5–S10 grew them back:** pilot ≤ 9.8k, explorer ≤ 2.15k, pilot-qa ≤ 5.5k, each asserted by a test. Revised by the pilot at S4: the first wording (≤ 12k total per crew agent before A4) was unreachable with 11.7k of rules in every total. Method: delete restatements of a skill in the agent that preloads it, and move `diagnosing-bugs` from preloaded to on-demand for QA | Numbers make "reduce" checkable. Rejected: an unmeasured edit pass |
| L11 | QA drops Core Web Vitals, the dark-mode diff and the 3-breakpoint sweep unless the spec names them. It adds the taste pass (L12) at one desktop width, and writes one report with a triage column | Speed (line 14) comes from removing checks this repository never needed. Rejected: adding the taste pass on top of every check |
| L12 | The taste pass is a new `skills/design-review/SKILL.md`, adapted from `OneRedOak/claude-code-workflows` `design-review` (MIT), with a provenance header and a `vendor/toolbox.md` row. It is preloaded by `pilot-qa` only | It was the only candidate that is a review, carries a licence, and ships no hooks or network calls. Rejected: `web-design-guidelines` (no licence, remote fetch); `ui-ux-pro-max` (a CLI surface); `frontend-design` (for building UI, not reviewing it) |
| L13 | The status line uses `workspace.project_dir` (the launch directory, which is the MCP client's `cwd`), falling back to `current_dir`. It counts waiting items whose `repoKey` matches only | This matches the deck's own key. Rejected: re-reading `current_dir` (the bug) |
| L14 | Release **0.7.0** as the last slice | Prompt and hook changes only reach a session through the installed plugin |
| L15 | The daemon keeps each headless session's pty handle. `onExit` writes `Session ended (exit N)` to the thread as the deck. Stop (`POST /thread/<id>/stop`, drawn only on a bound thread whose run is live) calls `pty.kill()`, then `taskkill /T /F /PID`. A daemon restart ends its ConPTY children, so at startup the daemon writes the notice to every bound thread whose run's pid is gone. **ADR 0035**: the daemon may start sessions, only headless and only from these two paths | The thread says when nobody is there to answer. Rejected: leaving a dead thread silent; a watchdog process outside the daemon (a second long-lived process, against ADR 0005) |
| L16 | A live pilot answering a created thread follows a new paragraph in `skills/pilot/SKILL.md`. A question goes to a `pilot-explorer`, which answers on the thread with `deck_reply`, a new grant as the teacher has. New work gets an in-thread recommendation to hand off each spec, and on the user's agreement the pilot calls a new `deck_launch {name, body}` tool, one call per spec. That tool is granted to the pilot only; it runs `launch.mjs`, posts `body` as the new thread's first message, and returns the thread id. "Never automatic" stays in prose | The launch path is shared with Create. A tool check cannot tell whether a reply meant yes, so the rule cannot become code. Rejected: the daemon classifying the message; the pilot answering questions in its own context (it pays for every one) |
| L17 | Grilling depth is **forks**. This is **one run, subtraction first**, as cut (the user, 2026-09-25) | ADR 0021 asks both once per run. Rejected: splitting into four runs (the DAG keeps each area separable if needed) |
| L18 | **No rigour level and no process-step changes this run.** The user rejected them (2026-09-25): the pilot's steps, gates, slicing and reviewers stay as they are, and subtraction is confined to prompt cost, hooks and the rules prune | The user's decision. Rejected: a `light` rigour (it would have removed the integration branch, the per-slice reviewer, the fundamentalist and the QA split, and let one implementer take several slices) |
| L19 | **The run continues to the end despite the weekly limit.** At 90% weekly usage (resets Sat 26 Sep 11:00) the user chose "Continue the whole run" over pausing (deck itm_e5b2e5b8315a, 2026-09-25). The pilot does not pause or ask again on a usage notice; it saves usage instead: Sonnet for every step whose brief specifies the change (fix rounds, mechanical slices, reviewers), Opus only where a design call is left to the agent | Rejected: pausing until the reset (costs ~12 h of wall clock); continuing only the S6 fix round |
| L20 | **The daemon starts a headless pilot only in a folder Claude Code already trusts**, looked up in `~/.claude.json` `projects[<real-case path>].hasTrustDialogAccepted`, and spawns in that real-case path, never the lowercased deck key. Otherwise the thread says how to trust the folder. It never writes `~/.claude.json` (pilot, 2026-09-25, found live in S6: the session hung at the trust dialog) | Rejected: auto-trusting the folder (a security decision that is the user's); passing a flag that skips the dialog |
| L21 | **Gate 2 is skipped for this run, and the pilot merges on its own.** The user, 2026-09-26 in the terminal: "you may push and merge changes on your own, skip gate 2". Once the step 7 fix round is merged into feat/independence and green, the pilot marks PR #104 ready, merges it into main, and installs 0.7.0, with no walkthrough and no signoff item. The fix round's own browser gate stands in for QA's re-probe | Rejected: holding for the walkthrough. This applies to this run only and writes no standing rule into CLAUDE.md |

ADRs this run writes, in their slices' owned files: **0033** created threads and bound routing (S7, amends 0031); **0034** full auto is the daemon's to enforce (S8); **0035** the daemon may start headless sessions, only from Create and `deck_launch`, and the exit notice, Stop and startup sweep that go with them (S6, extends 0005 and 0009's one-daemon model without a second process).

## 6. Assumed decisions awaiting the user

| # | Default taken | Tradeoff |
|---|---|---|
| A1 | *Resolved by the user:* the drill-down links go; in-place disclosure stays (line 10) | – |
| A2 | Create, then Full auto, sit under Everything in the right strip | The right strip grows from one control to three |
| A3 | Merge to main needs the unticked box in the confirm, stored in the `auto` map (L5) | One more control, against inferring "if you ask" from chat |
| A4 | *Resolved by the user:* prune `rules/common` (byte-identical guard) plus a proposed `CLAUDE.md` trim as a separate PR on `~/environment`; language directories untouched (line 16) | – |
| A6 | From the overview, Create's confirm lists the known repositories (the `decks` map); on a tab it uses that tab's repository. A headless session starts in that repository | A new directory needs one CLI start first |
| A7 | Remove archives rather than deletes: open non-chat items of that `repoKey` get `resolution: archived with its deck`, and its stored runs get `dismissedAt`, so `tabsOf` drops the tab by its existing rule (ended and nothing open). The D-number stays in the `decks` map, is not reused (ADR 0023), and returns if the repository registers again. Refused while `listLiveRuns` has a run there | A returning repository gets its old number back. Rejected: deleting items (history loss); deleting the number mapping (a reused D-number would name two decks) |

## 7. Out of scope

- A general per-item `deck_wait` filter (D23 future).
- The pilot or the daemon launching a session for new work without the user's word.
- Changing `full`'s gates.
- `frontend-design` for implementers.
- Editing `~/environment` in this run.
- The spawn-ceiling hook.
- The 19 language rule directories that never fire here.

## 8. Slices

`S1 → S2`; `S1 → S3 → S4 → S5 → S6 → S7 → S8 → S9 → S10 → S13`; `S4 → S11 → S12 → S13`. Deck slices are serial because they
share `store.mjs`, `server.mjs` and `render.mjs`. S2 (after S1 only so the baseline predates it), and S11 then S12, run in parallel with that chain.

| Slice | After | Delivers | Files owned | Expected behaviour | Verification · evidence | Prohibited | Done when |
|---|---|---|---|---|---|---|---|
| **S1 Prompt cost is measured** (walking skeleton) | – | 7 | `scripts/measure-prompt.mjs`, `scripts/test/measure-prompt.test.mjs` | The command prints per-agent rows: definition, preloaded skills (frontmatter `skills:` and `initialPrompt`), unconditional rules (`~/.claude/rules` files without `paths:` plus `CLAUDE.md`), and deck tool-schema bytes, with a `--json` flag. The baseline is pasted into §3 | `npm test`; the script run at `e85f301` · the output in the PR | hard-coded numbers; reading transcripts | The table prints from real files and a fixture test pins the arithmetic |
| **S2 The status line names its own deck** | S1 | 15 | `hooks/context-usage-statusline.js`, `hooks/test/context-usage.test.js` | Per L13 | a red-then-green test with `project_dir≠current_dir`, then a live session that `cd`s · status line text | keying on `current_dir` again | D-number and count match the launch dir |
| **S3 Rules become checks, tools get lighter** | S1 | 8, 9 | `deck/tools.mjs`, `deck/runs.mjs`, `deck/store.mjs`, `hooks/gateguard-fact-force.js`, their tests in `deck/test/`, `hooks/test/gateguard.test.js` | L7's two refusals, deck tool descriptions cut by at least a third, GateGuard's block message halved | tests red then green; S1 before and after · byte table | loosening a schema to pass; removing GateGuard | Both refusals are tested and S1 shows the cuts |
| **S4 The crew's prompts lose their restatements** | S3 | 7, 8, 17 | `agents/pilot*.md`, `skills/pilot/SKILL.md`, `scripts/test/pilot-agents.test.mjs`, `scripts/test/pilot-rules.test.mjs` | Line 17's spec layout is written into SKILL step 1 and pinned; L8's targets are met; the prose made redundant by S3 is deleted | `npm test`; S1 table · before and after in §3 | deleting a rule a test pins without moving the pin; dropping a gate | S1 shows the targets met |
| **S14 Orchestration plumbing** | S4 | 22 | `bin/pilot.mjs` (`integrate`), `scripts/integrate.mjs` (new), `deck/tools.mjs`, `deck/server.mjs`, `deck/status.mjs`, `deck/store.mjs` (cursor, duplicate reply), `hooks/gateguard-fact-force.js`, `agents/pilot.md`, `agents/pilot-implementer.md`, `skills/pilot/SKILL.md`, tests | Per line 22 | tests red then green; one live integrate of a scratch branch · output | changing `deck_wait`'s timeout (S5's) | one call integrates a slice; the status ack is one line |
| **S5 Create opens a named thread for the live pilot** | S14 | 1, 2, 3 (live half), 3a, 3b, 19, 20, 21 | `deck/tools.mjs` (`deck_wait` clamp and stop), `deck/runs.mjs` (`finished`), `skills/pilot/SKILL.md` (the wait wording), `deck/server.mjs` (`/create`), `deck/store.mjs` (created chat), `deck/ui/render.mjs`, `deck/ui/home.html`, `deck/ui/js/create.mjs`, `deck/ui/deck.css`, `deck/test/create.test.mjs` | Create sits under Everything. A name form, then a second-press confirm (with a repository pick on the overview), and the browser lands on `/thread/<id>`, which lists under Chat. Cancel writes nothing. With a live pilot, its `deck_wait` returns the thread's first message. With none, the thread says "no pilot is live here" (S6 replaces that) | a red store test on cancel; Origin tests; live, the pilot replies in the thread · screenshots | `prompt()` or `confirm()`; classifying the thread; skipping the Origin check | The thread exists, the live pilot answers it, and cancel is proven inert |
| **S6 No pilot live: the daemon starts one headless** | S5 | 3 (headless half), 3d, 24 | `deck/launch.mjs` (new), `deck/server.mjs` (`/create` launch branch, `/thread/<id>/stop`, startup sweep), `deck/store.mjs` (`thread` and `pid` on the item), `deck/client.mjs` (`PILOT_THREAD`), `deck/ui/render.mjs` (the Stop control), `docs/adr/0035-*.md`, `deck/test/launch.test.mjs` | Per L1, L2 and L15. Create on a repository with no unbound live run starts a hidden pilot that answers in the thread. Stop, or the session exiting, writes the notice | tests with the pty spawner injected (argument list, env, no name in the prompt, onExit notice, Stop kills, the sweep); live: Create with no session, no window opens, the reply arrives, Stop ends it · `Get-Process`, screenshot | a shell-string spawn; a visible window; `bypassPermissions`; the name in the pty | Headless reply, Stop and exit notice are all seen live |
| **S7 The pilot hands new work to fresh sessions** | S6 | 3c, 3e | `deck/tools.mjs` (`deck_launch`), `deck/server.mjs` (the tool handler, `forRun`), `deck/store.mjs` (the bound-run filter), `agents/pilot.md` (the tool grant), `agents/pilot-explorer.md` (the `deck_reply` grant), `skills/pilot/SKILL.md` (the created-thread paragraph), `docs/adr/0033-*.md`, `deck/test/routing.test.mjs`, `scripts/test/pilot-agents.test.mjs` | Per L3 and L16 | a red routing test (two runs on one repository, a bound thread's reply reaches its own run only); live: a question gets an explorer's answer on the thread, and two specs get a recommendation, then on "yes" two threads, two sessions · screenshots | launching without a user reply; granting `deck_launch` to crew agents; a per-item wait filter beyond `thread` | Cross-routing refused by test, and a hand-off seen live |
| **S8 Full auto** | S7 | 5, 6 | `deck/server.mjs` (`/auto`), `deck/store.mjs` (the `auto` map, auto-resolve), `deck/ui/render.mjs`, `deck/ui/js/auto.mjs`, `deck/ui/deck.css`, `skills/pilot/SKILL.md` (one paragraph), `docs/adr/0034-*.md`, `deck/test/auto.test.mjs` | Per L5 and A3 | tests; live toggle, confirm, reload; a `deck_post` returns `auto` · screenshots | auto-resolving items already open; merge without the box | Toggle, warning and auto-close are all seen |
| **S9 The Tree's drill-down links go** | S8 | 10 | `deck/ui/render.mjs`, `deck/test/tree.test.mjs` | Remove the sub-tree drill-down `<a>` (render.mjs ~785) and any route only it used; in-place disclosure stays | test; browser | touching the Status tab's Yours links | No drill-down link in the tree; expanding a node keeps the URL and page state |
| **S10 An old deck tab can be removed** | S9 | 18 | `deck/store.mjs` (`removeDeck`), `deck/server.mjs` (`POST /remove-deck`, the L4 Origin rule), `deck/ui/render.mjs` (the Remove control on an ended tab, second-press confirm), `deck/ui/deck.css`, `deck/test/remove-deck.test.mjs` | Per line 18 and A7 | a red store test (the tab gone, items intact, refused while live); browser: Remove, then confirm, then reload · screenshots | deleting items or the number mapping; drawing Remove on a live tab only in CSS while the server allows it | Tab gone, history intact, live refusal seen |
| **S11 QA judges taste, faster** | S4 | 12, 13, 14 | `skills/design-review/SKILL.md` (new), `skills/browser-qa/SKILL.md`, `agents/pilot-qa.md`, `vendor/toolbox.md`, `VENDOR.md`, `scripts/test/qa-preview.test.mjs` | Per L11 and L12. The QA agent timestamps spawn to walkthrough in its report | `npm test`, `check-provenance`; the baseline taken from transcripts · the table | copying `design-review` without a header; taking its Playwright tool config | Provenance is green and the checklist is in QA's preload |
| **S12 Contradicting rules stop loading** | S11 | 7, 9, 16 | `rules/common/**`, `rules/README.md`, `scripts/install-rules.mjs`, `scripts/test/install.test.mjs`, `vendor/toolbox.md`, `VENDOR.md`, `THIRD-PARTY-NOTICES.md`, `docs/INSTALL.md` | Per A4: the prune deletes only files byte-identical to a shipped copy and reports each one | install tests on a scratch home; S1 after · about −4.9k per agent | deleting non-identical files; merging the `~/environment` PR (it is proposed, the user merges) | S1 shows the drop and the test proves an edited file survives |
| **S15 Friction log and closing review** | S12 | 23 | `agents/pilot-architect.md`, `agents/pilot-implementer.md`, `agents/pilot-qa.md`, `agents/pilot-fundamentalist.md`, `agents/pilot-explorer.md` (report shape), `skills/pilot/SKILL.md` (Ending a run), `README.md` (philosophy), `docs/adr/0036-*.md`, `scripts/test/pilot-agents.test.mjs` | Per line 23 | pins red then green; S1 shows each definition grew by under 100 tokens | an audit pass; auto-applying a fix | every crew report shape names friction, and the closing report names the section |
| **S13 Release 0.7.0** | S10, S15 | – (ships 1 to 18) | `package.json`, `.claude-plugin/plugin.json`, `README.md` | Installed 0.7.0 in the cache | `claude plugin list` | – | 0.7.0 is installed |

## 9. Acceptance evidence, in the order the user meets it

1. The status line reads D1 after a `cd` (15).
2. The spec item reads as grouped, short lines with evidence in italics (17).
3. Create, name, confirm: the live pilot answers in the thread; with none live, a pilot starts with no window and answers; Stop ends it and the thread says so (1, 2, 3, 3a, 3d).
4. A question on the thread gets an explorer's answer; two specs get a hand-off question, and "yes" opens two threads that each reach only their own session (3c, 3e).
5. The Full auto toggle warns before it turns on; an auto post closes at once (5, 6).
6. The Tree no longer shows the named links (10).
7. An old tab is removed after a confirm and stays gone; with a live session, Remove is refused (18).
8. QA's report carries a taste table with screenshots, and its time against the baseline (12 to 14).
9. `measure-prompt` before and after (7 to 9).

**Left to QA (step 8), by the pilot, 2026-09-26.** Only QA can show these live:

- **S7:** the two-specs → recommendation → "yes" → two threads, two sessions hand-off (3e second half). S7 showed 3c and the explorer answer live.
- **Setup for S6/S7:** start the scratch daemon with `PILOT_PLUGIN_DIR=<the feat worktree>` so headless sessions load this branch's plugin, not the installed one.
- **Taste:** the S6 watchdog notice's pty tail runs words together (ConPTY cursor moves).

## 10. Status

| Slice | State | Branch | PR | Worktree | After | Delivers |
|---|---|---|---|---|---|---|
| S1 | planned | | | | – | 7 |
| S2 | planned | | | | S1 | 15 |
| S3 | planned | | | | S1 | 8, 9 |
| S4 | planned | | | | S3 | 7, 8, 17 |
| S5 | planned | | | | S4 | 1, 2, 3, 3a, 3b |
| S6 | planned | | | | S5 | 3, 3d |
| S7 | planned | | | | S6 | 3c, 3e |
| S8 | planned | | | | S7 | 5, 6 |
| S9 | planned | | | | S8 | 10 |
| S10 | planned | | | | S9 | 18 |
| S11 | planned | | | | S4 | 12, 13, 14 |
| S12 | planned | | | | S11 | 7, 9, 16 |
| S13 | planned | | | | S10, S12 | – |
| Feature: independence | planned | feat/independence | | | – | 1–18 |
