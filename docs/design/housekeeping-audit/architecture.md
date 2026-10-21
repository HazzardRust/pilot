# Housekeeping audit — architecture artefact

Feature: **housekeeping-audit** · slug `housekeeping-audit` · integration branch `feat/housekeeping-audit` · base
`main` at `6addeef` (v0.7.2) · architect branch `design/housekeeping-audit`.

## 1. Problem

"One read-only agent pass over the whole repository that asks *what here makes an agent slow, expensive or
error-prone?*, measures instead of guessing, and hands back a ranked list of fixes." It runs on demand ("audit this
repo for agents") or once when the pilot is first used on a repository, never every run. It changes nothing; the user
picks which fixes become tickets for later runs. Today the only ledger is ADR 0036's friction rows, which see only what one run happened
to trip over.

## 2. Spec

Accepted by the user as proposed (grilling depth *forks*). On 2026-09-27 the user restored line 4 (every ten runs),
added line 15 (the open area) and chose Opus for line 13 (L14–L17); lines marked *assumed* were told to them.

| # | Behaviour | Evidence |
|---|---|---|
| 1 | **On demand.** In any Claude session in a repository, "audit this repo for agents" or `/pilot:audit` runs one audit pass | the ranked list arrives on the deck as one `audit` item; `git status --porcelain`, `git branch -a`, `git stash list`, `git worktree list` identical before and after; no PR |
| 2 | **Scratch only.** Installs, test runs, timings and the preview happen in one `git worktree add --detach` outside the repository, removed at the end *(assumed)* | the report names the scratch path; it is absent from `git worktree list` afterwards; no branch was created |
| 3 | **First use.** The first piloted run in a repository the audit was never offered in posts the offer as one `question` beside the grilling-depth question; either answer records it, so the next run does not ask; under full auto it is neither posted nor recorded (L13). Repositories already piloted get the offer once *(A9)* | `pilot audit due` exits 0 on a fresh repo and 1 after the answer; the item shows on run 1, not run 2 |
| 4 | **Every ten runs.** At the start of the tenth piloted run since the last audit or offer, the same offer is posted beside the depth question; never an audit started unasked; skipped under full auto, the count keeping its place (L15) | `pilot audit due` exits 1 after nine counted runs and 0 on the tenth; counting one run twice leaves the count unchanged |
| 5 | **Setup cost** from the scratch worktree: steps and minutes until tests run, missing install scripts, env vars the code reads that no `.env.example` or doc names, services it expects. Services are detected, never started; env vars by name, never value | each row cites the command, exit code, seconds and an output excerpt |
| 6 | **Feedback loops**: the full suite run twice (a differing result is a flake), one test file alone, typecheck and lint scripts present or not, each command under a timeout | command, exit code, seconds; the differing test names |
| 7 | **Navigability**: files over the size an agent must read whole, dead code, duplicate modules, unclear entry points, a missing architecture map or glossary | path and line counts per row |
| 8 | **Context load**: always-loaded tokens per source — the repo's `CLAUDE.md` files and `.claude/`, and the user's `~/.claude` `CLAUDE.md`, rules and path-scoped rules matching this repo's files (ADR 0036's `react/` example) — bytes/4, labelled an estimate *(assumed: scope, A4)* | a per-source token table; each path rule with the files it matches |
| 9 | **Tooling**: missing MCP servers or CLIs that would replace manual multi-step work; hooks that fire broadly or inject much, with matcher and payload size (measured when the hook runs side-effect-free on a sample input, else estimated from source and labelled) | the settings or hooks file line and the size |
| 10 | **Preview and seeds**: the audit starts the preview in the scratch worktree under a timeout and reports whether and where it came up; it finds the one-command seed path or its absence, and never seeds or migrates any database *(assumed)* | the command, the URL or the timeout; the seed script's file:line |
| 11 | **Failure is a finding**: a failed install, a hung suite or a timeout becomes a row with its output, the pass continues, and the report lists what it could not measure | a fixture with a broken install still yields a report |
| 12 | **Output**: one list ranked by estimated saving per run against effort — finding · evidence · saving/run · fix · effort — each fix phrased as a candidate slice; on the deck as one `audit` item (L12), and kept as a file in the deck store outside the repo *(assumed: A3 for the deck form)* | the deck item; the file path it names |
| 13 | **Cost**: one auditor measuring setup, loops and preview itself, with read-only explorers for navigability and context/tooling, the auditor on Opus (L14), explorers at the model each area names *(assumed)*; about 100–150k tokens; the report states its tokens and minutes and what it skipped | the report's cost line |
| 14 | **Picking**: the user replies with row ids; each picked row's spec-shaped text (problem plus numbered behaviours with evidence) is posted as one `ticket` item in that repository, only on the pick; no session is started, and the chain takes the tickets in order (L11) | each ticket's body is the row's spec text verbatim; `pilot run` there starts the head ticket with that body |
| 15 | **Open area.** After the named areas the auditor reports anything else it met that makes an agent slow, expensive or error-prone here, at most 10 rows, each under L4 and ranked by L6 (L17) | every open row cites a command and its output; `validateReport` refuses an eleventh open row |

