# mac-linux: CI on three OSes, one platform seam, a hardened mac host

Ticket `itm_1d6f74c3861a` (thread `itm_b20eccceebe1`). Merge thread `itm_168e5b83ed36`: merged none (no answer; `itm_f1e75f31d28b`, the deck token, rebases on S3 and S7).
The spec was agreed on `itm_c786ba01fef0` (line 1 changed, lines 2–9 as proposed); grilling depth: forks (`itm_4163d88e0130`, L9).

## 1. Problem

Pilot has only been proven on Windows. The user asked three things. What security problems come with running on a Mac? Can the system be reliable without testing on a Mac, and is there an easy way around that? What should be redesigned for the differences between macOS, Linux and Windows? There is no Mac on this host. Every POSIX line below is therefore verified either by a GitHub-hosted runner (ubuntu-latest, macos-latest) or by a fake-platform test. §9 says which, and lists what stays unproven.

## 2. Spec

| # | Behaviour | Evidence | How it is verified without a Mac |
|---|---|---|---|
| 1 | `.github/workflows/gate.yml` (main-never-red's, extended rather than duplicated) runs the full gate on `ubuntu-latest`, `macos-latest` and `windows-latest` (`fail-fast: false`): ubuntu on every non-draft PR to main and push to main; macos and windows on every such PR when the repository is public (`github.event.repository.private == false`), and while private only on a PR labelled `all-os`, a weekly `schedule` and `workflow_dispatch` (L10). | The workflow pin test pins the condition, and `gh pr checks` on the feature PR, labelled `all-os`, shows 3 `gate` jobs green. | The runners themselves |
| 2 | Every `process.platform` read in non-test source goes through one module, `hooks/lib/platform.js` (L1): `hostPlatform`, `isWindows`, `pathKey`, `killTree`, `claudeBin`. Each other module takes a `platform` argument defaulting to `hostPlatform()`. | A test greps non-test sources and finds `process.platform` in `hooks/lib/platform.js` only. One table-driven test per export covers win32, darwin and linux. | Fake platform, on all 3 jobs |
| 3 | `killTree` ends a whole process tree: on POSIX the process group (when it was spawned to lead one) or the descendants from the process table; on win32 `taskkill /T /F`. A pid already gone is not an error. Landing and `gc` both go through it. | A test spawns a detached `sh` that starts two `sleep`s, calls `killTree`, and finds all three pids gone. It is skipped on win32, where a fake-`exec` test pins the `taskkill` argv. | ubuntu and macos jobs |
| 4 | On darwin, install writes the profile a login shell reads. For bash that is the first of `~/.bash_profile`, `~/.bash_login` and `~/.profile` that exists, or a new `~/.bash_profile` when none does (L5). zsh keeps `~/.zshrc`, fish keeps `conf.d/pilot.fish`, and linux is unchanged. | Fake-platform `profileFor`/`persistPath` tests on darwin for bash (each of the 4 cases) and zsh, and docs/INSTALL.md's table row naming the darwin files. | Fake platform |
| 5 | On POSIX the store dir (`storeDir()`, `~/.claude/pilot` or `PILOT_DECK_DIR`) and `~/.claude/pilot-inbox` are 0700, including an existing dir found at 0755. Every file written through `atomicWriteFileSync` (deck.json, the hook state) is 0600 (L6). | A mode test after `writeDeck` and after a hook state write reads `0o700` and `0o600`, skipped on win32. | ubuntu and macos jobs |
| 6 | `pathKey` resolves a path with `fs.realpathSync.native` when the path exists, and folds case on win32 only. Every repo key, in the deck (`repoKey`) and in the hooks (`repoKey`, `samePath`), is a `pathKey`, so `/tmp/x` and `/private/tmp/x` (or a symlinked `$TMPDIR`) are one repository (L3). | A test makes a dir and a symlink to it. A `registerRun` through the link and an `addDeck` of the real path land on 1 tab, and `samePath(link, real)` is true. Skipped where a symlink needs privilege (win32 EPERM). | ubuntu and macos jobs |
| 7 | On darwin the install prints a TCC note: macOS asks before a terminal reads `~/Desktop`, `~/Documents`, `~/Downloads` or iCloud Drive, so keep repositories elsewhere or grant the terminal Full Disk Access. README's Install section and docs/INSTALL.md say the same, with no new code fence, and README's `only tested on windows 11` line names the CI OSes. The line is the user's words plus ` · CI: windows, macos, ubuntu` (user's decision, itm_d4795a080ae2). | Wording pins on `describe()`'s darwin notes, on README's Install section and on INSTALL.md. | Fake platform; the TCC behaviour itself stays unproven |
| 8 | *Found.* `npm test` is green on ubuntu and macOS. `processTable` reads macOS `ps` (BSD `ps` has no `etimes`, so it reads `etime` and parses `[[dd-]hh:]mm:ss`), which keeps the gate's census from failing every macOS run. Four test files stop pushing Windows path literals through native `path.*`. | A `processTable` test on darwin-shaped `ps` output, and spec 1's ubuntu and macos jobs green. | The runners; darwin ps output by fixture |
| 9 | *Found, security.* On POSIX `claudeBin` resolves `claude` to an absolute file from absolute `PATH` entries only, and never from `.` or a relative entry resolved against the repository. Windows already does this (`searchPathOnly`). When there is no hit, `run` exits 127 with the existing "no absolute PATH entry has it" line. | A test with `PATH=.:<tmp>/bin` and a `claude` planted in the cwd resolves the `<tmp>/bin` one, or null when that one is missing. | Fake env, on all 3 jobs |

