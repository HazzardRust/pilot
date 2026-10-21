---
status: accepted
date: 2026-10-21
tags: [rules, install]
supersedes: []
superseded_by: []
paths: [scripts/build-rules-ledger.mjs, scripts/shipped-rules.json]
---
# The rules ledger is append-only

This amends ADR 0055, which had `scripts/build-rules-ledger.mjs` derive `scripts/shipped-rules.json` from git history alone: every commit that touched `rules/` contributes its whole tree, and the working tree its files as they stand. The fresh-repo move (ADR 0172) left the public repository one commit deep, and the first gate on its main failed with `ledger stale: scripts/shipped-rules.json, rebuilt; commit it`. The rebuild had 113 paths and 113 hashes where the committed ledger had 124 and 318: everything only the old history held was gone. Committing it, as the gate said, would have made the install treat every older shipped copy on a user's machine as hand-edited and every retired rule as the user's own, so neither is ever updated or deleted, silently, the failure 0055 exists to prevent.

So we decided that the ledger only grows. The builder takes the union of three sources: every version of `scripts/shipped-rules.json` committed in the history it reads (`HEAD`, and `MERGE_HEAD` inside a merge), every `rules/` tree that history holds, and the working tree's `rules/` files. A history that has lost versions never drops a hash or a path, because the last committed ledger still records them. `--check` is unchanged: a rules edit without its entry leaves the working-tree hash out of the committed file, and the rebuild differs.

"Already recorded" is read from the committed versions, not the working-tree file. That allows:
- An entry deleted by hand, in the working tree or in a commit, comes back on the next rebuild, and `--check` is red until it does; only a history that loses every commit recording it can drop it.
- A hash or path added by hand to the working-tree file is not kept by the rebuild, so `--check` catches it; once committed, it is permanent like any other entry.

Rejected:
- Committing the rebuilt ledger: it is what the gate asked for, and it is the silent failure above.
- Reading the working-tree ledger as input: a hand edit, an added hash or a deleted entry, would then reproduce itself and pass `--check`.
- Reading only `HEAD`'s copy: a commit that deletes an entry would pass its own gate, since the rebuild reads the deletion back.

**Consequences**:
- Removing an entry on purpose takes rewriting history, which nobody should want: a hash the package once shipped stays recognisable for good.
- The build reads one more `git log` and one blob per committed ledger version; a malformed committed ledger is an error, never skipped.
