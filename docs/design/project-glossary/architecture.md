# One project glossary the crew maintains

Ticket `itm_2458e437da6a` · slug `project-glossary` · base `origin/pilot` d282a698 · ADR NNNN (`docs/adr/NNNN-project-glossary.md`, S3)

## 1. Problem

The user wants Matt Pocock's domain-modeling philosophy applied with its state at project level: one glossary and
one `docs/adr/` per repository, in the repository, which grilling reads first, a run writes to as terms settle, and
the fundamentalist and the audit keep honest, with a bounded log of its changes that an agent reads only in part.
Today the skills say the glossary is "the artefact's section 3" and "one glossary per run", while this repository
already keeps a 70-term root `CONTEXT.md` nothing in the crew reads or writes.

## 2. Spec

| # | Behaviour | Evidence | Bar |
| --- | --- | --- | --- |
| 1 | Grilling looks the request up in the root glossary before its first question and challenges a word the glossary lists under `_Avoid_`, or one that is overloaded, by naming the canonical term. | `methodology-skills.test.mjs` over `grilling`, `domain-modeling`; `glossary-prose.test.mjs` over `agents/pilot.md`; QA: a scratch request saying "subagents" (L8) | each of the 3 files names `glossary.mjs match` before the first question; the pilot's question names **Crew** |
| 2 | A term that outlives its run is written to the root glossary on the design branch as it settles, by the architect, so the Gate 1 press signs it off; the artefact's ubiquitous-language section keeps run-local terms only. *L7* | `glossary-prose.test.mjs` over `agents/pilot.md`, `agents/pilot-architect.md`; this run's design diff | both files say it; this run's diff adds 3 glossary entries |
| 3 | The format file says the glossary carries no implementation detail, `ADR-FORMAT.md` keeps the three ADR tests, and `glossary.mjs check` fails an entry naming a file path and passes the repository's glossary inside `npm test`. | `glossary.test.mjs`; `node scripts/glossary.mjs check GLOSSARY.md` | path fixture: exit 1 naming the term; repo glossary: exit 0; 7 path entries rewritten |
| 4 | The audit's navigability area lists each stale term: a term with no use outside the glossary, `docs/design/` and `docs/adr/` is a row; a term the code contradicts is the explorer's judgement row. *practitioner: DDD modeller (Evans), the language checked against the code* | `glossary-stale.test.mjs`; `audit-navigability.test.mjs` | fixture with 1 unused term of 3: exactly 1 result naming it |
| 5 | `domain-modeling` and its vendor ledgers say where the glossary lives: one per repository, at its root, nothing under `~/.claude`. | `VENDOR.md` and `vendor/methodology.md` rows; `git grep -i "one glossary per run"` | 3 rows changed; 0 hits outside `docs/design/`, `docs/adr/` |
| 6 | `diagnosing-bugs` and `test-design` read the repository glossary, not "the artefact's section 3". *found issue* | `methodology-skills.test.mjs` | 0 "section 3 glossary"; both name `GLOSSARY.md` |
| 7 | The glossary is `GLOSSARY.md` at the root and every live reference follows it. *L9 (A1)* | `git grep -n "CONTEXT\.md"` outside `docs/design/`, `docs/adr/`, `vendor/`, `VENDOR.md` | 0 hits; `npm test` green |
| 8 | `GLOSSARY-FORMAT.md` shows the entry shape the glossary uses (`**Term**:`, definition, `_Avoid_:`), the shape `glossary.mjs` parses. *red team* | `methodology-skills.test.mjs` through `parseGlossary` | >= 1 entry parsed from the example, 0 lint problems |
| 9 | An agent reads only the entries it needs: `match <text>` returns the entries whose term or `_Avoid_` word is in the text, `term <name>` one entry; no prose tells an agent to read the whole file. *the user's, A2 answer* | `glossary.test.mjs`; `methodology-skills` and `glossary-prose` pins | "the subagents" -> 1 entry (**Crew**), under 6 lines of 300; 0 "read GLOSSARY.md" whole-file instructions |
| 10 | The glossary has a log of changes, `GLOSSARY-LOG.md` beside it: each term added, changed or removed, with the date and the run named in words, readable when copied to another project without this repository's history; `glossary-log.mjs check` fails when the log and the glossary disagree. *the user's, A2 and A4 answers, L12* | `glossary-log.test.mjs`; the repo's log checked in `npm test` | 3 appends -> 3 rows each naming its run, 0 commit shas required; a latest-`added` term missing from the glossary -> exit 1 naming it |
| 11 | The log is bounded and read in part: at most 200 rows, oldest dropped on append; an agent reads one term's rows or the newest N (default 20). *L12* | `glossary-log.test.mjs` | 201 appends -> 200 rows, the first gone; `show` -> 20 rows; `--term T` -> only T's rows |
| 12 | The fundamentalist checks terms in every feature's diff: an added prose line using an `_Avoid_` word, a term whose last use the diff removes, a new term the artefact lists as lasting but the glossary lacks, and a glossary edit with no log row, each a finding. *L10 (A2)* | `glossary-diff.test.mjs`; `fundamentalist-terms.test.mjs` over `agents/pilot-fundamentalist.md` | fixture diff with 1 Avoid use, 1 lost term, 1 unlogged entry -> 3 candidates; the pass names the command |