## 3. Findings

- **Precedent for an on-demand pass beside the crew**: `skills/policy-review`, invoked as `/pilot:policy-review`, fans
  out reviewers and is called by no step (`skills/pilot/SKILL.md:26`). The audit is `skills/audit/`, the same shape.
- **The explorer cannot measure setup.** `agents/pilot-explorer.md` "Read only" forbids installs and servers, and its
  budget pin has 12 tokens of headroom (2138 of 2150 measured on `6addeef`, `scripts/test/measure-prompt.test.mjs:114`). The explorer is
  used as it stands, briefed by path; its file is not edited.
- **ADR 0036 says "there is no separate audit pass"**, as does `skills/pilot/SKILL.md:473` ("Ending a run", from
  :456). The clause stays true inside a run; ADR 0040 amends 0036 for an on-demand, first-use pass.
- **Deck kinds**: an unknown kind is accepted with `GENERIC_SPEC`, a typed reply and no buttons (`deck/items.mjs:267-279`,
  :259). An open one is queued (`:383`) and so listed in its tab's queue (`deck/tabs.mjs:62,97`), but never in a
  `Yours` cell (`:406-414`), and the user may dismiss it (`deck/store.mjs:721-730`). `deck_wait` hands back user
  replies on any kind (`deck/store.mjs:787-797`). A `spec` or `signoff` is refused while any `question` in the
  directory is open (`deck/store.mjs:462-473`, `GATED_KINDS` `deck/items.mjs:75`). `report` and `ticket` are standing
  kinds, never waiting on the user (`deck/items.mjs:51-68`). `deck/ui/markdown.mjs` renders no tables.
- **Sessions**: the daemon starts none (ADR 0039); `deck_launch` is gone and no crew prompt or the pilot skill may name
  it or "headless" (`scripts/test/pilot-agents.test.mjs:682-688`, `deck/test/routing.test.mjs:74`). Work agreed in a
  thread is a `ticket` item, never posted without the user's words (`agents/pilot.md:50-52`); when a run finishes
  cleanly, or `pilot run` starts, `chainNext(repo)` hands the oldest open ticket's body to the next session and takes the
  ticket (`deck/chain.mjs:26-43`). Glossary: `Ticket`, `Chain hand-off`, `Report`, `Standing kind` (`CONTEXT.md:111-125`).
- **No per-repo run count exists**, but one is now cheap: `deck.records` keeps one record per directory and slug, never
  pruned (`deck/store.mjs:1076-1095`), so distinct slugs per `repoKey` count features piloted since run-record shipped
  (L15 rejects it for that). The audit keeps its own record under `storeDir()` (`deck/store.mjs:148`), keyed by `repoKey`
  (`deck/items.mjs:401`).
- **`scripts/measure-prompt.mjs`** measures this package's agents only; `unconditionalRuleBytes(home)` (`:61`) sums
  and skips `paths:` rules, so per-source and path-rule measurement is new code.
- **Budgets** (own share = definition + skills + tools, tokens, measured on `6addeef`): pilot 9651 of 9800
  (1472 + 6676 + 1503; 149 free); QA 5498 of 5500 (`scripts/test/qa-preview.test.mjs:111`); explorer 2138 of 2150.
- **Registration pins**: `scripts/test/install.test.mjs:827` pins 17 agent files against the README's `agents/` row;
  `scripts/test/pilot-agents.test.mjs:28` `CREW` must equal the Models table (`:130`), and an agent the pilot spawns
  must be in `agents/pilot.md`'s `Agent(...)` list. A file with no provenance header is own work
  (`scripts/check-provenance.mjs:24`). `${CLAUDE_PLUGIN_ROOT}/…` references must exist (`scripts/check-references.mjs:63`).

