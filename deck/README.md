# The deck

The deck is one daemon per machine serving a page and a JSON API over one store, plus a stdio client
each Claude session spawns. Read the modules in this order, then the rest as the work needs them.

## Start here

1. `bin/pilot.mjs`: the `pilot` command; every subcommand starts here.
2. `deck/daemon.mjs`: the process that owns the store and serves everything.
3. `deck/server.mjs`: the server's facade; the HTTP routes and the JSON API the client calls are in
   `deck/server-routes.mjs`.
4. `deck/store.mjs`: the store's facade over the one JSON file; the writes are in `deck/store-core.mjs`
   and its siblings.

## Modules

| Module | Purpose |
| --- | --- |
| `agents.mjs` | who is live in each deck, from the roster sessions declare |
| `alert-switch.mjs` | the Weekly alerts on/off switch file |
| `analytics.mjs` | `pilot analytics`: a run's tokens, tool calls, time and cost per agent |
| `audit.mjs` | the housekeeping audit report: checked, ranked, rendered, kept in the store |
| `blocked-shape.mjs` | checks a ticketed `Blocked:` question or walkthrough is posted blocking |
| `budget.mjs` | the per-session agent split set by `pilot budget` |
| `chain.mjs` | hands the next open ticket to a session when a run finishes cleanly |
| `classifier-log.mjs` | the classifier log: one line per auto-mode denial, credentials withheld, newest 10,000 kept; a record, never a permission |
| `client.mjs` | the stdio MCP server each session spawns; owns no state |
| `closing-report.mjs` | writes the closing report when a landing lands: resolves the gate2, finishes its record, closes the ticket |
| `crew-handoff.mjs` | a ticket's open crew-handoffs, which a successor's `deck_ticket co-pilot` grant closes |
| `credential.mjs` | the one credential check, `findCredential`, for every deck post, land's output and the classifier log |
| `daemon.mjs` | the deck process: starts the server over the store; holds a leash, or the idle rule on the user's deck |
| `doctor.mjs` | `pilot doctor`: one row per local check, `pass`, `fail` or `cannot tell` (Defender over the projects root and its admin step, Node against engines, the deck dependency, the store directory writable, `gh`, `git`, `claude` on PATH); exit 1 on a fail; reads only, bar one temp file it removes (process-gc L12, daemon-lifecycle spec 10) |
| `exit-route.mjs` | `POST /api/exit { version }`: 202 and the daemon's shutdown only for a newer caller, 409 for one not newer or while a landing runs (daemon-lifecycle L3, ADR 0156) |
| `gc.mjs` | `pilot gc`: stops each orphan `procs.mjs` names and nothing else, a test root as a tree; one line per stop, and `pilot land` runs it once landed (process-gc L11, L14) |
| `gate2-base.mjs` | the gate2 base check: refuses a gate2 whose sha does not merge clean onto pilot, local git only |
| `gate2-checks.mjs` | the gate2 checks field: where CI is configured at its sha, a gate2 carries `pilot checks <sha>`'s line, green at that sha, local git only (ci-gate spec 4) |
| `gate2-evidence.mjs` | the gate2 evidence check: a short-path ticket's gate2 carries a `Verdict:` per slice, a `Gate:` line and, for a surface, its walkthrough (short-path spec 2); a full run's gate2 naming no walkthrough carries the checks table and, on a plan with a surface, a `surface planned, no walkthrough:` reason line; a named walkthrough is a real one on the gate2's ticket; `walkthroughPlanGaps` refuses QA's walkthrough on a plan marked with no surface (walkthrough-surface spec 3-6); `recutGate1Gaps` refuses a re-cut ticket's gate1 without a `Changed since <sha7>:` line (never-stuck spec 15) |
| `health.mjs` | `GET /api/health`'s answer: pid, url, cursor, rss, and the plugin version with when this daemon started (daemon-lifecycle spec 3) |
| `host-github.mjs` | the GitHub adapter: **Host** over `gh`, and the one `gh` process start, argv only, refusing any call off its argv allowlist before a process starts (other-host spec 2, L5) |
| `host-gitlab.mjs` | the GitLab adapter: **Host** over `glab api` REST v4 on the current project's merge requests, and the one `glab` process start, argv only, refusing any call off its own allowlist before a process starts (other-host spec 4, 6, A3) |
| `host.mjs` | the host: reads `pilot.host` (unset is `github`) and hands back its **Host** adapter, or null at `none` (other-host spec 1-3) |
| `idle.mjs` | the user's deck's idle rule: it exits after 10 minutes with no session, no landing and no request, reading the process table only when the other two hold (process-gc L2, ADR 0136) |
| `items.mjs` | the item vocabulary: kinds, fields, open or closed, whose turn |
| `items-bounds.mjs` | the item vocabulary's bounds and field shapes: limits, the words the deck offers, `stepParts` |
| `land-child.mjs` | a landing's land child: its land dir, its recorded pid, and whether that pid is still the deck's land |
| `landing-replies.mjs` | the pilot's `Resolving` and `Land again` on a gate2 whose landing stopped on a conflict, and the check that the worktree land kept still holds |
| `landing-wait.mjs` | `pilot landing`: polls the deck until a gate2's landing settles and exits with its outcome |
| `landing.mjs` | lands the feature when a gate2 is signed: starts `pilot land` in the run's worktree and records the outcome; counts the landings running; at start, retries or reports what a restart left owed |
| `lane-ticket.mjs` | the ticket a denied agent's Blocked item is filed under, by agent type: the co-pilot's crew, QA, everyone else |
| `lanes.mjs` | a directory's main and co-pilot lanes as every surface prints them: the lane lines and the refusal of an idle main lane (ADR 0123) |
| `launch.mjs` | how a browser gets in: the 0600 open file that forwards to `GET /open?key=`, the per-port page cookie that route sets, and `pilot deck --rotate` (deck-token A2, A3) |
| `leash.mjs` | the leash a daemon that is not the user's deck holds: its pid and paths from argv, the 2 s poll that ends it, and the session's `CLAUDE_PID` (process-gc L1-L4) |
| `lineage.mjs` | the gate1 lineage check: refuses a design-docs-only post whose branch is not on pilot's lineage |
| `look.mjs` | `pilot look`: reads a surface's `surface.json` and captures a screen by route with one argv-started process; `apply` lays a playground export onto the token file |
| `memory.mjs` | each deck process's memory readings, one JSON line each |
| `one-line.mjs` | `oneLine`: text from a peer or caller made one printable line, for logs and stderr |
| `open.mjs` | opens the deck page in a browser when a run registers |
| `owed.mjs` | the threads the pilot still owes a directory: unanswered, or promised with `deck_reply`'s `promise`; served on `/api/record` |
| `pilot-state.mjs` | `pilotStateOf`: the pilot's state for a repository, read at render time from items, runs and held waits and stored nowhere, in the precedence ADR 0149 records |
| `pr-writes.mjs` | `startPrWrite`: the deck write, `pilot pr --ticket <id>` spawned on a gate1 and each status of its ticket, one in flight per ticket plus one rerun, a failure one line on the ticket (deck-writes-github spec 2, 7) |
| `probe.mjs` | `probeDeck`: the one answer to who holds a url, a deck by pid and version, nothing, or not a deck (daemon-lifecycle §3) |
| `procs.mjs` | `pilot ps`: the process table (one PowerShell CIM or `ps` read), the pilot-owned daemons, waits and test roots, and which are orphans and why (process-gc L5-L6) |
| `question-shape.mjs` | checks a crew question's recommended default carries a `Research:` line |
| `read.mjs` | which items a `deck_read` returns: one by id, or the newest |
| `recut.mjs` | `planDrift`: whether a signed plan still stands on `origin` (`ok`, `gone`, `moved`, `unchecked`), and `ownedFiles`, a slice file's owned paths, and `neverGranted`, the plan whose first grant checks it (never-stuck spec 13); `planChanges`, what moved in a re-cut's design dir between two shas (spec 15); `SHA`, a plan sha's shape |
| `refusal-log.mjs` | `logRefusal`: one deck.log line per refused or failed request (400, 415, 500), `[deck] <status> <METHOD> <path>: <message>`, a 500's stack frames under it, never the query or body (daemon-lifecycle spec 2) |
| `report-shape.mjs` | checks a closing report asks the user nothing (ADR 0148) |
| `run-claim.mjs` | the hand-off mod's claims and stamps: the once-only `/clear` claim, the lane's marker, the posted and reported-in stamps and the session pid |
| `run-env.mjs` | a pilot session's start: its settings and arguments (`runSettings`, `startArgs`) and environment (`runEnv`) |
| `run-look.mjs` | the hand-off mod's look: one `Outcome` per op (`turn`, `cleared`) as a CLI the mod runs |
| `runs.mjs` | what a run is and whether its session is still there |
| `schedule.mjs` | the co-pilot's scheduler: which slices of a run's record may start now, and from which tip |
| `scratch.mjs` | `pilot deck --scratch`: an agent's own deck on a free port, its store under the temp directory |
| `server-routes.mjs` | the HTTP routes and JSON API, and the server the daemon starts |
| `server-tools.mjs` | the server's tool layer: each deck tool as the deck performs it |
| `server-wait.mjs` | the server's waiting half: body readers, guards, the asset allowlist and the long poll |
| `server.mjs` | the server's facade: re-exports its siblings' names for every older importer |
| `session.mjs` | starts a session in a terminal window when the Start route asks |
| `slug-clash.mjs` | whether origin, the run remote or an open review already holds a slug's `feat/` or `design/` branch, read live |
| `spawn-root.mjs` | which root a client spawns the daemon from and its version: the installed plugin for a checkout on 4321, else its own root (ADR 0165) |
| `step-shell.mjs` | where a wizard's or a report's command steps run: a command step without a `dir` is refused, and a missing `shell` is the daemon's platform default (walkthrough-surface spec 9) |
| `stalled-waits.mjs` | the daemon's 5-minute scan: an unbounded wait shell past 50 minutes under a live run's `claude` is stopped through `gc`, and the run's repository told (wait-deadlines S3) |
| `status-command.mjs` | `pilot status`: the deck's url, pid, version against the plugin's, uptime, live agents, and deck.log's last 20 lines; reads only (daemon-lifecycle spec 8, 9) |
| `status.mjs` | the slice table and its Yours column |
| `store-archive.mjs` | the store's month archive: closed items over 30 days old moved to `deck.archive-YYYY-MM.json`, read back by id |
| `store-core.mjs` | the store's core: reading and writing deck.json, the refusals and validators, added decks |
| `store-defaults.mjs` | a plain question's default, taken by the deck at 20 minutes; re-exported by `store-items.mjs` |
| `store-dir.mjs` | where the deck keeps its files, loadable without the store |
| `store-items.mjs` | the store's items: posting, replies, the gates, resolving, reopening and closing |
| `store-recovery.mjs` | the store's backup: `deck.json.bak` kept before each write, and a corrupt store set aside and recovered from it |
| `store-restore.mjs` | `pilot store restore`: the backup swapped in by hand, refused while a deck serves the store on any port |
| `store-steps.mjs` | a ticket's human steps: the steps thread's one writer, the user's Done, and the ticket's one close the report shares |
| `store-stage.mjs` | a ticket entering a stage: its state, its place in that stage's queue, and its first green entry |
| `store-tickets.mjs` | the store's ticket queue: moving, taking and merging tickets, the lane switches |
| `store-runs.mjs` | the store's reads and delivery, runs, co-pilot, budget, threads, slices and records |
| `store.mjs` | the JSON store, read and written only inside the daemon |
| `tabs.mjs` | which runs the deck holds and which is on screen |
| `ticket-shape.mjs` | checks a ticket body is in ticket-making's shape |
| `tickets.mjs` | `pilot tickets`: the red queue a merge is judged from |
| `telemetry.mjs` | the half-hourly usage log |
| `testUtils.mjs` | what the deck's tests stand a deck up from |
| `tools.mjs` | the three tools a session may call, and where the deck lives |
| `trace.mjs` | `pilot trace`: a hand-off's trace rows in time order, then what it waits on |
| `transcripts.mjs` | the one transcript reader behind usage and analytics |
| `ui/markdown.mjs` | escaping, link schemes and the whitelisted markdown renderer |
| `ui/render-cards.mjs` | the cards, previews and run list |
| `ui/render-parts.mjs` | the thread parts, forms and per-kind renderers |
| `ui/render-strip.mjs` | the status table, git graph and tab strip with its forms |
| `ui/render-rail.mjs` | the ticket rows and queue, reports, agents, notices, chat and usage |
| `ui/render-pages.mjs` | the day sections, the queue, and the home, deck and thread pages |
| `ui/render.mjs` | the facade over the render siblings |
| `usage-switch.mjs` | the logging on/off switch file |
| `usage.mjs` | how much of the context, five-hour and weekly allowance is gone |
| `version.mjs` | `PLUGIN_VERSION`, read once from package.json, `isOlder`, `isVersion` and `ENGINES`; the only package.json read in the deck (daemon-lifecycle spec 3) |
| `wait-for.mjs` | `pilot wait-for`: a wait on a file for a matching line that ends by itself at a required deadline |
| `wait.mjs` | `pilot wait`: what wakes an idle agent |
| `walkthrough-shape.mjs` | checks a QA walkthrough is a look, not a script |
| `work.mjs` | the gates the pilot has signed in a directory since its last hand-off, for the guard's advice; served on `/api/record` |
