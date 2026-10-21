# verdict-pass: the pilot gives a verdict on every assumed decision before Gate 1

Ticket itm_a34a2ad27b29 · base `pilot` 2bbbc8fe · design branch `design/verdict-pass`

## 1. Problem

The architect stashes decisions it thinks are the user's, and the pilot passes them on to the user. The pilot can see things the architect cannot (the queue, other runs' overlaps, the user's recorded preferences), but that judgement happens only informally, when the pilot happens to reach for it. The user wants it to be a mechanism: one verdict per assumed decision, written into the artefact, and a `gate1` the deck refuses until every A‹n› has one. The user also wants the principle behind it recorded in their own words: "an emergent positive behaviour becomes a deterministic mechanism". The auditor should then look for more such behaviours and measure them as a cost.

## 2. Spec

| # | Behaviour | Evidence |
|---|---|---|
| 1 | When the architect stashes a decision, it takes the default, writes A‹n› with the default, the tradeoff and the rejected path, sends it to `main`, and carries on without waiting. | A wording pin on `agents/pilot-architect.md`; this run's own architect transcript shows no wait after a stash (A1). |
| 2 | Once the cut lands, and before any design-tree item goes to the user, at every depth including *No grilling* (A5), the pilot writes one `Verdict: stands` or `Verdict: overturned: <why>` line under each §6 A‹n›, on vantage grounds: the queue, other runs' overlaps, the user's recorded preferences. | A wording pin on `agents/pilot.md` step 3; this run's own artefact at Gate 1 carries a verdict line per A‹n› (A1). |
| 3 | A `gate1` is refused, naming the ids, while the artefact read at its `sha` has an A‹n› with no verdict line. It passes once every A‹n› has one, and it passes when §6 has no A‹n›. In a git repository, an artefact that cannot be read at that `sha` refuses the gate1. | `deck/test/gate1-verdicts.test.mjs` on a real temp repository: refused, then passing after the commit that adds the line. |
| 4 | An overturn that moves a slice resumes the architect for a re-cut. Any other overturn is the pilot's own edit, committed on `design/<slug>`. Either way the overturned A‹n› stays in §6 with its verdict, and its replacement enters §5 as an L‹n›. | Wording pins on `agents/pilot.md` (A1). |
| 5 | At *forks* and *every*, only the A‹n› the pass leaves standing whose paths fork reach the user as questions. The `gate1` body names every A‹n› beside its verdict, and the deck refuses a body that leaves one out (A2). | A pin on step 3; a deck test refusing a gate1 whose body omits `A2`; this run's gate1 body. |
| 6 | ADR 0141 records the principle in the user's words. ADR 0142 records the verdict gate and cites it. | Both files exist and the index lists them; `npm run adr-index` and `check-references` pass. |
| 7 | The pilot's prompt-budget pin moves by exactly what the new clauses cost, and the PR names the number. The architect has no such pin and gets none (A3). | The pin diff in `scripts/test/measure-prompt.test.mjs` shows the new number and nothing else. |
| 8 | The auditor reports "behaviour re-derived per run" rows. Each is a good move agents reach on their own, seen in two or more runs' records or transcripts, that no step, record or refusal pins. A row carries the evidence and the mechanism it should become. The pick step offers each row as a ticket line, and the auditor's definition cites ADR 0141. | Pins on `skills/audit/areas/rederived.md`, `agents/pilot-auditor.md` and `skills/audit/SKILL.md`; a scratch audit over this deck's run records reports this ticket's verdict pass as such a row. |

## 3. Findings

