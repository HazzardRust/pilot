# Review domains: obligations, code surfaces, and agent briefs

> Read this at Step 4. It maps obligation families onto the places in a codebase
> where they are actually broken, and specifies how to brief an agent so it
> returns statutory findings rather than general ones.

## The briefing problem

The reviewer agents are good at their domains and know nothing about your
obligations. Dispatched with "review this for compliance", `security-reviewer`
returns OWASP findings — correct, valuable, and not what this skill exists for.

The fix is the brief. Every dispatch carries four things:

1. **The obligations it owns**, quoted from the note with their citations
2. **The code surface**, as concrete paths or a diff range
3. **The finding schema** from `findings-format.md`
4. **An explicit frame**: it is hunting statutory nonconformance, not code quality

### Brief template

```
You are reviewing for LEGAL nonconformance, not code quality. Ignore style,
performance and architecture unless they bear on an obligation below.

REGIME: [jurisdiction] / [sector]. Operator acts as [capacity].

OBLIGATIONS YOU OWN:
1. [Obligation]. Source: [citation, retrieval date].
   Broken by: [concrete failure modes for this obligation].
2. ...

CODE SURFACE: [paths or diff range]

FOR EACH FINDING RETURN:
- the obligation it breaches, by number
- a code anchor as path:line, read and confirmed
- what is wrong, in one sentence
- what would discharge it
- status: Verified in code | Inferred | UNVERIFIED

RULES:
- Anchor every finding or mark it UNVERIFIED. Do not guess line numbers.
- Do not invent citations. Use only the obligations above.
- Report conflicts between two obligations rather than resolving them.
- If an obligation has no corresponding code at all, that is a finding.
```

That last rule matters more than it looks. **Absence is the most commonly missed
finding**, because a reviewer reads what is present. No deletion job, no audit
table, no access-request path — none of these appear in a diff, and all of them
are obligations.

---

## Domain: retention, deletion and disposal

**Agent**: `pilot:database-reviewer`

**Code surface**: migrations, `ON DELETE` rules, scheduled jobs, soft-delete
flags, backup and snapshot policy, object-storage lifecycle rules, log retention.

**Failure modes**:

- A TTL constant that disagrees with the documented floor or ceiling
- Deletion implemented as soft-delete where disposal is required, or hard-delete
  where retention is mandated
- A cascade that removes a record a retention rule requires be kept
- Backups outliving the retention ceiling — the most commonly missed instance,
  because the application deletes correctly and the snapshot does not
- No disposal mechanism at all for a category that must be disposed of
- Retention expressed once globally where it varies per jurisdiction or customer

**The direction trap**: check both bounds. Ask what forces retention as well as
what forces deletion, and confirm the code can express a window rather than a
single expiry.

---

## Domain: data residency and cross-border transfer

**Agent**: `pilot:security-reviewer`

**Code surface**: cloud region config, SDK endpoint and region parameters, model
and inference endpoints, CDN and edge config, email and SMS providers, error and
crash reporting, analytics, queue and cache hosting, CI runners.

**Failure modes**:

- A default region that is not the required one, relying on an override that some
  environment does not set
- A third-party SDK that phones home to a fixed region regardless of your config
- Error and crash reporting shipping payloads offshore — very common, because it
  is added once and never reviewed as a data flow
- Model or inference endpoints resolving to a global rather than regional profile
- A regional primary with a global failover that silently relocates data
- Sub-processors of your processors, which the note should enumerate

**Ask**: is residency enforced structurally, or does it depend on every call site
passing the right argument? The first is a control; the second is a convention.

---

## Domain: tenancy and access control

**Agents**: `pilot:database-reviewer` + `pilot:security-reviewer`

**Code surface**: row-level security policies, authorisation middleware, query
filters, background jobs, admin tooling, export and reporting paths, migrations
that alter the tenancy predicate.

**Failure modes**:

- A query path that omits the tenant predicate — usually a background job,
  an admin screen, or an export, because those are written after the pattern is
  established and outside the guarded path
