# The fundamentalist attacks the big-picture decisions

Ticket `itm_ff08c3e59cfa` · slug `fundamentalist-decisions` · base `pilot` at `7c987d3c` · ADR 0171

## 1. Problem

The fundamentalist looks at the wrong things. Of its 15 logged findings 13 were code-level (helpers,
duplicates, assertions) and the 2 decision-level ones were dropped. Its definition is diff-level, with one
paragraph arguing against the design. The user keeps its code review, but wants it to attack the big-picture
decisions adversarially, from where the feature now stands built: what could the system achieve with less.

## 2. Spec

Agreed with `main` 2026-10-19 (lines 1 to 8 stand as proposed).

1. The report's item 1 stays **The case against** and opens with the decisions table: exactly 1 row per
   L‹n›, A‹n› and S‹n› in the artefact, each with the case it is not needed, what the system does with less,
   1 verdict of needed / drop / simplify, its evidence from the built diff and its net lines. *Evidence: a
   wording pin on `agents/pilot-fundamentalist.md` `## Report` item 1; the replay in line 4 counts the rows.*
2. A `## The decisions pass` section runs first, before `## The subtraction pass`, and reads the whole
   artefact (§5, §6, §8), not only its spec and slice files; every drop or simplify row cites at least 1
   `file:line` of the built diff, and a needed row names the spec line that fails without it.
   *Evidence: wording pins on the heading order, the 3 verdicts and `## Scope discipline` naming the artefact.*
3. The auditor's use is unaffected: its brief's "tool passes and report shape do not apply here" already
   excludes the new pass, and 0 lines of `agents/pilot-auditor.md` change. *Evidence: the auditor's existing
   pins pass unchanged; `git diff --stat` on that file is empty.*
4. On a replay over 2 landed runs whose decision-level findings were dropped (`architect-deeper`: the bar
   grammar against L4; `back-arrow`: F1 against spec 3 and L3), each report's first table has exactly as many
   rows as that artefact has L, A and S ids, and the formerly dropped decision gets a non-needed verdict or a
   named reason it holds. practitioner: SEI ATAM evaluation team (each architectural decision enumerated and
   scored against its rationale); practitioner: Klein's pre-mortem (assume it failed, say why). *Evidence:
   QA's replay table, 2 rows, row count against id count.*
5. The code pass and the evidence runner stay as they are: the subtraction, test, evidence and judgement
   passes keep their text, `agents/pilot-evidence-runner.md` changes by 0 bytes, and every existing pin on
   both passes unchanged, the 65-line report bound and the case-against phrases included. *Evidence:
   `git diff --quiet origin/pilot -- agents/pilot-evidence-runner.md` exits 0; `npm test` green.*
6. Step 7 passes the fundamentalist the artefact's path, and triages each drop or simplify row as 1
   `deck_status` `findings` line, id first (`kept: L3 simplify — …`, `dropped: A2 drop — <reason>`); a needed
   row gets 0 lines; a kept one that moves no decision goes to the fix round or an added slice under the
   existing rails. *Evidence: a wording pin on `agents/pilot.md` step 7; the pilot pin raised by its measured
   cost.*
7. A kept decision finding that drops or simplifies an L‹n› or overturns an A‹n› is always a question for the
   user: the co-pilot sends it to `main` whatever its cost-of-a-wrong-guess bar, never drops it for moving a
   decision, and the run does not wait on it (A1). *Evidence: wording pins on `agents/pilot-co-pilot.md`
   `## What goes to main` and step 7; `node scripts/check-references.mjs` exits 0.*
8. ADR 0171 records the fundamentalist as an adversarial decisions reviewer first and a code reviewer
   second, and is 1 row in `docs/adr/README.md`. *Evidence: `node scripts/adr-index.mjs` leaves README
   unchanged after S3; the row is present.*

## 3. Findings

- `agents/pilot-fundamentalist.md` (282 lines): passes in order subtraction, test, evidence, judgement;
  `## Report` item 1 is **The case against**, "Argued from the diff, not the artefact". `## Scope discipline`:
  "No reading beyond the diff, what it calls into, and the callers you grep for".
- Pins on it: `scripts/test/fundamentalist-case.test.mjs` (item 1 is **The case against** with 3 phrases; the
  adversarial default), `pilot-agents.test.mjs:556-558,1578-1610,1701-1711` (subtraction heading, net line,
  "under about sixty-five lines", the pushback row, the runner), `test-depth.test.mjs`, `seam-change.test.mjs:88-115`
  ("slice files"), `principles-sweep.test.mjs:52-75` (description). All positive matches on kept text.
- `agents/pilot.md` step 7 (lines 440-469): the brief passes "the artefact's spec and every slice file's path";
  "Only one that would move a locked decision stays a question for the user." Pinned by `pilot-agents.test.mjs:1418-1445`,
  `integrate-base.test.mjs:226`, `seam-change.test.mjs:99` ("slice file's path"), `principles-sweep.test.mjs:118-127`.
