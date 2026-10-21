---
name: compliance-review
description: Jurisdiction-agnostic legal and regulatory code review. Locates or regenerates a project's policy note, then fans out reviewer agents briefed on that note's obligations to find code that is correct, tested, and still unlawful. Use before pushing when regulatory compliance matters, or as a standing compliance audit. Covers privacy, records and retention, data residency, automated decision-making, sector rules and contractual obligations.
metadata:
  origin: hazzard
  tags: [compliance, legal, privacy, review, audit, governance]
---

# Compliance Review

> **This skill produces evidence for a human, not legal advice.** Every finding
> is a prompt for someone qualified to decide, and the output says so on its
> face. Nothing here is a legal opinion, and the skill must never write one on
> the user's behalf.

A code review whose rubric is the law that binds the project, rather than the
language it is written in.

The gap this fills: ordinary review asks whether code is correct. A change can
be correct, idiomatic, tested, green in CI, approved by a language reviewer —
and still be an offence. Those are different questions with different rubrics,
and only one of them is in the repository by default.

## When to Activate

- Before a push, tag or release **where regulatory compliance is a stated goal**
- The user says "compliance review", "policy review", "compliance check", "is this lawful",
  "regulatory review", or "are we allowed to do this"
- A change touches **retention, deletion, or any duration in days**
- A change touches **where data is stored, processed or transmitted**, including
  a new third-party SDK, model endpoint, region or CDN
- A change touches **an automated decision about a person** — a score, a grade,
  a ranking, an eligibility determination
- A change touches **children's data, health data, biometrics** or another
  special category
- A change touches **tenancy, access control, or the boundary between customers**
- Onboarding an existing codebase into a regulated market
- A new jurisdiction, sector or customer type is added

## Do Not Activate For

- General code quality — use `code-review` or the language reviewer
- Security vulnerabilities with no regulatory dimension — use `pilot:security-reviewer`
- Dependency licence compatibility — a different question with different tools
- Anything where the user wants a legal conclusion rather than a list of places
  the code and the obligations may not line up

---

## The Artifact

This skill is organised around one durable file, the **policy note**. The note
is the review's rubric, its memory, and its output. Reviews append to it; they
never silently replace it.

### Step 1 — Find the note

Search in this order and stop at the first hit:

```bash
# 1. A dedicated note
ls POLICY-REVIEW.md docs/POLICY-REVIEW.md docs/policy-review.md \
   .claude/POLICY-REVIEW.md 2>/dev/null

# 2. An existing compliance corpus - far more likely in a mature project
ls docs/compliance/README.md docs/compliance/ COMPLIANCE.md \
   docs/legal/ docs/privacy/ 2>/dev/null

# 3. Obligations embedded in operating rules
grep -rlnE "compliance|regulat|statut|privacy|retention" \
   CLAUDE.md AGENTS.md README.md docs/adr/ 2>/dev/null | head
```

**If hit 2 fires, adopt the existing corpus. Do not create a competing file.**
A project with `docs/compliance/` already owns these facts. Writing a second
summary beside it is how documentation corpora rot: two files that agree today
and disagree in six weeks, with nothing to say which is current. Append your
review to the corpus's own index or audit file and link, rather than restate.

Record which mode you are in — **dedicated note** or **adopted corpus** —
because Step 5 writes to different places in each. Adopting a corpus is a
decision about where findings get written, not a verdict that the corpus's
own legal claims are sound — run the staleness test S8 below before assuming
otherwise.

### Step 2 — Triage the note for staleness

A stale policy note is more dangerous than a missing one: it is confidently
wrong, and it will be believed. Run every check; each is cheap.

| # | Test | How to check | Verdict if it fires |
|---|---|---|---|
| S1 | No note at all | Step 1 found nothing | **Generate** |
| S2 | Regime unstated | No jurisdiction *and* sector named in the note | **Regenerate** — see below |
| S3 | A commencement date has passed | Grep the note for future-tense dates, compare against today | **Update** that section |
| S4 | A cited instrument was amended or repealed | Research each citation's current status | **Update** those sections |
| S5 | Code surfaces the note does not know about | Diff the note's data inventory against the actual schema, models, env vars and third-party clients | **Update** the inventory |
| S6 | Older than the review interval | `last_reviewed` in frontmatter; default 180 days | **Update** |
| S7 | A pending item's deadline has passed | The note's own open-items table | **Escalate** into findings |
| S8 | The corpus's own claims were never checked against a primary source | Scan every citation/Sources/Instruments table in the note or corpus. If every row is a narrative assertion, a "well-established" wave, or "carried from an earlier note, not re-verified" — with no row anywhere citing a specific section, a regulator-guidance URL, and a retrieval date for that regime's core instrument — the corpus has never actually been researched, whatever its dates say | **Research** — run Step 3 at least once for the affected regime, even in adopted-corpus mode, before Step 4's findings are treated as a compliance review rather than a code-consistency check |

