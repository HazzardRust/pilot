# Finding schema, tiering and write-back

> Read this before writing up a review. The ordering rules are the deliverable,
> not presentation.

## Why tiering

A compliance review returns findings with radically different audiences and
clocks. "The retention default is unlawful and someone must choose a new one"
and "this log line includes a student's name" both matter, but one needs a
person with authority before any code is written and the other needs an engineer
for ten minutes. Presented as a flat list, the second buries the first, because
there are always more small findings than large ones.

Hence: **decisions first, quick fixes last.**

## The three tiers

### D — Decision

Requires a human choice, or is hard to reverse once made.

- The governing regime is ambiguous or contested
- A documented control is stricter or looser than the law appears to require
- A lawful design exists but has material cost, scope or product consequences
- The obligation conflicts with another obligation and something must give
- The fix changes an architectural boundary, a data model or a customer contract

**Never fix a D-tier finding.** Report it and stop. Where the project keeps
architecture decision records, say that an ADR is owed and name the question it
must answer. The value is the decision reaching a person, not the diff.

### O — Obligation gap

The law requires something that does not exist. No judgement call is involved —
the thing is simply unbuilt.

- No deletion mechanism exists for a category that must be disposed of
- No audit trail exists where record-keeping is mandated
- No mechanism exists to serve an access or correction request
- A required notice or disclosure is absent
- A required contractual instrument has no counterpart in the system

These are ordinary engineering work with an external deadline. Give each an
estimate of what discharges it, not just what is missing.

### F — Fix

Bounded, local, and the right answer is obvious.

- A field carrying personal information is logged
- A hard-coded region, endpoint or model identifier contradicts the residency rule
- A TTL constant disagrees with the documented floor
- An error report or telemetry payload carries more than it needs
- A cascade deletes something a retention rule requires be kept

## Ordering within a tier

Sort by **exposure**, in this order:

1. **Personal liability** — the consequence attaches to a natural person
   (a director, a records officer, a named individual) rather than to the
   company. This outranks everything, because a company can absorb a fine and a
   person cannot delegate an offence.
2. **Organisational liability** — penalty, enforceable undertaking, or licence
   consequence for the entity.
3. **Remediable on notice** — the realistic first consequence is a regulator
   asking you to fix it.
4. **Contractual** — a customer can terminate or claim, but no regulator is
   involved.

Where exposure is unknown, say so rather than guessing, and place the finding at
the top of its band. An unknown consequence is a reason to look, not a reason to
deprioritise.

## Finding schema

Every finding carries all of these. A field that cannot be filled is written as
`unknown`, never omitted.

```markdown
### [D1] Retention default contradicts the statutory minimum

- **Tier**: D — Decision
- **Exposure**: Personal liability - the offence attaches to an individual
- **Obligation**: Records must be retained for a minimum of one year
  - **Citation**: [Instrument, section] (retrieved 2026-08-22)
- **Code anchor**: `apps/worker/src/retention.py:41`
- **Status**: Verified in code
- **What is wrong**: The default TTL is 90 days. Any deployment that does not
  override it disposes of records inside the statutory minimum.
- **What would discharge it**: A floor enforced structurally, so that
  configuration can narrow the window but never widen it past the minimum.
- **Who must decide**: Whoever owns the retention policy. The choice of floor is
  not an engineering decision.
- **Confidence**: High. The constant and the citation were both read directly.
```

### The status field

Exactly one of:

- **Verified in code** — the anchor was read and it says what the finding claims
- **Inferred** — the pattern strongly suggests it, but the path was not traced
- **`[UNVERIFIED]`** — raised from the obligations without confirming the code

Mixing these silently is the fastest way to destroy a review's credibility. One
hallucinated finding presented with the same confidence as nine verified ones
puts all ten in doubt, and the reader has no way to tell which was which.

### The citation field

