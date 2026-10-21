---
status: accepted
date: 2026-10-20
tags: [git, github, publication, security]
supersedes: []
superseded_by: []
paths: [docs/OPERATING.md, scripts/fresh-repo.mjs, docs/design/fresh-public-repo/architecture.md]
---
# The move to a fresh public repository is the user's, and no agent runs its GitHub steps

The private HazzardRust/pilot goes public as a new repository of one orphan commit, its history left behind in the old repository renamed to a private, archived archive. Renaming the old repository, creating the new one, pushing the orphan, setting its secret and ruleset and archiving the old one are irreversible and happen on GitHub, so we decided the user runs them by hand from the "On GitHub" steps of `docs/OPERATING.md` and no agent runs any of them; the agents' part is local and checkable: `scripts/fresh-repo.mjs` builds the orphan in a local bare repository, checks its tree and identity and prints the push command without pushing, and the runbook's order is pinned by a test. We rejected a `pilot` verb that runs the whole move, because it hands an irreversible, public push to an agent whose mistake (the wrong tree, the personal email, the wrong order of rename and create) cannot be taken back once the repository is public.

**Consequences**: a brief, a skill or a deck item never asks an agent to run a runbook "On GitHub" command, even with the user's go-ahead in a message; the user types each one.
