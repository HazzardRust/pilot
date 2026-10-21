# A failing run has a debugging workflow

Feature `debug-workflow` · ticket `itm_ddffb46808eb` · base `feat/debug-workflow` from `origin/pilot` (18a5d2f0) · ADR NNNN

## 1. Problem

"Do we have a debugging workflow in place anywhere? Any agent? Skill?" The user asked this after pasting a red CI run into
the deck's chat by hand. Two gaps sit behind the question.

- `diagnosing-bugs` is vendored, but only QA is told to load it. The implementer, who writes every fix, never is.
- Nothing reads a red Actions run. The pilot learnt of run 39530951687 only because the user typed it in. That run's
  `gh run view --log-failed` output is 10,269 lines, and an explorer had to dump it and grep it to find the eight failing tests.

## 2. Spec

Agreed by the user on itm_95ade1208a01.

| # | Behaviour | Evidence (bar) |
|---|---|---|
| 1 | The implementer loads `pilot:diagnosing-bugs` with the Skill tool on demand, not in its frontmatter, in two cases: on a fix brief that carries a bug, and on a phase-gate red it calls `regression`. A co-pilot's fix brief for a CI red names the skill. QA's line is unchanged. | 2 new pins in `scripts/test/pilot-agents.test.mjs` beside the QA pin at :1285, one for the implementer and one for the co-pilot. 0 `skills:` fields name the skill. A pin asserts that `skills/diagnosing-bugs/SKILL.md` exists. `check-references` exits 0. |
| 2 | A Gate run of this repository that concludes `failure` reaches the pilot as **one CI red line** on the next poll that sees it. The line names the run id and URL, the branch and the event, each failed job and the jobs that passed. For each failed job it names up to 5 failing tests as `file:line name: "first assertion line"`, then `(+n more)`. | A test feeds the trimmed fixture of run 39530951687. The resulting line names `39530951687`, `gate (windows-latest)` with 8 failing, `gate (macos-latest)` with 10 failing, and `gate (ubuntu-latest)` as passed. The line is at most 1500 chars. |
| 3 | A run attempt is announced once and history never floods. Only runs updated in the last 6 h count, and at most 3 runs are announced per poll per repository. | Two polls over the same `gh` reply give 1 line. Five red runs give 3 lines on the first poll and 2 on the next. A run 7 h old gives none. |
| 4 | CI text reaches the pilot as quoted data, never as instruction (practitioner: security reviewer). ANSI and control characters are stripped. Each field is clipped (a name to 120 chars, a message to 160). Runs from fork PRs are ignored. Only a numeric run id from the log ever reaches a `gh` argv, and nothing from the log reaches a shell. | A fixture with ESC sequences, a 5,000-char test name, a line saying "ignore previous instructions", and a fork run gives stripped, clipped and quoted text, and the fork run is absent. `pilot ci abc` exits 1 without calling `gh`. |
| 5 | The CI red line is routed. A branch `feat\|slice\|fix\|qa/<slug>[-s<n>]` that matches a live run record of a yellow or green ticket puts the line on that ticket's item, and the pilot hands it to the ticket's co-pilot. Any other branch puts it on the repository's chat marked `unrouted`, and the pilot turns it into a ticket proposal per ticket-making (A2, settled). | A fixture on `slice/<slug>-s2` puts exactly 1 line on the ticket item and 0 on the chat. A fixture on `pilot` puts 1 line on the chat. A pin in `agents/pilot.md` names both routes. |
| 6 | The watcher's cost is bounded. Each poll makes one `gh api` runs-list call per repository with an open ticket, every 5 min (A1, settled). Logs are fetched only for a run about to be announced. When `gh` is missing or signed out, the daemon logs one line and posts nothing to the deck. | A test counts the injected `gh` calls: 1 per repository on a quiet poll, and 3 for a run announced (the list plus 2 for the run). |
| 7 | `pilot ci <run-id>` prints the same bounded summary, with every failing test and at most 40 lines, so no agent reads a raw Actions log again (practitioner: CI triager, whose raw material is the `✖ failing tests:` block; A4, settled). | On the fixture it prints 18 tests and stays at or under 40 lines. A live run against 39530951687 does the same. |
| 8 | An ADR records the crew's bug path. | `docs/adr/NNNN-debug-workflow.md` is listed in `docs/adr/README.md`, and `npm run adr-index -- --check` exits 0. |

## 3. Findings

