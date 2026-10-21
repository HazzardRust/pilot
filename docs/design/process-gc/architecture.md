# process-gc: daemons die with their session, tests reap what they spawn, gates are bounded

Ticket itm_f74117ba4db7 · thread itm_280da3b5f8da · cut from `pilot` at 67bb0a1e · ADR 0135, 0135

## 1. Problem

Pilot sessions leave node processes running. On 2026-10-12 the machine had 88 node processes,
13 orphaned `deck/daemon.mjs` started by tests and QA runs, a `pilot wait` belonging to a dead
session, and 7 `node --test` trees running at once. Each tree spawns dozens of short-lived node,
git and sh processes (37 in 20 s when sampled). Free RAM was 3 GB of 16, and Windows real-time
scanning reacted to the churn by taking the CPU. The user wants this fixed systematically, so
that anyone who installs pilot does not meet it.

A second probe on the same day, while this design was being written, found 33 `daemon.mjs`
under worktrees. `pilot-clean-landing-s11` held 7 of them, `pilot-feat-clean-landing` 5, and
`pilot-sync-*` temp dirs more. The only intended daemon was the user's deck (148 MB working set);
each orphan held about 55 MB.

## 2. Spec

| # | Behaviour | Evidence |
|---|---|---|
| 1 | A deck daemon that is not the user's deck on 4321 holds a **leash**. The leash is the pid that started it (or the one `--leash <pid>` names), plus its own `daemon.mjs` file and any `--leash-dir`. Within 10 s of the pid exiting or a path vanishing, the daemon closes and exits. `pilot deck --scratch` leashes to the session (`CLAUDE_PID`) and the directory it was run in. The user's deck is never leashed. | A test starts a daemon leashed to a sleeper, kills the sleeper, and sees the daemon gone within 10 s. The same with the leash dir removed. A scratch deck started under a fake `CLAUDE_PID` dies with it. `leashFrom` returns null for the user's port. |
| 2 | A `pilot wait` whose session (`CLAUDE_PID`) has exited prints `NO SESSION: <pid> has exited` and exits 0 within 10 s, whatever its `--timeout`. | A wait test under a fake `CLAUDE_PID` that is then killed. |
| 3 | `npm test` in this repository goes red, naming the pid, kind and command, when a pilot-owned process started from this checkout is still alive 10 s after the suite ends. On green it prints `left running: none`. | A gate test with a planted detached daemon-named sleeper is red and names it. The full suite prints `left running: none`. |
| 4 | `pilot ps` lists pilot-owned processes (daemons, waits, test trees) with pid, kind, owner, age, worktree, and `orphan` with its reason. `pilot gc` stops the orphans and names each one. It never stops the user's deck or a process whose owner is alive. `pilot land` runs gc after it lands and prints the stopped lines. The install step runs `pilot gc`, and the allow-list carries `pilot ps`, `pilot gc` and `pilot deck --stop *`. | A procs test over an injected process table. A gc test with a planted orphan, a live-owned daemon and the user's deck: only the orphan is stopped. A land test's output names it. An install-allow test names the three rules. |
| 5 | Gates are bounded. At most 2 gates per user hold a **gate slot** at once, whether `npm test` here or `runTests` for any repository. A third prints `gate: waiting for a slot: pid <a> in <dir>, pid <b> in <dir>` once and starts when a slot frees. A dead holder's slot is taken over. Pilot's gate runs `node --test` with `--test-concurrency=<n>`, where n ≤ 4. | A slots test where two holders are taken and the third waits, says so, then gets the slot after a release, and a dead holder's slot is retaken. A gate test pins the flag in the argv. |
| 6 | The gate counts the processes the suite spawns, prints `spawns <n> (node <a>, git <b>, other <c>)`, and goes red above a pinned ceiling. *Assumed (A2)*: sharing scratch repos and daemons per test file is a follow-up ticket, not part of this run. | A gate test with a fixture suite that spawns 3 processes: the count is 3, and the gate is red under a ceiling of 2. The PR carries the full suite's count. |
| 7 | A fresh idle daemon's `/api/health` reports its `rss`, and it stays under 96 MB. Pilot's gate runs its test children with `--max-old-space-size=512` in `NODE_OPTIONS`. | A test reads `rss` from a leashed daemon 5 s after start. A gate test pins the `NODE_OPTIONS`. |
| 8 | On Windows, `pilot doctor` says whether Defender real-time scanning is on, whether the projects root sits on a Dev Drive in performance mode, and whether it is excluded. It says "cannot tell" when the exclusions need an administrator to read them. Its step names a Dev Drive in performance mode first (one-time, admin, the projects root moved onto it) and a folder exclusion of the projects root as the fallback, one admin PowerShell line each. The README says the same. Elsewhere it says there is no scanner check. | A doctor test with fake scanner answers for on/excluded, on/not, unreadable, off and non-Windows. A wording pin on the README paragraph. |
| 9 | The user's deck on 4321 exits on its own once it has been idle for 10 minutes. Idle means all three hold at the check: no `claude` session in the process table, no landing running in the daemon, and no HTTP request (browser or session) in the last 10 minutes. While any one of them is live, it stays. The next session starts it again, as today. | A daemon test with a fake process table, a fake landing flag and a fake last-request clock: the deck exits at 10 min only when all three hold, and stays when any one is live. A real daemon on a free port, started with the idle rule and fakes, closes its server. |