Practitioner: spec 4 and 12 are the DDD modeller's: the ubiquitous language checked against the code, from `git grep`
and `git log` over the tracked tree, confirmed by a row a person can re-run.

## 3. Findings

- `CONTEXT.md` (root, 296 lines, 70 terms, `**Term**:` / definition / `_Avoid_:`, 6 subheadings) is the project
  glossary in all but name. Lines 82, 134, 161, 238, 260, 286, 316 name a path (spec 3's existing data). ci-gate (landed,
  d282a698) added a `### CI checks` group of 5 entries with no `_Avoid_:` line, one naming CI file paths.
- Its git history names each run (`feat|fix(<slug>): …`), but that history does not travel with a copied file, which is
  why the user chose a stored log (A4, L12).
- `skills/domain-modeling/SKILL.md:9,17-21,44-48`, `GLOSSARY-FORMAT.md:1-35`: glossary = artefact §3, "One glossary per
  run" (`:35`), an example shape `- **Order** — …` no file uses (spec 8). `ADR-FORMAT.md:60-66` has the three tests.
- The architect's template puts ubiquitous language at §4 (`agents/pilot-architect.md:211`); every skill says §3.
- `agents/pilot.md:90,345-347`: domain-modeling "during grilling and at Gate 1"; no file and no writer named.
- `skills/diagnosing-bugs/SKILL.md:9,17`, `skills/test-design/SKILL.md:9,17`: "the artefact's section 3 glossary".
- Live `CONTEXT.md` readers: `scripts/test/pilot-agents.test.mjs:306`, `state-words.test.mjs:45`,
  `three-lanes-wording.test.mjs:54-58` (colour words pinned out), `docs/architecture.md:7`, `navigability.md:40`.
- `agents/pilot-fundamentalist.md` (303 lines): passes decisions, subtraction, test, evidence, judgement; pinned by
  `fundamentalist-decisions.test.mjs` and `fundamentalist-case.test.mjs`. It reads the feature diff only.
- Audit areas are prose briefs whose measures are read-only commands, pinned by `audit-navigability.test.mjs`.

### Seams

| Seam | Interface | Folded behind it | Category |
| --- | --- | --- | --- |
| `scripts/glossary.mjs` | `parseGlossary`, `lintGlossary`, `matchGlossary`, `termOf`; CLI `check`, `match`, `term` | the entry shape, the path rule, the lookup | in-process |
| `scripts/glossary-stale.mjs` | `staleTerms(repoDir, text)`; CLI `<repo>` | a literal `git grep` per term with the 3 exclusions | local-substitutable (`git`) |
| `scripts/glossary-log.mjs` | `readLog`, `appendLog`, `checkLog`, `queryLog`; CLI `check`, `append`, `show` | the row shape, the 200 cap, agreement with the glossary | in-process |
| `scripts/glossary-diff.mjs` | `termsInDiff(repoDir, base, head)`; CLI | Avoid words in added prose lines, terms whose last use went | local-substitutable (`git`) |
| Glossary prose | where the glossary is and who looks up, writes and checks it: 4 skills, `pilot.md`, `pilot-architect.md`, `pilot-fundamentalist.md` | nothing folded: each file is read by a different agent | prose |

