# home-store-guard: the gate catches a write to the home deck store

Ticket `itm_8bee042932cd` · agreement `itm_c7a75885a597` · base `pilot` at `fa28b73b` · ADR NNNN (`docs/adr/NNNN-home-store-guard.md`)

## 1. Problem

During the never-stuck run's QA, the live deck store `~/.claude/pilot/deck.json` was stamped by a test or tool run nobody identified. Nothing guards it. The user wants the gate (`npm test` and every command that wraps it) to notice. It records the home store's state before the suite, and fails after it, naming the file, when the store changed.

## 2. Spec

| # | Behaviour | Evidence (bar) |
| --- | --- | --- |
| 1 | A suite process that writes the home store through the deck store is refused, and the gate goes red naming the file and the writer's pid and command. *Assumed (A1).* | `refuseGateHomeWrite` throws for the guarded path and appends exactly one log line; a `runGate` test whose suite leaves a log line exits 1, with the path and pid in the output. practitioner: hermetic-test engineer (catch at the write site, name the writer). |
| 2 | With no live deck, a home store whose stat changed between before and after makes the gate red, naming the file. | `runGate` with an injected store: touched mid-run → exit 1 and one `home store changed: <path>` line; untouched → 0; absent both ends → 0; created or deleted → 1. |
| 3 | The live deck writing its own store during a run never makes the gate red. *Assumed (A1).* | `runGate` with a touched store and an injected live deck pid → exit 0, exactly one `home store changed: <path>; live deck <pid> up` line. |
| 4 | A clean gate is otherwise unchanged. | The six existing `scripts/test/gate*.test.mjs` files pass unedited; a clean `npm test` prints 0 new lines. |
| 5 | Every gate entry is covered: `npm test`, `test:changed`, `test:quiet`, `coverage`, and `pilot integrate`/`sync`/`land`, which run those. | One hook in `scripts/gate.mjs`'s CLI entry; QA runs `npm test` and `npm run test:changed -- --since=HEAD~1` once each in a scratch clone, each red on a planted write. practitioner: QA engineer (the raw material is the store's stat, read with `node -e` before and after). |

## 3. Findings

