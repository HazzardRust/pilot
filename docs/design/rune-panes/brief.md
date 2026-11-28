# Brief: rune-panes

The facts every implementer of this feature shares. Read this first, then your slice file.

## Repository

`C:/Users/jrylk/Projects/pilot` (GitHub `HazzardRust/pilot`). Default branch `main`, pilot branch `pilot`. Never
work in that shared checkout or in another session's worktree. Create your own beside it,
`pilot-rune-panes-s<n>`, and run `npm ci` there before the first test: without it every Rune scratch-daemon test
fails at `deck/rune/tests/support/mod.rs:33`.

## Remote

Remote: origin

## Base and PR target

The base is `feat/rune-panes`, cut at Gate 1 from the design tip on `origin/pilot` (86957ec). Branches:
`slice/rune-panes-s<n>`, pushed for the pilot to integrate; no slice PR. The PR target is `pilot`.

## Live root

C:\Users\jrylk\.claude\pilot\live untrusted

## PR titles

- A slice: `feat(rune-panes): S<n> <title>`, the title lower-case first, e.g. `feat(rune-panes): S1 a thread scrolls to its last message by wheel, keys and bar`
- A fix round: `fix(rune-panes): <what>`
- The feature PR: `feat(rune-panes): Rune side panes match the HTML deck`

## Commit trailer

Every commit ends with these two lines, copied exactly:

```
Co-Authored-By: Claude Fable 5.2 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01NXgSForDWcHA67cB28cNrm
```

## PR footer

Every PR body ends with these lines, copied exactly:

```
🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_01NXgSForDWcHA67cB28cNrm
```

## Artefact

`docs/design/rune-panes/architecture.md`, slices in `slices/S1.md` to `slices/S7.md`. The run's ADR is
`docs/adr/0217-rune-panes.md` (S1); the landing numbers it.

## Gate command

```
npm ci
npm test
cargo test --locked --manifest-path deck/rune/Cargo.toml
```

`npm test` runs `node scripts/gate.mjs`, which runs the Rune tests where cargo is on PATH (it is, on this laptop:
177 of 177 passed at 86957ec). One Rust file: `cargo test --locked --manifest-path deck/rune/Cargo.toml --test <name>`.
One node file: `node --test <file>`. Run the full gate once, on the slice's final state. CI's `Rune deck` job
(windows-latest) runs on the feature PR. Anything with a surface is also run in the built window
(`cargo run --release --manifest-path deck/rune/Cargo.toml`) against a scratch deck, never the user's deck on 4321.

## Known flaky tests

Copied from `docs/design/stay-awake/brief.md` on origin/design/stay-awake, itself copied from crew-handoff-trace's:

- `deck/test/idle-wake.test.mjs` "a parked wait wakes": red after 10:20 UTC until ci-green lands.
- Windows-CI only: "sed -i on a tracked file is refused".

## Diff limit

400 changed lines per slice. Past that, stop and ask `main`.