Deletion test: one CLI for all four commands was the deeper module, but `stale`, `log` and `diff` run on parallel
lanes; one file would serialise S1-S7. All three import `parseGlossary`, so the entry shape
stays in one place.

## 4. Ubiquitous language

Lasting terms this run settled are in the glossary (**Glossary**, **Stale term**, **Glossary log**). Run-local:

- **Lasting term** — a term a later run would meet; goes to the glossary. Not a "global term".
- **Run-local term** — a term only this artefact uses; stays here. Not a "temp term".
- **Path entry** — a glossary entry whose definition names a file or directory path. Not "implementation detail" in general.
## 5. Locked decisions

- **L1 One glossary per repository, at its root, in the repository.** Durable, reviewed with the code (ADR 0006 keeps
  only disposable state under `~/.claude`). Rejected: per-run glossary (drifts), a deck-store glossary (unreviewed). ADR NNNN.
- **L2 The entry shape is the one the file uses** (`**Term**:`, definition, optional `_Avoid_:`, optional `###` groups).
  Rejected: the format file's `- **Term** —` list (no file uses it; 70 entries to rewrite).
- **L3 Staleness is measured, contradiction judged**: `staleTerms` is a case-insensitive fixed-string `git grep` per
  term outside the glossary, `docs/design/`, `docs/adr/`. Rejected: an LLM pass per term (no command behind the row).
- **L4 The path rule is narrow**: a token starting `~/` or `./`, two `/`-separated segments ending `/` or an extension,
  or a bare `name.ext` with a source or doc extension. `feat/<slug>` and agent names pass. Rejected: banning backticks.
- **L5 The check runs in this repository's gate and in the audit** of any repository. Rejected: a write hook.
- **L6 Historic ADRs and design docs keep `CONTEXT.md`** as written. Rejected: rewriting history.
- **L7 The architect writes each lasting term to the glossary on the design branch as it settles; the Gate 1 press
  signs the diff.** The user's answer to A3. Rejected: the pilot writing after the press (batched, unsigned).
- **L8 QA runs in its own worktree of this repository plus one scratch fixture repository** holding one path entry
  and one stale term, and one scratch pilot request using an `_Avoid_` word (`itm_813a9a2d4b97`). Rejected: a second
  real repository. Grilling depth is *forks* (`itm_488f8ece3b4f`): no Gate 1 walk.
- **L9 The file is `GLOSSARY.md`.** The user's answer to A1. Rejected: keeping `CONTEXT.md`.
- **L10 Both the fundamentalist and the audit check terms.** The user's answer to A2: the fundamentalist on every
  feature's diff (`glossary-diff.mjs` candidates, judged), the audit on the whole tree (stale terms). Recorded
  objection (pilot): a second owner of terms and a terms pass on every Opus review.
- **L11 The read path is a lookup, never the file**: grilling runs `match` on the request, any agent `term` on a word;
  the 300-line file is opened whole only to edit it. Rejected: an index of terms read every time (72 lines still
  loaded per run), a size cap on the glossary (the user bounded the log, not the terms).
- **L12 The log is a stored file, `GLOSSARY-LOG.md` at the root**, one Markdown table row per change (date, run,
  change, term), at most 200 rows, oldest dropped by `glossary-log.mjs append`; whoever edits the glossary appends in
  the same commit. Self-contained: a run is named by slug, never only by a sha. Agreement: a term whose newest row is
  `removed` is absent, one whose newest row is `added`/`changed` is present; a term with no row passes (the cap may
  have dropped it), and S7 flags a diff that edits an entry with no row. The user's answer to A4, for portability.

## 6. Assumed decisions

- **A1 Rename `CONTEXT.md` to `GLOSSARY.md`** (`itm_5c8f5fc83bae`). Default: rename. Answer (user): "Rename to
  GLOSSARY.md", after first typing "lets keep context actually". Locked as L9.
  Verdict: stands — the user pressed "Rename to GLOSSARY.md" on itm_5c8f5fc83bae after first typing keep
- **A2 The fundamentalist does not check terms** (`itm_bb24de856f02`). Default: the audit owns it. Answer (user):
  overturned, "okay well both then"; plus a bounded change log read in part. Locked as L10, L11; spec 9-12 added.
  Verdict: overturned: the user said "both" on itm_bb24de856f02: the fundamentalist checks terms in every feature's diff and the audit keeps its stale-term row, with a bounded change log read in part
