# A failing run has a debugging workflow

Feature `debug-workflow` · ticket `itm_ddffb46808eb` · base `feat/debug-workflow` from `origin/pilot` (18a5d2f0) · ADR NNNN

## 1. Problem

"Do we have a debugging workflow in place anywhere? Any agent? Skill?" The user asked this after pasting a red CI run into
the deck's chat by hand. Two gaps sit behind the question.

- `diagnosing-bugs` is vendored, but only QA is told to load it. The implementer, who writes every fix, never is.
- Nothing reads a red Actions run. The pilot learnt of run 39530951687 only because the user typed it in. That run's
  `gh run view --log-failed` output is 10,269 lines, and an explorer had to dump it and grep it to find the eight failing tests.

Re-cut (itm_22c8c585ac73, "Crew bug path only"): the user rejected a GitHub-centred fix for the second gap, "i dont want this
to be github centred, what if someone is using other vcs?" This run closes the first gap only.

## 2. Spec

Agreed by the user on itm_95ade1208a01; re-cut on itm_22c8c585ac73.

| # | Behaviour | Evidence (bar) |
|---|---|---|
| 1 | The implementer loads `pilot:diagnosing-bugs` with the Skill tool on demand, not in its frontmatter, in two cases: on a fix brief that carries a bug, and on a phase-gate red it calls `regression`. A co-pilot's fix brief that carries a bug names the skill. QA's line is unchanged. (practitioner: a debugging lead, who starts from the red that stays red rerun alone, the `regression` call, not from a guess.) | 2 new pins in `scripts/test/pilot-agents.test.mjs` beside the QA pin at :1285, one for the implementer and one for the co-pilot. 0 `skills:` fields name the skill. A pin asserts that `skills/diagnosing-bugs/SKILL.md` exists. `check-references` exits 0. |
| 2 | An ADR records the crew's bug path. (Was spec 8.) | `docs/adr/NNNN-debug-workflow.md` is listed in `docs/adr/README.md`, and `npm run adr-index -- --check` exits 0. |

Dropped on itm_22c8c585ac73: former spec 2 (CI red line), 3 (announce once), 4 (CI text as data), 5 (routing), 6 (watcher
cost), 7 (`pilot ci`). Each stood on reading GitHub Actions. overridden: the user rejected a GitHub-centred design; other VCS hosts must not be second-class.

## 3. Findings

**What exists**
- The QA pin `QA loads diagnosing-bugs on demand` is at `scripts/test/pilot-agents.test.mjs:1285`: `skills:` must not name it, and
  the body must match `/Skill tool[^.]*`pilot:diagnosing-bugs`/`. The new pins copy its shape.
- The implementer calls each red rerun alone `flake` or `regression` in `## The loop` (`agents/pilot-implementer.md:74`). Its
  `## A fix brief` (:140) carries the pilot's kept findings; neither names the skill.
- The co-pilot judges step 7's findings before a fixer sees them (`agents/pilot-co-pilot.md:53`, `## Steps 4 to 8`) and writes that fix brief.
- `scripts/test/implementer-steps.test.mjs` pins phrases in `Where you work` and `The loop`; a sentence added inside step :74 keeps them.
- `scripts/test/measure-prompt.test.mjs` pins only the pilot's, explorer's and architect's shares (:189, :207, :224), so S1 does not own it.
- `check-references` checks only `${CLAUDE_PLUGIN_ROOT}` paths, not bare skill names. ADRs end at 0173; `npm run adr-index` builds the README.

**Seams** (deepening pass)

| Seam | Interface | Folded behind it | Category |
|---|---|---|---|
| `agents/pilot-implementer.md` | `## A fix brief`, `## The loop` (the `regression` call) | When to load the bug path | in-process (prompt prose, pinned by phrase) |
| `agents/pilot-co-pilot.md` | `## Steps 4 to 8` (step 7's fix brief) | Naming the skill in a bug's fix brief | in-process (prompt prose, pinned by phrase) |

Deletion test: no module is added. The former `scripts/ci.mjs` and `deck/ci-watch.mjs` seams are withdrawn with spec 2-7. No fold slice.

## 4. Ubiquitous language

- **Bug path**: `diagnosing-bugs` loaded with the Skill tool by whoever writes the fix (the implementer, or QA on its branch).
- **Fix brief**: the brief a fixer gets on an existing branch; it "carries a bug" when a kept finding or red is a defect, not a tidy.
- **Regression**: the implementer's call on a test red that stays red rerun alone (`pilot-implementer.md:74`); the other call is `flake`.

## 5. Locked decisions

- **L1 CI text is data** (security): cleaned, clipped, quoted, forks dropped. overridden: the user rejected a GitHub-centred design; other VCS hosts must not be second-class.
- **L2 The wake is the existing deck line** (`noteDeck` + `announceChange`). overridden: the user rejected a GitHub-centred design; other VCS hosts must not be second-class.
- **L3 Parse the failing-tests block of `--log-failed`**. overridden: the user rejected a GitHub-centred design; other VCS hosts must not be second-class.
- **L4 Dedupe by marker** in the store's deck lines. overridden: the user rejected a GitHub-centred design; other VCS hosts must not be second-class.
- **L5 Route by branch** to a live ticket's co-pilot. overridden: the user rejected a GitHub-centred design; other VCS hosts must not be second-class.
- **L6 `diagnosing-bugs` loads on demand** with the Skill tool, as QA's does (independence L8), so it costs no spawn context.
  Rejected: a `skills:` preload, paid on every implementer spawn though most slices fix no bug.
- **L7 The co-pilot's fix brief names the skill** when it carries a bug, so the fixer loads it without re-deriving the call.
  Rejected: the implementer's prose alone, which a narrow fix brief can crowd out. Its former half (the CI red line by
  `SendMessage`, `pilot ci <id>` in the brief): overridden: the user rejected a GitHub-centred design; other VCS hosts must not be second-class.
