# Brief: ui-design-workflow

The facts every implementer of this feature shares. Read this first, then your slice file.

## Repository

`C:/Users/jrylk/Projects/pilot` (GitHub `HazzardRust/pilot`). Never work in that shared checkout or in another
session's worktree. Create your own beside it, `pilot-ui-design-workflow-s<n>`, and run `npm ci` there before the
first test.

## Remote

Remote: origin

## Base and PR target

The base is `feat/ui-design-workflow`, cut at Gate 1 from the design tip on `origin/main` (5fd835e). Branches:
`slice/ui-design-workflow-s<n>`, pushed for the pilot to integrate; no slice PR. The PR target is `main`.

## Live root

C:\Users\jrylk\.claude\pilot\live untrusted

## PR titles

- A slice: `feat(ui-design-workflow): S<n> <title>`, the title lower-case first, e.g. `feat(ui-design-workflow): S1 pilot look snap captures a web fixture screen in light and dark`
- A fix round: `fix(ui-design-workflow): <what>`
- The feature PR: `feat(ui-design-workflow): a UI design workflow in pilot`

## Commit trailer

Every commit ends with these two lines, copied exactly:

```
Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01NXgSForDWcHA67cB28cNrm
```

## PR footer

Every PR body ends with these lines, copied exactly:

```
🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_01NXgSForDWcHA67cB28cNrm
```

## Artefact

`docs/design/ui-design-workflow/architecture.md`, slices in `slices/S1.md` to `slices/S9.md`. The run's ADR is
`docs/adr/NNNN-ui-design-workflow.md` (S1); the landing numbers it.

## Gate command

```
npm ci
npm test
```

`npm test` runs `node scripts/gate.mjs`; on Windows with cargo on PATH it also runs `cargo test` for `deck/rune`
(S7 adds `cargo fmt --check`). One file: `node --test <file>`; one Rust test: `cargo test --manifest-path
deck/rune/Cargo.toml --test <name>`. Run the full `npm test` once, on the slice's final state.

- `deck/test/facades.test.mjs` caps deck source files at 800 lines: `deck/items.mjs` is at 799 and
  `deck/store-items.mjs` at 797. Add no line to them (S8 edits `store-items.mjs:167` in place).
- Prompt pins: the pilot (12069.5), architect (10634.25) and QA (5168.25) have 0 headroom. A slice that changes one
  raises its pin by the measured delta (`node scripts/measure-prompt.mjs`) with a dated comment, at most 80 tokens (L8).
- No test asserts a phrase in prose (ADR 0180): structural lints only, each with `// lint: <rule>`.
- Rust builds fill the disk: a `deck/rune/target` per worktree is 1-24 GB. Check free space before a release build.

## Known flaky tests

- `deck/test/idle-wake.test.mjs` "a parked wait wakes": red after 10:20 UTC until ci-green lands.
- Windows-CI only: "sed -i on a tracked file is refused".
- Candidate under investigation: `deck/test/crew-wait.test.mjs:94` on macOS.

## Diff limit

400 changed lines per slice, or the lower estimate a slice file writes for itself plus half. Past that, stop and ask
`main`.
