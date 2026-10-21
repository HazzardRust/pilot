# Architect depth — architecture artefact

Feature: **architect-depth** · slug `architect-depth` · integration branch `feat/architect-depth` · base `main` at
`4481167` (v0.7.0) · architect branch `design/architect-depth`.

## 1. Problem

"More thorough planning in the architect stage — we want more detailed designing of the architecture, less
decision-making work and more code writing for the implementation stage." Today a slice names its spec lines, owned
files and verification, and the implementer decides the rest: the exact files, the functions and types at each seam,
the shapes that cross them, the tests. Those choices vary between implementers, cost implementer tokens, and turn up
late, at the fundamentalist's review, as design problems.

## 2. Spec

Agreed by the user as posted (itm_31d6adb52ec4); lines 1 and 6 were re-cut for L7.

| # | Behaviour | Evidence |
|---|---|---|
| 1 | Every slice has a **slice file**, `docs/design/<slug>/slices/S<n>.md`. It lists each file the slice creates or changes, one line on each file's role. `architecture.md` keeps one entry per slice: title, spec lines delivered, files owned, what it comes after, and a link to its slice file. Crew briefs pass slice-file paths instead of pasting sections | this feature's `slices/S1.md` and `slices/S2.md`; S1's pin fails first, then passes; step 4's brief names a path (S2's pin) |
| 2 | Every slice file carries an **Interface** block: the signatures of the seams the slice creates or changes, as they stand after it (functions, types, routes, CLI flags, hook payloads, and for prompt files the headings and field names) | a fenced block in each slice file; S1's pin |
| 3 | The data shapes crossing those seams go in the same block, or name a §4 term | the same block |
| 4 | Every slice file lists its **Tests** by name, in the order to write them, each with what it asserts. These are the implementer's red steps | the slice PR body lists those names as red then green; S2's pin |
| 5 | A seam is stated once, in the slice that creates it. A later slice names it as `S<n>'s <symbol>` and reads it from the integration branch | the rule is in `vertical-slicing`; `slices/S2.md` follows it |
| 6 | The cap: `architecture.md` stays under 300 lines, and each slice file stays under 60. A slice that needs more is two slices | `agents/pilot-architect.md`; S1's pin |
| 7 | The implementer builds against the Interface. When a signature cannot hold, it sends `main` the smallest change, written as the block should read, and carries on with the work that does not depend on it | `agents/pilot-implementer.md`; S2's pin |
| 8 | The pilot decides a seam change itself and edits the owning slice file. The user is asked only if the change moves a spec line or a locked decision. The architect is resumed only if a later slice's files or tests stop holding *(A2)* | `skills/pilot/SKILL.md` step 6; S2's pin |
| 9 | The fundamentalist reports a silent divergence between the diff and a slice's Interface block as a finding | `agents/pilot-fundamentalist.md`; S2's pin |
| 10 | The prompt-budget tests stay green: S2 adds zero or fewer net bytes to `SKILL.md` *(A4)* | `npm test`, including `measure-prompt.test.mjs` |
| 11 | The architect writes no code beyond signatures: no function bodies and no pseudo-code; only declarations, types and one-line comments | `agents/pilot-architect.md`; S1's pin |

## 3. Findings

- **The slice fields are defined in `skills/vertical-slicing/SKILL.md`**, under "Anatomy of a slice": eight fields and a
  worked example. The skill is the package's own (`origin: hazzard`), and only the architect preloads it
  (`agents/pilot-architect.md:6`). The new fields go there, so they cost the pilot's budget nothing.
- **The architect's artefact list is in `agents/pilot-architect.md`**, "The artefact": item 8, plus the line "Keep it
  under three hundred lines". The pins on item 10 (`scripts/test/pilot-agents.test.mjs:322-374`) are untouched here.
- **The last artefact's slices were table rows** (`docs/design/independence/architecture.md:235-256`: 15 slices in 293
  lines). Under L7 a table stays as the slice list, and the detail moves to slice files.
- **These places tell the crew about a "slice section"**:
  - `skills/pilot/SKILL.md:224` (step 4, "verbatim"), `:308` (step 7) and `:335` (step 8);
  - `agents/pilot-implementer.md:14`, `agents/pilot-fundamentalist.md:15,118` and `agents/pilot-qa.md:13`.

  No test pins that wording; a grep of `scripts/test` for "slice section" and "verbatim" found nothing.