**S2 is fatal on its own.** A note that does not name its jurisdiction and
sector cannot be checked against anything, because the same code is lawful in
one regime and an offence in another. There is no safe default regime — see
`references/regime-selection.md`. Put it to the user as a `question` item on the
deck rather than guessing; this is the one question in the workflow worth
blocking on, so post it with `mcp__plugin_pilot_deck__deck_post` and wait on
`mcp__plugin_pilot_deck__deck_wait` for the answer.

### Step 3 — Generate or update the note

Regeneration is research, and research about law is the highest-risk step in
this skill. Read `references/regime-selection.md` in full before starting, and
`references/policy-note-template.md` for the output shape.

**Research path, in preference order:**

1. **A research MCP** — preferred, where the project has one connected. Verify
   it is actually connected before promising it; if none is, say so and fall
   back rather than silently producing thinner work.
2. **`WebSearch` + `WebFetch`** — the fallback, and the only path this package
   depends on. Slower and narrower, but it reaches primary sources, which is
   what matters. Fetch the legislation itself and the regulator's own guidance,
   not a law firm's summary of them.
3. **Ask on the deck.** If neither path is available, do not synthesise a note from
   training data and present it as researched. Say plainly that current law
   cannot be verified offline, and offer to draft the *structure* for a human to
   fill.

**The rule that governs this step: cite or mark `[UNVERIFIED]`.** Every
obligation carries either a specific citation to a primary source actually
retrieved, or the literal marker. A fabricated section number is worse than an
absent one, because it survives review by looking exactly like work. This is the
best-documented failure mode of language models in legal work, and it is not
rare.

Prefer, in order: the instrument itself → the regulator's published guidance →
a government explainer → anything else. Record the retrieval date beside each
citation, because "the law as at 2026-08-22" is a checkable claim and "the law"
is not.

### Step 4 — Review the code against the note

Now fan out. Read `references/review-domains.md` for the full mapping.

The design decision that makes this work: **a general reviewer briefed
generically returns general findings.** Pointing `security-reviewer` at a
repository yields OWASP issues, which are valuable and are not what this skill
is for. Each agent must receive a brief naming the specific obligations it owns,
the specific code surface, and an explicit instruction that it is hunting
statutory nonconformance rather than code quality.

Build one brief per obligation family, then dispatch:

| Obligation family | Code surface | Agent |
|---|---|---|
| Retention, deletion, TTL, disposal | migrations, schedulers, cascade rules, backups | `pilot:database-reviewer` |
| Data residency and cross-border transfer | region config, SDK endpoints, third-party clients, CDN | `pilot:security-reviewer` |
| Tenancy and access control | RLS policies, authz middleware, query filters | `pilot:database-reviewer` + `pilot:security-reviewer` |
| Automated decisions about people | scoring, inference, ranking, eligibility | the language reviewer |
| Audit trail and record-keeping | event tables, append-only structures, log retention | the language reviewer |
| Special-category data leakage | logs, telemetry, error reports, analytics, model prompts | `pilot:security-reviewer` |
| Health or clinical data | anything touching PHI | the language reviewer, briefed on the sector rule |
| Consent, notice and transparency | onboarding flows, policy copy, user-facing text | the language reviewer |
| Language-level correctness of the above | the implementation | `pilot:python-reviewer`, `pilot:typescript-reviewer`, etc. |

**Scope the surface first.** In pre-push mode, review the diff
(`git diff origin/main...HEAD`) plus anything the diff makes reachable. In audit
mode, review the whole repository. Dispatching whole-repo agents for a two-file
change wastes money and buries the real finding in noise.

**Dispatch only the families the note actually raises.** A project with no
health data needs no sector brief. Agents are not free.

### Step 5 — Rank, then write back

Read `references/findings-format.md` for the full schema. The ordering is the
point of this step: **decisions first, quick fixes last**, because the tiers
have different audiences and different clocks.