Lines 1-4 sharpen the draft against the code. The draft's "every test stops what it starts" is
delivered by two things: the leash, which reaps even after a test file is killed mid-run, and the
census, which proves it. Before the census exists there are no per-test teardown edits for it to
check.

## 3. Findings

- **Daemon spawns.** `ensureDaemon` spawns `daemon.mjs` detached and `unref`'d, with the
  session's whole env (`deck/client.mjs:152-168`). `startScratch` does the same, adding
  `PILOT_DECK_DIR`, `PILOT_DECK_PORT` and `PILOT_DECK_NO_OPEN` (`deck/scratch.mjs:89-99`). The
  daemon has no idle exit, no parent watch and no pid file. It exits only on SIGINT/SIGTERM
  (`deck/daemon.mjs:115-124`). It is detached by design, so that the user's deck outlives the
  session that started it (ADR 0005).
- **Who leaks.** Tests start daemons directly or through a client child: `deck/test/daemon.test.mjs`
  :874-1076, `telemetry.test.mjs:139`, `startup.test.mjs:276` ("would outlive the whole run",
  :69), `hooks/test/{inbox,owner-hooks,held-handoff}.test.js`, and `scratch*.test.mjs`. Teardown
  is per test (`t.after`). A file killed on its timeout, or by an inline kill that an assertion
  skips (`daemon.test.mjs:234-514`), leaves its detached daemon. Every leaked daemon in the probe
  runs `<worktree>/deck/daemon.mjs`, so its path names the checkout that started it.
- **Session identity.** Claude Code gives every child `CLAUDE_PID`, the `claude.exe` pid (43624
  in this session, checked with `tasklist`). Nothing in the deck reads it. `pilot run` adds
  `PILOT_RUN_PID` (`deck/run.mjs:554`). The run registry's pid is the MCP client's
  (`deck/client.mjs:192`), and its liveness is `process.kill(pid, 0)` (`deck/runs.mjs:10-15`).
- **Wait.** `deck/wait.mjs` long-polls `deck_wait` (120 s parks) until a reply arrives, the
  110-minute timeout passes, or the deck fails. Nothing watches a pid (`:218-250`).
- **Gates.** `npm test` = `node --test --test-timeout=60000` with no concurrency flag
  (`package.json:19`). `runTests` (`scripts/integrate.mjs:94-111`) uses `spawnSync` with a shell,
  writes to a log, and has no lock. Its callers are `integrate` (`:217`), `sync` (`scripts/sync.mjs:94`)
  and `land`. No lock exists anywhere (grep `lock`).
- **Landing output.** `land`'s stdout carries `cleared` lines before `landed` (`scripts/land.mjs:322`),
  and that is where gc's lines go.
- **Install.** The allow rules are written at `scripts/install-settings.mjs:560`, tested by
  `scripts/test/install-allow-merge.test.mjs`. `docs/INSTALL.md` is the install prompt (ADR 0002).
  Step 4 already tells agents to use `pilot deck --scratch` then `--stop` (`:95`).
- **No process listing** exists anywhere (no `tasklist`, `ps`, CIM). No `pilot doctor` exists.
  Subcommands are an `if` chain in `bin/pilot.mjs:142-278`.
- **Memory.** `deck/memory.mjs` logs `rss` when logging is on. `/api/health` returns
  `{ ok, pid, url, seq }` (`deck/server-routes.mjs:564`).
- Node on this machine is v26.1.0. `engines` is `>=22.8.0`, the oldest Node with every flag used
  here: `--test-concurrency` arrived in 20.10 and `--test-isolation`, which S9's tests use, in 22.8.

### Seams

