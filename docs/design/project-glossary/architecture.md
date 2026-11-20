# One project glossary the crew maintains

Ticket `itm_2458e437da6a` · slug `project-glossary` · base `origin/feat/human-steps` d88532ca · ADR NNNN (`docs/adr/NNNN-project-glossary.md`, S2)

## 1. Problem

The user wants Matt Pocock's domain-modeling philosophy applied with its state at project level: one glossary and
one `docs/adr/` per repository, in the repository, which grilling reads first, a run writes to as terms settle, and
the audit keeps honest. Today the plugin's skills say the glossary is "the artefact's section 3" and "one glossary
per run", while this repository already keeps a 70-term root `CONTEXT.md` nothing in the crew reads or writes.

## 2. Spec

| # | Behaviour | Evidence | Bar |
| --- | --- | --- | --- |
| 1 | Grilling reads the root glossary before its first question and challenges a request term the glossary lists under `_Avoid_`, or one that is overloaded, by naming the canonical term. | `methodology-skills.test.mjs` over `skills/grilling/SKILL.md`, `skills/domain-modeling/SKILL.md`; `glossary-prose.test.mjs` over `agents/pilot.md`; QA: a scratch request saying "subagents" | each of the 3 files names `GLOSSARY.md` and reading it first; the pilot's question names **Crew** |
| 2 | A term that outlives its run is written to the root glossary on the design branch as it settles, by the architect, so the Gate 1 press signs it off with the artefact; the artefact's ubiquitous-language section keeps run-local terms only. *L7 (A3, answered)* | `glossary-prose.test.mjs` over `agents/pilot.md`, `agents/pilot-architect.md`; this run's design diff | both files say it; this run's diff adds >= 1 glossary entry (it adds 2) |
| 3 | The glossary format file says the glossary carries no implementation detail, and `ADR-FORMAT.md` keeps the three ADR tests; `glossary.mjs check` fails an entry naming a file path and passes the repository's glossary inside `npm test`. | `glossary.test.mjs`; `node scripts/glossary.mjs check GLOSSARY.md` | path fixture: exit 1 naming the term; repo glossary: exit 0; 6 path entries rewritten |
| 4 | The audit's navigability area lists each stale term: a glossary term with no use outside the glossary, `docs/design/` and `docs/adr/` is a row; a term the code contradicts is the explorer's judgement row. *practitioner: DDD modeller (Evans), the language checked against the code* | `glossary.test.mjs` on `staleTerms`; `audit-navigability.test.mjs` | fixture with 1 unused term of 3: exactly 1 result naming it; the area file runs the command |
| 5 | `domain-modeling` and its vendor ledgers say where the glossary lives: one per repository, at its root, nothing under `~/.claude`. | `VENDOR.md` and `vendor/methodology.md` rows; `git grep -i "one glossary per run"` | the 3 rows changed; 0 hits outside `docs/design/`, `docs/adr/` |
| 6 | `diagnosing-bugs` and `test-design` read the repository glossary, not "the artefact's section 3". *found issue* | `methodology-skills.test.mjs` | 0 "section 3 glossary" in either skill; both name `GLOSSARY.md` |
| 7 | The glossary is `GLOSSARY.md` at the root and every live reference follows it. *assumed, A1* | `git grep -n "CONTEXT\.md"` outside `docs/design/`, `docs/adr/`, `vendor/`, `VENDOR.md` | 0 hits; `npm test` green |
| 8 | `GLOSSARY-FORMAT.md` shows the entry shape the glossary actually uses (`**Term**:`, definition, `_Avoid_:`), the shape `glossary.mjs` parses. *red team* | `methodology-skills.test.mjs`: the format file's example through `parseGlossary` | >= 1 entry parsed from the format file's example, 0 lint problems |

Practitioner lines: spec 4 is the DDD practitioner's (Evans): the ubiquitous language is checked against the code,
not kept as a document; its raw material is `git grep` over the tracked tree, and its external confirmation is the
audit row a person can re-run.

## 3. Findings