- **Gate 1's PR body is already "the artefact's spec and slice table"** (`SKILL.md:207`). Under L7 the slice table is
  the slice list, so the sentence already means what the user asked for and needs no edit.
- **The pilot already owns small artefact edits.** It resumes the architect "only to re-cut slices"
  (`SKILL.md:180-186`). Spec 8 leans on that rule, and step 6 gains one sentence.
- **Budgets** (`node scripts/measure-prompt.mjs` at `4481167`; own share = definition + skills + tools, in tokens):
  - pilot: 9708 against its 9800 pin (`scripts/test/measure-prompt.test.mjs:105`), so **92 tokens of headroom**;
  - explorer: pinned at 2150;
  - QA: pinned at 5500 (`qa-preview.test.mjs:102`); S2 moves its share by a few bytes;
  - architect (5142) and implementer (3977): no pin.
- **Overlap with `fix/deck-polish`:** it edits step 1 of `skills/pilot/SKILL.md`. S2 edits steps 4, 6, 7 and 8 only,
  and removes more bytes than it adds. Whichever lands second therefore rebases with no textual conflict and stays
  inside the same pin.

## 4. Ubiquitous language

- **Slice file**: `docs/design/<slug>/slices/S<n>.md`, holding one slice's fields. A brief passes its path.
- **Slice list**: the Slices section of `architecture.md`, one entry per slice. It is what Gate 1 signs.
- **Interface block**: the fenced block in a slice file, holding the seams that slice creates or changes, as they
  stand after it. Declarations, types and one-line comments only.
- **Owning slice**: the slice whose Interface block states a seam. Each seam has exactly one.
- **Seam change**: an implementer's request to alter an Interface block, sent to `main` as the replacement block.
- **Red steps**: the Tests field's names, in order. Each fails before the implementer writes the code it pins.

## 5. Locked decisions

| # | Decision | Rationale · rejected |
|---|---|---|
| L1 | Per slice: the files with their roles, the signatures at each seam, the shapes crossing them, and the test names with what each asserts | Decided by the user. Rejected: full pseudo-code, because the implementer still writes the code |
| L2 | Grilling depth is *forks* until told otherwise | Decided by the user (brief) |
| L3 | The new fields live in `vertical-slicing`, and the architect's item 8 points at them | The skill already owns the slice anatomy, and only the architect pays for it. Rejected: restating the fields in the architect definition, the restatement independence S4 removed |
| L4 | A seam is stated once, in its owning slice (spec 5) | A wrong signature is then corrected in one place and cannot ripple into later briefs. Rejected: restating a used seam in every slice that uses it; that is self-contained but drifts on the first seam change |
| L5 | The pins go in two new per-feature test files, not `pilot-agents.test.mjs` | Keeps each slice's owned files disjoint; `qa-preview.test.mjs` and `handoff-wording.test.mjs` already follow this pattern |
| L6 | This artefact is written in the new format | It is the first evidence for spec 1 to 5 |
| L7 | **One file per slice** (`slices/S<n>.md`) beside `architecture.md`, which keeps the slice list. Briefs pass paths. The cap is 300 lines for `architecture.md` and 60 per slice file | Decided by the user, against the inline default. A brief becomes a path instead of about 40 pasted lines per slice, and Gate 1 reads a short list. Cost: the files owned appear twice (paths in the list, roles in the slice file), and the architect keeps the two equal. Rejected: inline sections capped at 40 lines |
| L8 | **Nothing a Gate 1 sign-off needs lives only in a slice file.** The spec, the decisions, the DAG, and each slice's spec lines and files owned stay in `architecture.md`; a slice file holds only implementation detail. S1 writes it into `agents/pilot-architect.md` item 8 with a pin | Decided by the user (no separate S0 overview: `architecture.md` is the overview). Rejected: an S0 document, a second place for the same facts to drift; and leaving it unnamed, which lets a later architect move meaning into a file the user never reads |

## 6. Assumed decisions awaiting the user

| # | Default taken | Tradeoff |
|---|---|---|
| A2 | **The pilot approves a seam change** unless it moves a spec line or a locked decision (spec 8) | Fewer questions for the user, but a seam can move without the user seeing it. The audit trail is the slice-file edit plus the fundamentalist's divergence check |
| A3 | **No release slice**: the pilot releases this feature together with `fix/deck-polish` | Until then, the only "real feature" evidence for spec 1 is this artefact. The alternative is S3, a 0.8.0 bump like independence S13 |
| A4 | **The 9800 pin stays**: S2 adds zero or fewer net bytes to `SKILL.md`, paying for its sentence with the trims `slices/S2.md` names | Raising the pin goes to the user at sign-off only if a trim turns out to cost meaning. The price is two explanatory clauses; the rules they explain still stand |

