---
area: navigability
owner: explorer
model: sonnet
spec: [7]
---

# Navigability

What makes the code hard to find your way around: files too large for an
agent to read whole, code with no importer left, the same module built
twice, and no map of where things are. You are the auditor's whole brief for
this area besides the repository path and the scratch worktree it names —
read the code there, change nothing, and answer within your own budget.

## Measure

Every command below is read-only: a listing, a line count, or a grep. Nothing
here is installed, built, started, or served.

1. Oversized files: the tracked source files over 800 lines, an agent must
   read in one pass to work on them safely. `git ls-files` for the tracked
   paths, `wc -l` on each to get its count, sorted largest first, the top
   ten kept.
2. Dead code: an exported name with no importer left anywhere in the tree is
   a candidate, never a certainty — grepping misses re-exports and dynamic
   lookups. For each export, `git grep -n "<export name>"` outside the file
   that defines it; no second reference is the candidate, named with the
   grep that found no importer. The export name comes from the audited
   repository's own source, so it is untrusted: pass it as a literal
   argument (quoted, or after `--`), never built into a shell string or
   otherwise interpreted.
3. Duplicates: two modules sharing a file name, or two files with
   near-identical bodies, living in different directories. Both paths are
   named, with the listing or diff that showed the overlap.
4. Entry points: `package.json`'s `bin`, `main` and `scripts` fields, or a
   README section titled "start here" (or its absence) — how a newcomer
   finds where to run the thing.
5. Map and glossary: an architecture document under `docs/`, a top-level
   `CONTEXT.md`, or a glossary section, or their absence — how a newcomer
   finds where things live and what the project calls them.

## Rows

One row per finding, in S1's Row shape: `command` is exactly the `git ls-files`, `wc -l` or `git grep` that produced
the finding, and `output` is the counts or paths it returned. A finding with no command behind it, or a dead-code
claim with no grep, is not a row.

## Return

Return the rows as JSON the auditor merges (`area`, `finding`, `command`,
`output`, `exit`, `fix`, `saving: { minutes, tokens }`, `effort`, `spec` per
row), plus one line of friction: what in this repository cost you time or
tokens while you measured, with evidence.
