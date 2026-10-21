---
status: superseded
date: 2026-10-07
tags: [git, runs]
supersedes: []
superseded_by: [NNNN]
paths: [docs/design/co-pilot-reports/architecture.md, scripts/integrate.mjs]
---
# PR titles have one format and integrate enforces it

Slice PRs reached the integration branch titled every which way (`S6 The tab's…`, a feature's slug on another feature's branch), and the merge message `pilot integrate` builds from the title carried the drift into the history. A format written only in prose drifts again, and no deck call ever sees a PR, so the one place that reads every slice's title before it lands is `pilot integrate`. So we decided the format is one, and `integrate` refuses a slice whose PR title is off it (`docs/design/co-pilot-reports/architecture.md`, L9, L10, A1).

- **The format**, for the feature checked out as `feat/<slug>`: a slice is `feat(<slug>): S<n> <title, first letter lower-case>` (`^feat\(<slug>\): S\d+\w* [^A-Z]`), a fix round is `fix(<slug>): <what>` (`^fix\(<slug>\): \S`). A title starting `fix(` is held to the fix format; any other to the slice format.
- **The check runs before the first merge**, after `assertPushable`, through the existing `findPr`, whose one answer also names the merge commit. A refusal is one line naming the PR, its title and the format, telling the caller to retitle with `gh pr edit` and rerun; nothing is merged or pushed.
- **No PR, no `gh`, a base-only call, or a HEAD that is not `feat/<slug>`** skips the check, and `integrate` runs as it did.

Rejected:
- A format the deck checks: no deck call sees the PR.
- Checking at the commit: a merge and a full test run would already have been spent.
- Refusing when there is no PR: it would break every run without `gh` and every base-only call.

**Consequences:**
- A slice titled off the format costs one `gh pr edit` and a rerun, before anything was spent.
- A branch with no PR still lands unchecked; the check is only as wide as `gh` can see.
