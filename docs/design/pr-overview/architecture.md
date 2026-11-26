# pr-overview: every PR opens with a plain overview

Ticket `itm_1dc34cf2a81a`. Base `origin/pilot` (86957ec). Grilling depth: forks (L1).

## Overview

- **What changes**: every pull request the pilot opens now starts with a short plain summary. The detailed tables follow it unchanged.
- **Why**: today a reader first sees a table written for the build agents. Nobody can tell at a glance what the change is.
- **What you'll notice**: a few lines at the top of each PR. They say what changes, why, what a user notices and whether it can be undone.
- **Can it be undone**: two-way door. It only changes PR text, and only for runs that write a summary.

## 1. Problem

The PRs the pilot opens are written for agents: the body is tables of slices, verdicts and evidence. The user keeps
those, but nothing at the top tells a person what the PR is. The top of every PR should be a high-level overview a
business manager and a developer can both read, the tables below for whoever wants the detail. The user's pointer:
Matt Pocock's PR-writing skill.

## 2. Spec

| # | Behaviour | Evidence and bar |
| --- | --- | --- |
| 1 | A feature PR's body opens with a `## Overview` section: what changes, why, what a user notices, whether it can be undone; it holds no slice ids, item ids, decision ids or crew role names. | `featureBody` test on a seeded artefact and record: the body's first line is `## Overview`; 0 matches of `S<n>`, `itm_`, `A<n>`, `L<n>`, `ADR NNNN` or a crew role name in that section (A3). |
| 2 | The tables stay below, byte-identical to today's. | Test: the body with the overview block removed equals the body written with no overview, 0 bytes differ. The user's read of one real feature PR at Gate 2. |
| 3 | The pilot -> main release PR opens with an overview: one plain line per landed feature, then today's table unchanged; a trivial-work PR's body opens with an overview too. | `releaseNotes` test with 2 seeded landings: 2 overview lines above the unchanged table; a wording pin on `agents/pilot.md`'s trivial-work line (A6). |
| 4 | The overview is never stale: an edited overview, or a changed slice record, changes the body at the next write. | Test: a second `syncFeaturePr` with a changed overview makes exactly 1 `edit` carrying it; with 1 more slice `integrated`, the `Built so far: k of n parts.` line moves from 1 to 2. |
| 5 | Matt Pocock's `pr` skill is read first; what is taken is recorded, prompt text only, nothing installed. | §3 names source and lines taken; `skills/pr-overview/SKILL.md` carries the provenance header and `vendor/pr-overview.md` a row (A7); the diff adds 0 hooks, 0 `.mcp.json`, 0 network calls. |
| 6 | The overview is short and plain: at most 150 words, sentences averaging at most 20 words. practitioner: a technical writer works to plain-language rules (short sentences, the reader's words), not to a template. | `checkSpec` refuses an artefact whose overview is over either bound, or missing, or holds a banned token: 4 cases in `check-spec.test.mjs`. |
| 7 | A run whose artefact has no overview (runs already in flight) gets exactly today's body. | Test: `featureBody` with no overview returns the bytes it returns on `origin/pilot` today; the release line falls back to the slug. |
| 8 | The overview uses the project's own words. practitioner: Pocock's rule, "use the user's domain language from `GLOSSARY.md`". | The skill names `GLOSSARY.md` when one exists; the user's Gate 2 read finds 0 terms they do not know (reader check, *assumed*). |

## 3. Findings

What exists:
- `scripts/feature-pr.mjs:63` `featureBody(spec, record, footer)`: §2 + `Slice | State | PR` table + footer, through `quiet`. `syncFeaturePr` (:138) reads the artefact from `origin/feat/<slug>` and edits only on a differing body (:192-197).
- The deck runs `pilot pr` on every gate1 post (`deck/server-tools.mjs:337`), every QA comment (:340) and every `deck_status` of a ticket with a gate1 (:482). So the body is already recomputed from the branch on each move; freshness reduces to the artefact's text being current.
- `scripts/release.mjs:38` `releaseNotes` writes the pilot -> main body from `git log` alone (#135: a 3-column table). Marked legacy, still live.
- QA's comment is a separate comment (`upsertComment`), not the body; untouched.
- Trivial work: the pilot writes its own PR body (`agents/pilot.md:189`). No deck code.
- `scripts/check-slices.mjs:253` `checkSpec` is the architect's own check on `architecture.md`; not run by the deck, not over old artefacts.
- No model runs in the deck: prose must come from a crew agent; the deck only copies it.
- Example #142: the body opens `## 2. Spec` and a 9-row table; slice states read `planned`.
- Prompt budgets: `scripts/test/measure-prompt.test.mjs` pins `agents/pilot.md`; `scripts/test/qa-preview.test.mjs` pins QA's share. Project-glossary (#133) edits `agents/pilot.md` and `agents/pilot-architect.md` and adds `GLOSSARY.md`.

Matt Pocock's `pr` skill (mattpocock/skills 1.3.2, `skills/engineering/pr`, commit e484a80, MIT): ships `SKILL.md`,
`CREDITS.md`, `agents/openai.yaml`; no scripts, hooks, `.mcp.json`, credentials or network calls. Template `## Summary`
(a diagram), `## Evidence` (before/after), `## Merge Danger` (one-way or two-way door, blast radius). Audience: the
reviewer; nothing for a non-technical reader. Taken (adapted): "Skip all preambles and keep prose brief"; "Use the
user's domain language from `GLOSSARY.md`"; the door and blast radius, as the overview's last line. Not taken: the
diagram Summary (credited to Dex Horthy's `show-me`, so not vendored) and Evidence (the tables carry it).

### Seams

| Seam | Interface | Folded behind it | Category |
| --- | --- | --- | --- |
| `scripts/pr-overview.mjs` (new) | `overviewOf(markdown)`, `overviewProblems(text, roles)`, `builtLine(record)`, `overviewBlock(markdown, record)` | the section read, the banned-token and plain-language rules, the built count; three callers would otherwise each re-parse | in-process |
| `featureBody` | `featureBody(spec, record, footer, overview?)` | the overview placed first; the rest unchanged | in-process |
| `releaseNotes` | `releaseNotes({ git, pilotRef, mainRef, prs })` | each landed feature's overview line read at `pilotRef` | local-substitutable (git injected) |
| `checkSpec` | `checkSpec(markdown)` | rule `overview-plain` | in-process |

Deletion test: deleting `pr-overview.mjs` puts the section parse and rules back into three callers, so it stays.
`overviewBlock` passes the deletion test only because `featureBody` and the trivial pin both need its shape.

## 4. Ubiquitous language

- **Overview**: the `## Overview` section of `architecture.md`, four labelled lines, copied to the PR's top.
- **Feature PR**: the draft PR from `feat/<slug>`, written by `pilot pr`.
- **Release PR**: the open PR pilot -> main, written by `releasePr` at each landing.
- **Trivial PR**: the one PR of trivial work, written by the pilot.
- **Built line**: `Built so far: k of n parts.`, counted from the record's slice states starting `integrated`.
- **Door**: one-way (hard to undo) or two-way (can be walked back), Pocock's term.

## 5. Locked decisions

- **L1** Grilling depth is forks: the user's press on `itm_91ef98184724`.
- **L2** The overview's text lives in `architecture.md` as `## Overview` above §1, so the user reads it at Gate 1 and `pilot pr` copies it; the deck writes no prose. Rejected: a model call in the deck (no model there, metered billing); a separate `overview.md` (one more file for the same reader).
- **L3** One pure module `scripts/pr-overview.mjs` owns the parse and the rules; `featureBody`, `releaseNotes` and `checkSpec` call it. Rejected: the rules inline in each caller.
- **L4** No overview means today's body, byte for byte (spec 7): runs in flight are not broken. Rejected: refusing a gate1 without one (would touch `deck/store-items.mjs`, which ui-design-workflow S8 owns).
- **L5** The built line is the one record-derived line, counted from states starting `integrated` (507 of the record states in `docs/design/*/run.json` do); never a slice id.
- **L6** The overview's own rules live in an adapted skill, `skills/pr-overview/SKILL.md`; each writer's agent file gains one line naming it. ADR 0219 records L2-L6. Rejected: the rules restated in three agent files (prompt pins at 0 headroom).
- **L7** QA's environment is this feature's own draft PR on GitHub; other open PRs keep their bodies until their runs next update them. The user's press on `itm_121c01811a63`.

## 6. Assumed decisions

- **A1** Authors: architect writes it at Gate 1; QA rewrites it on `feat/<slug>` when its fixes change what a user sees; the pilot writes the trivial one; the deck composes the release one. Rejected: the pilot writes all (its context), the Gate 1 text stands untouched (can describe cut work). Thread `itm_cc3f54ddd01d`.
  Verdict: stands — the user pressed Architect, then QA on itm_cc3f54ddd01d
- **A2** Shape: four labelled lines, What changes / Why / What you'll notice / Can it be undone (door and who it affects), with the built line under them. Rejected: a free paragraph, nicer but uncheckable. Thread `itm_62f0a9fec739`.
  Verdict: stands — the user pressed Four labelled lines on itm_62f0a9fec739
- **A3** Banned tokens: `S<n>`, `itm_`, `A<n>`, `L<n>`, `ADR <4 digits>`, and the crew role names, from `agents/pilot-*.md` basenames minus `pilot-` (architect, implementer, fundamentalist, co-pilot, lander, teacher, explorer, qa ...); "pilot" itself stays, it is the product. Tradeoff: "explorer" or "teacher" in honest prose is refused too.
  Verdict: stands — the ticket's line 1 names these ids; pilot is the product's name
- **A4** Pocock's text adapted into a new skill rather than quoted in agent prose; ledger row at 1.3.2 in its own fragment, vendor/pr-overview.md, since build-vendor-ledger.mjs refuses two upstream versions in one fragment. Tradeoff: one more skill file to re-sync.
  Verdict: stands — glossary left the prompt pins at 0 headroom, a pointer line fits
- **A5** Release overview: one line per landed feature, the first sentence of its What changes; no artefact at `pilotRef`, the slug. Rejected: a written paragraph at landing (needs a model, stale between landings). Stated in thread `itm_cc3f54ddd01d`'s default.
  Verdict: stands — one line per landed feature was in the default the user pressed on itm_cc3f54ddd01d
- **A6** The trivial PR is proved by a wording pin on `agents/pilot.md` (ADR 0082 allows one where wording is the product). Rejected: a `pilot pr-body` helper, a CLI for one prompt line.
  Verdict: stands — no deck code writes the trivial PR body

- **A7** The pr skill's ledger row lives in its own fragment, vendor/pr-overview.md, because scripts/build-vendor-ledger.mjs:76-88 refuses two upstream versions (1.2.3, 1.3.2) in one fragment. Rejected: dropping the version from the builder key, which weakens one-version-per-fragment for every ledger; a 1.2.3 header, which is false provenance. Taken by default in S3.
- red team: S3's prompt lines land on `agents/pilot.md` and `agents/pilot-architect.md` while project-glossary lands; S3 merges `origin/pilot` first and re-measures the pins, never edits a pin to fit unmeasured.
- red team: `specOf` stops at the next `## `, so `## Overview` above §1 never leaks into §2; walked against `scripts/feature-pr.mjs:74-90`.
- red team: an overview carrying `@name` would notify; it passes through `quiet` like the rest (spec 1 test covers it).

## 7. Out of scope

Renaming the pilot branch (itm_0476cd419c86); QA's comment; slice table states going stale in the record; any deck
refusal of a gate1; diagrams; a model call anywhere in the deck; rewriting old PRs.

## 8. Slices

Width 2; longest stem 2

| Slice | Title | Spec | Files owned | After | Reviewers | File |
| --- | --- | --- | --- | --- | --- | --- |
| S1 | A feature PR opens with its overview | 1, 2, 4, 7 | `scripts/pr-overview.mjs` (new), `scripts/feature-pr.mjs`, `scripts/test/pr-overview.test.mjs` (new), `scripts/test/feature-pr.test.mjs` | – | typescript | [S1](slices/S1.md) |
| S2 | The release PR opens with one line per feature | 3, 7 | `scripts/release.mjs`, `scripts/test/release.test.mjs` | S1 (`overviewOf`) | typescript | [S2](slices/S2.md) |
| S3 | The writers write it and the check holds them to it | 1, 3, 4, 5, 6, 8 | `scripts/check-slices.mjs`, `scripts/test/check-spec.test.mjs`, `skills/pr-overview/SKILL.md` (new), `vendor/methodology.md`, `THIRD-PARTY-NOTICES.md`, `agents/pilot-architect.md`, `agents/pilot-qa.md`, `agents/pilot.md`, `scripts/test/measure-prompt.test.mjs`, `scripts/test/qa-preview.test.mjs`, `scripts/test/pilot-agents.test.mjs`, `docs/adr/0219-pr-overview.md` (new) | S1 (`overviewProblems`) | typescript, security | [S3](slices/S3.md) |

S1 is the walking skeleton: this artefact's own overview reaches its own feature PR's top at Gate 1.

## 9. Acceptance evidence

1. At Gate 1 the draft feature PR for this run opens with this artefact's `## Overview` and its built line `0 of 3`.
2. The tables below it read as on #142, unchanged.
3. As slices integrate, the built line counts up on the PR with no hand edit.
4. At Gate 2 the user reads the overview cold and can say what the feature does.
5. After landing, the release PR pilot -> main opens with one plain line for this feature.
6. `node scripts/check-slices.mjs` on an artefact with `S1` in its overview fails, naming the line.

## 10. Status

| Slice | State | Branch | PR | Worktree | After | Spec |
| --- | --- | --- | --- | --- | --- | --- |
| S1 | planned | `slice/pr-overview-s1` | – | – | – | 1, 2, 4, 7 |
| S2 | planned | `slice/pr-overview-s2` | – | – | S1 | 3, 7 |
| S3 | planned | `slice/pr-overview-s3` | – | – | S1 | 1, 3, 4, 5, 6, 8 |
| pr-overview | planned | `feat/pr-overview` | – | – | S1, S2, S3 | 1-8 |
