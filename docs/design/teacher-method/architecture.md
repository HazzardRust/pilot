# teacher-method: the teacher teaches by teach-me's method; a big lesson leaves as an md report

Ticket `itm_41555e898d37` · base `pilot` at 3d1b86e9 · branch `design/teacher-method` · ADR NNNN (`docs/adr/NNNN-teacher-method.md`)

## 1. Problem

Today `pilot-teacher` teaches one decision on the deck by its own six rules. The user wants it to
teach the way their `teach-me` skill teaches in the moment (by principle, by analogy, short
messages) and to take nothing long-horizon from that skill (no lesson plans, knowledge sheets,
mastery tracker, psychology log). A lesson too large for the teaching agent leaves the deck as one
self-contained md file that a regular Claude session with teach-me takes as-is: dot points, the
user's level, verifiable goals, everything inlined, and an instruction to research while planning.
teach-me itself is not modified, and the original thread's press still decides.

## 2. Spec

| # | Behaviour | Evidence and bar |
|---|---|---|
| 1 | The teacher teaches by teach-me's in-the-moment moves: why before what (by principle), an analogy from what the user already knows, a concrete case over a repeated rule, least help first, one question per message and never answered in it, no upfront lists, right once = move on, "not sure why" = teach from scratch, concise over grammatical. | A `## Teaching moves` section in `skills/teaching-a-decision/SKILL.md` holding at least 9 numbered moves (structural lint, ADR 0180 forbids phrase pins); the reviewer reads each against teach-me §2; at the walkthrough every lesson reply is at most 3 sentences and at most 1 question. Teacher's own share no more than 4,640 tokens (4,235.5 at 3d1b86e9). |
| 2 | Nothing long-horizon is taken from teach-me. | A lint over the teacher's definition and skill: 0 matches for lesson plan, knowledge tracker/sheet, mastery level/tracker, psychology log, experiment, whiteboard, Teaching Notes, session log. The teacher still holds no Write or Edit (crew-waits lint kept). |
| 3 | After the user's diagnostic answer the teacher calls the lesson small or large: large when the gap is background outside the decision itself and needs more than 5 steps (practitioner: tutor, sizing the gap from the diagnostic). Small is taught on the deck as today; large writes the report, posts no step, and resolves the lesson naming the report's path. *assumed* A1: the user may force either way by replying `report` or `here`. | `read`: the definition's `## Small or large` section; `look` at the walkthrough: one lesson taught on the deck, one forced `report` that ends with 0 on-deck steps and a resolution naming the path. |
| 4 | The report is one self-contained md file a teach-me session takes as-is: `## Goals` (each "you can …, checked by …"), `## Your level` (the diagnostic answer quoted), `## Dot points` (at least 3), `## Background` (artefact, ADR and code excerpts quoted inline), `## The decision to come back to` (question and options verbatim). | `pilot lesson-report` refuses a report missing any of the 6 headings (with 5), with fewer than 3 dot points, a goal without "checked by", a markdown link to a non-http target, a credential shape, or over 60,000 bytes (test). Walkthrough: the user uploads 1 report to a claude.ai chat with teach-me and it plans from it with no follow-up question about missing context. practitioner: instructional designer (goals as performance plus criterion, Mager); the receiving teach-me session is the outside reader. |
| 5 | The report tells Claude to research while planning the lesson. | `pilot lesson-report` refuses a report with no non-empty `## Research while planning` section, at least 1 line under it (test). |
| 6 | The teach-me skill is not modified, and none of its personal text enters this public repository. | The feature diff names 0 paths outside the repository; a grep of the diff for teach-me §7's doc ids and links returns 0 lines. |
| 7 | The original thread's option press still decides; a lesson, on the deck or off it, decides and closes nothing there. | `pilot-agents.test.mjs` "the teacher owns its lesson thread" and "the pilot hands a Teach me reply" pass unedited (2 tests). |
| 8 | The report is written to `<store>/lessons/<lesson id>.md` (store = `~/.claude/pilot`, `PILOT_DECK_DIR` overriding) by `pilot lesson-report <lesson id>` with the md on stdin, which prints the path; the shared checkout is untouched. | Test: a valid report lands at that path and exit 0; an id not shaped `itm_<12 hex>` exits 1 and writes 0 files. |
| 9 | On the old-deck fallback (no `lesson` kind) a large lesson writes the same report and names its path in one reply on the original thread. | `read`: the definition's fallback paragraph names it, exactly 1 reply. |

## 3. Findings

- `agents/pilot-teacher.md` (99 lines): posts and owns a `lesson` (ADR 0053), waits with `pilot wait`,
  "your Bash is for `pilot wait` and nothing else" (line 61), no Write/Edit.
- `skills/teaching-a-decision/SKILL.md` (154 lines): `## The six rules` (L14, ADR 0032, counted by
  `pilot-agents.test.mjs:747`), then "What the steps are made of", "A stall", "Done", "Teach inside
  what they already know", "Cite, never remember". Provenance header credits Pocock's `/teach`
  (`pilot-agents.test.mjs:784-818` pins the header lines; `vendor/methodology.md:80` the ledger row).