- Row-level security enabled on a table but bypassed by the application's role
- A migration that alters the tenancy predicate without altering the policies
  derived from it
- Admin tooling that legitimately crosses tenants without an audit record

**Regulatory framing**: a cross-tenant read in a regulated dataset is usually a
notifiable breach, not merely a bug. That reframing changes the tier.

---

## Domain: automated decisions about people

**Agents**: the language reviewer

**Code surface**: scoring, grading, ranking, pricing, eligibility, risk
assessment, model inference, and any threshold that gates a person's outcome.

**Failure modes**:

- No record of the inputs that produced a determination, so it cannot be
  explained or reviewed afterwards
- The decision is presented as final where a human review path is required
- No disclosure that the determination was automated
- Model or prompt versions unpinned, so a past decision cannot be reproduced
- No mechanism to correct a determination found to be wrong
- Training or fine-tuning on data collected for a different purpose

**Timing**: these rules commonly have **future commencement dates**. A future
date is a deadline for the open-items table, not a reason to skip the finding.

---

## Domain: audit trail and record-keeping

**Agent**: the language reviewer

**Code surface**: event tables, append-only structures, log sinks and their
retention, access logs for sensitive records.

**Failure modes**:

- The audit record is mutable, or deletable by the actor it records
- The audit trail's own retention is shorter than the records it describes
- Access to sensitive records is not logged, where an access register is required
- The trail records the action but not the actor, the time, or the before-state
- Audit entries carry more personal information than the obligation requires,
  creating a second retention problem inside the control

---

## Domain: special-category data leakage

**Agent**: `pilot:security-reviewer`

**Code surface**: log statements, structured-logging field lists, exception
handlers, telemetry, analytics events, model prompts, support tooling,
notification bodies, URL query parameters.

**Failure modes**:

- Personal or special-category fields in log lines, most often via
  whole-object logging rather than a named field
- Exception handlers serialising a request body containing the payload
- Analytics events carrying identifiers believed to be anonymous
- Prompts to third-party models carrying more of the record than the job needs
- Personal information in URLs, and therefore in access logs and referrer headers
- Support tooling with unaudited read access to production records

**This domain finds the most, and is the most often skipped**, because a log line
does not look like a data flow. It is one.

---

## Domain: consent, notice and transparency

**Agent**: the language reviewer

**Code surface**: onboarding and signup flows, policy documents in the repo,
consent state storage, preference centres, cookie and tracker config.

**Failure modes**:

- Consent recorded as a boolean, where the obligation requires knowing what was
  consented to, when, and under which version of the notice
- No withdrawal path, or withdrawal that does not propagate to processors
- The published notice describing behaviour the code does not implement, or
  omitting behaviour it does — check the policy text against the code, in both
  directions
- Consent used as the lawful basis where it is unavailable in this context

---

## Domain: health, clinical or other sector-specific data

**Agents**: the language reviewer and `pilot:security-reviewer`, both briefed on
the sector regime

Sector regimes usually sit **on top of** the general one rather than replacing
it. Run the sector reviewer in addition to the general domains, not instead of
them, and expect the sector rule to win where they conflict.

---

## Dispatch discipline

**Only dispatch families the note actually raises.** A project with no health
data needs no healthcare reviewer. Agents cost real money, and each one has to
re-establish context from cold.

**Scope to the diff in pre-push mode.** `git diff origin/main...HEAD` plus what
it makes reachable. Whole-repo dispatch for a two-file change buries the real
finding.

**Run language reviewers last, and only on code the other domains flagged.**
Their job here is confirming that a proposed remedy is correct in the language,
not finding obligations.

**Do not dispatch an agent to verify another agent's finding.** Verification is a
read of the anchor, and belongs in the main loop.

## Deduplication

The same defect surfaces from several agents — an unfiltered query is a tenancy
finding and an access-control finding and possibly a residency one. Merge on the
**code anchor**, keep the highest tier, and list every obligation the single
defect breaches. Three entries for one line makes a review look larger than it is
and is read, correctly, as padding.
