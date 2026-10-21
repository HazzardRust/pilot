# daemon-test-flake: the suite does not flake under load

Ticket `itm_8ced1f04d52a` · branch `design/daemon-test-flake` from `origin/pilot` 023185b9 · merge: none (`itm_4721838b01f0`)

## 1. Problem

"im signing off, but lets make that flake into a ticket." On the audit-f1-f7 walkthrough,
`deck/test/daemon.test.mjs` "two sessions in two repositories put two runs on one deck;
closing one leaves the other" failed once under `npm run test:quiet` with a fetch failing
at the 15 s timeout. It then passed under `npm test` and when run alone. The design run here
found three more load flakes, and the user widened the ticket to all four (L5):
"we need more bias towards making things bigger jobs ... i want it to spot an issue, add
it to the ticket and build it all without having to even ask the user".

## 2. Spec

| # | Behaviour | Evidence |
|---|---|---|
| 1 | The full suite passes under load on this machine. | 10 consecutive full-suite `npm run test:quiet` runs with the other agents live, all green. |
| 2 | The two-sessions test (`daemon.test.mjs:966`) waits at least as long as the client's join contract. The PR names the cause: the 15 s wait equalled the 10 s + 5 s contract with no time left for the client's own Node start, and an out-of-date error hid which step was slow. | S1 test 2 failing before the change; the paragraph in the PR. |
| 3 | A two-sessions failure names its cause. The timeout message carries the probe's last answer (the run count, or the error that is current) and each session's stderr. | S1 tests 1 and 3; a forced failure shows `runs: 1` and a session's `[deck] ...` line. |
| 4 | One wait budget per test file. No `until(` in `daemon.test.mjs` passes its own `timeoutMs` (except `until`'s own test), and `run.test.mjs` waits on conditions through one `eventually` budget. | `grep -n "timeoutMs" deck/test/daemon.test.mjs`; `grep -n "SETTLE_BUDGET_MS" deck/test/run.test.mjs`. |
| 5 | `daemon.test.mjs:1403` "a wait that finds nothing says so once per poll" passes under load. Its count is checked against the `deck_wait` requests actually made, not against what a 1500 ms wall-clock window should hold. | S2 test 1; the test in all 10 runs. |
| 6 | `daemon.test.mjs:1470` "a progress token of 0 is a token" passes under load on the same basis: one notification per empty poll the client made, with token 0. | S2 test 2; the test in all 10 runs. |
| 7 | `run.test.mjs:665` "a chain at start the deck did not answer is asked again" passes under load. A wait for something to *happen* waits for the condition, and the fixed 150 ms `settle()` stays only before an assertion that something did *not* happen. | S3 test 1; the test in all 10 runs. |
| 8 | *locked, L8*: a session whose first join failed joins on a later attempt instead of staying off the deck for life. | S4 tests 1 and 2. |

## 3. Findings

- `package.json:19-20`: `test:quiet` differs from `test` only by `--test-reporter=dot`. Concurrency (cores minus 1 = 11 here) and `--test-timeout=60000` are the same, so load is the factor, not the reporter.
- **Two-sessions test.** `until` (`daemon.test.mjs:147`, 15 s) keeps the last thrown error after later probes return null, so "fetch failed" can be stale. `tracked` (:135) drains stderr and drops it. `deck/client.mjs:43,57` set `START_TIMEOUT_MS = 10_000` and `REGISTER_TIMEOUT_MS = 5_000`. `ensureOnTheDeck` (:335) makes one memoised attempt and never retries. The losing daemon exits on `EADDRINUSE` by design (`daemon.mjs:95`), which is not a bug. #500 (3e15a5b7) touched this file only at :1526.
- **The two poll tests** (:1403, :1470). `clientOnADeck` (:1135) runs the deck in the test's own process. `waitForReply` (`client.mjs:259`) polls `deck_wait` every `pollMs` (300) until a 1500 ms deadline and reports each empty poll except the last. The test asserts at least 3 reports, which assumes each poll takes about 300 ms. Under load each round trip is slower, there are only 2 polls in the window, and the test fails. The client behaved correctly; the test counted wall-clock time rather than polls.
- **The chain test** (`run.test.mjs:665`). After the second `/api/chain` reaches the fake deck, `watch` (`deck/run.mjs:487`) still has to read that response, make an `/api/tool` read through `clear()`, and only then type. `settle()` (:584) is a fixed 150 ms sleep. The failing run had `chains.length === 2` (the assertion at :675 passed) but nothing typed yet (:676). This is timing only: no product bug. `settle()` is used 32 times; 15 are followed directly by an assertion, 5 of those of absence.
- Probes run here: a daemon cold start to healthy takes 497–747 ms (3 runs). One full `test:quiet` run (2m31s) did not reproduce the two-sessions flake but failed :1410, :1482 and `run.test.mjs:676`. That single run is the reproduction of the other three.
- `freePort()`'s window and `startup.test.mjs:45`'s hand-copied `START_TIMEOUT_MS` are noted and out of scope.

### Seams

| Seam | Interface | Folded behind it | Category |
|---|---|---|---|
| `until` (daemon harness) | `until(probe, { timeoutMs?, what })`, default `SESSION_JOIN_MS` | stale-error report; the wait number | in-process |
| `tracked` / `heard` (daemon harness) | `tracked(t, child)`, `heard(child)` | stderr capture | local-substitutable |
| `waitPolls` (daemon harness) | `waitPolls(t): () => number` | counting the `deck_wait` requests a client makes | in-process |
| `eventually` (run harness) | `eventually(predicate, what)`, `SETTLE_BUDGET_MS` | the 150 ms guesses before a positive assertion | in-process |
| client join | `START_TIMEOUT_MS`, `REGISTER_TIMEOUT_MS`, `ensureOnTheDeck(): Promise<boolean>` | the one-attempt memo (S4) | in-process |

Deletion test: every harness seam serves at least 2 call sites (`eventually` about 10). No fold beyond these.

## 4. Ubiquitous language

- **Join**: a session getting a deck that answers and its run registered (`ensureOnTheDeck`).
- **Join contract**: `START_TIMEOUT_MS + REGISTER_TIMEOUT_MS`, the client's own limits.
- **Wait budget**: the one number a test file waits on a condition with.
- **Last answer**: what the final probe returned or threw before the budget ran out.
- **Load flake**: a test that fails only when the full suite runs beside other work.

## 5. Locked decisions

- **L1** The two-sessions wait budget is derived from the join contract plus a fixed Node-start margin. Rejected: another literal, which is "a longer timeout alone".
- **L2** A two-sessions failure carries its last answer and both sessions' stderr, because that flake did not reproduce here. Rejected: looping the suite until it fails.
- **L3** One wait budget per file (spec 4). Rejected: per-test `timeoutMs`.
- **L4** S1 changes `client.mjs` only by exporting two constants. Behaviour changes there belong to S4 alone.
- **L5** (was A2) All four flakes are fixed in this run, and spec 1 is the whole suite green 10 times. *Overridden*: the default's objection was three diagnoses without a separate repro each, and the fix landing later. User, on itm_113930f2ed32: "we need more bias towards making things bigger jobs ... pushing it into tech debt is a slower moving machine ... i want it to spot an issue, add it to the ticket and build it all without having to even ask the user".
- **L6** The poll tests count against the polls the client actually made, not a wall-clock window. Rejected: a longer `timeout` or shorter `pollMs` (a bigger number alone).
- **L7** `settle()` stays only in front of absence assertions. Every positive wait in `run.test.mjs` becomes `eventually`. Rejected: raising 150 ms.
- **L8** (was A1; decided on itm_0a85e393126d) The client's one-attempt join is fixed in this run as S4: a failed join is forgotten so the next call tries again, and startup tries up to `JOIN_ATTEMPTS = 3` times, at most 3 daemon starts per session. **overridden**: the default fixed only the test side and made the join a ticket, since a startup change to every session cannot be proved the flake's cure without a repro; the user: "retry the client join in this run", under their bias-to-bigger-jobs rule (itm_113930f2ed32).
- **L9** Grilling depth: forks (itm_5c5da5ecfcaf, the recommended default). Gate 1 is one item, no walk.
- **L10** QA runs the full suite ten times under `npm run test:quiet` on this loaded machine with the other agents live (itm_589b27f72422, the recommended default). Rejected: a quiet machine, where the flakes never showed.

## 6. Assumed decisions

- **A1** Locked as L8 on itm_0a85e393126d.
- **A3** Locked as L10 on itm_589b27f72422.
- **A4** (co-pilot, S3) `eventually` rejects naming `what` and the budget, not a last state: its predicate is a boolean, and the assertion after each wait prints the actual value. Default taken.
- **A5** (co-pilot, under L5) Two more load flakes stand between the four and spec 1: `run.test.mjs` "stops the wait" (3 of 10 in S3's loaded runs) and `usage.test.mjs` "in 2 hrs". Added as S5 and S6 (the run's two added slices), each tracing to spec 1 and moving no locked decision. Default taken.
- **A7** (co-pilot) `daemon.test.mjs` "the harness is told only when it asked" failed under load in S1's runs; it joins S2's owned tests (same poll window, L6). S1's 69-line diff is accepted under the brief's 100-line limit.
- **A6** (co-pilot) Base pilot took ADR numbers 0116-0118 while this ran; this feature's ADRs are 0121 (test waits, after base took 0119 too) and 0120 (join retry).

## 7. Out of scope

`freePort`'s window; `startup.test.mjs`'s copied constant; daemon (`daemon.mjs`) changes; `settle()` before absence assertions.

## 8. Slices

Width 3; longest stem 2

| Slice | Title | Spec | Files owned | After | Reviewers | File |
|---|---|---|---|---|---|---|
| S1 | A late join fits the wait, and a failure says why (walking skeleton) | 2, 3, 4 | `deck/test/daemon.test.mjs`, `deck/client.mjs` | – | `pilot:typescript-reviewer` | [S1](slices/S1.md) |
| S2 | An empty poll is counted against the polls made | 5, 6, 1 | `deck/test/daemon.test.mjs` | S1 (`deck/test/daemon.test.mjs`) | `pilot:typescript-reviewer` | [S2](slices/S2.md) |
| S3 | The watch tests wait for what they assert | 7, 4, 1 | `deck/test/run.test.mjs` | – | `pilot:typescript-reviewer` | [S3](slices/S3.md) |
| S4 | A session that missed its join tries again (L8) | 8 | `deck/client.mjs`, `deck/test/startup.test.mjs` | S1 (`deck/client.mjs`) | `pilot:typescript-reviewer`, `pilot:security-reviewer` | [S4](slices/S4.md) |
| S5 | The marker-wait abort test waits for what it asserts (added, A5) | 1 | `deck/test/run.test.mjs` | S3 (`deck/test/run.test.mjs`) | `pilot:typescript-reviewer` | [S5](slices/S5.md) |
| S6 | The reset-time reading holds under load (added, A5) | 1 | `deck/test/usage.test.mjs` | – | `pilot:typescript-reviewer` | [S6](slices/S6.md) |

Estimated diff: S1 about 40, S2 about 30, S3 about 50, S4 about 40 changed lines; about 160 in all, under the 200-line limit. S4 carries the security reviewer because it changes when a process start (the daemon spawn) happens.

## 9. Acceptance evidence

1. `grep` shows one wait budget in each of `daemon.test.mjs` and `run.test.mjs` (spec 4).
2. `node --test deck/test/daemon.test.mjs deck/test/run.test.mjs deck/test/startup.test.mjs` is green, and each slice's new tests fail on the pre-change files (specs 2, 3, 5–8).
3. A forced two-sessions failure (probe pointed at 3 runs, locally, not committed) prints the run count and both sessions' stderr (spec 3).
4. 10 consecutive full-suite `npm run test:quiet` runs on this machine with the agents live, all green (spec 1).
5. The PR's diagnosis paragraphs, one per flake (specs 2, 5–7).

## 10. Status

| Slice | State | Branch | PR | Worktree | After | Spec |
|---|---|---|---|---|---|---|
| S1 | planned | | | | – | 2, 3, 4 |
| S2 | planned | | | | S1 | 5, 6, 1 |
| S3 | planned | | | | – | 7, 4, 1 |
| S4 | planned | | | | S1 | 8 |
| S5 | added | | | | S3 | 1 |
| S6 | added | | | | – | 1 |
| daemon-test-flake | planned | | | | S1–S6 | 1–8 |