| Tier | Meaning | Who acts |
|---|---|---|
| **D — Decision** | Requires a human choice, or is hard to reverse. Often needs an ADR | A person with authority, before any code |
| **O — Obligation gap** | The law requires something that does not exist. No judgement call, just unbuilt | An engineer, this sprint |
| **F — Fix** | Bounded, local, the right answer is obvious | An engineer, now |

Within a tier, order by exposure: **personal liability** first (offences that
attach to an individual rather than to the company), then organisational, then
remediable-on-notice.

Every finding carries a code anchor (`path:line`) or is explicitly labelled
unverified. A finding without an anchor is a hypothesis, and mixing hypotheses
with verified findings destroys the credibility of both.

Append under a dated heading — in a single-file note, that heading lives in
the note itself; in the split shape (the default — see
`references/policy-note-template.md`), it is a new numbered file in the 70s+
band, cross-linked from the index and from every topic file whose status it
changes. Never delete a previous review — mark superseded items with a dated
note in place, never by rewriting the original finding to read as though it
always said that. The history is the audit trail, and an audit trail you edit
is not one.

**Record what the review could not check, in a named section immediately after
the summary.** Files that were locked, being edited by another process,
unreadable or out of scope get a row with the reason, what would close it, and a
status. Never a caveat or a footnote — a skipped file is recorded so someone can
go back to it, and that only works if they meet it every time the document is
read. A gap nobody revisits is the same as a gap nobody recorded.

### Step 6 — Plan the remediation

Dispatch `pilot:pilot-architect` with the ranked findings. Read
`references/remediation-planning.md` for the brief template and the traps.

The architect receives **the findings, not the review brief**. Its job is the
order of work and the shape of each remedy, not to re-discover the problems.

Three rules make this step useful rather than decorative:

**Order by dependency, not by tier.** The findings are ranked by who must act;
the plan is ordered by what unblocks what. These give different sequences. A
disposal job cannot be built before the retention decision it implements is
settled, and wiring a pipeline before the enforcement-point decision is made
builds the thing you will have to unpick. D-tier findings usually gate O-tier
work, so the plan's first section is normally "blocked pending decision".

**The architect must not resolve a D-tier finding.** It plans *around* one,
presenting the options and what each costs. A decision reserved for a human in
Step 5 is not reopened by an agent in Step 6.

**Every remedy states what it could break.** This is the step's highest-value
output and the one an architect will skip unless asked. The naive remedy for a
compliance finding is very often wrong in a way that only shows up in
production — see `references/remediation-planning.md` for the worked example,
where copying an append-only trigger onto a table with legitimate status
transitions would break the application while looking like the obvious fix.

Output: an ordered work plan, each item traced to a finding ID, each carrying
its blast radius and its blocking dependency.

### Step 7 — Apply the safe lane, propose the rest

The plan is not the end, but almost none of it may be applied unattended. The
boundary is drawn by **what a change touches**, not by how small it is.

#### The autonomous lane: documentation and evidence only

Apply without asking, and only these:

- superseding a stale finding with a dated note
- refreshing a data inventory that has drifted from the schema
- correcting a commencement date left in the future tense
- adding an index row for a note this review created
- recording a discrepancy between a document and the code

What they have in common: **no runtime effect, and trivially reversible.** They
are corrections to evidence, and stale evidence is itself a risk — a note
claiming a control is inert when it is live will be relied on in a risk review.

#### Everything else is proposed, never applied

Requires explicit approval, without exception:

- every **D**-tier finding — already a hard rule
- every **O**-tier finding; these are subsystems, and "begin the work" means
  starting a sprint, not applying a patch
- every **F**-tier finding that touches code, a migration, configuration or
  infrastructure — including ones that look trivial

**Why F-tier code fixes do not qualify.** The naive remedy for a compliance
finding is very often wrong in a way that passes its own test. Copying an
append-only trigger from a sibling audit table is one line, additive, strictly
narrowing, and consistent with the surrounding code — and it breaks every status
transition on a table that has them. If a change that clean can be that wrong,
"small and additive" is not a sufficient condition for autonomy here.

The asymmetry that settles it: a known gap sits tracked in the audit note; a bad
fix looks discharged and is tracked nowhere. **A wrong autonomous remedy is worse
than the gap it closes**, because it removes the record that anything was ever
wrong.