**What exists**
- Deck lines already wake the pilot. `noteDeck(id, text)` at `deck/store-items.mjs:465` writes a `from: 'deck'` reply with a
  `seq`. `handsTo` at `deck/items.mjs:404` hands every deck line to the pilot, through `pilot wait` and `hooks/inbox-alert.js`.
  A newly posted item does **not** wake a wait. The yield line (`deck/store-tickets.mjs:375`) and the landing lines use this route.
- The daemon timers that write are in `deck/server-wait.mjs:427-547` (`armConflicts`, `armYields`). Ticking timers start in
  `deck/daemon.mjs:214-232` and never in `startDaemon`, so a test daemon never ticks. `announceChange` is already exported (`server-wait.mjs:765`).
- `gh` is called through an injectable `execFileSync('gh', argv)` in three places: `deck/tickets.mjs:24`, `scripts/integrate.mjs:55`
  and `scripts/branches.mjs:149`. `openRuns` (`deck/tickets.mjs:31`) filters on `isCrossRepository === false`, which is the precedent for
  dropping forks. The repository's `owner/repo` comes from the cwd, through gh's `{owner}/{repo}` placeholders.
- `failingNames` (`scripts/integrate.mjs:205`) reads `✖` names from local test output. No parser of Actions logs exists.
- The log shape is real (run 39530951687). Each line is `<job>\t<step>\t<ISO ts> <text>`. One `✖ failing tests:` block per failed job
  holds, per test, `test at <file>:<l>:<c>`, then `✖ <name> (<ms>)`, then the indented assertion. Windows has 8 failing tests and
  macOS 10. The run was a `workflow_dispatch` on `fix/ledger-append-only`.
- Each repository's chat exists from registration (`deck/store-core.mjs:625`). A run record carries `slug`, `ticket` and `repo` (`deck/store-runs.mjs:287`, `listRuns`).
- Branch shapes in the crew prompts are `feat/<slug>`, `slice/<slug>-s<n>`, `fix/<slug>-s<n>` and `qa/<slug>`.
- The QA pin `QA loads diagnosing-bugs on demand` is at `scripts/test/pilot-agents.test.mjs:1285`. `check-references` checks
  only `${CLAUDE_PLUGIN_ROOT}` paths, not bare skill names.
- `gate.yml` has `contents: read` and runs no comment step. ci-cross-os (yellow) owns its triggers.

**Seams** (deepening pass)

| Seam | Interface | Folded behind it | Category |
|---|---|---|---|
| `scripts/ci.mjs` (new) | `ciSummary(runId, { gh, cwd })`, `summaryLines(summary)`, `failuresOf(log)` | Prefix stripping, block parsing, the clean-and-clip, the two `gh` calls | remote-but-owned (gh injected) |
| `deck/ci-watch.mjs` (new) | `pollCi({ items, records, gh, now, note, log })`, `startCiWatch({ announce })` | The runs list, the fork filter, the window, dedupe by marker, routing, the line | local-substitutable (store via `note`) + remote (gh) |
| `noteDeck` (exists) | `noteDeck(id, text)` | The wake. Unchanged. | in-process |

Deletion test: removing `scripts/ci.mjs` would push the parse into both `pilot ci` and the watcher, so it stays. `failingNames` reads
another input (local, unprefixed output, names only) and survives. Folding it into `failuresOf` would touch `integrate.mjs` and its
five tests for no spec line, so there is **no fold slice** (L8).

## 4. Ubiquitous language

- **Red run**: a Gate workflow run of this repository's own branches whose conclusion is `failure`. A run attempt is one red run.
- **CI red line**: the one `from: 'deck'` line that announces a red run. It begins `CI red: run <id>#<attempt>`, the marker it is deduped on.
- **Failing-tests block**: the `✖ failing tests:` section the node spec reporter prints at the end of a failed job's log.
- **Routed / unrouted**: whether a red run's branch maps to a live ticket (line on the ticket) or not (line on the chat).
- **Bug path**: `diagnosing-bugs` loaded by whoever writes the fix (the implementer, or QA on its branch), fed by `pilot ci`.

## 5. Locked decisions

- **L1 CI text is data** (security). The text is cleaned and clipped, quoted inside the line, and fork runs are dropped. Only a run id that
  matches `^\d+$` goes to `gh`, as an argv element. The raw log is held in memory for one parse and never stored. The pilot's prompt says
  the line is quoted data. Rejected: passing the log through to an agent, which is 10k lines of injectable text.