- Home store: `path.join(os.homedir(), '.claude', 'pilot', 'deck.json')`. `deck/store-dir.mjs:12` `defaultStoreDir`, and `hooks/lib/deck-secret.js:30` `deckDir`, which `PILOT_DECK_DIR` overrides.
- The one store writer is `deck/store-core.mjs:322` `writeDeck`: `storeFile()`, then `keepBackup`, then `atomicWriteFileSync`. `store-core.mjs` has **799 lines**, and `deck/test/facades.test.mjs:19` caps deck files at 800. So S2 adds no line there.
- Tests stay off the home store by opting in, file by file: `deck/testUtils.mjs:26` (a suite HOME, and `tempDeck`'s assert at :72) and `scripts/test/lib/fake-home.mjs` (imported by choice). A `scripts/` test that imports neither runs with the real HOME. That is the open hole.
- The gate: `package.json` `test`, `test:changed`, `test:quiet` and `coverage` all run `node scripts/gate.mjs`. `scripts/integrate.mjs:206` `testCommand` runs `npm test` or `test:changed`, and `sync.mjs` reuses it. `runGate` (`scripts/gate.mjs:226`) already wraps the suite between two censuses and a spawn count. It takes every dependency as an option, and the CLI entry (:312) passes the real ones.
- The live daemon is not a gate descendant. It writes `deck.json` on every post, status and reply, and the crew post during gates. So a bare mtime check is red on most runs on this machine.
- `deck/gc.mjs:74` `deckPidNow()` returns null for no deck, a pid for a live one, and undefined when it cannot tell. `census` already uses it as `deckPid`.
- No overlap with the live run yellow-never-idle (`deck/lanes.mjs`, `store-items.mjs`, `store-stage.mjs`, `server-tools.mjs`, `agents.mjs`).

**Seams** (deepening pass: `runGate` survives the deletion test, since the CLI and six test files call it. The new stat check folds behind it as an option, not a new module. The write guard sits in `store-dir.mjs`, which already owns "where the store is".)

| Seam | Interface | Folded behind it | Category |
| --- | --- | --- | --- |
| `runGate` (`scripts/gate.mjs`) | `runGate(args, { homeStore?, deckPid?, ... }) -> exit code` | the stat before and after, the live-deck exemption, reading the write log | local-substitutable (fs stat, injected pid) |
| `gateEnv` (`scripts/gate.mjs`) | `gateEnv(env, slot, spawns, guard?) -> env` | the two guard variables the suite inherits | in-process |
| `refuseGateHomeWrite` (`deck/store-dir.mjs`) | `refuseGateHomeWrite(file) -> file \| throws` | path comparison (case-folded on win32), the log append | local-substitutable (env, fs) |

## 4. Ubiquitous language

- **home store**: `<os.homedir()>/.claude/pilot/deck.json`, as the gate's own process resolves it at start.
- **store stat**: `{ exists, mtimeMs, size }` of the home store. Absent is a state.
- **write guard**: the refusal in `refuseGateHomeWrite`, armed by `PILOT_GATE_HOME_STORE` in a suite process's env.
- **write log**: the gate-owned file named by `PILOT_GATE_HOME_LOG`. The write guard appends one `<pid> <argv> <file>` line per refusal.
- **live deck**: the daemon `deckPidNow()` names. It is not a gate descendant and never carries the guard.

## 5. Locked decisions

- **L1** One hook point: `runGate`, armed only by the CLI entry passing `homeStore`. With no `homeStore`, `runGate` and `gateEnv` behave as today. Rationale: the existing gate tests stay unedited (spec 4), and every wrapper reaches the CLI entry (spec 5). Rejected: hooking `integrate.mjs` and `sync.mjs` separately, which gives three places to drift.
- **L2** The stat is `exists`, `mtimeMs` and `size`, read with `fs.statSync`. Rejected: a content hash, because the live deck changes content just as it changes mtime, so a hash adds no signal and costs a full read.
- **L3** The live deck is probed once, after the suite, and only when the stat changed. Rejected: a probe before and after, which spends a node spawn on every clean run.
- **L4** `store-core.mjs` gets no added line: the existing `store-dir.mjs` import grows a name, and `const file = storeFile()` becomes `refuseGateHomeWrite(storeFile())`. Rejected: splitting `store-core.mjs`, which is a tidy-up this ticket does not need.
- **L5** Grilling depth: No grilling, the user's last answer on `itm_4ccf604677fb` (after an earlier "forks"). A1 and A2 had been answered by the user before it.

## 6. Assumed decisions

- **A1** (thread `itm_be4f2a4009b2`) How a stray write is told from the live deck's own. Default taken: write guard + stat backstop (spec 1, 2, 3). The backstop is red with no live deck, and only prints a line while a deck is up, `deckPidNow()` undefined counting as up. Trade: a raw `fs` write by a test while the deck is up only warns, and the feature is 2 slices, not 1. Rejected: a stat check alone, which is red on most runs here. Also rejected: a fake HOME for the whole suite, which breaks git's global config for fixtures and changes every test.
  User's answer: "Tripwire + mtime backstop (default)", the default as written.
  Verdict: stands — the user chose "Tripwire + mtime backstop (default)" on itm_be4f2a4009b2; no queued ticket touches scripts/gate.mjs or store-dir.mjs
- **A2** (thread `itm_49cb9033a918`) QA environment. Default taken: a CLI gate in a scratch clone with HOME and USERPROFILE set to a temp dir, a planted home store, and no database. Trade: never run against the user's live deck.
  User's answer: "CLI gate in scratch clone, fake HOME (default)", the default as written.
  Verdict: stands — the user chose "CLI gate in scratch clone, fake HOME (default)" on itm_49cb9033a918
- red team: walked S1's first behaviour against `scripts/test/gate*.test.mjs`. Those six files call `runGate` with no fake HOME. A default `homeStore` would have them stat the real store while the live deck writes it, which flakes spec 4. Hence L1: `homeStore` is opt-in, passed only by the CLI entry. Also walked S2 against `facades.test.mjs`: store-core at 799 lines, a new import line plus a call would reach 801, hence L4. Also walked S2 against `tempDeck` and `testUtils`: their store paths differ from the guarded one, so the guard never trips on them, and a nested gate re-arms with its own `homedir`.

## 7. Out of scope

- Guarding `PILOT_DECK_DIR` stores, `deck.json.bak`, `deck-secret`, or anything else under `~/.claude`.
- Making every test file use a fake HOME (the cause, once the guard names it, is its own ticket).
- Writes outside a gate run, such as mutation or coverage tools run by hand.

## 8. Slices

Width 1; longest stem 2

| Slice | Title | Spec | Files owned | After | Reviewers | File |
| --- | --- | --- | --- | --- | --- | --- |
| S1 | The gate is red when the home store changed with no live deck | 2, 3, 4, 5 | `scripts/gate.mjs`, `scripts/test/gate-home-store.test.mjs` (new), `docs/adr/NNNN-home-store-guard.md` (new) | – | `pilot:typescript-reviewer` | [S1](slices/S1.md) |
| S2 | A suite process's write to the home store is refused and named | 1 | `deck/store-dir.mjs`, `deck/store-core.mjs` (2 changed lines), `scripts/gate.mjs`, `deck/test/home-write-guard.test.mjs` (new), `scripts/test/gate-home-store.test.mjs` | S1 (`scripts/gate.mjs` `runGate`, `gate-home-store.test.mjs`) | `pilot:typescript-reviewer`, `pilot:security-reviewer` | [S2](slices/S2.md) |

S1 is the walking skeleton: a stat before and after, reported by the real gate. S2 thickens it with the write guard.

## 9. Acceptance evidence

1. In a scratch clone with a temp HOME and a planted `deck.json`, a clean `npm test` is green with no `home store` line (spec 4).
2. A planted test that touches the store with `fs.utimesSync` makes `npm test` exit 1 with `home store changed: <path>` (spec 2). Run once more as `npm run test:changed -- --since=HEAD~1` (spec 5).
3. A planted test that calls the deck store's write with the real-HOME path makes the gate exit 1, naming the path and the writer's pid and command (spec 1).
4. A run with a scratch deck up that touches the store prints the `live deck <pid> up` line and exits 0 (spec 3).

## 10. Status

| Slice | State | Branch | PR | Worktree | After | Spec |
| --- | --- | --- | --- | --- | --- | --- |
| S1 | planned | – | – | – | – | 2, 3, 4, 5 |
| S2 | planned | – | – | – | S1 | 1 |
| home-store-guard | planned | `feat/home-store-guard` | – | – | S1, S2 | 1–5 |