| Seam | Interface | Folded behind it | Category |
|---|---|---|---|
| Leash | `leashFrom(argv, env, { ppid, daemonFile })`, `holdLeash(leash, onGone, opts)`, `sessionPid(env)` in `deck/leash.mjs` (new) | the parent-pid and path watch the daemon, a scratch deck and `pilot wait` would each write | local-substitutable |
| Process table | `processTable({ platform, run })` → `Proc[]`, `pilotProcesses(table, { userDeckPid, exists })` → `Owned[]` in `deck/procs.mjs` (new) | the CIM and `ps` readers, the kind and orphan rules, used by `ps`, `gc` and the census | true external (OS) |
| GC | `gc(owned, { kill })` → `string[]` in `deck/gc.mjs` (new) | the tree kill per platform and the stop lines `pilot gc` and `land` print | true external (OS) |
| Gate slot | `takeSlot({ dir, slots, cwd, env, alive, sleep, say })` → `{ release, waited }` in `scripts/gate-slots.mjs` (new) | the lock files, stale takeover, the waiting line and re-entry | local-substitutable |
| Pilot's gate | `runGate(args, { cwd, spawn, table, slot })` → exit code, `gateArgv(args, cores)`, `gateEnv(env, spawnsFile)` in `scripts/gate.mjs` (new) | caps, slot, census and spawn count around `node --test` | true external (OS processes) |
| Scanner check | `checkScanner({ platform, run, root })` → `{ state, lines }` in `deck/doctor.mjs` (new) | the PowerShell probe and its "N/A: administrator" case | true external (OS) |

Deletion test. `scratch.mjs`'s `end()` and the tests' `killDeckAt` stay: they are explicit stops,
and the leash is the backstop for when they never run. A leash written inline three times (daemon,
scratch, wait) would fail the test, so it is one module. `runTests` keeps its log logic, and the
slot wraps it. No fold changes existing code beyond its own slice, so none goes to `main`.

## 4. Ubiquitous language

- **User's deck**: the daemon serving `DECK_PORT` (4321), found by its `/api/health` pid. It is never leashed and never stopped by gc; it ends itself only by the idle rule (L2).
- **Leash**: `{ pid, paths }`. While the pid lives and every path exists, the holder lives. It is written on the command line as `--leash <pid> [--leash-dir <path>]`.
- **Session**: the Claude Code process, `CLAUDE_PID`.
- **Pilot-owned process**: a node process whose command line runs `deck/daemon.mjs`, `pilot`/`launcher.mjs wait`, or a `node --test` root.
- **Orphan**: a pilot-owned process whose leash, owner or parent is gone (rules in L5).
- **Gate slot**: one of 2 lock files a gate holds while its suite runs.
- **Census**: the gate's before/after comparison of pilot-owned processes under its checkout.

## 5. Locked decisions

Grilling depth: **forks** (the user, itm_766f8b4cd5dd, 2026-10-12): only forks reached the user; A3 and A8 stand assumed as recommended.