- **A3 The architect writes lasting terms inline; Gate 1 signs them** (`itm_592774a86226`). Answer (user):
  "Architect inline, signed at Gate 1". Locked as L7.
  Verdict: stands — the user chose "Architect inline, signed at Gate 1" on itm_592774a86226
- **A4 The glossary log is derived from git history, not stored** (`itm_7a69812e9528`). Default: `glossary-log.mjs`
  reads `git log -p -- GLOSSARY.md` (following the rename), rows of term, added/changed/removed, run, date; `--term`
  and `--limit 20`. Nothing stored, so nothing grows. Trades away: a shallow clone shows less; no file to open.
  Rejected: `GLOSSARY-LOG.md` capped at N rows (every run writes it, conflicts at landing, can disagree with git).
  Answer (user): "Stored log file, capped"; after the pilot's objection, "it can live in the repo, i want it so that i
  can take it from one project to another". Locked as L12, cap 200.
  overridden: git already records every change, a stored file is a second copy that can disagree, and runs landing
  close together conflict in it.
  Verdict: overturned: the user wants a stored log file in the repo so it can be taken from one project to another (itm_7a69812e9528); a git-derived log does not travel with a copied file

## 7. Out of scope

A glossary map or several contexts; per-module glossaries; a `CONTEXT.md` fallback reader; rewriting old ADRs or
design docs; a cap on the number of terms; auto-fixing a stale term (the audit reports, a ticket fixes).

## 8. Slices

Width 3; longest stem 3

| Slice | Title | Spec | Files owned | After | Reviewers | File |
| --- | --- | --- | --- | --- | --- | --- |
| S1 | Walking skeleton: `GLOSSARY.md` passes `glossary.mjs check` in the gate | 3, 7 | `GLOSSARY.md` (from `CONTEXT.md`), `scripts/glossary.mjs` (new), `scripts/test/glossary.test.mjs` (new), `scripts/test/fixtures/glossary/` (new), `scripts/test/pilot-agents.test.mjs`, `scripts/test/state-words.test.mjs`, `scripts/test/three-lanes-wording.test.mjs`, `docs/architecture.md` | – | `pilot:typescript-reviewer`, `pilot:security-reviewer` | [S1](slices/S1.md) |
| S2 | A word looks up its entry, never the whole file | 9 | `scripts/glossary.mjs` (`matchGlossary`, `termOf`, `match`, `term`), `scripts/test/glossary-match.test.mjs` (new) | S1 (`scripts/glossary.mjs`) | `pilot:typescript-reviewer`, `pilot:security-reviewer` | [S2](slices/S2.md) |
| S3 | The skills say one glossary per repository, looked up | 1, 3, 5, 6, 8, 9 | `skills/domain-modeling/SKILL.md`, `skills/domain-modeling/GLOSSARY-FORMAT.md`, `skills/grilling/SKILL.md`, `skills/diagnosing-bugs/SKILL.md`, `skills/test-design/SKILL.md`, `VENDOR.md`, `vendor/methodology.md`, `scripts/test/methodology-skills.test.mjs`, `docs/adr/NNNN-project-glossary.md` (new) | S1 (`parseGlossary`), S2 (`match`), S6 (`GLOSSARY-LOG.md` row shape) | `pilot:typescript-reviewer`, `pilot:security-reviewer` | [S3](slices/S3.md) |
| S4 | The audit names a stale term | 4, 7 | `scripts/glossary-stale.mjs` (new), `scripts/test/glossary-stale.test.mjs` (new), `scripts/test/fixtures/glossary-stale/` (new), `skills/audit/areas/navigability.md`, `scripts/test/audit-navigability.test.mjs` | S1 (`parseGlossary`) | `pilot:typescript-reviewer`, `pilot:security-reviewer` | [S4](slices/S4.md) |
| S5 | The pilot looks the request up first and the architect writes terms | 1, 2, 9 | `agents/pilot.md`, `agents/pilot-architect.md`, `scripts/test/glossary-prose.test.mjs` (new) | S2 (`match`), S6 (`append`) | `pilot:typescript-reviewer`, `pilot:security-reviewer` | [S5](slices/S5.md) |
| S6 | A bounded glossary log that travels with the glossary | 10, 11 | `GLOSSARY-LOG.md` (new), `scripts/glossary-log.mjs` (new), `scripts/test/glossary-log.test.mjs` (new) | S1 (`parseGlossary`) | `pilot:typescript-reviewer`, `pilot:security-reviewer` | [S6](slices/S6.md) |
| S7 | The fundamentalist flags a term the diff misuses or orphans | 12 | `scripts/glossary-diff.mjs` (new), `scripts/test/glossary-diff.test.mjs` (new), `agents/pilot-fundamentalist.md`, `scripts/test/fundamentalist-terms.test.mjs` (new) | S1 (`parseGlossary`), S4 (`staleTerms`), S6 (`readLog`) | `pilot:typescript-reviewer`, `pilot:security-reviewer` | [S7](slices/S7.md) |