- **The gate1 post path does not run `check-slices`, contrary to the draft.** `callTool('deck_post')` in `deck/server-tools.mjs:194` runs `assertOnPilotTip(args.repo, args.branch)` from `deck/lineage.mjs` before `postItem`. That function reads the item's `repo` with git, skips a `repo` that is not a git repository, refuses with `DeckRefusal`, and has a 5 s deadline. `check-slices` is run by hand. The new check uses lineage's pattern, not check-slices'.
- `deck/items.mjs:210` `GATE1_FIELDS` already requires `artefact` (repo-relative, e.g. `docs/design/x/architecture.md`), `sha`, `branch` and `ticket`, so the check needs no new field.
- `deck/test/gate1-lineage.test.mjs` posts gate1s on real temp clones with a fake `sha` `0305827` and no artefact. Those fixtures must commit an artefact (L5).
- §6 is written two ways across the 63 existing artefacts: `- **A3 Title.** …` and `- **A1** …` (`docs/design/process-gc`, `docs/design/bigger-jobs`). The parser must accept both.
- The step 3 prose in `agents/pilot.md` (lines 260-300, "If the architect's assumed default is the one the user would pick anyway, do not ask") is the informal verdict this run replaces.
- The architect's stash clause, "Decide, and stash what is not yours" (`agents/pilot-architect.md:75`), already says "Then carry on; do not wait". It does not name A‹n› or the rejected path.
- Prompt pins in `scripts/test/measure-prompt.test.mjs`: pilot `<= 10464` on pilot and `10494.75` on `feat/gate-no-stall`; explorer `2466.5`. There is no architect pin.
- Audit row kinds are area files, `skills/audit/areas/{context,loops,navigability,setup,open}.md`, each with frontmatter `area`, `owner`, `model`, `spec`. Their `spec` values are pinned in `scripts/test/audit-agent.test.mjs` `EXPECT`. `scripts/audit-spend.mjs` already hands the auditor every finished run record's friction rows (`reports`).
- **Collision with gate-no-stall** (`feat/gate-no-stall`, yellow). It inserts `if (args?.kind === KIND_GATE2) assertHoldsDefault(...)` on the line straight after `server-tools.mjs:194`, and moves the pilot pin to 10494.75. S1's call goes on the same spot, a one-hunk conflict. Whichever lands second keeps both lines: gate1 checks, then gate2. S3 measures the pin on the rebased integration tip, never against a stale number.
- ADRs: 0135-0136 are on pilot (process-gc) and 0137-0140 are taken on gate-no-stall, so this run uses 0141 and 0142.

### Seams

| Seam | Interface | Folded behind it | Category |
|---|---|---|---|
| `scripts/verdicts.mjs` (new) | `assumedIds(markdown)`, `unverdicted(markdown)` | the §6 grammar: both bullet shapes, the verdict line | in-process |
| `deck/lineage.mjs` (gate1 checks) | `assertOnPilotTip(repo, branch)`, `assertVerdicts(repo, gate)` | `git cat-file blob <sha>:<artefact>`, the 5 s deadline, the refusal wording | local-substitutable (a real temp git repository in tests) |
| `callTool('deck_post')` | unchanged: one gate1 line calls both checks | — | in-process |
| prose: `agents/pilot.md` step 3, `agents/pilot-architect.md` stash clause, `skills/audit/areas/rederived.md` | headings and the `Verdict:` line form | — | prose, pinned by wording tests |

Deletion test: removing `verdicts.mjs` would spread a markdown grammar across the deck and the tests, so it earns its keep as a pure module. `assertVerdicts` sits beside `assertOnPilotTip` rather than being folded into one `assertGate1`. A fold would change line 194, which is the line gate-no-stall's hunk sits next to, and would gain one call site and nothing else. Nothing is folded, so there is no fold slice.

## 4. Ubiquitous language

- **Assumed decision (A‹n›)**: a §6 bullet whose first token is `A<n>`. It is the architect's default for a choice it judged to be the user's.
- **Verdict**: one line inside an A‹n›'s bullet, `Verdict: stands` (optionally `— <why>`) or `Verdict: overturned: <why>`, written by the pilot.
- **Verdict pass**: the pilot writing a verdict for every A‹n› once the cut lands, before any design-tree item.
- **Overturn**: a verdict that replaces the default. It is a *re-cut* when it moves a slice (the architect resumes) and an *edit* otherwise (the pilot commits).
- **Mechanism**: a step with a record and a refusal behind it (ADR 0141).
- **Re-derived behaviour**: a good move seen in two or more runs that no mechanism pins. It is an audit row.

## 5. Locked decisions