- teach-me is the user's synced skill at `~/.claude/skills/synced/<id>/teach-me/SKILL.md`
  (also github.com/HazzardRust/teach-me), outside this repo and not shipped. Its §2 "How to teach in
  the moment" holds the method; §1, §3-§7 are the long-horizon system (syllabus map, Knowledge
  Tracker, phases, Whiteboard, Psychology Log, Teaching Notes) and §7 holds personal doc links.
  It runs in claude.ai (Claude Docs, voice), which cannot open this repo or the deck: hence spec 4's
  inlining. Its §1 already reads a "dot point" as one item on a scope map and plans backwards from
  a target: the report's Dot points and Goals feed exactly that.
- `scripts/verdicts.mjs` + `bin/pilot.mjs:399-412`: a `pilot <verb> <arg>` reading md on stdin
  through a pure checker, refusing with a message; the pattern `pilot lesson-report` follows.
- `deck/store-dir.mjs` `storeDir()`: the store, `PILOT_DECK_DIR` override for tests; audits already
  live in `<store>/audits` (`deck/audit.mjs:252`). `deck/store-core.mjs:105` `findCredential(text)`.
- `scripts/measure-prompt.mjs`: teacher own share 4,235.5 tokens, no pin.
- ADR 0180: no phrase pins in prose; structural lints only. ADR 0185: Behaviours with kinds.
- PR #5 (crew-tests-behaviour) MERGED 2026-11-16, `daa08f3c` on `pilot`: the ticket's precondition holds.

### Seams

| Seam | Interface | Folded behind it | Category |
|---|---|---|---|
| lesson report | `reportProblems(md)`, `writeLessonReport(id, md, {store})` in `scripts/lesson-report.mjs`; CLI `pilot lesson-report <id>` | heading shape, goal and dot-point counts, link and credential refusal, size cap, id check, atomic write | in-process (local fs via injected store dir) |
| teacher workflow | `agents/pilot-teacher.md` headings `## Small or large`, `## The report` | the size call, the override words, the pipe to the CLI, the resolution line | prompt (read) |
| teaching method | `skills/teaching-a-decision/SKILL.md` heading `## Teaching moves` beside `## The six rules` | teach-me §2's moves, adapted to one decision | prompt (read) |

Deletion test: `pilot lesson-report` earns its keep (without it the teacher needs Write, which a
lint forbids, and the shape check has no home). `bin/pilot.mjs` dispatch is pass-through and stays
the codebase's pattern. No fold slice: nothing shallow is touched.

## 4. Ubiquitous language

- **lesson**: the teacher's own thread teaching one decision (ADR 0053).
- **small lesson / large lesson**: taught on the deck / leaves as a report; the teacher's call after the diagnostic.
- **report** (here, lesson report): the one md file at `<store>/lessons/<lesson id>.md`.
- **teaching moves**: teach-me §2's in-the-moment rules as the skill carries them.
- **long-horizon**: anything kept across sessions (plans, trackers, logs, boards); never the teacher's.

## 5. Locked decisions

- **L1 The report is written by `pilot lesson-report`, not by the teacher.** The teacher keeps no
  Write/Edit (lint, crew-waits.test.mjs:30) and pipes the md through a quoted heredoc as the
  architect does for `pilot verdicts`. Rejected: giving the teacher Write (breaks the lint, no shape
  check); posting the md on the deck (the user must upload a file to claude.ai; deck bodies are capped).
- **L2 The report lives in the store, `<store>/lessons/<lesson id>.md`.** Rejected: the repo
  (shared checkout, public repo, a teacher writing into a working tree).
- **L3 teach-me's moves join the skill beside the six rules, not in place of them.** The six rules
  (ADR 0032) are compatible with teach-me §2 and pinned by count; a `## Teaching moves` section
  carries the rest, and the overlapping prose ("What the steps are made of" duplication) is cut to
  pay for it. Rejected: a new skill (two method copies, L14); copying teach-me's text (personal,
  long-horizon, and it names Docs the teacher cannot reach).
- **L4 Credit, not vendoring.** teach-me is the user's own; the provenance `adapted:` line and the
  ledger row name it; no teach-me text is copied. Rejected: a second provenance header (the header
  test pins one upstream).
- **L5 No prompt-phrase pins** (ADR 0180): spec 1 and 3 are evidenced by a structural lint, `read`
  and the walkthrough; only the CLI's checker is unit-tested.
- **L6 The size call is the teacher's, made once after the diagnostic**, bar "background outside the
  decision, more than 5 steps". Rejected: a mid-lesson switch by step count (a stalled small lesson
  already has rule 6's worked step).
- **L7 Grilling depth is forks** (user, itm_99d009266614). Only a question whose paths give
  materially different deliverables went to the deck. Rejected: every stash on the deck.