## 7. Out of scope

- Changing the implementer's default model. Detailed Interface blocks will meet the existing Sonnet criterion ("mechanical
  against a precise brief") more often, and the pilot applies that criterion as it stands.
- The explorer and the teacher: neither reads a slice.
- Pinning the architect's or the implementer's budget.
- A script that measures slice-file length or checks the slice list against the slice files. The cap is a sentence the
  architect follows.
- Rewriting past artefacts in the new format.

## 8. Slices

`S1 → S2`. S2 needs no code from S1, but it uses S1's field names and the slice-file path, and building the skeleton
first proves the format before the crew relies on it.

| Slice | Delivers | Files owned | After | Detail |
|---|---|---|---|---|
| **S1 A slice file carries files, interface and tests** (walking skeleton) | 1 (format), 2, 3, 5, 6, 11 | `skills/vertical-slicing/SKILL.md`, `agents/pilot-architect.md`, `scripts/test/slice-interface.test.mjs` (new) | – | [slices/S1.md](slices/S1.md) |
| **S2 The crew reads slice files, and a seam change reaches main** | 1 (briefs), 4, 7, 8, 9, 10 | `skills/pilot/SKILL.md` (steps 4, 6, 7, 8 only), `agents/pilot-implementer.md`, `agents/pilot-fundamentalist.md`, `agents/pilot-qa.md`, `scripts/test/seam-change.test.mjs` (new) | S1 | [slices/S2.md](slices/S2.md) |

## 9. Acceptance evidence, in the order the user meets it

1. At Gate 1, this artefact: a two-row slice list, and a slice file for each slice with its files, an Interface block
   and named Tests (spec 1, 2, 3, 5, 11), all within the cap (spec 6).
2. The S1 and S2 PRs: each body lists its red steps by the names in its slice file (spec 4).
3. `npm test` is green on `feat/architect-depth`, including the 9800 budget pin (spec 10).
4. The changed crew files: step 4's brief passes a path (spec 1); the implementer sends a seam-change message (spec 7);
   step 6 carries the pilot's sentence (spec 8); the fundamentalist checks for divergence (spec 9).
5. After release (A3): the next piloted run writes slice files unprompted, and its implementers' PRs cite the test
   names in them.

## 10. Status

| Slice | State | Branch | PR | Worktree | After | Delivers |
|---|---|---|---|---|---|---|
| S1 A slice file carries files, interface and tests | integrated | `slice/architect-depth-s1` | #123, merge `9bf9c34` | | – | 1, 2, 3, 5, 6, 11 |
| S2 The crew reads slice files, and a seam change reaches main | integrated | `slice/architect-depth-s2` | #124, merge `8bbd921` | | S1 | 1, 4, 7, 8, 9, 10 |
| feature architect-depth | draft PR #121, fix round | `feat/architect-depth` | #121 | | S2 | 1–11 |

## 11. Principles findings

- kept: word pins collapse into sentence regexes so specs 7, 8, 9, 11 cannot be reversed with the suite green (11 of 13 prose mutants survived)
- kept: S2.md Interface names two labels the prose never got (Red steps, diverges from S<n>'s Interface) — removed from the block as a recorded seam change
- kept: item 8 and the implementer opening restate the skill's field count and path (L3)
- kept: implementer says the slice fields are in the brief; they are in the slice file (QA F1); duplicated PR-body clause removed
- kept: Full auto trim lost the reason the rule lives in agents/pilot.md; restored within the pin
- kept: step 6 says the slice-file edit is committed on feat/<slug>
- kept: code-review and resolving-merge-conflicts still point at a slice section (QA F2, F3)
- kept: glossary terms to CONTEXT.md, as Gate 1 requires
- kept: worked example shows the S<n>'s symbol form once (QA F5)
- kept: vertical-slicing states spec 3's glossary-term option (QA F6, half)
- dropped: moving the divergence sentence after the reading sentence — reorder with no consequence named
- dropped: S2.md bare seam names inside the block (QA F4) — heading carries the prefix, L4 holds
- dropped: pin name ", in order" drift (QA F6, half) — the pin is stricter than the slice file, not looser
