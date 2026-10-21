---
# Amended by ADR 0083: the base is always the pilot branch, `origin/pilot`.
status: amended
date: 2026-10-04
tags: [git, runs]
supersedes: []
superseded_by: [0083]
paths: [agents/pilot.md, docs/design/runs-build-on-each-other/architecture.md]
---
# `pilot integrate` takes the run's base on every call, for every run

A run cut from another run's branch (ADR 0067) falls behind it as soon as that branch moves, and a run cut from the default branch falls behind that: #289 stood alone, fell behind main and conflicted after its Gate 2. Keeping up by hand is a step the pilot forgets and a rule its prompt cannot afford. So we decided `pilot integrate` merges the run's base before it merges the slice, on every call, whether the run is stacked or not.

- **The base is #N's head while #N is open, and the default branch otherwise (L4).** A run with nothing under it takes the default branch. The user confirmed this goes past stacked runs (itm_8c4cd08cb061).
- **Taking the base is a committed `--no-ff` merge, before the slice merge (L5).** One test run judges both; red resets the branch to where the call found it and pushes nothing.
- **`pilot integrate` with no branch takes the base alone.** The pilot runs it before it sends QA the fix round's tip, so the walkthrough and Gate 2 see the final base.
- **A conflict taking the base stops the integration as a slice conflict does, naming the base.**

Rejected:
- Only stacked runs take their base: two rules, and a lone run still meets the default branch's changes at the end, after the user has signed.
- Rebasing `feat/<slug>` onto the base: it rewrites a pushed branch that has a PR open.
- A paragraph in `agents/pilot.md` telling the pilot to merge the base: the pin cannot carry it (L6), and prose is forgotten where code is not.

**Consequences**:
- A change merged to the base mid-run enters the run without that run's reviewers having read it, and a broken base turns the run's tests red for a reason that is not its own. The integrate line names the base taken, so the cause is on the line.
- The feature's principles review and QA measure the feature against its base, not the default branch.

Recorded in `docs/design/runs-build-on-each-other/architecture.md` (§2 spec 3, 4, 9; §5 L4, L5, L6).
