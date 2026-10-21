# daemon-lifecycle: the deck logs its crashes, replaces a stale daemon, names who holds its port, and has status, doctor and uninstall commands

Ticket `itm_140d9b3c845c`. Merge: `itm_f520e253fe50` (Operator tooling) merged in (thread `itm_d14fa6747da3`).
Base `pilot` at 4349249b. Grilling depth: forks (`itm_680ca206c5d5`).

## 1. Problem

The user asked what missing parts keep the pilot from being a thoroughly developed application, and had the
gaps made into tickets. This one holds the daemon's and the operator's: a daemon crash leaves no trace, a plugin
update can leave the old daemon serving, a second start on port 4321 fails with a bare "already held", nothing
shows what is running, `pilot doctor` checks only Defender, nothing undoes an install, and the operating doc has
no runbook for the deck's failures.

## 2. Spec

From the two tickets' drafts, sharpened against the code; agreed by the user (`itm_e382db8f7bd8`). Spec 15 came
from the user's answer on `itm_9ea59b4524b1` (§6). Lines resting on a decision name it.

| # | Behaviour | Evidence |
|---|---|---|
| 1 | An uncaught exception or unhandled rejection in the daemon writes `[deck] crashed:` and the stack to deck.log, and the daemon exits 1 within 2 s. | a daemon spawned with `node --import <fixture that throws in a timer>` leaves the stack in deck.log and exits 1 |
| 2 | Every error the HTTP error handler answers (400, 415, 500) writes one deck.log line `[deck] <status> <METHOD> <path>: <message>`, and the daemon keeps serving. | a refused `POST /api/tool` writes the line; `/api/health` still answers |
| 3 | `/api/health` carries `version` (package.json's) and `startedAt`; the MCP server's version is the same constant. | the health JSON; no version literal left in `deck/client.mjs` |
| 4 | A session joining a deck that reports an older version, or none, replaces it: one `POST /api/exit` (an unversioned deck, confirmed in the process table as `deck/daemon.mjs`, is stopped by pid), then it starts its own (A2). | a test daemon reporting an older version receives one exit request and health answers a new pid |
| 5 | A deck on the same or a newer version keeps serving; an older one with a landing running answers the exit 409, the session writes one stderr line and uses it, and its next join asks again. | a test per case reads the pid unchanged and the line |
| 6 | A joined session whose deck went away rejoins on its next tool call and retries that call once, inside ADR 0120's three starts. | a test stops the daemon under a joined client; the next `deck_read` answers from a new pid |
| 7 | A second start on a held port names the holder: a deck by pid and version, anything else as "not a deck" (A1). | two spawned-daemon tests read the two messages and exit code 1 |
| 8 | `pilot status` on a live deck prints the url, pid, version against the plugin's (`stale` when older), uptime, live agents by repository and type, and deck.log's last 20 lines. | its output against a scratch deck |
| 9 | With no deck, `pilot status` prints `no deck is running at <url>`, then deck.log's last 20 lines if a log exists, and exits 1 (A3). | its output with nothing on the port |
| 10 | `pilot doctor` prints one row per local check, each `pass`, `fail` or `cannot tell`: Defender (today's check), Node at or above package.json's engines, the deck's dependency installed, the store directory writable, and `gh`, `git`, `claude` on PATH; it exits 1 when a row fails (A5). | a test per row with its condition faked; the live output here |
| 11 | `pilot doctor` adds two deck rows: port 4321 (free, our deck, or held by another program) and the running deck's version against the plugin's. | tests over a scratch deck, a foreign listener and an empty port |
| 12 | `pilot uninstall` prints what it will remove and leave, and with `--yes` stops the user's deck, removes the `pilot` command and its launcher directory and the marked shell-profile PATH block, names what it left (the store, the audits, the Windows PATH entry, the CLAUDE.md excerpt) and ends naming `claude plugin uninstall pilot@pilot` (A4). | a test over a scratch home leaves only the named files; docs/INSTALL.md documents the command |
| 13 | With `--yes` it also removes pilot's status lines and the permission rules that name pilot from settings.json, and the unedited copies of the shipped rules; edited rules, the default-branch ask rules and WebFetch hosts stay and are named (A4). | a test over a scratch `~/.claude` keeps a user's own rule and an edited rule, and removes the rest |
| 14 | docs/OPERATING.md gains a runbook: where deck.log is, `pilot status`, a stuck deck (`pilot gc`), a corrupt store (`pilot store restore`, from store-durability), a port conflict (A6). | the section exists; every command it names runs; a pin test reads the headings |
| 15 | The feature ships as 0.9.3 (the base was already 0.9.2): package.json, package-lock.json and .claude-plugin/plugin.json carry the new version, so the first session after this update finds the user's 0.9.2 deck unversioned and replaces it (spec 4), and every later update takes the exit route (L9). | the three files agree; `deck/test/store-upgrade.test.mjs` pins 0.9.3; spec 4's unversioned test |

Implied and stated: spec 6 (a crash under spec 1 otherwise leaves every joined session failing "fetch failed"
until it is closed, since `ensureOnTheDeck` stays memoised true, `deck/client.mjs:350`).
Cannot mean: "a client whose version differs" restarts the deck. Sessions opened before an update keep the old
client; on "differs" an old session and a new one would stop each other's deck in turn (A2).

## 3. Findings

- `deck/daemon.mjs:52-78` `logToStore` tees stderr into `<storeDir>/deck.log` with `writeSync`, so a line written in
  a crash handler lands before exit. `:105-159` `main`: EADDRINUSE at `:116` prints one message with no probe;
  ticking work starts in `main`, never in `startDaemon`, which the suite calls. No crash handler anywhere.
- `deck/server-routes.mjs:572-580` health: `ok, pid, url, seq, rss`. `:775-796` the error handler logs only a 500
  (`:790`); DeckRefusal (400) and 415 answer silently. Every refusal reaches this handler as a throw.
  `:702-716` `POST /api/agents` takes heartbeats; `deck/agents.mjs:313` `listAgents()` has no GET route.
- `deck/client.mjs:140-147` `isDeckUp`, `:154-180` `ensureDaemon`, `:350-366` `ensureOnTheDeck` (memoised once
  joined; failures retried, three starts, ADR 0120), `:432` the hardcoded `'0.9.1'`.
- Three health probes: client `isDeckUp`, `deck/procs.mjs:175` `userDeckPid`, `deck/scratch.mjs:41` `healthPid`.
  `deck/procs.mjs:77` already recognises a `deck/daemon.mjs` process in the process table.
- `deck/landing.mjs:35` `landingsRunning()`; a landing's child dies with its daemon (`daemon.mjs:131`).
- `deck/doctor.mjs`: Defender only, `checkScanner({ platform, run, root })` returns `{ state, lines }`, exit 0.
  `package.json` engines `node >=22.8.0`; one dependency, `@modelcontextprotocol/sdk`.
- `bin/pilot.mjs:150-339` the dispatcher; `pilot` runs the current plugin version through the launcher
  (`scripts/install-command.mjs`), so the CLI's package.json version is the plugin's.
- Install writes, with no record of what it added (explorer read of `scripts/install-*.mjs`): the launcher in
  `~/.claude/pilot/command/` and npm's global `pilot` (`install-command.mjs:146-164,224`, ours told apart by
  `decide()` `:121`); the PATH (Windows registry, unmarked; POSIX a `# >>> pilot >>>` block, `install-path.mjs:72-125`);
  settings.json status lines (ours by `ownCommandPath`, `install-settings.mjs:244`) and permission rules (fixed
  strings, `:442-620`); rules copies, told unedited by the sha256 ledger (`install-rules.mjs:66`); the CLAUDE.md
  excerpt, appended by hand with no marker. The plugin's SessionStart hook (`hooks/hooks.json:20,31`) re-copies
  rules and repairs settings, so an uninstall left with the plugin enabled is undone next session.
- No lockfile exists; `deck/scratch.mjs:123` keeps a registry for scratch decks only.

### Seams

| Seam | Interface | Folded behind it | Category |
|---|---|---|---|
| deck probe | `probeDeck(url, options?)` → `{ state: 'deck', pid, version, startedAt } \| { state: 'none' } \| { state: 'foreign', why }` | client `isDeckUp` (in S4); the held-port check, status, doctor's deck rows | true external (a socket; tests use a real listener) |
| plugin version | `PLUGIN_VERSION`, `isOlder(a, b)` | the hardcode at `client.mjs:432`; the comparison spec 4, 8 and 11 share | in-process |
| daemon lifecycle | `main()` in `deck/daemon.mjs`; `createDeckHttpServer({ exit })` | crash handlers, the held-port message, the exit seam | local-substitutable (a spawned daemon on a free port, temp `PILOT_DECK_DIR`) |
| status command | `main(options?)`, `statusLines(report)` | health, agents and log tail in one report | in-process over the probe |
| doctor | `checkAll(deps)` → `Row[]`, `main()` | today's `checkScanner` as one row; each new check | local-substitutable (each probe injected) |
| uninstall | `planUninstall(home, deps)` → `Plan`, `applyPlan(plan, deps)`, `main(argv)` | the per-install-step removers exported beside each writer | local-substitutable (a scratch home) |

Deletion test: removing `deck probe` puts three answers (none, deck, foreign) into the daemon, status and doctor
separately, beside the three existing probes; it earns its keep, and the client's `isDeckUp` folds into it in S4,
where the client must read the version anyway. `userDeckPid` and `healthPid` read only a pid and stay (§7).
Removing `plugin version` puts a package.json read in three places. Each uninstall remover lives in the install
script whose write it reverses, so the rule for "ours" stays beside the code that wrote it.

## 4. Ubiquitous language

- **deck**: the daemon serving the port; **the user's deck** is the one on 4321, never a scratch deck.
- **older deck**: one whose health reports a version below the plugin's, or no version.
- **holder**: whatever has the port bound: a deck, or another program.
- **row**: one doctor check's line, `pass`, `fail` or `cannot tell`, never a guess.
- **provably pilot's**: a file or setting install wrote that the code can tell from the user's own.

## 5. Locked decisions

- **L1** Crash handlers are installed in `main`, never in `startDaemon`; the handler writes the stack through
  console.error (tee'd) and runs the existing shutdown with exit code 1 and a 2 s unref'd force-exit. Rejected: a
  handler that keeps serving, which Node documents as unsafe after an uncaught exception.
- **L2** The crash test plants its throw with `node --import`; daemon.mjs gains no fault switch. Rejected: an env
  variable that throws on demand, a backdoor in production code.
- **L3** The exit request is `POST /api/exit { version }`, behind `isTrustedOrigin` like every write; the daemon
  itself decides: 202 and shutdown only when the caller's version is newer, 409 while `landingsRunning()`.
  Rejected: the client killing the pid, which drops a running landing and cannot be refused.
- **L4** An unversioned deck (every daemon through 0.9.2) is stopped by `process.kill(pid)` only after the process table
  shows that pid running `deck/daemon.mjs`; anything else on the port is left alone. Rejected: no fallback, which
  leaves the first update after this one serving the old deck until it idles out.
- **L5** Rejoin is on a connection refused from `post`, once per call, through `ensureOnTheDeck`'s existing cap.
  Rejected: a health poll in the background.
- **L6** `pilot status` reads `GET /api/agents` (new, read-only, `listAgents()`) rather than growing health, which
  the client polls every 100 ms while starting a deck.
- **L7** QA environment: a scratch deck (`pilot deck --scratch`) that QA crashes, restarts and double-starts on
  purpose, plus `npm test`; the user's deck on 4321 is never touched (`itm_d2d2ff77be2b`).
- **L8** One ADR, written in S4: a session replaces an older deck through the deck's own exit route.
- **L9** The version bump to 0.9.3 is S1's, the slice that puts the version on the health route, so every later
  slice tests against the shipped number; the user asked for the bump (`itm_9ea59b4524b1`). Rejected: a chore
  commit after the last slice, which no slice's gate covers and which a DAG with four leaves cannot place.
- **L10** `pilot uninstall` removes only what is provably pilot's: the launcher directory and command, the marked
  PATH block, status lines matched by `ownCommandPath`, the fixed permission strings, rules whose sha256 is a
  shipped copy's (the user's answer on `itm_ffac582b6ec7`). Rejected: removing every line install touched, which
  cannot tell the user's own rule or PATH entry from ours.
- **L11** Only an older (or unversioned) deck is replaced; a newer one is left running (the user's answer on
  `itm_9ea59b4524b1`). Rejected: "differs", under which a session opened before an update and one opened after
  stop each other's deck in turn.

## 6. Assumed decisions

Questions posted on the ticket for the forks (A1, A2, A4), all three confirmed by the user as written; A2 and A4
are locked as L11 and L10 and kept here under their tags because the slices cite them. The rest decided here
under depth "forks".

- **A1** One deck per machine rests on the bound port and `/api/health`, no lockfile; confirmed by the user on
  `itm_7d4f880004bd` after the pilot's pushback. Trades naming a wedged deck by pid for no stale file after a
  crash. Rejected: the ticket's lockfile with pid and start time.
  Verdict: stands — the user confirmed it after pushback; nothing queued touches daemon.mjs's port path.
- **A2** Only an older (or unversioned) deck is replaced; confirmed by the user (`itm_9ea59b4524b1`). Trades an
  old session talking to a newer deck for no ping-pong across an update. Rejected: the ticket's "differs".
  Verdict: stands — locked as L11 by the user.
- **A3** `pilot status` with no deck still prints deck.log's last 20 lines, where spec 1's stack is. Trades a
  one-line answer for the crash trace. Rejected: one line only. Not posted (depth forks).
  Verdict: stands — the user asked for crashes to be logged (spec 1); a status that shows the log is the cheapest read of it.
- **A4** `pilot uninstall` removes what is provably pilot's, plans first and acts on `--yes`, and names
  `claude plugin uninstall pilot@pilot` last; confirmed by the user (`itm_ffac582b6ec7`). Trades a few lines left for the user to remove
  for never deleting the user's own rule or PATH entry. Rejected: removing every string install could have written.
  Verdict: stands — locked as L10 by the user.
- **A5** `pilot doctor` exits 1 when any row fails, 0 otherwise (`cannot tell` does not fail). Trades today's
  "exit 0 always" for a usable preflight. Rejected: exit 0 always. Not posted.
  Verdict: stands — a preflight the queued Main-never-red CI can call; no other run touches doctor.mjs.
- **A6** The runbook goes in docs/OPERATING.md, the operating doc; docs/INSTALL.md gains only the uninstall step.
  Rejected: the ticket's INSTALL.md, the install walkthrough an agent follows. Not posted.
  Verdict: stands — matches the user's readme-pitch call moving operator detail to docs/OPERATING.md; S9 rebases over readme-pitch's new "Commands under the hood" section, no overturn.

## 7. Out of scope

- Folding `procs.mjs` `userDeckPid` and `scratch.mjs` `healthPid` into the probe: they read a pid only and the
  request touches neither.
- Recording what install adds so a later uninstall can remove permission rules and the Windows PATH entry.
- Removing the CLAUDE.md excerpt or the Windows PATH entry; running `claude plugin uninstall` for the user.
- The store's own recovery and archive: store-durability (`feat/store-durability`, PR #760), which S2 and S4
  rebase on in `daemon.mjs` `main` and S5 in `bin/pilot.mjs`.

## 8. Slices

Width 4; longest stem 4 (S1 → S5 → S7 → S8).

| Slice | Title | Spec | Files owned | After | Reviewers | File |
|---|---|---|---|---|---|---|
| S1 | Walking skeleton: the deck reports its version and `pilot status` shows it | 3, 8, 9, 15 | `deck/version.mjs` (new), `deck/probe.mjs` (new), `deck/status-command.mjs` (new), `deck/server-routes.mjs`, `deck/client.mjs`, `bin/pilot.mjs`, `deck/README.md`, `deck/test/status-command.test.mjs` (new), `package.json`, `package-lock.json`, `.claude-plugin/plugin.json`, `deck/test/store-upgrade.test.mjs` | – | ts, security | [S1](slices/S1.md) |
| S2 | A crash and every refusal reach deck.log; a held port names its holder | 1, 2, 7 | `deck/daemon.mjs`, `deck/server-routes.mjs`, `deck/test/daemon-lifecycle.test.mjs` (new), `deck/test/fixtures/throw-in-timer.mjs` (new) | S1 (server-routes.mjs, probeDeck) | ts | [S2](slices/S2.md) |
| S3 | A session whose deck went away rejoins on its next call | 6 | `deck/client.mjs`, `deck/test/client-rejoin.test.mjs` (new) | S1 (client.mjs) | ts, security | [S3](slices/S3.md) |
| S4 | A session replaces an older deck | 4, 5 | `deck/client.mjs`, `deck/server-routes.mjs`, `deck/daemon.mjs`, `deck/test/daemon-replace.test.mjs` (new), `docs/adr/<next>-a-session-replaces-an-older-deck.md` (new), `docs/adr/README.md` | S2 (daemon.mjs, server-routes.mjs), S3 (client.mjs) | ts, security | [S4](slices/S4.md) |
| S5 | `pilot doctor` runs every local check as a row | 10 | `deck/doctor.mjs`, `deck/test/doctor.test.mjs`, `bin/pilot.mjs` | S1 (bin/pilot.mjs) | ts, security | [S5](slices/S5.md) |
| S6 | `pilot doctor` checks the port and the deck's version | 11 | `deck/doctor.mjs`, `deck/test/doctor-deck.test.mjs` (new) | S5 (doctor.mjs), S1 (probeDeck) | ts | [S6](slices/S6.md) |
| S7 | `pilot uninstall` plans, then removes the command, launcher and PATH block | 12 | `scripts/uninstall.mjs` (new), `scripts/install-command.mjs`, `scripts/install-path.mjs`, `bin/pilot.mjs`, `docs/INSTALL.md`, `scripts/test/uninstall.test.mjs` (new) | S5 (bin/pilot.mjs) | ts, security | [S7](slices/S7.md) |
| S8 | `pilot uninstall` removes pilot's settings and unedited rules | 13 | `scripts/uninstall.mjs`, `scripts/install-settings.mjs`, `scripts/install-rules.mjs`, `scripts/test/uninstall-settings.test.mjs` (new) | S7 (uninstall.mjs) | ts, security | [S8](slices/S8.md) |
| S9 | docs/OPERATING.md gains the deck's runbook | 14 | `docs/OPERATING.md`, `scripts/test/operating-runbook.test.mjs` (new) | S1 (pilot status) | ts | [S9](slices/S9.md) |

Reviewers: ts is `pilot:typescript-reviewer`, security `pilot:security-reviewer`. S9 names `pilot store restore`
and so is integrated after store-durability lands on `pilot`; until then it is cut without that paragraph.

## 9. Acceptance evidence

In the order a user meets it, on a scratch deck (L7):
1. `pilot status` with nothing running: one line and the log tail, exit 1 (spec 9).
2. Start the deck; `pilot status` shows url, pid, version, uptime, agents and the log tail (spec 3, 8).
3. Post a malformed question; deck.log has one refusal line and the deck still serves (spec 2).
4. Start a second deck on the same port: it names the first by pid and version; with a plain listener there, "not a deck" (spec 7).
5. Plant a crash with `--import`: deck.log holds the stack, the process exits 1; a joined session's next call starts a new deck (spec 1, 6).
6. Start a deck reporting an older version; a new session replaces it (new pid); with a landing running it does not (spec 4, 5).
7. `pilot doctor`: every row, then with the port held by another program (spec 10, 11).
8. `pilot uninstall` over a scratch home: the plan, then `--yes`, the files left exactly the named ones (spec 12, 13).
9. docs/OPERATING.md's runbook commands each run (spec 14); `npm test` green.

## 10. Status

| Slice | State | Branch | PR | Worktree | After | Spec |
|---|---|---|---|---|---|---|
| S1 | planned | | | | – | 3, 8, 9, 15 |
| S2 | planned | | | | S1 | 1, 2, 7 |
| S3 | planned | | | | S1 | 6 |
| S4 | planned | | | | S2, S3 | 4, 5 |
| S5 | planned | | | | S1 | 10 |
| S6 | planned | | | | S5, S1 | 11 |
| S7 | planned | | | | S5 | 12 |
| S8 | planned | | | | S7 | 13 |
| S9 | planned | | | | S1 | 14 |
| daemon-lifecycle | planned | | | | S1–S9 | 1–15 |