- **L1 Grilling depth: forks** (itm_b856b02e9d9d, 2026-10-13). Only decisions whose paths produce materially different deliverables are asked; the rest stand assumed. There is no Gate 1 walk.
- **L2 The check runs on the post path, beside lineage.** `assertVerdicts` lives in `deck/lineage.mjs` and is called from `callTool('deck_post')` before `postItem`. Rationale: only a refusal the deck makes cannot be skipped. Rejected: a count field the poster declares, which is self-reported; running it inside `check-slices`, which is not on the post path.
- **L3 Verdict syntax.** An indented line `Verdict: stands`, optionally `Verdict: stands — <why>`, or `Verdict: overturned: <why>`, a non-empty why, inside the A‹n›'s bullet, ending at the next top-level bullet or heading. Rejected: a §6 table column, which would rewrite 63 artefacts' shape; a separate verdict section, which can drift from its decisions.
- **L4 Read at `sha`, not the worktree file.** The check runs `git cat-file blob <sha>:<artefact>` in `repo` with fsmonitor off, with no shell, under the same 5 s deadline (`cat-file` runs no textconv; amended from `git show` by the pilot at S1, same decision). The gate signs that sha. Rejected: reading the working file, which can differ from what is signed.
- **L5 Fail closed.** In a git repository, an artefact unreadable at `sha` refuses the gate1, naming the path and sha. A `repo` that is not a git repository is not checked, as with lineage. Rejected: passing when the read fails, which would leave a hole in the mechanism.
- **L6 No A‹n› passes.** An artefact whose §6 is empty or absent needs no verdict.
- **L7 Overturned stays visible.** An overturned A‹n› keeps its bullet and verdict. The replacement is a new L‹n› in §5 citing it. Rejected: deleting it, which loses why the default lost.
- **L8 ADRs.** 0141 records the principle in the user's words, quoted from itm_6f60cec0f386. 0142 records the verdict gate (L2-L6) and cites 0141.
- **L9 A row kind is an area file.** `skills/audit/areas/rederived.md`, the pattern the five existing areas use. Rejected: a new `kind` field on report rows, which `audit save` would have to learn.
- **L10 QA environment: a scratch deck and a temp repository** (itm_cda10f8cff29, 2026-10-13). QA runs `pilot deck --scratch` and a temp git repository with a committed artefact from its own worktree; the real gate1 post on this run's own artefact is the live check. Rejected: the live deck on 4321, which exercises the real path but leaves test items in the user's inbox.

## 6. Assumed decisions

- **A1 This run is the scratch run.** The transcript evidence for spec 1, 2 and 4 comes from this run (its architect, its verdict pass) plus wording pins. There is no separate scratch pilot run. Tradeoff: an overturn of each kind is shown only if this run's pass produces one. Rejected: a dedicated scratch run, which costs a full pilot run.
  Verdict: stands — this run is the scratch run; a dedicated extra run buys evidence the gate1 refusal already pins.
- **A2 The body listing is refused too.** `assertVerdicts` also refuses a gate1 whose `body` does not name every A‹n› id, which turns spec 5's listing into a mechanism. Tradeoff: about 15 lines and one more refusal a pilot can hit. Rejected: a prose-only rule.
  Verdict: stands — a refusal over the listing is the user's own principle (an emergent behaviour becomes a mechanism); 15 lines is its cost.
- **A3 No architect pin.** Spec 7 applies to the pilot pin alone, since none exists for the architect. Tradeoff: the architect's clause cost goes unmeasured. Rejected: adding an architect pin, a new budget nobody asked for.
  Verdict: stands — no architect pin exists; measuring a budget nobody enforces is a new mechanism, not this ticket's.
- **A4 The re-derived area is owned by an explorer on Sonnet, with a threshold of two runs.** A move counts when it is seen in two or more runs' records (`reports`, `findings`) or transcripts, and a grep of `agents/`, `skills/` and `deck/` finds no step, record or refusal naming it. Tradeoff: one more explorer per audit. Rejected: the auditor reading the transcripts itself, which costs its context; a threshold of one run, which would flag one-offs.
  Verdict: stands — an explorer on Sonnet with a two-run threshold matches the audit skill's existing fan-out and keeps the auditor's own context for judgement.
- **A5 The pass runs at every depth.** Under *No grilling* the pilot still writes verdicts; it just posts nothing. Tradeoff: the pilot spends a few minutes on every run. Rejected: skipping the pass when there is no grilling, which would make the gate1 refuse anyway.
  Verdict: stands — the pass runs at every depth; under No grilling nothing is posted, so the only cost is the pilot's minutes.

## 7. Out of scope

- The pilot's long-term memory: the verdict pass reads only what exists now (deck queue, run records, ADRs).
- Re-verdicting historic artefacts: the check runs on new gate1 posts only, and no existing artefact is migrated.
- The yellow lane, blocking items and allow-list (itm_c310da07c9c6), and the gate2 default check (gate-no-stall).
- A `check-verdicts` CLI: the deck's refusal is the one adapter.

