---
status: accepted
date: 2026-09-26
tags: [workflow]
supersedes: []
superseded_by: []
paths: []
---
# A seam is stated once, in the slice that creates it, and a seam change goes through `main`

With signatures written into every slice file, the same seam could be restated in every slice that uses it, which reads as self-contained and drifts on the first change. We decided a seam is stated once, in the slice that creates it, and a later slice names it by slice and symbol — "S1's `measure(opts)`" — and reads it from the integration branch (L4), so a wrong signature is corrected in one place and cannot ripple into later briefs. We decided the implementer builds against the Interface block and, when a signature cannot hold, sends `main` the smallest change as the block should read and carries on with what does not depend on it, never redesigning silently; the pilot decides that change itself and edits the owning slice file, it reaches the user only when it moves a spec line or a locked decision, and the architect is resumed only when a later slice's files or tests stop holding (A2). The fundamentalist reports any silent divergence between the diff and a slice's Interface block as a finding, which with the slice-file edit is the audit trail. Restating a used seam in every slice was rejected for the drift above; routing every seam change to the user was rejected because most are a parameter or a return type the user would wave through, and the ones that matter are exactly the ones that move a spec line.

**Consequences**: a seam can move mid-run without the user seeing it, by design, with the fundamentalist's check and the artefact's edit as the record; and an implementer whose slice depends on an earlier seam reads the integration branch for it rather than its own brief.
