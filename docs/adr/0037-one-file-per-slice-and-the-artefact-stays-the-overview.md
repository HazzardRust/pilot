---
status: accepted
date: 2026-09-26
tags: [workflow]
supersedes: []
superseded_by: []
paths: []
---
# Each slice's design lives in its own file, and the artefact stays the only overview

Under the pilot the implementer used to inherit a slice as a table row — spec lines, owned files, a verification command — and spend its run deciding the rest: which files exactly, what the functions and types at each seam look like, what crosses them, which tests to write. Those decisions varied per implementer and surfaced at the end of the run as the design problems the fundamentalist finds late. We decided the architect designs each slice to the level of files with their roles, the signatures at each seam as they stand after the slice, the data shapes crossing them, and the tests by name in writing order (L1), and that this detail lives in one file per slice, `docs/design/<slug>/slices/S<n>.md`, capped at 60 lines, beside an `architecture.md` capped at 300 that keeps one entry per slice — title, spec lines delivered, files owned, what it comes after, and the link (L7). A brief passes the slice file's path instead of pasting forty lines, the pilot spends none of its own output on the design, and Gate 1 reads a short list. We decided with it that nothing a Gate 1 sign-off needs may live only in a slice file: the spec, the decisions, the DAG, and each slice's spec lines and files owned stay in `architecture.md`, and a slice file holds implementation detail only (L8). Inline sections capped at 40 lines were rejected because a fifteen-slice run's artefact would reach nine hundred lines and every brief would paste one of them; a separate "S0" overview document was rejected because `architecture.md` already is that document, and a second one is a second place for the same facts to drift. Full pseudo-code per slice was rejected: the implementer still writes the code, and an architect wrong in a function body is corrected through `main` on every slice.

**Consequences**: the files a slice owns appear twice — as paths in the slice list and with roles in the slice file — and the architect keeps the two equal; the two end-of-run readers, the fundamentalist and QA, open N short files instead of one long one, at the same token cost; and the design detail binds the architect to a cap that prose does not fit, so the worked example in `vertical-slicing` shows the compact form.