Implied: the deck's Start and Resume buttons stay Windows-only (`deck/session.mjs:117`) unless A2 says otherwise, and on a Mac `pilot run` is started from a terminal.
Cannot mean: `deck/platform.mjs`, because the hooks are CommonJS and call `repoKey` synchronously, so they cannot import an `.mjs`, while the deck already imports `hooks/lib/*.js` (L1). It also cannot mean every store file is 0600 by itself: a 0700 dir closes the appended logs (L6). Spec 1 cannot mean every PR runs all 3 OSes while the repository is private, the cost main-never-red L8 refused; once it is public (ticket `itm_c570093cafb5`) they do, with no second edit (L10).

## 3. Findings

- **F1. CI.** `gate.yml` (feat/main-never-red, ADR 0156) has one `ubuntu-latest` job, runs on non-draft PRs to main and on pushes to main, and uses Node 26 with `fetch-depth: 0`. The user chose ubuntu only, on cost, in main-never-red L8 (`itm_c0eba1fff954`). The repo is private. GitHub prices Linux at $0.006/min, Windows at $0.010 and macOS at $0.062 (about 10x), out of 2,000 free minutes a month. No gate run has executed yet; every one was skipped as a draft.
- **F2. Platform reads.** There are 20 `process.platform` reads in non-test source. These already take an injected `platform`: `deck/procs.mjs:56`, `deck/gc.mjs:20`, `deck/doctor.mjs:79`, `deck/session.mjs:108`, `deck/open.mjs:42` (`openerFor`), `scripts/gate.mjs:96`, `scripts/pilot-branch.mjs:35,59` and `scripts/install-path.mjs:36`. These read it inline: `deck/items.mjs:747`, `hooks/lib/deck.js:228`, `deck/landing.mjs:188,203`, `deck/run.mjs:101`, `deck/open.mjs:72`, `deck/ui/render-strip.mjs:388`, `scripts/install-command.mjs:37,230` and `scripts/install-settings.mjs:735`. Three tests redefine `process.platform` at run time (`onPlatform` in start-session, confirm and inplace), so the seam must read it live (L2).
- **F3. Path keys.** `repoKey` is duplicated: `deck/items.mjs:745` and `hooks/lib/deck.js:226`, pinned equal by `hooks/test/join.test.js`. It is `path.resolve` plus a win32 lowercase, with no realpath. Over 40 callers use it, and it keys persisted state (decks, coPilots, switches, budgets, records). Only `addDeck` (`deck/store-core.mjs:700`) realpaths, so on macOS a run registered from `process.cwd()` and a deck added for the same dir split (`deck/test/add-deck.test.mjs:149,196` fail there). `git rev-parse` output, read by `deck/telemetry.mjs:34` and `deck/wait.mjs:136`, is already realpathed by git.
- **F4. Kill.** `deck/landing.mjs:187` sends `process.kill(-pid)` to a group that `landingSpawnOptions` made detached; it throws ESRCH when the group is gone (logged), and has no test. `deck/gc.mjs:20` `stopper` walks `descendants(table)` with SIGKILL and runs `taskkill` synchronously on win32; `scripts/gate.mjs:128` reuses it. They are two kills that disagree.
- **F5. `ps`.** `deck/procs.mjs:22` uses `-eo pid=,ppid=,etimes=,comm=,args=`. macOS `ps` rejects `etimes`, and `procs.test.mjs:245` already fixtures that error. The gate's census (`scripts/gate.mjs`) then prints `cannot tell` and exits 1, so every macOS gate is red regardless of the tests.
- **F6. `claude` lookup.** `scripts/pilot-branch.mjs:60` `onSearchPath` returns the bare name off win32, so `deck/run.mjs:659`'s "never the bare name" guarantee holds on Windows only, and a relative PATH entry finds a `claude` planted in the repository.
- **F7. Install.** `scripts/install-path.mjs:74` `PROFILES` is `{ zsh: .zshrc, bash: .bashrc, fish }` and `profileFor(shell, home)` is platform-blind. bash's manual: a login shell reads only the first of `.bash_profile`, `.bash_login`, `.profile`. macOS terminals open login shells, so `.bashrc` is never read. zsh's manual: an interactive login shell reads `.zshrc`. Pins: `scripts/test/install.test.mjs:976` (README Install keeps exactly two fences), `:1007` and `:1015` (INSTALL.md step 4 and the changes table). There is no TCC text anywhere.
- **F8. Store modes.** There is no `chmod` or `mode` on any store write. `atomicWriteFileSync` (`hooks/lib/atomic-write.js:24`) is the only shared writer (deck.json, audit records, hook state). Ten other writers append or write raw. `hooks/lib/wrapper-log.js:21` and `pilot-inbox` (`hooks/lib/deck.js:410`) ignore `PILOT_DECK_DIR`.
- **F9. Suite on POSIX.** Static read: `deck/test/daemon.test.mjs:263,629`, `deck/test/record.test.mjs:332`, `deck/test/add-deck.test.mjs` (UNC refusal) and `scripts/test/audit-session-start.test.mjs:55` push `C:\`/`D:\` literals through native `path.basename`, `isAbsolute` and `resolve`, and fail on both POSIX OSes. Everything else is injected or already skipped. `SPAWN_CEILING` (9855) was measured on Windows. S1's first run measures POSIX.
- **F10. Runs ahead.** gate2-frees-lane (#748) changes nothing under `deck/`. store-durability (designed, not built) owns `hooks/lib/atomic-write.js`, `deck/store-core.mjs` and `deck/daemon.mjs`, and S7 here rebases on it. main-never-red owns `gate.yml` and `scripts/gate.mjs`, and S1 and S9 rebase on it.

### Seams

| Seam | Interface | Folded behind it | Category |
|---|---|---|---|
| `hooks/lib/platform.js` (new, CJS) | `hostPlatform()`, `isWindows(p?)`, `pathKey(p, {platform?})`, `killTree(pid, opts)`, `claudeBin(env?, platform?)` | both `repoKey` bodies, `install-settings` `fold`, landing's `killTree`, `gc` `stopper`'s body, `run.mjs` `CLAUDE`, and the POSIX branch of `onSearchPath` | Local-substitutable (fs, child processes, injected `platform`, `exec`, `signal`) |
| `deck/procs.mjs` | `processTable({platform, run})` | the per-platform `ps` argv and the `etime` parse | Local-substitutable (injected `run`) |
| `scripts/install-path.mjs` | `profileFor(shell, home, platform?)`, `persistPath(dir, options)` | the darwin login-profile choice | Local-substitutable (temp home) |
| `hooks/lib/atomic-write.js` | `atomicWriteFileSync(path, contents, options?)`, `privateDir(dir)` | 0600 on the tmp write, and a 0700 mkdir plus chmod | Local-substitutable (fs) |
| `.github/workflows/gate.yml` | the triggers, `strategy.matrix.os`, job `gate` | – | True external (GitHub Actions), pinned by text |

Deletion test: `pathKey` and `killTree` earn their place, since without them the rule reappears in 4 and 3 callers. `openerFor` stays in `deck/open.mjs`. It has one caller and is already table-tested on four platforms, so moving it would add nothing (L1). `isWindows` is shallow, but it is the grep test's one sanctioned read site, and it saves 12 callers spelling `=== 'win32'`.

## 4. Ubiquitous language

- **Platform seam**: `hooks/lib/platform.js`, the only non-test reader of `process.platform`.
- **Path key**: the comparable spelling of a directory: realpath when it exists, then lowercase on win32. Two paths are one place exactly when their path keys are equal.
- **Tree kill**: ending a process and every descendant, by group on POSIX when the process leads one.
- **Login profile**: the one startup file a login shell reads on darwin.
- **Private store**: the store dir and pilot-inbox at 0700, with atomically written files at 0600.

## 5. Locked decisions

- **L1. The seam is `hooks/lib/platform.js`, CommonJS.** Rationale: `hooks/lib/deck.js` is synchronous CJS and needs `pathKey`. ESM can import CJS (precedent: `deck/audit.mjs:12` imports `hooks/lib/atomic-write.js`), but not the reverse. Rejected: `deck/platform.mjs` plus a CJS copy, which is the duplicate F3 already pins with a test. `openerFor` stays where it is (deletion test).
- **L2. `hostPlatform()` reads `process.platform` on each call; there is no constant.** The `onPlatform` tests redefine it at run time (F2). Every default parameter becomes `platform = hostPlatform()`. Rejected: a module constant, which would freeze at import and break those tests.
- **L3. `pathKey` realpaths when the path exists and falls back to `path.resolve` when it does not.** Tradeoff: a syscall per key; keys are computed per request, so this is measured in microseconds. On Windows `lower(realpath)` equals `lower(resolve)` except through a junction or `subst` drive, so the keys already stored in deck.json carry over. A key read from deck.json for a deleted dir still compares by `resolve`. Rejected: realpath only at registration, which leaves the hooks' cwd spellings split. Rejected: folding case on darwin, because APFS can be case-sensitive and realpath does not canonicalise case there; this stays unproven (§9).
- **L4. `killTree(pid, { platform, group, table, exec, signal })` is synchronous.** On win32 it runs `taskkill /PID <pid> /T /F` through `exec`. On POSIX with `group` it sends `kill(-pid, SIGKILL)`; otherwise it walks `table`'s descendants deepest first, then the root. ESRCH is swallowed and every other error throws. Landing passes `group: true` (it spawned detached). `gc` passes its `table`. Rejected: an async `taskkill` (today's landing), which leaves two contracts. Rejected: a group kill in gc, which does not own the group.
- **L5. darwin bash writes the first existing login file, or creates `.bash_profile`.** Creating `.bash_profile` beside an existing `.profile` would silently stop bash reading `.profile` (bash manual, F7). zsh stays `.zshrc`, which an interactive login shell reads. Rejected: `.zprofile`, which adds a second darwin rule for no gain.
- **L6. Privacy is the directory's: 0700 dirs, with 0600 only through `atomicWriteFileSync`.** A 0700 dir makes every file under it unreadable to other users whatever the file's mode, so the 10 raw writers need no change. `privateDir(dir)` does `mkdirSync({recursive, mode: 0o700})` and then `chmodSync(0o700)`, because mkdir does not change an existing dir. The deck calls it in `writeDeck` and at daemon start; the hooks call it where `pilot-inbox` is made. It is a no-op on win32 (ACLs; out of scope).
- **L7. CI runs on the PR's own workflow file.** `pull_request` reads `gate.yml` from the PR's merge ref, so a trigger change is exercised on the PR that makes it. `workflow_dispatch` would only work once the file is on main. The `permissions: contents: read` and no-secret rules of ADR 0156 L4 hold for every job.
- **L8. Windows path literals in tests become host paths (`path.join(os.tmpdir(), …)` or `path.win32` where the code under test is win32-only).** Production code is unchanged for them, because a POSIX repo never has a `D:\` path.
- **L9. Grilling depth: forks** (`itm_4163d88e0130`). Only decisions whose paths give materially different deliverables reach the user; the other assumed decisions stand as the architect took them.
- **L10. The macOS and Windows jobs run on every PR once the repository is public, and on the `all-os` label, a weekly schedule and dispatch while it is private** (`itm_c786ba01fef0`, overriding A1). One `if` on the job: `matrix.os == 'ubuntu-latest' || github.event.repository.private == false || contains(github.event.pull_request.labels.*.name, 'all-os') || github.event_name == 'schedule' || github.event_name == 'workflow_dispatch'`. The user has queued a move to a fresh public repository (`itm_c570093cafb5`), where standard runners are free with no minute cap (20 concurrent jobs, 5 of them macOS, on the free plan); until then A1's cost argument holds for the private repo. Rejected: label/weekly for good (A1), which needs a second workflow edit at the move. Rejected: 3 OSes on every PR now, about 155 billed minutes a run against 2,000 a month.
- **L11. QA runs against GitHub-hosted runners plus the local Windows gate** (`itm_5aeefb28183a`). QA labels the feature PR `all-os` and reads the ubuntu, macos and windows job logs (census line, pass count, the POSIX-only tests shown as passed), and runs the Windows gate and the fake-platform tests locally. No Mac is available; the §9 unproven rows stay unproven. Rejected: a user-provided Mac (none), WSL (proves nothing the ubuntu job does not).

## 6. Assumed decisions

Grilling depth: forks (L9). A1 is overturned by the user and replaced by L10; A2 forks (a Mac launcher or none) and is posted.

- **A1. Which events run macOS and Windows.** Default: ubuntu keeps main-never-red L8 (non-draft PRs to main, and pushes to main). The macOS and Windows jobs run on a PR to main labelled `all-os` (drafts included, so QA can label this run's feature PR), on a weekly `schedule` on main, and on `workflow_dispatch`. Tradeoff: a platform regression merged mid-week shows within 7 days, not on its PR. A full 3-OS run costs about 155 billed minutes (macOS about 12 min at 10x, Windows about 15 at 2x, ubuntu about 5), so about 4 scheduled runs plus a few labelled ones stay under a third of the 2,000. Rejected: every PR to main on all 3 OSes, which spends the 2,000 in about 4 days. Rejected: making the repo public, which makes Actions free but is the user's and irreversible in effect.
  Verdict: overturned: the user queued a move to a fresh public repository (`itm_c570093cafb5`), where the matrix is free; the trigger is conditioned on the repository's visibility so the move needs no second edit. Replacement: L10.
- **A2. Start and Resume on a Mac.** Default: out of scope. The buttons stay Windows-only, and the deck page tells a Mac user to run `pilot run` in a terminal. Tradeoff: a Mac user loses one-click Start. Rejected: a terminal launcher (`osascript` to Terminal.app, `x-terminal-emulator`), which is a design of its own and is unproven without a Mac.
  Verdict: stands — Start/Resume is Windows-only by design (session.mjs); no queued ticket asks for it on a Mac. User: Out of scope (`itm_face96d21ceb`).
- **A5. A directory whose chmod is refused.** Default: `privateDir` keeps a directory whose chmod fails with EPERM (another user owns it) and reports it through `onKept`, instead of throwing, because throwing would crash the daemon. Tradeoff: that directory may stay wider than 0700. Rejected: throwing, which stops the daemon over a directory only its owner can change.
  Verdict: assumed, recorded in the fix round.

## 7. Out of scope

- Start and Resume on POSIX (A2). Windows ACLs on the store. Case-folding on darwin (L3).
- A Mac-only feature beyond the 9 spec lines. Linux desktop opener variants (WSL `wslview`).
- Making the CI check required (main-never-red L5).

## 8. Slices

Width 5; longest stem 4 (S3 → S4 → S5 → S9).

| Slice | Title | Spec | Files owned | After | Reviewers | File |
|---|---|---|---|---|---|---|
| S1 | The gate runs on three OSes on a labelled PR (walking skeleton) | 1 | `.github/workflows/gate.yml`, `scripts/test/gate-workflow.test.mjs` | – | ts, security | [S1](slices/S1.md) |
| S2 | The suite's Windows path literals become host paths | 8 | `deck/test/daemon.test.mjs`, `deck/test/record.test.mjs`, `deck/test/add-deck.test.mjs`, `scripts/test/audit-session-start.test.mjs` | – | ts | [S2](slices/S2.md) |
| S3 | One repository behind a symlink is one path key | 2, 6 | `hooks/lib/platform.js` (new), `hooks/test/platform.test.js` (new), `deck/items.mjs`, `hooks/lib/deck.js`, `scripts/install-settings.mjs`, `deck/test/path-key.test.mjs` (new) | – | ts, security | [S3](slices/S3.md) |
| S4 | A landing's and gc's trees die by one killTree | 2, 3 | `hooks/lib/platform.js`, `hooks/test/platform-kill.test.js` (new), `deck/landing.mjs`, `deck/gc.mjs`, `deck/test/landing.test.mjs` | S3 (`hooks/lib/platform.js`) | ts, security | [S4](slices/S4.md) |
| S5 | claude resolves from absolute PATH entries on POSIX | 2, 9 | `hooks/lib/platform.js`, `hooks/test/platform-claude.test.js` (new), `deck/run.mjs`, `scripts/pilot-branch.mjs` | S4 (`hooks/lib/platform.js`) | ts, security | [S5](slices/S5.md) |
| S6 | The process table reads macOS ps | 8 | `deck/procs.mjs`, `deck/test/procs.test.mjs` | – | ts | [S6](slices/S6.md) |
| S7 | The store and pilot-inbox are private on POSIX | 5 | `hooks/lib/atomic-write.js`, `hooks/test/private-store.test.js` (new), `deck/store-core.mjs`, `deck/daemon.mjs`, `hooks/lib/deck.js` (the `pilot-inbox` mkdirs) | S3 (`hooks/lib/deck.js`) | ts, security | [S7](slices/S7.md) |
| S8 | A Mac install writes the login profile and the TCC note | 4, 7 | `scripts/install-path.mjs`, `scripts/install-command.mjs`, `scripts/test/install-path.test.mjs`, `scripts/test/install-command.test.mjs`, `scripts/test/install.test.mjs`, `README.md`, `docs/INSTALL.md` | – | ts, security | [S8](slices/S8.md) |
| S9 | Every platform read goes through the seam | 2 | `deck/open.mjs`, `deck/session.mjs`, `deck/ui/render-strip.mjs`, `deck/doctor.mjs`, `scripts/gate.mjs`, `scripts/test/platform-reads.test.mjs` (new), plus the default-parameter line in `deck/procs.mjs`, `deck/gc.mjs`, `scripts/pilot-branch.mjs`, `scripts/install-path.mjs`, `scripts/install-command.mjs` | S3 (`hostPlatform`), S4 (`deck/gc.mjs`), S5 (`scripts/pilot-branch.mjs`), S6 (`deck/procs.mjs`), S8 (`scripts/install-*.mjs`) | ts, security | [S9](slices/S9.md) |

The ready set by risk: S3 (the key every stored record uses), then S6 and S2 (macOS and ubuntu green), then S8 and S1; S7 follows S3. S1's labelled run is green only once S2 and S6 are integrated. Its own evidence is the 3 jobs starting and the ubuntu one reaching the suite.

## 9. Acceptance evidence

1. On the feature PR, labelled `all-os`: `gh pr checks` lists `gate (ubuntu-latest)`, `gate (macos-latest)` and `gate (windows-latest)`, all green (spec 1, 8). QA reads each job's census line and pass count, and the macOS job's minutes.
2. `node --test scripts/test/platform-reads.test.mjs` passes, and `git grep -n process.platform -- ':!**/test/**'` names `hooks/lib/platform.js` only (spec 2).
3. In the macos and ubuntu job logs, the tree-kill, path-key and private-store tests show as passed, not skipped (spec 3, 5, 6).
4. Locally, the darwin `persistPath` fake-home tests and the `describe()` TCC pin pass. README and INSTALL.md read the note (spec 4, 7).
5. The planted-`claude` test passes on all 3 jobs (spec 9).

Unproven without a Mac: TCC prompts, and whether a detached daemon inherits the terminal's grant. Terminal.app actually sourcing the written profile. A real `pilot run` under node-pty with a real `claude`. Case-variant paths on APFS. The Start button (A2).

## 10. Status

| Slice | State | Branch | PR | Worktree | After | Spec |
|---|---|---|---|---|---|---|
| S1 | planned | `slice/mac-linux-s1` | – | – | – | 1 |
| S2 | planned | `slice/mac-linux-s2` | – | – | – | 8 |
| S3 | planned | `slice/mac-linux-s3` | – | – | – | 2, 6 |
| S4 | planned | `slice/mac-linux-s4` | – | – | S3 | 2, 3 |
| S5 | planned | `slice/mac-linux-s5` | – | – | S4 | 2, 9 |
| S6 | planned | `slice/mac-linux-s6` | – | – | – | 8 |
| S7 | planned | `slice/mac-linux-s7` | – | – | S3 | 5 |
| S8 | planned | `slice/mac-linux-s8` | – | – | – | 4, 7 |
| S9 | planned | `slice/mac-linux-s9` | – | – | S3, S4, S5, S6, S8 | 2 |
| mac-linux | planned | `feat/mac-linux` | – | – | S1–S9 | 1–9 |