## 4. Ubiquitous language

- **Audit**: one on-demand pass over one repository producing one report. Never per run, never a fix.
- **Auditor**: `pilot-auditor`, the Opus agent that runs the audit, measures in the scratch worktree and judges.
- **Scratch worktree**: the detached worktree outside the repository the auditor measures in and removes.
- **Area**: one measured concern, briefed by a file in `skills/audit/areas/`, owned by the auditor or an explorer;
  `open` is the auditor's area for what no named area covers (spec 15).
- **Row**: one finding with its evidence (command and output), saving per run, fix, effort and spec text.
- **Audit report**: the ranked rows plus cost and what went unmeasured, saved as a file in the deck store and posted
  as one `audit` item that waits for picks. Never a `Report`, the glossary's standing closing-report kind.
- **Offer**: the first-use question; answered once per repository.
- **Pick**: the user's typed reply of row ids on an audit report; the only words that post a `ticket` from it.

## 5. Locked decisions

| # | Decision | Rationale · rejected |
|---|---|---|
| L1 | Grilling depth is *forks* | Decided by the user |
| L2 | "Read-only" means the repository's tracked files, branches, stashes, remotes and shared worktree are untouched; measurement runs in a detached scratch worktree | Spec 2. Rejected: guessing setup cost from docs, which is what the user asked the audit not to do |
| L3 | The report file lives in the deck store, `audits/<repo key>/<stamp>.md` beside `<stamp>.json` | Spec 12; ADR 0006's pattern keeps git clean. Rejected: `docs/` in the target repo |
| L4 | Every row must carry a command and its output, and spec text; `saveReport` refuses a report with a row that does not | "Measures instead of guessing" is enforced in code, not only prose. Rejected: a prose-only rule |
| L5 | Areas are files in `skills/audit/areas/`, each with frontmatter naming its owner; the auditor reads every file there | A new area adds a file, so S2–S4 own disjoint files and run in parallel. Rejected: an area table in `skills/audit/SKILL.md` all three would edit |
| L6 | Ranking is deterministic: score = (minutes + tokens/1000) per run ÷ effort weight (S 1, M 3, L 8), ties by area then finding | One ordering the tests can pin; the exchange rate is printed in the report header. Rejected: the auditor ordering by judgement |
| L7 | New ADR 0040 amends 0036: an on-demand or first-use audit, never a standing per-run pass | The audit contradicts 0036's sentence; the record must say why |
| L8 | Slices follow the architect-depth format: slice files under `slices/`, nothing Gate 1 needs only there | The brief's format |
| L9 | The SKILL.md edit is confined to step 1 and the Models table | The pilot's ruling; keeps clear of "Ending a run" and "When your own context fills" |
| L10 | *(was A8)* The 9800 pilot pin stays and S5 needs no trim: the step-1 sentence, the Models row and the `Agent(...)` entry and the every-ten clause cost about 100 tokens against 149 free (§3) | Measured, not estimated. Rejected: a trim nobody needs, or raising the pin. If another merge eats the headroom first, S5 trims a restatement in step 1 |
| L11 | *(was A5; the user's)* A pick posts one `ticket` per picked row, body the row's spec text verbatim, title `Audit F<n>: <finding>`; it never starts a session. The pick reply is the user's words the ticket rule needs | ADR 0039 and the user's standing rules: no headless sessions, all work a deck item, one run per deck in succession. Rejected: `deck_launch`, now deleted |
| L12 | The audit report posts as its own kind `audit`: neither a `question`, which would refuse the pilot's `spec` and `signoff` while open during a run (`deck/store.mjs:462-473`), nor a `report`, which is standing and never waits for the user | A reply on any kind wakes `deck_wait` (`deck/store.mjs:787-797`); L16 makes `audit` a known kind |
| L13 | *(assumed, told to the user)* Under full auto the offer is neither posted nor recorded | Full auto takes each item's default, and a default of either answer is wrong: yes spends 100–150k tokens unasked, no records a refusal the user never gave |
| L14 | *(was A1; the user's)* `pilot-auditor` runs on Opus; the explorers keep a model per area, navigability Sonnet and context/tooling Haiku *(assumed, told to the user)* | "Runs occasionally, hopefully like once a week … a stronger model pays off." Rejected: Sonnet |
| L15 | *(was A2; the user's)* The offer repeats every `OFFER_EVERY_RUNS = 10` piloted runs, counted in the audit's own record: `pilot audit count <run key>` adds a run key once, `pilot audit due` only reads; an answered offer or a saved report resets the count *(counting and reset assumed, told to the user)* | A key already counted is a no-op, so a step 1 run twice counts once. The run key is the run's slug, `<slug>#<n>` for run n ≥ 2 of a split feature. Rejected: `deck.records`, which counts features; `due` bumping, which double-counts |
| L16 | *(was A10; the user's)* `audit` is a known kind: in `Yours`, a `none` button beside the typed reply, not dismissable, gating nothing | Easy to lose in a live run otherwise. Rejected: the unknown kind |
| L17 | *(the user's)* An `open` area owned by the auditor, at most 10 rows under L4 and L6; `validateReport` refuses an eleventh | Refused rather than dropped, so the auditor chooses which ten, and L4's "refuse, never guess" holds. Rejected: silent truncation |

## 6. Assumed decisions awaiting the user

| # | Default taken | Tradeoff |
|---|---|---|
| A1 | *Decided: L14* | – |
| A2 | *Decided: L15* | – |
| A3 | **Deck body is a numbered list** in the `audit` item (typed ids or `none`); the table is in the file | No change to the deck's escaping module. Alternative: pipe-table rendering in `deck/ui/markdown.mjs`, a slice with hostile-input tests |
| A4 | **Scope inherits ADR 0036**: the repo and the machine config loaded in it; never the pilot's own agent or skill prompts (`measure-prompt`, `context-budget` cover those) | Keeps the boundary 0036 drew. Alternative: one place for all context cost |
| A5 | *Withdrawn: became L11* | – |
| A6 | **Tests**: unit tests for every deterministic module, prose pins for the auditor's rules, and a fixture repository with planted friction that QA audits live for recall; no CI test spawns an agent | Recall on the real agent is checked once at QA, not per commit |
| A7 | **Inside a run** the auditor runs in the background and its explorers one at a time, so the run stays at eight agents; tickets picked mid-run chain only after that run finishes cleanly | Timings beside a live run are noisier; the report says so. Alternative: audit before step 2, the run waiting 30–60 minutes |
| A8 | *Withdrawn: decided by measurement, became L10* | – |
| A9 | **Existing repositories** get the offer once after release (no audit record yet) | They were never offered it; one question per repo |
| A10 | *Decided: L16* | – |

## 7. Out of scope

- Applying any fix; the audit posts and stops (ADR 0036).
- Any write to the run record or `deck/chain.mjs`, and `skills/pilot/SKILL.md`'s "Ending a run"
  and "When your own context fills".
- The closing `report` item, its friction section, and anything analytics will touch.
- Measuring the pilot's own agent prompts (A4).
- Improvements to the system in general (product, architecture, security): offered as its own run, not taken.
- Table rendering on the deck (A3); starting any session, on a pick or otherwise (L11, ADR 0039).
- Seeding or migrating any database, and starting any service other than the preview (spec 10).

## 8. Slices

`S1 → {S2, S3, S4, S5, S7}`, `{S5, S7} → S6`. S2, S3, S4 and S7 each add one area file plus their own tests, so they run
in parallel with each other and with S5; S5 and S6 share `deck/audit.mjs` and `bin/pilot.mjs`, so S6 follows S5, and S6
follows S7 so its fixture plants an open-area item. S1's `validateReport` carries L17's ten-row cap; S7 the area.

| Slice | Delivers | Files owned | After | Detail |
|---|---|---|---|---|
| **S1 Asking for the audit runs a loops pass and posts a ranked, evidenced list, leaving the repo untouched** (walking skeleton) | 1, 2, 6, 11, 12, 13 | `agents/pilot-auditor.md` (new), `skills/audit/SKILL.md` (new), `skills/audit/areas/loops.md` (new), `deck/audit.mjs` (new), `deck/test/audit.test.mjs` (new), `bin/pilot.mjs`, `scripts/test/audit-agent.test.mjs` (new), `scripts/test/install.test.mjs`, `README.md`, `deck/items.mjs`, `deck/test/items.test.mjs`, `deck/test/audit-kind.test.mjs` (new) | – | [slices/S1.md](slices/S1.md) |
| **S2 The report shows setup cost and whether the preview comes up** | 5, 10 | `skills/audit/areas/setup.md` (new), `scripts/test/audit-setup.test.mjs` (new) | S1 | [slices/S2.md](slices/S2.md) |
| **S3 The report shows what makes the code hard to navigate** | 7 | `skills/audit/areas/navigability.md` (new), `scripts/test/audit-navigability.test.mjs` (new) | S1 | [slices/S3.md](slices/S3.md) |
| **S4 The report shows context load and tooling per source** | 8, 9 | `skills/audit/areas/context.md` (new), `scripts/audit-context.mjs` (new), `scripts/test/audit-context.test.mjs` (new), `scripts/test/fixtures/audit-home/**` (new) | S1 | [slices/S4.md](slices/S4.md) |
| **S5 A repository's first piloted run offers the audit, and every tenth run after** | 3, 4 | `deck/audit.mjs`, `bin/pilot.mjs`, `deck/test/audit-offer.test.mjs` (new), `skills/pilot/SKILL.md` (step 1 and Models only), `agents/pilot.md`, `scripts/test/pilot-agents.test.mjs`, `CONTEXT.md`, `docs/adr/0040-the-housekeeping-audit-runs-on-demand-never-per-run.md` (new) | S1 | [slices/S5.md](slices/S5.md) |
| **S6 A picked row becomes a ticket the next run takes** | 14 | `skills/audit/SKILL.md` (Picking section), `deck/audit.mjs`, `bin/pilot.mjs`, `deck/test/audit-pick.test.mjs` (new), `fixtures/audit-repo/**` and `fixtures/audit-repo-broken/**` (new), `README.md` (layout row) | S5, S7 | [slices/S6.md](slices/S6.md) |
| **S7 The report ends with what else the auditor met** | 15 | `skills/audit/areas/open.md` (new), `scripts/test/audit-open.test.mjs` (new) | S1 | [slices/S7.md](slices/S7.md) |

The fixture repository with planted friction (A6) lands in S6, last, so it can plant one item per area S2–S4 and S7 shipped;
QA audits it live. S6 follows S5 only for the shared files; S2–S4 need not be integrated first, but the fixture's
planted items for their areas are only checkable once they are.

## 9. Acceptance evidence, in the order the user meets it

1. In a plain session in this repository, `/pilot:audit`: the auditor runs; the deck shows one `audit` item with a numbered,
   ranked list, each row with its command and output, the cost line and the unmeasured list, the item in `Yours` with a `none` button (spec 1, 6, 11, 12, 13);
   its open rows, at most ten, each cite a command (spec 15).
2. `git status --porcelain`, `git branch -a`, `git stash list`, `git worktree list` match the snapshot taken before
   (spec 1, 2); the report file exists at the path the item names (spec 12).
3. The list carries setup and preview rows with seconds and the URL or timeout, and no database was touched (spec 5, 10);
   navigability rows with line counts (spec 7); the context table per source and hook rows with matcher and size (8, 9).
4. On the fixture repository, the audit reports every planted item, and the broken-install variant still yields a
   report (spec 11, A6).
5. A fresh repository's first piloted run shows the offer beside the depth question; the second run does not (spec 3);
   with nine runs counted, the tenth shows it again, and counting a run twice changed nothing (spec 4).
6. Replying `F1, F3` to a report posts two `ticket` items whose bodies are those rows' spec text verbatim, and no
   session starts; `pilot run` in that directory then starts F1's ticket with that body (spec 14).

## 10. Status

| Slice | State | Branch | PR | Worktree | After | Delivers |
|---|---|---|---|---|---|---|
| S1 Audit runs a loops pass and posts a ranked, evidenced list | planned | | | | – | 1, 2, 6, 11, 12, 13 |
| S2 Setup cost and the preview | planned | | | | S1 | 5, 10 |
| S3 Navigability | planned | | | | S1 | 7 |
| S4 Context load and tooling | planned | | | | S1 | 8, 9 |
| S5 First piloted run offers the audit, and every tenth after | planned | | | | S1 | 3, 4 |
| S6 A picked row becomes a ticket the next run takes | planned | | | | S5, S7 | 14 |
| S7 The open area | planned | | | | S1 | 15 |
| feature housekeeping-audit | planned | `feat/housekeeping-audit` | | | S2, S3, S4, S6 | 1–15 |
