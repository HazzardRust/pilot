# Brief: crew-handoff-trace

The facts every implementer of this feature shares. Read this first, then your slice file.

## Repository

`C:/Users/Hazzard/Projects/pilot` (GitHub `HazzardRust/pilot`). Default branch `main`, pilot branch `pilot`. Never
work in that shared checkout or in another session's worktree. Create your own beside it,
`pilot-crew-handoff-trace-s<n>`, and run `npm ci` there before the first test.

## Remote

Remote: origin

## Base and PR target

The base is `feat/crew-handoff-trace`, cut at Gate 1 from `origin/pilot` (ebe5233c). Branches:
`slice/crew-handoff-trace-s<n>`, pushed for the pilot to integrate; no slice PR. The PR target is `pilot`.

## PR titles

- A slice: `feat(crew-handoff-trace): S<n> <title>`, the title lower-case first, e.g. `feat(crew-handoff-trace): S1 pilot trace prints a hand-off's posted row and what it waits on`
- A fix round: `fix(crew-handoff-trace): <what>`
- The feature PR: `feat(crew-handoff-trace): a crew hand-off never goes missing between pilot sessions`

## Commit trailer

Every commit ends with these two lines, copied exactly:

```
Co-Authored-By: Claude Fable 5.2 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01NXgSFppeY5pzVQLciH5swh
```

## PR footer

Every PR body ends with these lines, copied exactly:

```
🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_01NXgSFppeY5pzVQLciH5swh
```

## Artefact

`docs/design/crew-handoff-trace/architecture.md`, slices in `slices/S1.md` to `slices/S7.md`. The run's ADR is
`docs/adr/0208-crew-handoff-trace.md` (S1); the landing numbers it.

## Gate command

```
npm ci
npm test
```

`npm test` runs `node scripts/gate.mjs`. One file: `node --test <file>`. Run the full `npm test` once, on the
slice's final state. The repo has no typecheck, lint or build script.

- `deck/test/facades.test.mjs` caps deck source files at 800 lines: `deck/items.mjs` and `deck/store-runs.mjs` are
  at 799, `deck/store-items.mjs` at 798. Add no line to them (S5 edits `items.mjs:280` in place).
- `SPAWN_CEILING` (`scripts/gate.mjs:46`) is raised only by the rule in that file's comment; print the gate's spawn
  count in your report.
- `scripts/test/platform-reads.test.mjs` allows `process.platform` only in `hooks/lib/platform.js`.
- Tests that write the trace inject a temporary home; never write `~/.claude/pilot/handoff-trace.jsonl` from a test.

## Known flaky tests

- `deck/test/idle-wake.test.mjs` "a parked wait wakes": red after 10:20 UTC until ci-green lands.
- Windows-CI only: "sed -i on a tracked file is refused".

## Diff limit

150 changed lines per slice, or the higher number a slice file writes for itself. Past that, stop and ask `main`.
