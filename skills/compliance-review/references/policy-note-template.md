# The policy note: shape and template

> Read this at Step 3, when generating or updating the note.

The note is the review's rubric, its memory and its output. It has to be
readable by a lawyer who cannot read code and by an engineer who cannot read
statute, which is a real constraint on how it is written: **state the obligation
in the law's terms and the consequence in the system's terms, in that order,
and keep them in separate sentences.**

## Sizing and shape

Aim for one screen per obligation family. A note nobody reads is not a control.

**Default to the split shape — a `docs/compliance/` directory of numbered
files — for any new dedicated note that covers a real product**, not only once
a single file grows past roughly 300 lines. A single monolithic note is the
right call in exactly two cases: a genuinely narrow review (one obligation
family, one file's worth of finding), or a `status: structure-only` skeleton
left for a human to fill in. Anything else — a first real compliance pass
against a live product — reaches several obligation families and at least one
dated audit before it is useful, and a single file at that point becomes
precisely the "wall of undifferentiated findings" the skill's own anti-patterns
section warns against. Start split; do not wait to be forced into it.

Both shapes carry the same content — Steps 3 through 5 do not change — the
split shape only gives each obligation family, and each dated audit, its own
file with its own citations, instead of stacking all of it into one document.

## Naming

- **Dedicated note, single file** (narrow review or a `structure-only`
  skeleton only): `POLICY-REVIEW.md` at the repository root, or
  `docs/POLICY-REVIEW.md` if the root is crowded.
- **Dedicated note, split** (the default): `docs/compliance/` — see
  "Split into numbered files" below for the concrete shape.
- **Adopted corpus**: keep whatever the project already uses. Follow its
  existing numbering and naming. Do not introduce a competing scheme.

---

## Split into numbered files (the default shape)

This is the shape produced in this skill's own worked example: ISMGenius's
`docs/compliance/` (10 through 70, plus a `README.md` index), restructured
from a single `COMPLIANCE.md` on 2026-09-01. Follow it directly unless the
project already has its own compliance-doc convention, in which case that
convention wins — see the adopted-corpus rule in `SKILL.md`.

### Numbering bands

Numbers signal what kind of claim a file makes, not just its topic, so a
reader can tell derived fact from synthesis from dated evidence at a glance:

| Band | Contents |
|---|---|
| **00s–10s** | Source material derived from the code itself: the data inventory (what personal information exists, where, and which processor touches it). Low numbers because everything else cites this. |
| **20s** | The governing regime and instrument-by-instrument or provision-by-provision compliance status — the split-file equivalent of the single template's §1–2. |
| **30s–50s** | One file per obligation family or sector-specific rule that earns its own document — a special category of data subject, a tracking/consent regime, a cross-border or sector-specific plan. Not every project needs all of these; add a band only for a family with enough content to justify its own file, and don't force a family that's two sentences long into its own document just to fill a number. |
| **60s** | The synthesis — a single numbered action list, prioritised, struck through as items discharge. This is the file in the whole directory a busy operator should read first; the index should say so. |
| **70s+** | Dated audits — one file per review date, in the shape `references/findings-format.md` already describes for adopted-corpus write-back. Never edit a past audit's findings in place; a later audit adds a dated supersession note (see below), and a new review date gets a new file. |

Adjust the exact topics inside 30s–50s to what the project actually has — the
numbers are a convention for signalling kind, not a checklist that must be
filled top to bottom.

### The index file (`README.md`)

Every split note has one `docs/compliance/README.md` that a reader opens
first. It carries, in order:

1. Frontmatter (`title`, `tags`, `status`, `regime`) and the same not-legal-
   advice framing as the single-file template's header.
2. **"Start here"** — a one-line pointer to whichever numbered file the
   synthesis lives in (usually the 60s file), because that is the one file
   a time-pressed reader needs.
3. A table of every file in the directory with a one-line description of what
   it covers — the directory's table of contents.
4. **"The regime, in one line"** — the single-template's §1 compressed to a
   paragraph, so a reader never has to open a second file to learn what law
   applies.
5. **"What is already right"** — carried from the single template's §7. This
   is not self-congratulation; it stops a later review re-raising a settled
   question and tells a regulator what was deliberate.
6. **"What is still open"** — a compressed version of the current dated
   audit's findings, with a pointer to the full file. Keep the finding count
   in this summary in sync with the audit file itself; a mismatched count
   (e.g. "ten" here against "nine" in the audit) is exactly the kind of
   internal inconsistency a restructuring introduces silently — check it.
7. **"How this was researched"** — carried from the single template's §8,
   plus a line for every subsequent pass (a later verification agent run, a
   restructuring) so a reader can tell which claims were re-checked and which
   were only carried forward.
8. **"Related"** — companion documents that exist outside the directory
   (a PIA, a DPA template, a threat model) and are not yet migrated in.

### Per-topic files (the 10s–50s and 60s bands)

Each file opens with:

```markdown
---
title: <what this file is about>
tags: [privacy, <jurisdiction>, <project>]
status: restructured <date> from <prior source>, or researched <date>
regime: <primary instrument>
---

# <Title>

*One-sentence description of what question this file answers.*

Not legal advice. <One sentence on provenance: migrated from an older note
and not re-verified in this pass, or freshly researched this pass — say
which, plainly, for every file.>

## Sources

| Claim | Source | Retrieved |
|---|---|---|
| <the claim this file makes> | <statute/APP number, vendor doc, or `path:line` code anchor> | <date, or "Carried from <prior note>, not re-verified in this pass"> |

---

<content sections — carry over whatever the single template's numbered
sections would hold for this file's slice: regime table, obligation-by-
obligation status, a data-flow table, a per-processor table, whatever the
topic calls for>

---

## Related

- [<sibling-file>.md](<sibling-file>.md) — <why a reader would go there next>
```

**The Sources table is not optional and not decorative — it is the per-file
implementation of this skill's hard rule to cite or mark `[UNVERIFIED]`.**
Every row is either a specific citation actually retrieved, a `path:line` code
anchor actually read, or the literal string "Carried from `<file>`, not
re-verified in this pass." A file whose Sources table is thin because nothing
in it was re-verified is not a defect — say so plainly in the table, exactly as
described, rather than quietly upgrading an old claim's confidence by moving
it into a fresh-looking file.

### Dated audit files (the 70s+ band)

One file per review date, in the exact shape `references/findings-format.md`
already specifies for write-back: a Sources table mapping each finding ID to
its primary code anchor, then Scope / Regime / Agents / Research, a Summary,
Coverage gaps, the findings themselves grouped by tier, "Not findings", and
"Carried forward". A finding referenced from a topic file (see below) should
resolve to a specific heading anchor in this file — e.g.
`70-audit-2026-09-01.md#o-3-<slug>` — not just the filename, so a cross-link
survives the file growing.

### Cross-referencing and dated updates, across files

A finding lives in its dated audit file, but the topic file whose status it
changes should say so and link to it — e.g. an APP-status table's row for
security links to the specific finding ID in the audit file, rather than
restating the finding's detail in two places that can drift apart.

When a fact changes after a file is written — new code lands, a later pass
verifies or partially resolves an earlier finding — **do not edit the original
claim to make it look right in hindsight.** Add a dated update in place,
clearly marked, that says what changed, what was verified and how, and what
remains true of the original finding. For example, in an audit file:

```markdown
> **Update, 2026-09-01 (later the same day) — PARTIALLY RESOLVED, not
> superseded.** <What changed, verified against what, by which reviewer or
> agent, with citations.> **The core of this finding is unchanged**: <what
> still holds, and why>. Full detail: [<topic-file>.md](<topic-file>.md).
```

This is the split-mode form of `findings-format.md`'s "supersede with a dated
note, do not delete" rule. Treat "resolved" and "partially resolved" as
different, checkable claims — verify the specific mechanism a finding called
for actually exists before calling it resolved, not just that *something*
changed in the area. A system that fixes 80% of a gap and stops is still open,
and marking it closed removes the only record that the remaining 20% was ever
tracked.

---

## Single-file template (narrow reviews, or a `structure-only` skeleton)

```markdown
---
last_reviewed: 2026-08-22
review_interval_days: 180
jurisdictions: [<specific jurisdiction>]
sectors: [<sector>]
capacity: <agency | contracted service provider | controller | processor | ...>
status: <researched | partial | structure-only>
---

# Policy note - <project>

> **Not legal advice.** This note records research into the obligations that
> appear to bind this project, as evidence for a person qualified to decide. It
> is not a legal opinion and must not be relied on as one. Every citation
> carries a retrieval date; law changes and this note does not change with it.

## 1. Regime

| | |
|---|---|
| **Jurisdiction** | |
| **Sector** | |
| **Operator capacity** | ...and the contractual basis for that claim |
| **Data subjects** | including any special category |
| **Regulator(s)** | |
| **Enforcement shape** | who investigates, what notice, whether liability attaches to an individual |

**Where the regime varies.** If it varies per customer, sector or region, say so
here and say how the system represents that. A per-customer regime cannot be
expressed as a global constant, and discovering that late is architectural.

## 2. Instruments

| Instrument | Provisions that bite | Retrieved | Source |
|---|---|---|---|
| | | 2026-08-22 | primary / regulator guidance / secondary |

Mark anything not retrieved from a primary or regulator source as
`[UNVERIFIED]`, in this table and everywhere it is relied on.

## 3. Data inventory

What personal information the system actually holds, derived from the schema and
the code rather than from intention.

| Data | Where it lives | Subject category | Special category | Leaves the country? |
|---|---|---|---|---|

Staleness check S5 diffs this table against the real schema. Keep it derived,
and note the commit it was derived from.

## 4. Obligations

One subsection per family. For each:

### 4.x <Family>

- **Obligation**: in the law's own terms.
- **Citation**: instrument, provision, retrieval date. Or `[UNVERIFIED]`.
- **Consequence for this system**: in the system's terms.
- **How it is discharged today**: with a code anchor, or "not discharged".
- **Exposure**: who is liable, and whether that is a person.

Cover at least: lawful basis and purpose limitation; collection and notice; use
and disclosure; **retention floor and ceiling, both directions**; security;
cross-border transfer; access and correction; breach notification; automated
decisions; sector-specific rules; contractual obligations beyond statute.

Write the family even when the answer is "no obligation found" - the negative is
what stops the next review re-deriving it.

## 5. Reflexes tested and excluded

The imported-reflex checklist from `regime-selection.md`, with results. Record
what was tested and found **not** to apply, not only what did.

| Reflex | Applies here? | Why |
|---|---|---|
| Erasure on request | No | The records regime forbids early disposal - [citation] |

## 6. Open items

| # | Item | Owner | Deadline | Why the date |
|---|---|---|---|---|

Future commencement dates live here. Staleness check S7 reads this table.

## 7. What is already right

The controls that exist and work, with anchors. This is not self-congratulation:
it stops the next review re-raising settled questions, and it tells a regulator
what was deliberate.

## 8. Method

How this note was researched: sources, tools, what could not be reached, and what
is consequently thin. A reader must be able to tell whether a clean note is
thorough or merely narrow.

## Reviews

Appended by `compliance-review`, newest first. See `findings-format.md`.
```

---

## Filling it in

The guidance below is written against the single-file template's section
numbers; in split mode the same content lives in the numbered file its band
covers — §3 (data inventory) is the 10s file, §4 (obligations) is spread
across the 30s–50s files by family, §6 (open items) and the ranked findings
live in the 60s synthesis and the 70s+ audits. §5 (reflexes tested and
excluded) has no dedicated band of its own in split mode — write it inline,
as a short subsection, in whichever 20s or 30s–50s file discusses the regime
question a given reflex tests, rather than collecting every reflex in one
place regardless of topic.

**Derive section 3 from the code**, never from the product description. Read the
migrations, the models, the env vars and the third-party clients. Intention and
schema diverge, and the schema is what holds the data.

**Section 4 is the rubric.** Every obligation here becomes a brief in Step 4. An
obligation too vague to test against code is too vague to be useful — sharpen it
until it names a thing you could look for.

**Section 5 is the cheapest durable value in the note.** It is where the next
review — and the next model — is stopped from importing the wrong regime's
answers. Write it even when it feels redundant.

**Mark `status: structure-only`** when research was unavailable and the note is a
skeleton for a human to fill. A skeleton labelled honestly is useful. A skeleton
that reads like researched work is a hazard, because the next reader has no way
to know the difference.