Either a specific citation to a primary source actually retrieved, with its
retrieval date, or the literal marker `[UNVERIFIED]`. Never a section number
produced from memory. If the obligation is real but the citation could not be
retrieved, state the obligation and mark the citation unverified — that is
useful and honest. A fabricated citation is neither.

## Write-back

### Where

- **Dedicated-note mode** — append to the note under a dated heading.
- **Adopted-corpus mode** — append to the corpus's audit file, or create a new
  dated audit note beside the others and add one row to the corpus index. Follow
  the corpus's existing numbering and naming rather than introducing your own.

### Format

```markdown
## Review 2026-08-22

**Scope**: pre-push, `git diff origin/main...HEAD` (14 files)
**Regime**: [jurisdiction] / [sector], per the note's regime section
**Agents**: database-reviewer, security-reviewer, python-reviewer
**Research**: WebSearch fallback - firecrawl and exa MCPs not configured

### Summary

Two decisions, three obligation gaps, six fixes. The decisions block the
release; the fixes do not.

### Coverage gaps - what this review could not check

| File or area | Why it was skipped | What would close it | Status |
|---|---|---|---|
| `docs/FEEDBACK-CONTRACT.md` | Being edited by another process during the review | Re-run the feedback domain once that work lands | **Open** |

### D - Decisions
...
### O - Obligation gaps
...
### F - Fixes
...

### Carried forward

| From | Finding | Status |
|---|---|---|
| 2026-06-01 | [D2] Sector defaulting | Discharged - see ADR 0005 |
| 2026-06-01 | [O1] No access-request path | Still open |

### Not findings

Things checked and found correct, so the next review does not re-raise them:
...
```

### Coverage gaps go near the top, never in the fine print

Any file or area the review could not check — locked, being edited by another
process, unreadable, timed out, or outside the scope that was set — gets its own
named section immediately after the summary.

**Not a caveat, not a footnote, not a parenthetical in the method section.** The
point of recording a skipped file is to give a reader the chance to go back and
look at it later, and that only works if they meet it every time the document is
read. A caveat buried in the body is read once, on the day it is written. A gap
nobody revisits is functionally the same as a gap nobody recorded.

Give each row a **status** so it can be discharged and seen to have been
discharged. It is an open item, not a disclaimer.

This matters most for exactly these documents, because they are re-read later as
evidence. A reader months afterwards has no other way to know that a clean result
was actually a partial one.

### Rules for write-back

1. **Append, never overwrite.** Previous reviews stay. The history is the audit
   trail, and an audit trail that is edited is not one.
2. **Supersede with a dated note**, do not delete. When a finding is discharged
   or turns out to be wrong, say so in place with the date and the reason.
3. **Carry forward every open finding.** A finding that silently vanishes between
   reviews looks discharged and is not.
4. **Record the negatives.** The "not findings" section is what stops the next
   review re-raising a settled question, and it is the cheapest durable output of
   the exercise.
5. **Record the method.** Scope, agents, research path. A reader must be able to
   tell whether a clean review was thorough or merely narrow.
6. **Never write a legal conclusion.** "This is unlawful" is not yours to say.
   "This appears to conflict with [citation], and here is the anchor" is.

## Reporting to the user

In chat, lead with the decision count and whether anything blocks the push:

> Three findings block the push, all D-tier. Six fixes can follow later.
> Appended to `docs/compliance/70-audit-2026-08-22.md`.

Then the D-tier findings in full, the O-tier in one line each, and the F-tier as
a count with a pointer. The user reads the decisions; the file holds the rest.

## Expected false positives

Say these are expected, so they are not treated as noise or as failures of the
skill:

- **Test fixtures and seed data** that look like personal information
- **A constant that disagrees with the note** where the note is the stale one —
  check the code's history before assuming the code is wrong
- **Deletion paths that look absent** because they live in infrastructure rather
  than application code
- **Vendor SDK defaults** that are overridden at a call site the reviewer did not
  reach
- **Obligations that apply to the customer, not to you** — capacity again

When a finding survives one of these checks, say which check it survived. That is
what makes it credible.