red team: (1) the format file's example shape is one `parseGlossary` cannot read: spec 8, L2. (2)
`three-lanes-wording.test.mjs` pins colour words out of the glossary; this run's 3 terms hold none. (3) the skills
slice half-built on S1's parser and S2's `match` while running beside them: S3 now comes after both. (4) one
`glossary.mjs` for every command serialised four slices on one file: `stale`, `log`, `diff` split out (Seams). (5)
ci-gate landed 5 entries without `_Avoid_:` and one naming CI paths: L2 makes `_Avoid_:` optional and S1 rewrites 7
path entries, not 6. (6) the 200 cap drops a term's only row, so a strict "every term has a row" check would fail by design: L12 lets a rowless term pass and S7 catches an unlogged edit in the diff instead. (7) `_Avoid_` words
like "update" are common in code: S7 scans added Markdown lines only, outside `docs/design/` and `docs/adr/`, and
the fundamentalist judges each candidate.

## 9. Acceptance evidence

1. `node scripts/glossary.mjs match "the subagents"` prints the **Crew** entry only (spec 9).
2. A scratch pilot request saying "the subagents": the first question names **Crew** (spec 1, L8).
3. `node scripts/glossary.mjs check GLOSSARY.md` exits 0; on the scratch fixture's path entry exits 1 (spec 3).
4. `git grep -n "CONTEXT\.md" -- ':!docs/design' ':!docs/adr' ':!vendor' ':!VENDOR.md' ':!skills/domain-modeling/SKILL.md' ':!skills/domain-modeling/GLOSSARY-FORMAT.md' ':!skills/audit/areas/navigability.md' ':!agents/pilot-fundamentalist.md'` prints nothing (spec 7); the four excluded files name it as vendor provenance, as another repository's file the audit looks for, and as the rename that reads every entry unlogged.
5. `node scripts/glossary-stale.mjs <scratch fixture>` prints exactly its 1 stale term (spec 4).
6. `node scripts/glossary-log.mjs show --term Glossary` shows its `added` row naming `project-glossary`; `check` exits 0; a copy of both files in a scratch directory with no git gives the same output (spec 10, 11).
7. `node scripts/glossary-diff.mjs . origin/pilot feat/project-glossary` lists its candidates; the fundamentalist's
   report has a terms row or says none (spec 12).
8. This run's design diff adds **Glossary**, **Stale term**, **Glossary log** (spec 2); `git grep -i "one glossary per run"` outside
   `docs/design/`, `docs/adr/` prints nothing (spec 5, 6, 8).

## 10. Status

| Slice | State | Branch | PR | Worktree | After | Spec |
| --- | --- | --- | --- | --- | --- | --- |
| S1 | planned | slice/project-glossary-s1 | – | – | – | 3, 7 |
| S2 | planned | slice/project-glossary-s2 | – | – | S1 | 9 |
| S3 | planned | slice/project-glossary-s3 | – | – | S1, S2, S6 | 1, 3, 5, 6, 8, 9 |
| S4 | planned | slice/project-glossary-s4 | – | – | S1 | 4, 7 |
| S5 | planned | slice/project-glossary-s5 | – | – | S2, S6 | 1, 2, 9 |
| S6 | planned | slice/project-glossary-s6 | – | – | S1 | 10, 11 |
| S7 | planned | slice/project-glossary-s7 | – | – | S1, S4, S6 | 12 |
| project-glossary | planned | feat/project-glossary | – | – | S1-S7 | 1-12 |
