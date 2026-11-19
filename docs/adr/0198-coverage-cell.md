---
status: proposed
date: 2026-11-19
tags: [evidence-runner, coverage, auto-mode, crew-refusals]
supersedes: []
superseded_by: []
paths: [agents/pilot-evidence-runner.md, scripts/diff-coverage.mjs, docs/design/coverage-cell/architecture.md]
---
# The evidence runner's Node coverage cell fetches nothing

We decided that the evidence runner measures Node diff coverage with Node's own `NODE_V8_COVERAGE` and the plugin's
zero-dependency `scripts/diff-coverage.mjs`, so the cell fetches no third-party code at run time, and that no
permission, allowlist or hook changes to let the old cell through.

## Context

Auto mode refused the runner's Node `Diff coverage` cell, which fetched two tools at run time and ran them against the
suite. crew-refusals L1 binds the fix (`docs/design/crew-refusals/architecture.md:121`):

> No slice edits a permission setting, an allowlist, an auto-approving hook or `CLAUDE.md` to let a refused command
> through; no slice obfuscates, splits or rewords a command so the same action passes unjudged. Each fix removes the
> risky action.

## Decision

- **L2** crew-refusals L1 holds: the risky action removed is the two run-time fetches.
  Old cell: `npx --yes c8 --reporter=lcovonly --report-dir "$S/cov" $TEST && uvx diff-cover "$S/cov/lcov.info" --compare-branch "$BASE"`.
  New cell: `NODE_V8_COVERAGE="$S/v8" $TEST && node "${CLAUDE_PLUGIN_ROOT}/scripts/diff-coverage.mjs" "$S/v8" "$BASE"`.
- **A1** The tool is Node's built-in V8 coverage plus the plugin script (the user, `itm_aa6e5e340524`).

## Alternatives rejected

- An allow rule for the old cell: hands the classifier's judgement to a list (L1).
- Keeping c8 and dropping only `--yes`: rewords the same fetch.
- c8 as a plugin dependency plus diff-cover via pip: two toolchains, and Python required.

## Consequences

- Line coverage only: no source maps (TypeScript) and no branch coverage.
- The six other columns keep `uvx diff-cover` (A4); no refusal of them is on record.
- The script reads committed work only (`<base>...HEAD`), so the cell runs on a committed tree.