- `agents/pilot-co-pilot.md:53` "The verdicts of step 7 are yours"; `## What goes to main` escalates a question
  only "if a wrong guess is unreasonably expensive to revise". The records show the 3 decision-level findings
  died here: `docs/design/back-arrow/run.json` "dropped: F1 … moves spec 3/L3", `architect-deeper/run.json`
  "dropped: case against the bar grammar - spec 3 is locked", `audit-fixes/run.json` "dropped: plain-pickup redesign".
- `deck/runs.mjs:422-432` refuses a findings line not starting `kept: ` or `dropped: ` (`DECIDED`); an id after
  the prefix passes, so no deck change is needed.
- `scripts/test/measure-prompt.test.mjs:178` pins the pilot's own share at 11455.75 with 0 headroom; the co-pilot
  and fundamentalist have no pin.
- `agents/pilot-auditor.md:89-108` spawns the fundamentalist on audit rows and excludes its passes and report.
- `rules/vertical-execution.md` calls the review "subtraction first"; still true of the code pass (§7).

### Seams

| Seam | Interface | Folded behind it | Category |
| --- | --- | --- | --- |
| the fundamentalist's prose | headings `## The decisions pass`, `## Report` item 1, `## Scope discipline` | the decision walk, the 3 verdicts, the row unit | in-process (wording pins via `sectionOf`, `flat`) |
| the pilot's step 7 | `### 7. Feature-level principles review and fix round, once, AFK` | the brief's artefact path, decision-row triage, the findings line shape | in-process (wording pins via `step7()`) |
| the co-pilot's escalation | `## What goes to main` | the always-escalate clause for a decision-moving finding | in-process |
| the prompt measure | `measure({ root, home })`; the pilot's own share | nothing new | in-process |
| the findings record | `recordFields({ findings })` and its `DECIDED` grammar | nothing; unchanged | in-process |

Deletion test: the case-against paragraph in `## Why this step exists` would, deleted, reappear as the
decisions pass, so it stays and points there. No module is shallow enough to fold; no code changes; no fold slice.

## 4. Ubiquitous language

- **decisions pass**: the fundamentalist's first pass, over every L, A and S of the artefact against the built diff.
- **decisions table**: its output, report item 1's opening table, 1 row per decision or slice.
- **decision row**: 1 row of it; its **verdict** is exactly 1 of needed, drop, simplify.
- **decision finding**: a decision row whose verdict is drop or simplify; it is a finding like any other.
- **moves a decision**: a kept decision finding that drops or simplifies an L‹n› or overturns an A‹n›.

## 5. Locked decisions

- **L1 Item 1 keeps its name.** The decisions table opens **The case against**, and its 3 pinned phrases stay.
  Rejected: a new item before it, which breaks `fundamentalist-case.test.mjs` and spec 5.
- **L2 A section of its own, first.** `## The decisions pass` sits before `## The subtraction pass`, whose "the point
  of the run" becomes "the code pass's lead". Rejected: folding decisions into subtraction, which keeps the diff framing.
- **L3 Every row argued from the built diff.** A needed verdict carries evidence too: agreeing with the artefact stays
  not evidence (the pinned default). Rejected: rows only for suspects, which lets a decision pass unexamined.
- **L4 Step 7's brief passes the artefact's path** beside every slice file's path. Rejected: pasting §5/§6, which drifts.
- **L5 Findings lines id first** under the deck's existing grammar. Rejected: a new `decisions` field, a deck change for no
  consequence.
- **L6 A decision-moving finding always reaches the user.** The co-pilot's cost bar does not apply to it. Rejected: the
  co-pilot deciding it, which is how all 3 recorded decision findings were dropped.
- **L7 No code change.** The deck, `verdicts.mjs`, the evidence runner and the auditor stay untouched.
- **L8 ADR 0171** (0165-0169 are held by other design branches, 0170 by lander-tail).
- **L9 Grilling depth: forks** (itm_a53c3f12a800): only forking decisions were posted; A1-A3 stood assumed.
- **L10 A process record is needed by definition.** A decision no line of the built diff carries (an ADR number, the grilling depth, a
  default the user took) gets verdict needed with evidence "no built line", never a decision finding. The user, itm_be9b1a864c4a
  2026-10-21: "Yes, process records are needed by definition". Rejected: escalating each as an empty L6 question.

## 6. Assumed decisions

- **A1 A decision question does not block the run.** Default: QA and the fix round go on; a drop answer before the Gate 2
  sign-off is built as a fix round or an added slice. Tradeoff: QA may walk code later dropped. Rejected: QA waits on the
  answer, idling the run at its end. Not a fork per `main` 2026-10-19; thread `itm_3ed23b4c30fa` withdrawn.
    Verdict: stands — a plain question never blocks a run; nothing queued waits on QA
