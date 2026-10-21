---
status: superseded
date: 2026-09-21
tags: [vendor, hooks]
supersedes: []
superseded_by: [0078]
paths: []
---
# The vendored fact-forcing gate blocks, and ADR 0010 is scoped to the context guard

The user chose to vendor ECC's GateGuard into the plugin rather than rely on the copy ECC installs, so that a machine without ECC gets the same gate on the first edit of a file. ADR 0010 says the context guard recommends and never blocks, and this is the first hook the package ships that can deny a tool call on someone else's machine. We decided that the gate blocks, as it does upstream — a gate that only advises is not a gate, and the user asked for this one knowing what it does — that ADR 0010 is read as scoped to the context guard it names, that `ECC_GATEGUARD=off` stays the documented off switch, and that the plugin's copy stands down doing no work when ECC's own copy is active so nothing fires twice. ADR 0007's condition — "a hook we have not read" — is discharged rather than reversed: the scripts have been read in full and carry no network call, no telemetry and no credential, so 0007 is amended in place. Rejected: shipping the gate advisory-only (removes its whole effect); shipping it off by default (a hook nobody turns on); a new ADR superseding 0007 (the repo has no supersession convention and the smallest case is the wrong place to invent one).

**Consequences**: a friend who installs the plugin is asked for facts before the first edit of each file, and turns it off with one setting; the vendored code is verbatim under a provenance row, so a re-sync is a straight replacement and the reviewable surface is the registration and the stand-down, not the 1,788 lines.