- **L8 QA environment** (user, itm_170035f73349): a scratch deck on the feature worktree with
  seeded questions; the user uploads the report md to a claude.ai chat with teach-me, so the report
  links nothing local and inlines everything (spec 4's `local-link` rule). Rejected: the live deck.

## 6. Assumed decisions

- **A1 Who forces small or large.** Default: the user, by replying `report` or `here` on the
  lesson, at any time; the pilot cannot. Tradeoff: one more rule in the teacher's prompt. Rejected:
  teacher only (a wrong call costs a re-press); the pilot's brief (the pilot lacks the judgement).
  Deck: itm_aa238936b475. User answered: "You, by a reply on the lesson".
- **A2 Nothing returns from an off-deck lesson.** Default: the original thread stays open and the
  report's last section carries its question and options verbatim, so the user comes back and
  presses. Tradeoff: the pilot learns nothing from the off-deck lesson beyond the diagnostic in
  `extracted`. Rejected: teach-me ending with a summary the user pastes back (a step for the user
  and a reply shape for the pilot). Deck: itm_41a9952d5a1d. User answered: "Nothing returns".

## 7. Out of scope

- Any edit to teach-me, its docs, or the user's `~/.claude/skills`.
- Opening, uploading or linking the report from the deck UI (the path in the resolution is the hand-off).
- A pin on the teacher's prompt size (spec 1's bar is measured, not pinned).
- `agents/pilot.md` (the pilot's hand-off to the teacher is unchanged; a blocked-steps landing is editing it).
- Removing old reports (they sit in the store, which uninstall already leaves and names).

## 8. Slices

Width 2; longest stem 1

| Slice | Title | Spec | Files owned | After | Reviewers | File |
|---|---|---|---|---|---|---|
| S1 | A too-large lesson leaves as a shape-checked md report | 3, 4, 5, 7, 8, 9 | `scripts/lesson-report.mjs` (new), `scripts/test/lesson-report.test.mjs` (new), `bin/pilot.mjs`, `agents/pilot-teacher.md`, `docs/adr/NNNN-teacher-method.md` (new) | – | `pilot:typescript-reviewer`, `pilot:security-reviewer` | [S1](slices/S1.md) |
| S2 | The teacher teaches by teach-me's moves, nothing long-horizon | 1, 2, 6, 7 | `skills/teaching-a-decision/SKILL.md`, `vendor/methodology.md`, `scripts/test/pilot-agents.test.mjs` | – | `pilot:typescript-reviewer`, `pilot:security-reviewer` | [S2](slices/S2.md) |

S1 is the walking skeleton: teacher, CLI, store file and lesson resolution end to end.

red team: S2's long-horizon lint reads `agents/pilot-teacher.md`, which S1 owns; the two run side by
side, so S1's Prohibited line bars those words and the integration gate runs the lint on both.
red team: the blocked-steps landing edits `agents/*.md`; S1's edit to the teacher stays inside its
own new sections and line 61 so a rebase conflict is one hunk.
red team: a report body containing the heredoc delimiter would cut the pipe; the definition names
an unusual delimiter (`LESSON_REPORT_END`).
red team: the auto-mode classifier reads only command text; `pilot lesson-report` writes in the
store, not a tracked file, and itm_14e3f5278542's spec 2 lets a heredoc piped to a command pass. QA
confirms it runs unprompted at the walkthrough; no allowlist change in this run.
red team: `<lesson id>` comes from the CLI argument and builds a path: S1 validates `itm_<12 hex>`
before any write (security trigger, reviewer named).

## 9. Acceptance evidence

1. On the deck, the user presses Teach me on a seeded question; the teacher's first reply is one
   diagnostic question; each later reply is at most 3 sentences and 1 question, with an analogy or a
   why-first step visible (spec 1).
2. On a second seeded question the user answers the diagnostic and replies `report`; the lesson
   resolves naming `~/.claude/pilot/lessons/<id>.md` with 0 on-deck steps (spec 3, 8).
3. The user opens that file: 6 headings, quoted excerpts, a research instruction, the decision
   verbatim (spec 4, 5).
4. The user uploads it to a claude.ai chat with teach-me; it plans the lesson with no question about
   missing context (spec 4).
5. Back on the deck, the original question is still open and the user's press decides it (spec 7).
6. Gate: `npm test` green; `git diff --stat` names 0 paths outside the repo (spec 2, 6).

QA environment (proposed): a scratch deck from the feature worktree, two seeded questions on a
scratch ticket, the user's own claude.ai account with teach-me for step 4.

## 10. Status

| Slice | State | Branch | PR | Worktree | After | Spec |
|---|---|---|---|---|---|---|
| S1 | planned | – | – | – | – | 3, 4, 5, 7, 8, 9 |
| S2 | planned | – | – | – | – | 1, 2, 6, 7 |
| teacher-method | planned | feat/teacher-method | – | – | S1, S2 | 1-9 |