- **L2 The wake is the existing deck line** (`noteDeck` + `announceChange`). There is no new wake mechanism and no new item kind.
  Rejected: posting a `report` item, which does not wake `pilot wait`.
- **L3 Parse the failing-tests block of `--log-failed`** and take passed and failed jobs from `gh run view --json jobs`. Rejected: an
  `if: failure()` step in `gate.yml` that writes a summary, because ci-cross-os owns that file and Actions cannot reach a deck on 127.0.0.1.
- **L4 Dedupe by marker** in the store's deck lines (open and closed items), within the 6 h window. No new store field.
  Rejected: a cursor field, which needs a store migration.
- **L5 Route by branch.** The branch shape gives a slug, the slug gives a run record, and the record gives an open yellow or green
  ticket. Red (planning) tickets are never routed. Rejected: routing by commit sha, which costs a `git` call per run for no case the branch misses.
- **L6 `diagnosing-bugs` loads on demand** with the Skill tool, as QA's does (independence L8), so it costs no spawn context.
- **L7 The routing rule is the pilot's prose.** The co-pilot gets the line by `SendMessage` and writes the fix brief, which names `pilot ci <id>`
  and the skill. The crew never reads a raw log.
- **L8 No fold of `failingNames`** (§3). Tradeoff: two parsers of `✖` lines, on different inputs.
- **L9 QA environment** (user, itm_6fcfb321b58e): a live red run on this repository's Actions, from a scratch branch with one deliberately red test, dispatched and deleted after. Also the deck, and the local Windows (`npm test`) and WSL (`node scripts/gate.mjs`, five times) suites.
- **L10 Depth** (user, itm_347cf0c7f44f): grill the forks only. A1–A4 are those forks, and nothing more is asked.

## 6. Assumed decisions

- **A1 Poll in the deck daemon every 5 min**, only for repositories with an open ticket (itm_2e9ff4aae745). Tradeoff: a red run while
  the deck is off, older than 6 h when it returns, is missed. Rejected: polling inside `pilot wait`, which dies with the session and repeats per wait.
  Verdict: stands — the queued ticket other-host (itm_b18bcafffbce) will abstract the GitHub calls; the poller sits behind the same injectable gh seam as `openRuns`, so it moves with them.
  Answer: the user chose "Daemon poll, 5 min" (default) on itm_2e9ff4aae745, 2026-10-21. Settled.
- **A2 Unrouted goes to the chat, and the pilot proposes** (itm_9777b734b8eb). Tradeoff: one pilot turn per unrouted red run, and spec 5's
  evidence becomes a chat line plus a pin instead of a proposal item. Rejected: the daemon posting the proposal, because it cannot fill
  Found or Estimate.
  Verdict: stands — matches ticket-making: no ticket without the user's yes.
  Answer: the user chose "Chat line, pilot proposes" (default) on itm_9777b734b8eb, 2026-10-21. Settled.
- **A3 All own-branch runs count**: push, PR (draft or not), dispatch and schedule, with forks excluded (itm_d9ad308820aa). Tradeoff:
  scratch dispatches are reported too. Rejected: only `pilot` and open PRs, which misses the dispatch that started this ticket.
  Verdict: stands — the motivating run was a dispatch on a fix branch.
  Answer: the user chose "All own-branch runs" (default) on itm_d9ad308820aa, 2026-10-21. Settled.
- **A4 Add `pilot ci <run-id>`** as spec 7 (itm_861cad618f35). Tradeoff: one more subcommand. Rejected: the summary only in the line.
  Verdict: stands — the crew reads a 40-line summary instead of a 10k-line log; the user asked for a workflow the agents can use.
  Answer: the user chose "Add pilot ci" (default) on itm_861cad618f35, 2026-10-21. Settled.
- red team: S1 and S2 each half-built `cleanField`. S1 quoted the branch and S2 cleaned test text, which would have needed two cleaners or an `after` that serialises the skeleton. Now S1's line carries no free text: the run id and attempt are integers, the event is from a fixed list, and the URL is shape-checked. S2 owns the one cleaner, and S3 adds the branch through it.
- red team: S2's red step adds `ci` to `pilot help`. `scripts/test/operating-commands.test.mjs:14` fails on any help subcommand that is
  neither in `NON_MOVING` nor documented under `docs/OPERATING.md` "Commands under the hood". S2 now owns that test and adds `ci` to `NON_MOVING`.