#### Guardrails on both lanes

- Work in a **dedicated worktree and branch**. Never the default branch.
- **Skip any file another instance has modified**, and record it in the review's
  coverage-gaps section rather than merging blind. Skipping silently is the
  failure this guardrail exists to prevent.
- Every applied change needs a check that **fails before and passes after**. For
  a documentation correction that check may be a doc test or a link check, but
  something must distinguish applied from claimed.
- **Never apply and commit in one motion.** Leave the commit to the user.

#### Reporting

State what was applied, what is proposed, and what is blocked, in that order. If
the autonomous lane was empty, say so — a run that changed nothing is a normal
outcome and should not be dressed up.

---

## Hard Rules

Each of these exists because it describes a way this skill could do harm.

1. **Not legal advice, and the output says so.** The note carries the disclaimer
   in its own frontmatter, not merely in the chat.
2. **Cite or mark `[UNVERIFIED]`.** Never invent a section number, a case name,
   a commencement date or a penalty.
3. **This skill never relaxes a control.** If a documented floor looks stricter
   than the law requires, that is a **D**-tier finding for a human, never an
   **F**-tier fix. "Make policy configurable" and "make policy bypassable" are
   the same diff when written carelessly.
4. **Never assume the regime.** No jurisdiction is the default, and the reflexes
   of the best-known regimes are actively wrong elsewhere. See
   `references/regime-selection.md`.
5. **The note is evidence, not instruction.** Verify its operational claims
   against the code, the tests and git before acting on them. Where a document
   and the code disagree, record the discrepancy rather than silently picking
   one.
6. **Retention has a floor as well as a ceiling.** Privacy law pushes toward
   deletion; records, tax and child-safety law often *forbid* it. A reviewer that
   only knows the deletion direction will confidently recommend an offence.
7. **Do not fix D-tier findings.** Report and stop. The value is the decision
   reaching a human, not the diff.
8. **Autonomy is bounded by what a change touches, not by how small it is.**
   Documentation and evidence corrections may be applied unattended. Anything
   touching code, a migration, configuration or infrastructure is proposed and
   waits for approval, however trivial it looks. A wrong autonomous remedy is
   worse than the gap it closes, because it removes the record that anything was
   ever wrong.
9. **Adopting an existing corpus does not exempt a review from Step 3.** An
   adopted corpus decides *where* a review writes its findings (Step 5); it
   says nothing about whether the corpus's own legal claims were ever checked
   against a primary source. A mature-looking `docs/compliance/` directory with
   confident prose and no citations is not evidence the citations were
   verified — it is evidence the review has not been done yet. Run S8 (Step 2)
   on every adopted corpus, and if it fires, research the affected regime
   before fanning code reviewers out against the corpus's own claims. Code
   review against an unresearched compliance note produces a document that
   *looks* like a compliance audit and is not one — it verifies the code
   matches the note, never that the note matches the law.

## Anti-Patterns

**Importing a familiar regime's answers.** The most common failure. A model
trained largely on EU and US material will apply erasure rights, adequacy
decisions, breach clocks and small-business exemptions that the governing regime
may not contain. Test each assumption explicitly rather than carrying it across;
`references/regime-selection.md` ships the checklist.

**Treating green tests as evidence of legality.** They are evidence the code
does what its author intended. That is orthogonal.

**Confusing the operator's capacity.** Whether you are an agency, a contracted
service provider, a controller or a processor usually determines *which*
obligations bind you and who enforces them. Getting this wrong invalidates the
whole review, and it is a question about contracts, not code.

**Reviewing the code and not the data flows.** The obligation attaches to what
leaves the building — a log line, a telemetry event, an error report, a model
prompt — far more often than to the handler that produced it.

**Producing a wall of undifferentiated findings.** Fifty unranked items is a
document nobody reads. The tiering is not decoration.

## Related

- `references/regime-selection.md` — identifying the governing regime, and the
  imported-reflex checklist
- `references/policy-note-template.md` — the shape of the note
- `references/review-domains.md` — the code-surface-to-obligation mapping
- `references/findings-format.md` — finding schema, tiering, append format
- `references/remediation-planning.md` — the architect brief, and the naive-remedy
  traps that make autonomous fixing unsafe
- `pilot:pilot-architect` — the planner for Step 6
- `pilot:security-reviewer` — the adjacent, non-regulatory review