- **L8 No fold of `failingNames`**, moot with spec 7. overridden: the user rejected a GitHub-centred design; other VCS hosts must not be second-class.
- **L9 QA environment** (user, itm_6fcfb321b58e; reduced on itm_22c8c585ac73): the local Windows suite (`npm test`), the WSL gate
  (`node scripts/gate.mjs`, five times) and `node scripts/check-references.mjs` on this repository. Its live Actions run:
  overridden: the user rejected a GitHub-centred design; other VCS hosts must not be second-class.
- **L10 Depth** (user, itm_347cf0c7f44f): grill the forks only, and nothing more is asked.
- **L11 Crew bug path only** (user, itm_22c8c585ac73): nothing host-specific, so no CI poller, no `pilot ci`, no `gh`.
  Rejected: the CI watcher of the first cut, and the same watcher on another host's API. A red CI run still reaches the crew
  as the user pastes it, and the bug path then applies to its fix.

## 6. Assumed decisions

None standing.

- **A1 Poll in the deck daemon every 5 min** (itm_2e9ff4aae745, settled). overridden: the user rejected a GitHub-centred design; other VCS hosts must not be second-class. Verdict: overturned: the user rejected the GitHub-centred design on itm_22c8c585ac73; no replacement, the behaviour is out of scope (L11).
- **A2 Unrouted goes to the chat, and the pilot proposes** (itm_9777b734b8eb, settled). overridden: the user rejected a GitHub-centred design; other VCS hosts must not be second-class. Verdict: overturned: the user rejected the GitHub-centred design on itm_22c8c585ac73; no replacement, the behaviour is out of scope (L11).
- **A3 All own-branch runs count** (itm_d9ad308820aa, settled). overridden: the user rejected a GitHub-centred design; other VCS hosts must not be second-class. Verdict: overturned: the user rejected the GitHub-centred design on itm_22c8c585ac73; no replacement, the behaviour is out of scope (L11).
- **A4 Add `pilot ci <run-id>`** (itm_861cad618f35, settled). overridden: the user rejected a GitHub-centred design; other VCS hosts must not be second-class. Verdict: overturned: the user rejected the GitHub-centred design on itm_22c8c585ac73; no replacement, the behaviour is out of scope (L11).
- red team: the seven finds of the first cut (`cleanField`, `operating-commands`, `noteDeck` on a missing item, `announceChange`,
  `pollCi`'s `records`, the daemon's idle exit, the pilot prompt pin) retire with the old S1-S4.
- red team: S1's first red step walked against the real files. `implementer-steps.test.mjs` pins `The loop` by phrase, so the
  Skill sentence goes inside step :74 and adds no numbered step. `measure-prompt` pins neither the implementer nor the co-pilot,
  so S1 owns no size pin. `model-policy.test.mjs:65` reads the co-pilot's Model line, which S1 leaves as it is. One slice, so no seam is half-built by two.

## 7. Out of scope

- Reading any CI host's runs, logs or checks: no CI poller, no `pilot ci`, no `gh` call (L11).
- Any change to `.github/workflows/gate.yml` (ci-cross-os) or `claude.yml`.
- Any change to `skills/diagnosing-bugs/` (vendored) or to QA's line.
- Re-running a red job, auto-labelling flaky tests, or fixing anything automatically.

## 8. Slices

Width 1; longest stem 1. The old S1-S3 (CI watcher, `pilot ci`, routing) are retired and their files deleted; the old S4, cut to the bug path, is S1.

| # | Title | Spec | Files owned | After | Reviewers | File |
|---|---|---|---|---|---|---|
| S1 | The crew's bug path, in prose and ADR | 1, 2 | `agents/pilot-implementer.md`, `agents/pilot-co-pilot.md`, `scripts/test/pilot-agents.test.mjs`, `docs/adr/NNNN-debug-workflow.md` (new), `docs/adr/README.md` | – | ts, security | [S1](slices/S1.md) |

## 9. Acceptance evidence

1. `agents/pilot-implementer.md` tells the implementer to load `pilot:diagnosing-bugs` with the Skill tool on a fix brief and on a
   red it calls `regression`; its `skills:` field does not name it. QA's line reads as before.
2. `agents/pilot-co-pilot.md` names the skill in a fix brief that carries a bug.
3. The three new pins and the QA pin pass; `node scripts/check-references.mjs` exits 0.
4. `docs/adr/README.md` lists the ADR and `npm run adr-index -- --check` exits 0. The suite is green on Windows (`npm test`) and
   five times in WSL (`node scripts/gate.mjs`).

## 10. Status

| Slice | State | Branch | PR | Worktree | Blockers | Spec |
|---|---|---|---|---|---|---|
| S1 | planned | | | | – | 1, 2 |
| debug-workflow | planned | feat/debug-workflow | | | S1 | 1-2 |