- red team: `noteDeck` throws on a missing item (`threadIn`, `store-items.mjs:243`). A polled repository has an open ticket, so it is
  registered and its chat exists (`store-core.mjs:625`). `pollCi` still catches a throw per run and logs one line (S1 test 4).
- red team: S1 was cut on the belief that `announceChange` was private, which would have meant an edit to `server-wait.mjs` (769 of the
  800-line bar in `deck/test/facades.test.mjs`). It is exported (`server-wait.mjs:765`), and S1 does not touch the file.
- red team: S1 and S3 could each have half-built `pollCi`'s routing input. S1's `pollCi` takes no `records`. S3 adds `records` and owns
  that change. The daemon's one call, `startCiWatch({ announce })`, stays as it is, and S3 does not touch `daemon.mjs`.
- red team: the daemon exits after 10 idle minutes with no `claude` process (`deck/idle.mjs`). A red run during that gap is caught by the
  6 h window when the deck restarts, which A1's tradeoff covers.
- red team: S4 edits `agents/pilot.md`, whose size `scripts/test/measure-prompt.test.mjs` pins, so S4 owns that test.

## 7. Out of scope

- Any change to `.github/workflows/gate.yml` (ci-cross-os) or `claude.yml`.
- Re-running a red job, auto-labelling flaky tests, or fixing anything automatically.
- Other workflows than Gate, and other CI hosts.
- Folding `failingNames` (L8).
- A `pilot doctor` row for gh auth.

## 8. Slices

Width 3; longest stem 2 (S1 → S3).

| # | Title | Spec | Files owned | After | Reviewers | File |
|---|---|---|---|---|---|---|
| S1 | Walking skeleton: a red run wakes the pilot on the chat | 2 (run, url), 3, 4 (fork, shape), 6 | `deck/ci-watch.mjs` (new), `deck/daemon.mjs`, `deck/test/ci-watch.test.mjs` (new) | – | ts, security | [S1](slices/S1.md) |
| S2 | `pilot ci <run>` prints the failing tests | 4 (clip, argv), 7 | `scripts/ci.mjs` (new), `scripts/test/ci.test.mjs` (new), `scripts/test/fixtures/ci/run-39530951687.log` (new), `bin/pilot.mjs`, `scripts/test/operating-commands.test.mjs` | – | ts, security | [S2](slices/S2.md) |
| S3 | The CI red line names the failing tests and goes to its ticket | 2, 5 | `deck/ci-watch.mjs`, `deck/test/ci-route.test.mjs` (new) | S1 (ci-watch.mjs), S2 (ciSummary) | ts, security | [S3](slices/S3.md) |
| S4 | The crew's bug path, in prose and ADR | 1, 5 (pilot's route), 8 | `agents/pilot-implementer.md`, `agents/pilot-co-pilot.md`, `agents/pilot.md`, `scripts/test/pilot-agents.test.mjs`, `scripts/test/measure-prompt.test.mjs`, `docs/adr/NNNN-debug-workflow.md` (new), `docs/adr/README.md` | – | ts, security | [S4](slices/S4.md) |

## 9. Acceptance evidence

On a scratch branch with one deliberately red test, dispatched on Actions (the QA environment, itm_6fcfb321b58e):

1. Within 5 min of the run concluding, a CI red line appears on the deck's chat. It names the run, the branch, the red jobs, the
   planted test as `file:line name: "message"`, and the jobs that passed. The pilot's `pilot wait` wakes on it.
2. Polled again, the same run yields no second line.
3. The same red test on a `slice/<slug>-s1` branch of a live ticket puts the line on that ticket's item instead.
4. `pilot ci <run-id>` prints the same tests, with every failing one, in at most 40 lines.
5. The pilot routes it. An unrouted line becomes a proposal question, and a routed one goes to the co-pilot, whose fix brief names `pilot ci` and `diagnosing-bugs`.
6. `docs/adr/README.md` lists the ADR. The suite is green on Windows (`npm test`) and five times in WSL (`node scripts/gate.mjs`).

## 10. Status

| Slice | State | Branch | PR | Worktree | Blockers | Spec |
|---|---|---|---|---|---|---|
| S1 | planned | | | | – | 2, 3, 4, 6 |
| S2 | planned | | | | – | 4, 7 |
| S3 | planned | | | | S1, S2 | 2, 5 |
| S4 | planned | | | | – | 1, 5, 8 |
| debug-workflow | planned | feat/debug-workflow | | | S1, S2, S3, S4 | 1-8 |