- **A2 The agent enumerates the rows.** Default: prose; it reads §5, §6, §8 and writes a row per id; QA counts on the replay.
  Tradeoff: a row can be skipped silently on a long artefact. Rejected: a ~30-line `decisionIds()` beside `assumedIds()` in
  `scripts/verdicts.mjs`. Not a fork; thread `itm_24a7004df8db` withdrawn.
    Verdict: stands — the replay's row count catches a skipped row; a script is 30 lines for a count a pin already makes
- **A3 The 65-line report bound stays.** Default: rows 1 line each, the case-against prose shrinks to the table plus at most
  3 lines. Tradeoff: a 25-row artefact leaves about 30 lines for tools and findings. Rejected: raising the pinned bound.
    Verdict: stands — raising the bound would loosen a pin three landed runs hold
- **A4 Short tickets keep skipping the fundamentalist.** short-path skips it on tickets of at most 2 slices, so they get no
  decisions pass. Default: keep the skip. Tradeoff: small tickets' decisions go unattacked. Posted by `main`.
    Verdict: stands — the user took the default (itm_aab00f4df5a1)
- **A5 QA environment.** Default: scratch decks and the local gate, plus the replay of line 4 on the 2 landed runs. Posted by `main`.
    Verdict: stands — the user took the default (itm_951327cde41b)

## 7. Out of scope

The evidence runner, the auditor, the deck's findings grammar, `rules/vertical-execution.md` ("subtraction first"
stays true of the code pass, and the rules ledger is its own change), any per-slice decisions review, and replaying
more than 2 past runs.

## 8. Slices

Width 3 (S1, S2, S3); longest stem 1.

| # | Title | Spec | Files owned | After | Reviewers | Model | File |
|---|---|---|---|---|---|---|---|
| S1 | The fundamentalist leads with the decisions pass | 1, 2, 3, 4, 5 | `agents/pilot-fundamentalist.md`, `scripts/test/fundamentalist-decisions.test.mjs` (new) | – | ts, security | opus | [S1](slices/S1.md) |
| S2 | Step 7 and the co-pilot take decision findings as findings | 6, 7 | `agents/pilot.md`, `agents/pilot-co-pilot.md`, `scripts/test/decision-triage.test.mjs` (new), `scripts/test/measure-prompt.test.mjs` | – | ts, security | opus | [S2](slices/S2.md) |
| S3 | ADR 0171 and the glossary record the decisions reviewer | 8 | `docs/adr/0171-the-fundamentalist-attacks-decisions-first.md` (new), `docs/adr/README.md`, `CONTEXT.md` | – | ts | sonnet | [S3](slices/S3.md) |

Reviewers: ts = `pilot:typescript-reviewer`, security = `pilot:security-reviewer` (S1, S2 are agent configuration).

red team: S1 and S2 share no file but both name §4's terms; if S1 renamed "decisions table", S2's prose would point at
nothing. Both slices quote §4 verbatim and S2's pin matches "decision finding", the term S1 does not own; no `after`.
red team: S1's first red step against the real file: pin 1 in `fundamentalist-case.test.mjs` splits item 1 at `\n\s*2\.\s`;
a table inside item 1 with a row starting "2." would cut it early. S1 forbids numbered lines inside item 1 (Prohibited).
red team: S2 raises the pilot pin at 0 headroom; short-path and architect-runs-red raise the same line, so the later to
land re-measures on rebase (brief.md, Overlaps).

## 9. Acceptance evidence

1. `agents/pilot-fundamentalist.md` shows `## The decisions pass` before `## The subtraction pass`, and Report item 1
   opens with the decisions table (spec 1, 2).
2. `git diff --stat origin/pilot -- agents/pilot-evidence-runner.md agents/pilot-auditor.md` prints nothing (spec 3, 5).
3. QA's replay on `architect-deeper` and `back-arrow`: 2 rows, rows against L+A+S count, the dropped decision's verdict (spec 4).
4. Step 7 and `## What goes to main` carry the id-first findings line and the always-ask clause (spec 6, 7).
5. ADR 0171 is in `docs/adr/README.md`; `check-references` exits 0; `npm test` green (spec 8).

## 10. Status

| Slice | State | Branch | PR | Worktree | After | Spec |
|---|---|---|---|---|---|---|
| S1 | planned | `slice/fundamentalist-decisions-s1` | – | – | – | 1-5 |
| S2 | planned | `slice/fundamentalist-decisions-s2` | – | – | – | 6, 7 |
| S3 | planned | `slice/fundamentalist-decisions-s3` | – | – | – | 8 |
| fundamentalist-decisions | planned | `feat/fundamentalist-decisions` | – | – | S1-S3 | 1-8 |
