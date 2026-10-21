# Remediation planning

> Read this at Step 6, after findings are ranked and written back.

## What this step is for

The review produces findings ranked by **who must act**. A plan needs them
ordered by **what unblocks what**. Those are different sequences, and conflating
them produces a plan that starts with the most alarming item rather than the
first actionable one.

The architect's job here is sequence and shape, not discovery. It receives the
findings as given.

## Architect brief template

```
You are planning remediation for a completed compliance review. The findings
are given. Do not re-derive them and do not audit the codebase for new ones.

REGIME: [jurisdiction] / [sector]. Operator acts as [capacity].
FINDINGS: [paste the ranked findings, with IDs and anchors]
DEADLINES: [any commencement or statutory date, with days remaining]

PRODUCE AN ORDERED WORK PLAN.

Order by DEPENDENCY, not by severity. The findings are already severity-ranked;
that is not the plan's ordering. Ask what each item needs to exist first.

FOR EACH ITEM:
- the finding ID(s) it discharges
- what changes, concretely, in which files
- what it depends on - especially any D-tier decision that gates it
- BLAST RADIUS: what this change could break. Required, not optional.
- how it would be verified - the test that fails before and passes after
- rough size

RULES:
- Do NOT resolve a D-tier finding. Those are reserved for a human. Plan around
  them: state the options, what each costs, and what stays blocked until the
  decision is made.
- Group into: BLOCKED PENDING DECISION / BUILDABLE NOW / SAFE ANY TIME.
- Where a deadline exists, say which items must land before it and which need
  not.
- If the obvious remedy for a finding is wrong, say so and say why. This is the
  most valuable thing you can contribute.
- Do not write the code. Plan it.
```

## The naive-remedy trap

The single most useful thing this step produces is a warning that the obvious fix
is wrong. Compliance remedies attract naive fixes because the finding usually
names its own solution, and the named solution is often unsafe.

**A worked example, from a real run.** The finding: a pinned policy-decision
column is documented as immutable, but unlike its sibling audit tables it carries
no trigger preventing UPDATE or DELETE. The obvious remedy is to copy the
`reject_mutation()` trigger that already protects the ledger tables in the same
migration file. One line, same pattern, visibly consistent.

It would break the application. Those sibling tables are append-only by nature —
nothing ever updates a ledger entry. The table in question carries batch **status
transitions**, which are ordinary UPDATEs happening constantly. A whole-table
trigger forbids them all.

The correct remedies are a column-scoped trigger, or moving the pinned decision
into a genuinely append-only table — both more work than the naive fix, and
neither obvious from the finding text.

The general shape: **a control copied from a structurally different neighbour
inherits assumptions that do not hold.** Ask what the neighbour's data does that
this data does not.

## Other recurring traps

**Redaction filters that miss a field.** A log sanitiser matching known key names
silently passes anything renamed later. The remedy is usually an allowlist of
what may be logged, not a denylist of what may not.

**Row-level security that the application role bypasses.** Enabling RLS does
nothing if the application connects as table owner. `FORCE ROW LEVEL SECURITY`
is a separate statement, and the omission is invisible in testing when tests run
as a different role than production.

**Retention jobs that read the wrong number.** A disposal job that re-derives its
own window rather than reading the pinned decision reintroduces the divergence the
pinned decision existed to prevent.

**A deletion path with no proof.** "Deleted" and "provably deleted" are different
obligations. A remedy that removes the row without writing the disposal record
discharges half of it.

**Fixing a documentation finding by editing the finding away.** Stale evidence is
superseded with a dated note, never deleted. The correction is itself part of the
audit trail.

## Plan output shape

```markdown
## Remediation plan - 2026-08-22

### Blocked pending decision
| # | Discharges | Blocked on | Options |
|---|---|---|---|

### Buildable now
| # | Discharges | Changes | Blast radius | Verified by | Size |
|---|---|---|---|---|---|

### Safe any time
Documentation and evidence corrections, no runtime effect.

### Deadline-driven
| Item | Deadline | Days | Must land before |
|---|---|---|---|
```

Keep the plan traceable to finding IDs throughout. A plan that cannot be mapped
back to the findings it discharges cannot be checked for completeness, and the
next review will re-raise whatever it quietly dropped.