- **L1 The leash lives in the process it holds.** Every 2 s the daemon or wait checks `process.kill(pid, 0)` and `fs.existsSync` on each path. On a miss it closes and exits, so it needs no supervisor process to be running. Rejected: gc alone (it needs something to run it, and leaves a 10 s bound impossible); Windows Job Objects (no Node API, and Windows only).
- **L2 The user's deck exits when idle; every other daemon holds a leash** (the user, itm_3eaa4a08b811, 2026-10-12; ADR 0136 supersedes ADR 0005's "long-lived" clause). `leashFrom` returns null for `DECK_PORT` with no `--leash`. Such a deck instead runs the idle rule: every minute it checks whether the last HTTP request was more than 10 minutes ago and no landing is running. Only when both hold does it read the process table once (S3's `processTable`), and it exits when no `claude` process is in it. This way an active deck never spawns a reader. Every other daemon defaults its leash to `process.ppid`. The user's reason: "it starts up like instantly".
  overridden: a shared process has no single parent; an idle rule with the three conditions keeps landings and tab reads safe. (The recommended default was never to stop the user's deck.) Rejected: leashing the user's deck to one session, which would kill it under the other sessions.
- **L3 The session is `CLAUDE_PID`**, read from the env Claude Code gives every child. Rejected: walking the process tree at start, which costs one PowerShell per wait and depends on process names.
- **L4 The leash is on the command line**, so `pilot ps` can read it from the process table. Rejected: env, which no API reads from another process on Windows.
- **L5 Orphan rules.** A daemon (not the user's deck) is an orphan when its leash pid (`--leash`, else its parent) is not in the table, or its `daemon.mjs` or `--leash-dir` is gone. A wait is an orphan when no ancestor in the table is a `claude` process. A test tree is an orphan when the parent of its `node --test` root is not in the table. Rejected: age thresholds, which kill long healthy runs.
- **L6 One process-table reader, two adapters.** Windows reads one `powershell -NoProfile` CIM query (pid, ppid, name, command line, creation date). POSIX reads `ps -eo pid=,ppid=,etimes=,comm=,args=`. Both are injected in tests.
- **L7 `npm test` becomes `node scripts/gate.mjs`** (and `test:quiet` and `coverage` pass their flags through), so an implementer's direct run and `runTests` are both bounded. Rejected: bounding only `runTests`, because implementers' own runs were most of the 7 trees.
- **L8 A gate slot is re-entrant.** The holder sets `PILOT_GATE_SLOT` on its child, and a gate that sees it takes no second slot, so `runTests` → `npm test` → `gate.mjs` holds one slot. The lock dir is `os.tmpdir()/pilot-gate-slots`, and each slot file is written `wx` as `{ pid, dir, since }`.
- **L9 The census is scoped to the gate's checkout.** It counts pilot-owned processes whose command names a path under `cwd`, present after and absent before, still alive after a 10 s grace. Concurrent gates in other worktrees never trip it.
- **L10 The spawn count is a preload.** `NODE_OPTIONS=--import=<abs>/scripts/count-spawns.mjs` subscribes to the `child_process` diagnostics channel and appends one line per spawn to `PILOT_GATE_SPAWNS`. It reaches every node descendant. Rejected: patching `child_process`, and process-table sampling (it misses short-lived processes).
- **L11 gc stops, it never asks.** A daemon or wait gets `process.kill(pid)`. A test tree gets `taskkill /PID <pid> /T /F` on Windows, and on POSIX its descendants from the table, deepest first. A stop that fails is a line, never a red landing.
- **L12 Doctor advises a Dev Drive first, a folder exclusion as the fallback** (locked by the user on itm_0fd6fbc7a8ba, 2026-10-12). The step names a Dev Drive in performance mode (real-time protection stays on, scans run after the open instead of blocking it) and, where none can be made, one folder exclusion of the projects root (the repository's parent directory) as an admin line. Pilot never changes Defender itself; doctor says "cannot tell" when the exclusion list is unreadable, since `HideExclusionsFromLocalAdmins` can hide it. Research: Microsoft Learn on Defender exclusions, common exclusion mistakes, Dev Drive and performance mode, 5 sources, favours Dev Drive performance mode; the architect's assumed folder-exclusion default was overturned by it. Rejected: a folder exclusion alone (Microsoft's comparison calls it the weaker option: the files are never scanned), excluding `node.exe` (wider exposure), and doing any of it automatically.
- **L13 QA environment** (the user, itm_9c93a700e835, 2026-10-12; was A1). QA runs on this Windows machine against a scratch deck and a scratch repository with two bare remotes, plus a planted orphan daemon and two gates started together. There is no database and there are no credentials. Rejected: running against the user's deck or a real remote.
- **L14 gc runs at landing and at install, not at SessionStart** (the user, itm_a62057cff233, 2026-10-12; was A6, taken as recommended). Tradeoff: an orphan left by a crash lives until the next landing or a `pilot gc` by hand; leashes make that rare. Rejected: every SessionStart, which costs one PowerShell (~1 s) per session.
- **L15 Two gate slots per user, machine-wide, shared across repositories** (the user, itm_6343df842849, 2026-10-12; was A4, taken as recommended). An unbounded queue with one line naming the holders; a dead holder's slot is taken over. Tradeoff: a hung holder blocks a third gate until its test timeouts fire. Rejected: one slot (it serialises every gate behind every landing), and a count from the cores.
- **L16 A leftover process or a spawn count over the ceiling makes the gate red, not a warning** (the user, itm_4ae4ed969233, 2026-10-12; was A7, taken as recommended). After the suite, a pilot-owned process from this checkout still alive 10 s later, or a spawn count above the pinned ceiling, is reported by pid, kind and command and the gate fails. A PR that legitimately adds spawns raises the pin with a dated comment. The gate retries itself, never the user (the user, same thread): the census polls every 1 s through the 10 s grace instead of sampling once; what is still alive at the grace the gate stops with L11's kill and re-checks over a second 10 s grace, and only a process that survives that is red, so a slow kill on Windows is not a red and no leftover is left running. The spawn count is deterministic and has no retry. Rejected: warn only, under which leaks drift back in; a red that asks the user to rerun the gate.
- **L17 Spec 6's per-file fixture sharing is deferred to a follow-up ticket** (the user, itm_3b10084c6dbb, 2026-10-12; was A2, taken as recommended). This run lands the spawn counter and the ceiling (measured +10%). Converting the ~29 `git init` files and the daemon tests to share fixtures per file is proposed as a ticket at this run's closing report, sized by the counter's per-file numbers. Tradeoff: churn falls in this run only through the concurrency cap and slots, not through fewer spawns. Rejected: refactoring now, which runs well past 300 lines per slice and loosens test isolation.

## 6. Assumed decisions

- **A3 The caps apply only to pilot's own gate.** `runTests` for another repository takes the slot only, never `NODE_OPTIONS` or the concurrency flag. Tradeoff: another repo's suite stays as wide as it is. Rejected: injecting a heap cap into a user's suite, which could fail it with an out-of-memory error.
- **A8 The allow-list gains `pilot ps`, `pilot gc` and `pilot deck --stop *` here.** The last is half of itm_c310da07c9c6 line 6 (`--scratch` stays there). Rejected: leaving `--stop` to that ticket, which keeps QA's reaping behind a prompt until it lands.
- A9 macOS ps (no etimes) is out of scope; the POSIX reader answers one line and no orphan when ps fails; L6 unchanged.

## 7. Out of scope

- Sharing test fixtures per file (A2: a follow-up ticket).
- Bounding other repositories' own suites beyond the slot (A3).
- Leashing the user's deck (L2 gives it the idle rule instead). Its 148 MB is a separate question.
- Changing Defender settings from code, and creating a Dev Drive (L12).
- Hook processes (`stop-gate.js` and others): they are short-lived and owned by Claude Code.

## 8. Slices

Width 6; longest stem 4

| Slice | Delivers | Files owned | After | Reviewers | File |
|---|---|---|---|---|---|
| S1 A test daemon and a scratch deck die with whoever started them | 1 | `deck/leash.mjs` (new), `deck/daemon.mjs`, `deck/scratch.mjs`, `deck/test/leash.test.mjs` (new) | – | `pilot:typescript-reviewer`, `pilot:security-reviewer` | [S1](slices/S1.md) |
| S2 A wait whose session is gone exits | 2 | `deck/wait.mjs`, `deck/test/wait-session.test.mjs` (new) | S1 (`holdLeash`, `sessionPid`) | `pilot:typescript-reviewer` | [S2](slices/S2.md) |
| S3 `pilot ps` lists pilot-owned processes and names orphans | 4 | `deck/procs.mjs` (new), `bin/pilot.mjs` (`ps`), `deck/test/procs.test.mjs` (new) | S1 (`--leash` argv) | `pilot:typescript-reviewer`, `pilot:security-reviewer` | [S3](slices/S3.md) |
| S4 `pilot gc` stops orphans, and a landing runs it | 4 | `deck/gc.mjs` (new), `bin/pilot.mjs` (`gc`), `scripts/land.mjs` (gc lines), `deck/test/gc.test.mjs` (new), `scripts/test/land-gc.test.mjs` (new) | S3 (`bin/pilot.mjs`, `pilotProcesses`) | `pilot:typescript-reviewer`, `pilot:security-reviewer` | [S4](slices/S4.md) |
| S5 The install allows and runs gc | 4 | `scripts/install-settings.mjs`, `scripts/test/install-allow-gc.test.mjs` (new), `docs/INSTALL.md` | S4 (`pilot gc`) | `pilot:typescript-reviewer`, `pilot:security-reviewer` | [S5](slices/S5.md) |
| S6 A third gate waits for a slot | 5 | `scripts/gate-slots.mjs` (new), `scripts/integrate.mjs` (`runTests`), `scripts/test/gate-slots.test.mjs` (new) | – | `pilot:typescript-reviewer` | [S6](slices/S6.md) |
| S7 Pilot's own gate runs capped and slotted | 5, 7 | `scripts/gate.mjs` (new), `package.json`, `scripts/test/gate.test.mjs` (new) | S6 (`takeSlot`) | `pilot:typescript-reviewer`, `pilot:security-reviewer` | [S7](slices/S7.md) |
| S8 The gate goes red on a process left running | 3 | `scripts/gate.mjs` (census), `scripts/test/gate-census.test.mjs` (new), `scripts/test/fixtures/leak/` (new) | S7 (`scripts/gate.mjs`), S3 (`pilotProcesses`) | `pilot:typescript-reviewer` | [S8](slices/S8.md) |
| S9 The gate counts spawns against a ceiling | 6 | `scripts/count-spawns.mjs` (new), `scripts/gate.mjs` (count), `scripts/test/gate-spawns.test.mjs` (new) | S8 (`scripts/gate.mjs`) | `pilot:typescript-reviewer` | [S9](slices/S9.md) |
| S10 An idle daemon reports its RSS under 96 MB | 7 | `deck/server-routes.mjs` (`/api/health`), `deck/test/daemon-rss.test.mjs` (new) | – | `pilot:typescript-reviewer` | [S10](slices/S10.md) |
| S11 `pilot doctor` names the scanner exclusion | 8 | `deck/doctor.mjs` (new), `bin/pilot.mjs` (`doctor`), `deck/test/doctor.test.mjs` (new), `README.md` | S4 (`bin/pilot.mjs`) | `pilot:typescript-reviewer`, `pilot:security-reviewer` | [S11](slices/S11.md) |
| S12 The user's deck exits after 10 idle minutes | 9 | `deck/idle.mjs` (new), `deck/daemon.mjs` (idle clock), `deck/landing.mjs` (`landingsRunning`), `deck/test/idle.test.mjs` (new) | S1 (`deck/daemon.mjs`), S3 (`processTable`) | `pilot:typescript-reviewer` | [S12](slices/S12.md) |

`bin/pilot.mjs` is edited by S3, then S4, then S11; `scripts/gate.mjs` by S7, then S8, then S9; `deck/daemon.mjs` by S1, then S12. S12 owns the landing flag itself (`deck/landing.mjs`, no other slice touches it). Width 6 is the antichain {S2, S5, S9, S10, S11, S12}.
The walking skeleton is S1: one real daemon started under a real sleeper parent exits when that
parent dies. That proves the leash, the argv shape and the 10 s bound that S2, S3 and S8 stand on.
Three roots run at once (S1, S6, S10), and then four (S2, S3, S7, S10). S10 adds `rss` to
`/api/health`, which S1 does not touch. S8's leak fixture is a sleeper whose command line names
`deck/daemon.mjs` under a scratch checkout, not a real daemon, so it cannot leash itself away.

## 9. Acceptance evidence

1. In a scratch repo on this machine, `pilot ps` before QA's work lists the user's deck and no
   orphans. After `pilot deck --scratch`, the scratch deck is listed with owner = the session.
2. Killing a sleeper that holds a test daemon's leash: `pilot ps` shows the daemon gone within 10 s
   (spec 1). A `pilot wait` under a killed fake session prints `NO SESSION` (spec 2).
3. A planted pre-feature daemon (unleashed, with a dead parent): `pilot ps` marks it `orphan`,
   `pilot gc` prints `stopped <pid> daemon <worktree>`, and a scratch `pilot land` prints the
   same line (spec 4).
4. `npm test` here prints `left running: none` and `spawns <n> (…)`. On the leak fixture the
   gate stops the leak, prints its `stopped` line and stays green; only a leftover that survives
   the gate's kill makes it red (spec 3, 6; L16).
5. Three `npm test` runs started together: the third prints `gate: waiting for a slot …` and
   then runs (spec 5). `/api/health` on a fresh daemon shows `rss` under 96 MB (spec 7).
6. A scratch deck started as the user's deck kind (idle rule on, fakes injected) closes after the fake 10 minutes with no session, landing or request, and stays while any is live (spec 9).
7. `pilot doctor` on this machine prints the Defender state and the exclusion line (spec 8).

## 10. Status

| Slice | State | Branch | PR | Worktree | After | Delivers |
|---|---|---|---|---|---|---|
| S1 | planned | | | | – | 1 |
| S2 | planned | | | | S1 | 2 |
| S3 | planned | | | | S1 | 4 |
| S4 | planned | | | | S3 | 4 |
| S5 | planned | | | | S4 | 4 |
| S6 | planned | | | | – | 5 |
| S7 | planned | | | | S6 | 5, 7 |
| S8 | planned | | | | S7, S3 | 3 |
| S9 | planned | | | | S8 | 6 |
| S10 | planned | | | | – | 7 |
| S11 | planned | | | | S4 | 8 |
| S12 | planned | | | | S1, S3 | 9 |
| process-gc | planned | feat/process-gc | | | S1-S12 | 1-9 |
