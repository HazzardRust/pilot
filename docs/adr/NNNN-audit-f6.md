---
status: proposed
date: 2026-11-18
tags: [gate, tests, syntax]
supersedes: []
superseded_by: []
paths: [scripts/check-syntax.mjs, scripts/gate.mjs, docs/design/audit-f6/architecture.md]
---
# The gate checks every file's syntax before the suite, in one flagged child

We decided that `npm test` parses every tracked or untracked-but-not-ignored `.mjs` and `.js` file before it rebuilds
the ledgers or starts the suite. A parse error stops the gate, red, and names each broken file and line. The parse
runs in one child, `node --experimental-vm-modules --disable-warning=ExperimentalWarning scripts/check-syntax.mjs`,
with V8 in process.

## Context

A syntax error in a file no test imports passed the gate. A syntax error in a file a test does import failed the
gate only after minutes of suite, and as a test failure. Running `node --check` once per file on 666 files took
21.9 s at width 8. One process parsing each file with `vm.SourceTextModule`, with `vm.compileFunction` as the CJS
fallback, took 0.4 s with no false reds.

## Decision

- **First (L1)**: the check is the first step of `runGate`, before the `--since` selection, the ledgers and the
  suite. It is the cheapest step and fails fastest.
- **Every mode (L2)**: full, `--since` and coverage runs all check the whole tree. That costs less than working out a
  selection.
- **Injected (L3)**: `runGate` takes a `syntax` dependency with a no-op default. Only the entry block passes the real
  `syntaxErrors`, so existing `runGate` tests stay unchanged.
- **Fails closed (L4)**: if the child cannot start or prints no result, the gate is red with
  `syntax: could not check (<reason>)`. It never passes by not running.
- **In process (A1)**: the parse depends on an experimental Node API, `vm.SourceTextModule`, which needs the flag.
  The corpus test against `node --check` guards against the API drifting, and L4 makes the gate red if the API is
  removed.
- **Detection follows Node's loader**: a `.mjs` file is parsed as ESM only. A `.js` file is parsed as ESM, and else
  as CJS. When its CJS error names module syntax (`import`, `export`, `await`), the ESM error is the one reported.
  `node --check` on Node 26.1 passes such a file without parsing it as ESM, yet `node <file>` throws at load. The
  gate follows the load, not `node --check`.
- **Fault lines**: `vm.SourceTextModule` gives no location, so an ESM fault's line is the shortest run of leading
  lines that fails with the same message, found by halving. For `Unexpected end of input`, it is the last line.

## Consequences

- A clean gate prints one more line, `syntax ok <n> files in <ms> ms`. The spawn count is unchanged, because the
  counter preload reaches only the suite's children.
- A broken scratch file left untracked in a worktree makes the gate red (A3).
- `.cjs`, `.ts` and `.json` files are not checked.
- A syntax error in a file `gate.mjs` imports statically is reported by Node at load, before the check runs.
