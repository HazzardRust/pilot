---
area: loops
owner: auditor
spec: [6, 11]
---

# Feedback loops

How long an agent waits to learn whether a change worked, and whether the
answer can be trusted. The format every area file follows: frontmatter
(`area`, `owner`, `model` when an explorer owns it, `spec`), then what to
measure and which rows to write.

## Measure

All in the scratch worktree, each command under a timeout, timed in seconds:

1. Install with the command the lockfile implies (`npm ci`, `pnpm install
   --frozen-lockfile`, `uv sync`, ...), under 600 s — area files are read in
   name order and `loops` sorts before `setup`, so this is the install that
   runs and gets timed; `setup`'s own **install** row reuses this command,
   its exit code and its seconds instead of running it again. A failed
   install is a row here too, and the steps below that need it go in
   `unmeasured`.
2. Find the test command: `scripts.test`, a pytest or cargo config, a
   Makefile target. None is a row.
3. Run the full suite twice, under 900 s each. Compare the failing test names
   of the two runs; a test that differs is a flake.
4. Run one test file alone, under 180 s, the way its runner allows. No way to
   run one file is a row.
5. Look for a typecheck and a lint script (`typecheck`, `tsc`, `mypy`,
   `pyright`; `lint`, `eslint`, `ruff`). Run each present one under 300 s;
   note each absent one.

## Rows

Each row's `command` is exactly what ran, and its `output` starts with
`<seconds> s, exit <code>` (or `<seconds> s, timed out`) followed by an
excerpt of at most twenty lines. Candidates:

- the full suite is slow: saving the minutes a narrower command would save
  across the runs an agent makes per slice;
- a flake, naming each differing test and both results;
- no single-file run, no typecheck, or no lint script;
- a failing, hanging or timed-out install or suite.