## 8. Slices

Width 5; longest stem 1

| Slice | Delivers | Files owned | After | Reviewers | File |
|---|---|---|---|---|---|
| S1 A gate1 with an unverdicted A‹n› is refused, naming it | 3, 5 | `scripts/verdicts.mjs` (new), `deck/lineage.mjs`, `deck/server-tools.mjs` (gate1 line), `deck/test/gate1-verdicts.test.mjs` (new), `deck/test/gate1-lineage.test.mjs` (fixtures) | – | `pilot:typescript-reviewer`, `pilot:security-reviewer` | [S1](slices/S1.md) |
| S2 The principle and the verdict gate are ADRs | 6 | `docs/adr/0141-an-emergent-behaviour-becomes-a-mechanism.md` (new), `docs/adr/0142-a-gate1-waits-on-a-verdict-per-assumed-decision.md` (new), `docs/adr/README.md` | – | `pilot:typescript-reviewer` | [S2](slices/S2.md) |
| S3 The pilot runs the verdict pass and routes overturns | 2, 4, 5, 7 | `agents/pilot.md` (step 3, Gate 1), `scripts/test/measure-prompt.test.mjs` (pilot pin), `scripts/test/verdict-pass-pilot.test.mjs` (new) | – | `pilot:typescript-reviewer`, `pilot:security-reviewer` | [S3](slices/S3.md) |
| S4 The architect's stash names A‹n› and the rejected path | 1 | `agents/pilot-architect.md` (stash clause), `scripts/test/verdict-pass-architect.test.mjs` (new) | – | `pilot:typescript-reviewer`, `pilot:security-reviewer` | [S4](slices/S4.md) |
| S5 The audit reports behaviour re-derived per run | 8 | `skills/audit/areas/rederived.md` (new), `skills/audit/areas/open.md` (area list), `agents/pilot-auditor.md` (ADR cite), `skills/audit/SKILL.md` (pick step), `scripts/test/audit-agent.test.mjs` (`EXPECT`), `scripts/test/audit-rederived.test.mjs` (new) | – | `pilot:typescript-reviewer`, `pilot:security-reviewer` | [S5](slices/S5.md) |

The slices share no file and no seam, so the DAG has no edges. Prose that cites ADR 0141/0142 before S2 lands is harmless, because `check-references` resolves plugin-root paths, not ADR numbers. Every slice lands before Gate 2.
**Walking skeleton: S1.** One real gate1 post on a real temp repository is refused for an unverdicted A1 and passes after the commit that adds its verdict. That proves the parser, the git read at `sha` and the post-path wiring that S3's prose relies on.
**Estimate:** 5 slices, against the ticket's 7. Spec 7 is S3's pin rather than a slice of its own, the architect half of spec 7 does not exist, and spec 5's deck half shares S1's files and risk.
**Rebase:** if gate-no-stall lands first, S1 resolves the `server-tools.mjs` hunk by keeping both lines, and S3 re-measures its pin from 10494.75.

## 9. Acceptance evidence

1. On a scratch deck, a `gate1` posted for an artefact whose A1 has no verdict line is refused with `A1` named. After a commit adds `Verdict: stands`, the same post goes up (spec 3).
2. The same gate1 with a body that leaves out `A2` is refused naming `A2` (spec 5).
3. This run's own Gate 1: §6 carries a verdict under A1-A5, and the gate1 body lists each beside its decision (spec 2, 5; A1).
4. If this run's pass overturns one, its routing is visible: a re-cut commit by the architect, or a pilot edit commit on `design/verdict-pass` (spec 4).
5. `docs/adr/README.md` lists 0141 and 0142, and 0141 quotes the user (spec 6). The pilot pin diff names one number (spec 7).
6. A scratch audit over this deck's run records shows a `rederived` row for the verdict pass, with its evidence and its mechanism (spec 8).
7. The wording pins for spec 1 pass, and this run's architect transcript shows no wait after a stash.

## 10. Status

| Slice | State | Branch | PR | Worktree | After | Delivers |
|---|---|---|---|---|---|---|
| S1 | planned | | | | – | 3, 5 |
| S2 | planned | | | | – | 6 |
| S3 | planned | | | | – | 2, 4, 5, 7 |
| S4 | planned | | | | – | 1 |
| S5 | planned | | | | – | 8 |
| verdict-pass | planned | feat/verdict-pass | | | S1-S5 | 1-8 |