- `CONTEXT.md` (root, 296 lines, 70 terms, upstream shape `**Term**:` / definition / `_Avoid_:`, 6 subheadings) is
  the project glossary in all but name; last touched by spec-first S4. Lines 82, 132, 209, 231, 257, 287 name a path
  or file (spec 3's existing data).
- `skills/domain-modeling/SKILL.md:9,17-21,44-48` and `GLOSSARY-FORMAT.md:1-35`: glossary = artefact §3, "One glossary
  per run" (`:35`), example shape `- **Order** — ...` that no file here uses (spec 8). `ADR-FORMAT.md:60-66` already
  carries the three tests.
- The architect's template puts ubiquitous language at §4 (`agents/pilot-architect.md:211`); every skill says §3.
- `agents/pilot.md:90,345-347`: domain-modeling "during grilling and at Gate 1"; terms "go to the glossary" with no
  file named and no writer named.
- `skills/diagnosing-bugs/SKILL.md:9,17`, `skills/test-design/SKILL.md:9,17`: read "the artefact's section 3 glossary".
- Live `CONTEXT.md` readers: `scripts/test/pilot-agents.test.mjs:306`, `state-words.test.mjs:45`,
  `three-lanes-wording.test.mjs:54-58` (colour words pinned out of it), `docs/architecture.md:7`,
  `skills/audit/areas/navigability.md:40`. ADRs 0147, 0151, 0185 and old design docs cite it as history.
- Audit areas are prose briefs to an explorer whose measurements are read-only commands (`navigability.md`, pinned
  by `audit-navigability.test.mjs`); measuring scripts live in `scripts/audit-*.mjs`.
- `npm test` = `scripts/gate.mjs`, every `scripts/test/*.test.mjs` picked up.
- Upstream `domain-modeling` (main) now names the file `GLOSSARY.md` at the root of a single-context repo.

### Seams

| Seam | Interface | Folded behind it | Category |
| --- | --- | --- | --- |
| `scripts/glossary.mjs` | `parseGlossary(text)`, `lintGlossary(text)`, `staleTerms(repoDir, text)`; CLI `check <file>`, `stale <repo>` | the entry shape, the path rule, the `git grep` per term (today nowhere: the audit has no glossary measure) | in-process; `git` local-substitutable |
| Glossary prose | the files naming where the glossary is and who reads and writes it: `domain-modeling`, `grilling`, `diagnosing-bugs`, `test-design`, `pilot.md`, `pilot-architect.md` | nothing folded; deletion test: each file is read by a different agent, so each keeps its line | prose |

Deletion test: `audit/areas/navigability.md` item 5 survives (it is the explorer's brief); `glossary.mjs` earns its
keep across 2 callers (the gate's test, the audit).

## 4. Ubiquitous language

Lasting terms this run settled are in the glossary (**Glossary**, **Stale term**). Run-local:

- **Lasting term** — a term a later run would meet; goes to the glossary. Not a "global term".
- **Run-local term** — a term only this artefact uses; stays in its ubiquitous-language section. Not a "temp term".
- **Path entry** — a glossary entry whose definition names a file or directory path. Not "implementation detail" in general.

## 5. Locked decisions

- **L1 One glossary per repository, at its root, in the repository.** Durable, reviewed with the code, read by
  every agent in the checkout (ADR 0006 keeps only disposable state under `~/.claude`). Rejected: a per-run glossary
  (drifts, nobody reads last run's), a deck-store glossary (not in the repo, not reviewed). ADR NNNN.
- **L2 The entry shape is the one the file already uses** (`**Term**:` line, definition line, `_Avoid_:` line,
  optional `###` groups). Rejected: the format file's `- **Term** —` list (no file uses it; 70 entries to rewrite).
- **L3 Staleness is measured, contradiction judged.** `staleTerms` is a case-insensitive fixed-string `git grep` per
  term outside the glossary, `docs/design/`, `docs/adr/`; contradiction stays the explorer's row. Rejected: an LLM
  pass per term (unmeasured, the audit's rows need a command).
- **L4 The path rule is narrow**: a definition token starting `~/` or `./`, holding two `/`-separated segments
  ending `/` or a file extension, or a bare `name.ext` with a known source or doc extension. Branch patterns like
  `feat/<slug>` and agent names pass. Rejected: banning all backticks (kills `gate1`, `report`).
- **L5 The check runs in this repository's gate and in the audit** of any repository. Rejected: a hook on every
  write (new hook surface for a doc lint).
- **L6 Historic ADRs and design docs keep `CONTEXT.md`** as written. Rejected: rewriting history.
- **L7 The architect writes each lasting term to `GLOSSARY.md` on the design branch as it settles; the Gate 1 press
  signs the diff.** The user's answer to A3. Rejected: the pilot writing after the press (batched, unsigned).
- **L8 QA runs in its own worktree of this repository plus one scratch fixture repository** holding one path entry
  and one stale term, and one scratch pilot request using an `_Avoid_` word. The user's answer (`itm_813a9a2d4b97`).
  Rejected: a second real repository. Grilling depth for this run is *forks* (`itm_488f8ece3b4f`): no Gate 1 walk.

## 6. Assumed decisions

- **A1 Rename `CONTEXT.md` to `GLOSSARY.md`** (`itm_5c8f5fc83bae`). Default: rename, update the 5 live readers.
  Trades away: a repository still holding an upstream-1.2.3 `CONTEXT.md` is not read (no fallback). Rejected: keep
  `CONTEXT.md` (the name says context, upstream moved on).
- **A2 The fundamentalist does not check terms** (`itm_bb24de856f02`). Default: the audit owns staleness, Gate 1
  owns new terms. Trades away: a rename in code leaves a stale term until the next audit. Rejected: a row in the
  fundamentalist's pass.
- **A3 The architect writes lasting terms inline on the design branch; Gate 1 signs them** (the pilot's
  `itm_592774a86226`). Trades away: two runs adding under one subheading can conflict at landing (the lander resolves
  hunks). Rejected: the pilot writes after the press (batched, unsigned, owns no branch).
  Answer (user, 2026-11-20): "Architect inline, signed at Gate 1". Locked as L7.

## 7. Out of scope

A glossary map or several contexts; per-module glossaries; a fallback reader for `CONTEXT.md`; rewriting old ADRs
or design docs; a fundamentalist row (A2); auto-fixing a stale term (the audit reports, a ticket fixes).

## 8. Slices

Width 3; longest stem 2

| Slice | Title | Spec | Files owned | After | Reviewers | File |
| --- | --- | --- | --- | --- | --- | --- |
| S1 | Walking skeleton: `GLOSSARY.md` passes `glossary.mjs check` in the gate | 3, 7 | `GLOSSARY.md` (from `CONTEXT.md`), `scripts/glossary.mjs` (new), `scripts/test/glossary.test.mjs` (new), `scripts/test/fixtures/glossary/` (new), `scripts/test/pilot-agents.test.mjs`, `scripts/test/state-words.test.mjs`, `scripts/test/three-lanes-wording.test.mjs`, `docs/architecture.md` | – | `pilot:typescript-reviewer`, `pilot:security-reviewer` | [S1](slices/S1.md) |
| S2 | domain-modeling says one glossary per repository | 1, 3, 5, 6, 8 | `skills/domain-modeling/SKILL.md`, `skills/domain-modeling/GLOSSARY-FORMAT.md`, `skills/grilling/SKILL.md`, `skills/diagnosing-bugs/SKILL.md`, `skills/test-design/SKILL.md`, `VENDOR.md`, `vendor/methodology.md`, `scripts/test/methodology-skills.test.mjs`, `docs/adr/NNNN-project-glossary.md` (new) | S1 (`parseGlossary`) | `pilot:typescript-reviewer`, `pilot:security-reviewer` | [S2](slices/S2.md) |
| S3 | The audit names a stale term | 4, 7 | `scripts/glossary.mjs` (`staleTerms`, `stale`), `scripts/test/glossary-stale.test.mjs` (new), `scripts/test/fixtures/glossary-stale/` (new), `skills/audit/areas/navigability.md`, `scripts/test/audit-navigability.test.mjs` | S1 (`scripts/glossary.mjs`) | `pilot:typescript-reviewer`, `pilot:security-reviewer` | [S3](slices/S3.md) |
| S4 | The pilot reads the glossary first and the architect writes it | 1, 2 | `agents/pilot.md`, `agents/pilot-architect.md`, `scripts/test/glossary-prose.test.mjs` (new) | – | `pilot:typescript-reviewer`, `pilot:security-reviewer` | [S4](slices/S4.md) |

red team: (1) S2 first wrote the format file's example in the `—` list shape `parseGlossary` cannot read; spec 8 and
L2 added. (2) `three-lanes-wording.test.mjs` pins colour words out of the glossary; this run's 2 terms hold none.
(3) S2's spec-8 test half-built on S1's parser while running beside S1: S2 now comes after S1 (`parseGlossary`).
(4) A term like "Pilot" always matches; `staleTerms` only ever under-reports, which the Misses line says.

## 9. Acceptance evidence

1. `node scripts/glossary.mjs check GLOSSARY.md` exits 0; on `scripts/test/fixtures/glossary/path-entry.md` exits 1
   naming the term (spec 3).
2. `git grep -n "CONTEXT\.md" -- ':!docs/design' ':!docs/adr' ':!vendor' ':!VENDOR.md'` prints nothing (spec 7).
3. `node scripts/glossary.mjs stale scripts/test/fixtures/glossary-stale` prints exactly 1 term (spec 4).
4. A scratch run whose request says "the subagents": the pilot's first question names **Crew** (spec 1).
5. The design branch diff of this run shows `GLOSSARY.md` gaining **Glossary** and **Stale term** (spec 2).
6. `git grep -i "one glossary per run" -- ':!docs/design' ':!docs/adr'` prints nothing; the 3 ledger rows read
   "one per repository, at its root" (spec 5, 6, 8).

## 10. Status

| Slice | State | Branch | PR | Worktree | After | Spec |
| --- | --- | --- | --- | --- | --- | --- |
| S1 | planned | slice/project-glossary-s1 | – | – | – | 3, 7 |
| S2 | planned | slice/project-glossary-s2 | – | – | S1 | 1, 3, 5, 6, 8 |
| S3 | planned | slice/project-glossary-s3 | – | – | S1 | 4, 7 |
| S4 | planned | slice/project-glossary-s4 | – | – | – | 1, 2 |
| project-glossary | planned | feat/project-glossary | – | – | S1-S4 | 1-8 |
