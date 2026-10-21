# user-thread-listener

Deck ticket itm_eb35ade648ba. Branch `feat/user-thread-listener`. Base: origin/main e8a0e79 (merge-first #290, overview-one-ticket #297, slice-estimates #289 and runs-build-on-each-other #311 merged). Anchors re-checked against it 2026-10-04.

## 1. Problem

The user asked "why isnt your deck-wait working" and then "how do we systematically stop that from happening again". Three misses so far:

- **2026-10-01, first miss.** A `pilot wait` returned the user's thread, but the harness labelled it "stopped at the time limit". The pilot believed the label and never read the output. The Stop gate then offered "if you never posted this, it belongs to another session", and the pilot took that way out on a thread the user had opened in this repository.
- **2026-10-01, second miss.** The pilot ran `pilot wait` from its `feat/<slug>` worktree. The wait sends `process.cwd()` as its repository, and the daemon compares paths as plain strings, so it listened on a directory the user never posts to.
- **2026-10-04.** A QA walkthrough wait ran in QA's worktree. The user's reply sat unread: "why are you not listening to the deck?"

## 2. Spec

| # | Behaviour | Evidence |
|---|---|---|
| 1 | `pilot wait` prints `listening on <repo>` first. When a reply lands, it then prints `REPLY <id> "<title>"` above each reply's text. When none lands it prints `NO REPLY after <n> minutes`. | `deck/test/wait.test.mjs` pins all three lines. The output file of a wait that took a reply has `REPLY` on its second line. |
| 2 | The Stop gate holds the turn on a `user` or `chat` thread of this repository the user answered, and its reason says the thread is this repository's pilot's. It does not offer "it belongs to another session". The same holds for a thread on this repository's live ticket, whichever session posted it, so a session that picked up a hand-off cannot disown the run's own questions and gates (A3, the user's answer). Other threads keep that escape. | A stop-gate test: an answered user thread blocks, and the reason has no "another session". A question on this repository's live ticket that this session never posted blocks the same way. A question stamped with another repo still stands aside. |
| 3 | `agents/pilot.md` tells the pilot to read the wait's output before it believes any exit label the harness gives, and it quotes the new `NO REPLY` line. | A sentence pin in `scripts/test/pilot-rules.test.mjs`. The pilot's own-share pin holds, and the trim that paid for the sentence is named in the PR. |
| 4 | While a pilot thread the user answered stays open with the user's word last, every tool use carries a short notice naming it. The notice stops once that thread is resolved or answered. Confirmed by the user (A1): the full reply text is said once, as today, and the repeats are the short form. | `hooks/test/inbox.test.js`: two tool uses after a reply both carry `still unanswered: <id>`, and a third after a `deck_reply` does not. |
| 5 | `pilot wait` started inside a git worktree listens on the repository that worktree belongs to (`git rev-parse --git-common-dir`). Outside git it listens on its cwd. | A wait whose cwd is a real `git worktree` takes a reply posted on the main checkout, and prints `listening on <main checkout>`. |
| 6 | In scope, confirmed by the user (A4): the PostToolUse inbox lane and the Stop gate key on the session's project directory (`CLAUDE_PROJECT_DIR`, else the hook's cwd). A pilot whose shell sits in a worktree is still handed the reply and still held. | A hook test run with `cwd` = a worktree and `CLAUDE_PROJECT_DIR` = the repo delivers the reply and blocks the stop. Today the same run reads past the reply. |
| 7 | The listener (`pilot wait`), the deck daemon and the deck's tool client each record their own memory. *(merged from itm_22298cbe5f0a)* | The log holds readings from all three, each naming its process (`wait`, `daemon`, `client`) and its pid. |
| 8 | A reading is taken when the process starts, every 10 minutes, and when it exits or is stopped. Confirmed by the user for a hard kill (A6). | The log holds a last `exit` line for a listener that timed out, took a reply, or was stopped with Ctrl-C or SIGTERM. A hard-killed listener's last line is its last `tick`. |
| 9 | Free system memory is logged beside each reading. | Each line has the process's `rss` and the machine's `free` memory. |
| 10 | Readings go where `pilot analytics` reads, and it shows the peak per run. *Assumed* destination (A5). | `pilot analytics <slug>` prints a memory row per process: peak `rss` inside the run's span and the free memory at that reading. |

| 11 | One logging switch governs the token-spend log (`usage.jsonl`) and the memory log (`memory.jsonl`) together. It is on by default, and off means neither is written. | A test: with no switch file, a usage tick and a wait's start both write. After `pilot logging off`, a tick, a wait's start and a running process's next `tick` write nothing to either file. |
| 12 | The command is `pilot logging on\|off\|status`. `pilot usage <anything>` prints one line pointing to `pilot logging` and exits non-zero. There is no alias. | A CLI test: `pilot logging status` prints `logging on, <store dir>`, and `pilot usage off` exits 2 with `pilot usage is now pilot logging on\|off\|status` and changes no state. |
| 13 | A user who turned `pilot usage off` before the rename is still off after it. | A test: an existing `usage-log.json` with `enabled: false` makes `pilot logging status` print `logging off`, and nothing is written. |

Lines 7–10 came with itm_22298cbe5f0a, merged on the user's word (itm_523d07387e48). Lines 11–13 are the user's, from 2026-10-04 (itm_d226fbd5ff87): "rather than call it 'usage logging', we just have general logging that does all the stuff. it defaults to on."

Dropped from the draft: nothing. All five draft lines are open on main (§3), and line 1 is only partly there. Spec 6 is implied: without it, spec 2 and spec 4 fail in exactly the worktree state that caused the 2026-10-01 second miss.

Cannot mean here: "a user-opened thread landed" cannot wake a wait at Create time. `createThread` (`deck/store.mjs:1525`) writes no reply, so the user's first message in the thread is what wakes the wait, as with any reply.

Cannot mean here: "a last line for a listener that was stopped" cannot hold for a hard kill. On Windows Node runs no handler for a terminate, and the harness's background stop is one, so that listener's last line is its last 10-minute `tick` (A6).

Cannot mean here, literally: "where `pilot analytics` reads". It reads Claude Code transcripts and `docs/design/<slug>/run.json` (§3), neither of which a process may append to. The nearest log is the deck store's `usage.jsonl`, which analytics does not read either (A5).

## 3. Findings

| Area | What is there | Anchor |
|---|---|---|
| Wait output | Prints `<id> — "<title>":\n<text>`, or `no reply after <n> minutes`. No keyword and no repo line. | `deck/wait.mjs:89-92`, `:131` |
| Wait repo | `repo: cwd`, where cwd is `process.cwd()`. | `deck/wait.mjs:103`, `:135` |
| Daemon join | `forRun` does `sameRepo(reply.repo, repo)`, a case-folded `path.resolve` compare with no worktree resolution. | `deck/server.mjs:687`, `deck/items.mjs:656` |
| Item repo | The MCP client registers and stamps `process.cwd()`, which is the session's launch directory. Create stamps the deck's repo. | `deck/client.mjs:185`, `deck/store.mjs:1525` |
| Worktree resolvers | `runs.mjs repoOf` reads the `.git` file (no subdirectory support). `telemetry.mjs gitRepo` runs `git rev-parse --git-common-dir` asynchronously. `analytics.mjs:72` runs it synchronously with `--path-format=absolute`. | `deck/runs.mjs:104`, `deck/telemetry.mjs:32`, `deck/analytics.mjs:72` |
| Gate escape | `reasonFor` always ends "if you never posted …, it belongs to another session". | `hooks/stop-gate.js:179-206` (the sentence at `:200-203`, after #290's gate-sentence branch) |
| Gate join | `isForThisRepo(item, input.cwd)`. The fallback `deck_wait` and `namedTickets` also use `input.cwd`. | `hooks/stop-gate.js:153,280,293,304` |
| Inbox once | A claim per reply seq, the cursor advanced on commit, "delivered once and you will not be shown it again". | `hooks/inbox-alert.js:49,78,91,189` |
| Inbox drift | `deck_wait(repo: input.cwd)`. When nothing matches, the cursor is advanced past everything. | `hooks/inbox-alert.js:165-201,265` |
| Cwd drift | Already known: `markTurnEnded` keys on `CLAUDE_PROJECT_DIR \|\| cwd` "since the shell's drifts into a worktree", and a test pins it. | `hooks/lib/deck.js:500`, `hooks/test/inbox.test.js:712,725` |
| Owner by kind | `chat`, `user` and `ticket` always belong to the pilot. | `deck/items.mjs:535` |
| Pilot prose | The listener rule quotes `no reply after 110 minutes`, pinned. | `agents/pilot.md:63-75`, `scripts/test/pilot-rules.test.mjs:403`; `scripts/test/pilot-agents.test.mjs:487` also pins `110 minutes` |
| Prompt pin | Pilot own share ≤ 10270.75. | `scripts/test/measure-prompt.test.mjs:108-114` |
| Daemon entry | `main` starts the server, then `startUsageLog()` (kept out of `startDaemon` so a test daemon never ticks), then SIGINT/SIGTERM handlers that `process.exit(0)`. | `deck/daemon.mjs:87`, `:107`, `:110-117` |
| Client entry | `main` connects the stdio transport, then `ensureOnTheDeck()`. One client per Claude Code session. | `deck/client.mjs:415-421` |
| Wait entry | `main(argv)` parses, then `wait(parsed)`; the tests call `wait` directly. | `deck/wait.mjs:178-185` |
| Analytics reads | Transcripts via `readRun(repo, slug)` and the `run.json` mirror; no deck log. The run's sessions carry `first` and `spanMs` per file but `readRun` exposes no time span. | `deck/analytics.mjs:262-283`, `deck/transcripts.mjs:53`, `:269-283` |
| Usage log | `<storeDir()>/usage.jsonl`, one line per half-hour window. Its resume reads the last line's `window.to` and treats any other last line as torn. | `deck/telemetry.mjs:21`, `:114-131` |
| Switch | `<storeDir()>/usage-log.json` holds `{enabled, at}`. Absent or unreadable means on. The tick re-reads it so a running daemon hears `off`. `pilot usage` prints `usage log on\|off, <usage.jsonl>`, and an unknown word exits 2. ADR 0043 records it. No agent, skill, hook or README names `pilot usage`, so no prompt pin moves. | `deck/usage-switch.mjs:14-38`, `deck/telemetry.mjs:178-180`, `bin/pilot.mjs:29,65-66,127-137`, `deck/daemon.mjs:108`, `docs/INSTALL.md:20`, `CONTEXT.md:226`, `deck/test/usage-switch.test.mjs:113-136`, `deck/test/telemetry.test.mjs:164` |
| Memory today | Nothing calls `process.memoryUsage` or `os.freemem` in `deck/`, `hooks/` or `bin/`. | grep |

## 4. Ubiquitous language

- **Listener**: a `pilot wait` process, or one of the two hook lanes (the inbox lane and the Stop gate), that hands the user's replies to an agent.
- **Listening repository**: the path a listener sends as `repo`. For `pilot wait` it is the main checkout of its cwd. For the hooks it is the session's project directory. Never a worktree.
- **Exit line**: the first line `pilot wait` prints after `listening on`, either `REPLY …` or `NO REPLY …`. It is the only account of why the wait exited.
- **Unanswered thread**: an open thread the pilot owns whose last word is the user's, said while this session was alive. This is the Stop gate's `answered` rule. The inbox's repeat and the gate's hold are both defined by it.
- **User-opened thread**: kind `user` or `chat`. Nobody posted it, so no session can disown it.
- **Memory reading**: one JSON line `{at, process, pid, event, rss, free}`, where `event` is `start`, `tick` or `exit`. It is the process's own `rss` and the machine's free memory at that moment, in bytes.
- **Logging switch**: the single on/off for every log the deck keeps (`usage.jsonl`, `memory.jsonl`), set with `pilot logging`. It is on unless set off. Never "usage switch" in user-facing text.

## 5. Locked decisions

| # | Decision | Rationale | Rejected |
|---|---|---|---|
| L1 | The exit line is uppercase `REPLY` / `NO REPLY` and comes right after `listening on <repo>`. Each reply printed gets its own `REPLY` line. | One grep-able token on the line read first. It cannot be mistaken for a harness label. | A JSON line: unreadable at a glance for the user. |
| L2 | Spec 5 resolves in the CLI (`deck/wait.mjs`): `git rev-parse --path-format=absolute --git-common-dir` once, synchronously, at start; its parent directory, else cwd. *(A2)* | The CLI has to print the repository anyway. One spawn per wait, never per poll. It handles subdirectories, which `runs.mjs repoOf` does not. | Daemon `readRepo`: a git spawn on every inbox poll. `runs.mjs repoOf`: fails in a subdirectory. |
| L3 | The hooks key on `projectDir(input, env)`, which is `env.CLAUDE_PROJECT_DIR \|\| input.cwd`. It is one function in `hooks/lib/deck.js` and replaces every `input.cwd` join in `inbox-alert.js` and `stop-gate.js`. *(A4)* | Precedent at `hooks/lib/deck.js:500`. Free, with no git spawn on each tool use. It equals the launch directory the client registered. | Running git in the hooks: about 30 ms on every tool call. A git `.git`-file reader in CommonJS: a second resolver. |
| L4 | The unanswered-thread rule moves from `stop-gate.js` into `hooks/lib/deck.js` as `unanswered(items, posted, baseline, repo)`. The gate and the inbox lane both call it. | One definition, so the notice repeats exactly as long as the gate would hold. | A second filter in the inbox lane that drifts from the gate's. |
| L5 | The repeat reads `deck_read {open:true, limit:20}` without `repo`. | A read naming a repo marks that repo's replies delivered (`hooks/lib/deck.js:168`). The gate already reads it this way. | `deck_read` with `repo`: it would take replies the wait should take. |
| L6 | The "another session" escape is cut for user-opened threads and for threads on this run's ticket: an item whose `ticket` is a ticket `deck.record(projectDir, ticket)` hands back with `live: true`. Every other thread keeps it. *(A3, answered by the user 2026-10-04, itm_dd85dec5f22e)* | "Mine" is a per-session list (`readPosted(sessionId)`, `hooks/lib/deck.js:420`), empty after a hand-off, so the escape was literally true for every thread a fresh session inherited. The ticket join is per run, not per session, and `namedTickets` (`hooks/stop-gate.js:164`) already makes that read. Another pilot in the same repo on a ticket that is not this one keeps its way out. | User-opened only: leaves the hand-off gap. Every thread of the repo: a second session in the same repo loses the way out too. |
| L7 | ADR 0070 "a listener listens on the repository and says what it heard" (S1); ADR 0071 "the hooks key on the project, and a user-opened thread is the pilot's" (S2); ADR 0072 "an unanswered thread is said until it is answered", which supersedes inbox-alert's "delivered once" (S3). | Structural decisions are recorded as ADRs (vertical-execution §1). 0062–0069 are on main; 0070 is the next free number. | One ADR across three slices: S1 and S2 run in parallel and would collide on it. |
| L8 | QA runs against a scratch deck on its own port and store (§9), never the live deck on 4321. Answered by the user, 2026-10-04 (itm_9890f905a0da). | The live deck carries this run's own threads and listener; a fix to the listener probed there could swallow real replies. | The live deck on 4321. |
| L9 | Grilling depth is *forks*: only decisions whose paths produce materially different deliverables reach the user as items; Gate 1 is one item on the whole artefact. Answered by the user, 2026-10-04 (itm_4deaebac2dba). | No schema, auth, money, public API or irreversible data in this feature. | *Every*: a walk of each locked decision before the gate. |
| L10 | One module, `deck/memory.mjs`, owns the reading: `startMemoryLog(name)` writes `start`, an unref'd 10-minute `tick`, and `exit` from `process.on('exit')` and from SIGINT/SIGTERM. Each of the three `main`s calls it once. `wait()` and `startDaemon()` never do. | Same seam as `startUsageLog` (`deck/daemon.mjs:107`), so no test process ever writes a reading. The unref'd timer never holds a wait open. | A sampler inside the daemon that polls the others: it cannot see another process's memory without a native call. |
| L11 | `pilot analytics` prints one memory row per process name: the peak `rss` among readings whose `at` falls inside the run's span (`readRun` gains `span: {from, to}` from its sessions' files), and the `free` beside it. All readings on the machine count, not only this repository's. | The daemon is machine-wide and has no repository. Free memory is a machine figure too, so filtering waits by repository would hide what the machine was carrying. | A repository filter: drops the daemon, the process the user most wants to see. |
| L12 | *(Replaces the earlier "the memory log ignores `pilot usage off`".)* The logging switch governs both logs. `startMemoryLog` re-reads it before every reading, as the usage tick does, so `off` reaches a running wait, daemon or client at its next reading. Answered by the user, 2026-10-04 (itm_d226fbd5ff87). | The user's words: "general logging that does all the stuff. it defaults to on." | A switch per log. Ignoring the switch for memory, which was the earlier default. |
| L13 | ADR 0073 "each deck process logs its memory beside the usage log" (S4). | One ADR per slice (L7). 0070–0072 are reserved by S1–S3, and 0073 is free on main e8a0e79. | Amending ADR 0070: S1 and S4 would edit one ADR. |
| L14 | `pilot logging on\|off\|status` replaces `pilot usage`. `pilot usage` with any words prints `pilot usage is now pilot logging on\|off\|status` to stderr and exits 2, the code the CLI already uses for a malformed command. `status` prints `logging on\|off, <store dir>`, and the daemon's start-up line becomes `[deck] logging on, <store dir>` or `[deck] logging off (pilot logging on)`. Answered by the user, 2026-10-04 (itm_d226fbd5ff87). | No alias, at the user's choice. The store directory names both logs, and S5 does not depend on S4's `memoryLogFile`. | An alias that keeps `pilot usage` working. Exit 1. |
| L15 | The switch file keeps its name, `usage-log.json`, and `deck/usage-switch.mjs` keeps its name and exports. Only what the user sees is renamed. | An existing `off` stays off by construction (spec 13), with no migration and no precedence rule. The code names are internal and not in the request. | A new `logging.json` that falls back to the old file: two files and a precedence rule forever. Renaming the module: about six files of churn with no behaviour change. |
| L16 | ADR 0074 "one logging switch governs every log the deck keeps" (S5) supersedes ADR 0043's switch decision, and 0043 says so in its status line. | One ADR per slice (L7). The ADR numbers in this run are 0070–0072 (S1–S3), 0073 (S4) and 0074 (S5). | Editing 0043 in place, which loses the record of the first decision. |
## 6. Assumed decisions awaiting the user

A5 (came with the merge) was not asked: mixing readings into `usage.jsonl` breaks its resume, so the default is the only safe path; the user can overturn it at Gate 1. A1, A3, A4 and A6 were answered on the deck on 2026-10-04, and A2 was not asked because its default (the CLI) is the one with no cost on the hot path.

| # | Question | Default taken | Tradeoff |
|---|---|---|---|
| A1 | Should the repeated notice be a short form? | Yes. The full text is said once, then each repeat is `SYSTEM NOTICE: still unanswered: <id> "<title>"` per thread, plus one instruction line, about 25 tokens per thread. **Confirmed by the user, 2026-10-04 (itm_45a359cd73cb).** | A pilot that compacted the first notice away sees titles only and has to `deck_read`. Full repeats could cost up to 16k characters per tool use. |
| A2 | Should spec 5 resolve in the CLI or in the daemon? | The CLI (L2). | The daemon would fix every caller, but at the cost of a git spawn on the hot path, and it would still have to echo the repo back. |
| A3 | Should the escape go for user-opened threads only, or for every thread of the repo? | Was: user-opened only. **Answered by the user, 2026-10-04 (itm_dd85dec5f22e): user-opened plus this run's ticket threads (L6).** They asked what a handed-off session does with threads it did not post; it has an empty posted list, so the default left the escape on the run's own inherited threads. | A slightly larger S2: one record read per distinct ticket named by a held thread, only when the gate is about to block. |
| A4 | Is spec 6 (the hooks key on the project directory) in scope? | Yes (L3). **Confirmed by the user, 2026-10-04 (itm_50dbe8ea177d).** | It changes the key for every hook lane. A session launched from a parent directory disagrees with its run either way, as it does today. |
| A5 | Where do the readings go: into the deck's `usage.jsonl`, or into a new file beside it? | **Assumed:** a new `memory.jsonl` in the deck store, which `pilot analytics` learns to read. | A second file to know about. Mixing readings into `usage.jsonl` would break its resume, which takes any last line without `window.to` as torn (`deck/telemetry.mjs:124`), and would show memory lines to `audit-spend`. |
| A6 | What does "stopped" mean for spec 8? | **Confirmed by the user, 2026-10-04 (itm_b4e14ab8ffea): a 10-minute tick everywhere.** An `exit` line on every normal exit, on Ctrl-C and on SIGTERM. A hard kill, which is how the harness stops a background wait on Windows, leaves the last `tick` (at most 10 minutes old) as the last line. | No guarantee of a last line on Windows' background stop. The alternative is a 1-minute tick for `pilot wait`: about ten times the lines, for a staleness bound of a minute. |

## 7. Out of scope

- Waking a wait when Create opens a thread with no message in it.
- Changing what the daemon's `forRun` or `sameRepo` compare.
- The crew files' wait prose (`pilot-qa.md`, the teacher, the auditor). The worktree fix lives in the CLI, so their waits are fixed without a prose change.
- The "parent directory" launch case of 2026-09-16 (`readPosted` already covers posted items).
- A PreToolUse rewrite of `pilot wait` (ADR 0061 rejected it).
- Memory of the hooks, the crew's agents or Claude Code itself. Only the three deck processes are logged (spec 7). No rotation of `memory.jsonl`, and no alerting on a reading.
- Renaming `usage.jsonl`, `usage-log.json` or `deck/usage-switch.mjs` and its exports (L15). The audit's "usage log" wording (`deck/audit.mjs`, `scripts/audit-spend.mjs`) names the file, not the switch, so it stays.

## 8. Slices

| Slice | Title | Spec | Files owned | After | File |
|---|---|---|---|---|---|
| S1 | A wait from a worktree hears the user and says so first (walking skeleton) | 1, 3, 5 | `deck/wait.mjs`, `deck/test/wait.test.mjs`, `deck/test/wait-as.test.mjs`, `agents/pilot.md`, `scripts/test/pilot-rules.test.mjs`, `scripts/test/measure-prompt.test.mjs`, `docs/adr/0070-…` (new) | – | [S1](slices/S1.md) |
| S2 | A pilot in a worktree is held on a user's thread it cannot disown | 2, 6 | `hooks/lib/deck.js`, `hooks/stop-gate.js`, `hooks/inbox-alert.js` (the join only), `hooks/test/listener-join.test.js` (new), `docs/adr/0071-…` (new) | – (beside S1) | [S2](slices/S2.md) |
| S3 | An answered thread is repeated until the pilot answers it | 4 | `hooks/inbox-alert.js`, `hooks/lib/deck.js` (`unanswered`), `hooks/stop-gate.js` (calls it), `hooks/test/inbox.test.js`, `docs/adr/0072-…` (new) | S2 | [S3](slices/S3.md) |
| S5 | `pilot logging` is the one switch, and an old "off" stays off | 12, 13 | `bin/pilot.mjs` (`logging` and the `usage` pointer), `deck/usage-switch.mjs` (doc comment only), `deck/daemon.mjs` (the start-up line, `:108`), `deck/telemetry.mjs` (the comment at `:178`), `deck/test/usage-switch.test.mjs`, `deck/test/telemetry.test.mjs` (the `:164` pin), `docs/INSTALL.md`, `CONTEXT.md`, `docs/adr/0043-…` (status line), `docs/adr/0074-…` (new) | – (beside S1, S2) | [S5](slices/S5.md) |
| S4 | Each deck process logs its memory, under the logging switch, and `pilot analytics` shows the peak | 7, 8, 9, 10, 11 | `deck/memory.mjs` (new), `deck/test/memory.test.mjs` (new), `deck/wait.mjs` (`main` only), `deck/daemon.mjs` (one call in `main`), `deck/client.mjs`, `deck/transcripts.mjs` (`span`), `deck/analytics.mjs`, `deck/test/analytics.test.mjs`, `docs/adr/0073-…` (new) | S1, S5 | [S4](slices/S4.md) |

S1 and S2 share no file and can run in parallel. S3 comes after S2 because it reuses S2's `projectDir` and edits the same three hook files. S5 shares no file with S1, S2 or S3 and can run beside them. S4 comes after S1 because both edit `deck/wait.mjs` (S1 everything but `main`, S4 one line in `main`). It comes after S5 because both edit `deck/daemon.mjs`, and because the memory log reads the switch S5 makes general. S4 only imports `readUsageSwitch` and owns no part of `deck/usage-switch.mjs`. S1's ownership is unchanged.

No collisions with unmerged work: #290 and #297 are merged and main reflects them. `reasonFor`'s closing "another session" sentence and `notice()`'s "delivered once" sentence both survived #290 unchanged, so S2 and S3 edit them as written here. S1 measures the prompt pin against 10270.75.

## 9. Acceptance evidence

A scratch deck runs on its own port and store (`PILOT_DECK_DIR=<tmp>`, `PILOT_DECK_PORT=4399`), never the live deck on 4321. The scratch repo has one `git worktree`.

1. From the worktree, `pilot wait --timeout 1` prints `listening on <main checkout>` (spec 5). Reply in the scratch deck's browser and it prints `REPLY <id> "<title>"` with the text (spec 1). Run it again without replying and it prints `NO REPLY after 1 minutes`.
2. Open a thread with Create and type in it. Run `hooks/stop-gate.js` by hand with `cwd` = the worktree and `CLAUDE_PROJECT_DIR` = the repo: it blocks, and the reason does not say "another session" (spec 2, 6).
3. Run the PostToolUse hook by hand twice: both outputs carry `still unanswered`. Reply with `deck_reply`, run it a third time, and nothing is said (spec 4).
4. Read `agents/pilot.md`'s listener rule: it says read the output, not the label (spec 3).
5. Start the scratch daemon. Run `pilot wait --timeout 1` once to its timeout and once stopped with Ctrl-C. Open `<PILOT_DECK_DIR>/memory.jsonl`: it has `start` and `exit` lines for both waits and a `start` for the daemon, each with `rss` and `free` (spec 7, 8, 9). Run `pilot analytics <slug>` on a scratch run: it prints the memory rows (spec 10).
6. Run `pilot usage off`: it exits 2 and points to `pilot logging`. Run `pilot logging off` and start a wait: neither `memory.jsonl` nor `usage.jsonl` grows. Run `pilot logging on` and both resume (spec 11, 12). With a pre-rename `usage-log.json` set off in a fresh store, `pilot logging status` prints `logging off` (spec 13).

## 10. Status

| Slice | State | Branch | PR | Worktree | Blocker | Spec |
|---|---|---|---|---|---|---|
| S1 | integrated | slice/user-thread-listener-s1 | #364 | pilot-user-thread-listener-s1 | – | 1, 3, 5 |
| S2 | integrated | slice/user-thread-listener-s2 | #363 | pilot-user-thread-listener-s2 | – | 2, 6 |
| S3 | integrated | slice/user-thread-listener-s3 | #366 | pilot-user-thread-listener-s3 | S2 | 4 |
| S5 | integrated | slice/user-thread-listener-s5 | #365 | pilot-user-thread-listener-s5 | – | 12, 13 |
| S4 | integrated | slice/user-thread-listener-s4 | #367 | pilot-user-thread-listener-s4 | S1, S5 | 7, 8, 9, 10, 11 |
| feature | in QA | feat/user-thread-listener | #318 | pilot-feat-user-thread-listener | S1, S2, S3, S4, S5 | 1–13 |

Status notes, 2026-10-07:

- ADR numbers renumbered: 0062–0086 were taken by the feat tip, 0087–0089 on origin/pilot and 0090 is reserved by walkthrough-taste. L7, L13 and L16 now read S1 → 0091, S2 → 0092, S3 → 0093, S4 → 0094, S5 → 0095 (0095 supersedes 0043). S4 and S5 were assumed by the co-pilot under the same rule and confirmed free by main.
- The prompt pin in §3 is stale: the base had already lowered it to 10115.5, and S1 lowered it to 10115.
- Seam change on S4, approved by main: `deck/store-dir.mjs` (new) holds `defaultStoreDir` and `storeDir`, which `store.mjs` re-exports, and `deck/usage-switch.mjs` imports from it, so `client.mjs` never loads `store.mjs` (daemon.test.mjs L3 pin).
- S4 landed at 411 changed lines, 11 over the limit, all in two signal tests added on review. Kept by the co-pilot (assumed).
- The sub-deck was deleted on the base (ADR 0088). S1 dropped its `deck/test/subdeck-wait.test.mjs` edit at the merge.
