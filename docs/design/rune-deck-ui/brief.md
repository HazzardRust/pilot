# Brief: rune-deck-ui

The facts every implementer of this feature shares. Read this first, then your slice file.

## Repository

`C:/Users/Hazzard/Projects/pilot` (GitHub `HazzardRust/pilot`). Default branch `main`, pilot branch `pilot`. Never
work in that shared checkout or in another session's worktree. Create your own beside it, `pilot-rune-deck-ui-s<n>`,
and run `npm ci` there before the first test.

## Remote

Remote: origin

## Base and PR target

The base is `feat/rune-deck-ui`, cut at Gate 1 from `origin/pilot` (d2358d9f at design time). Branches:
`slice/rune-deck-ui-s<n>`, pushed for the pilot to integrate; no slice PR. The feature PR's target is `pilot`.

## PR titles

- A slice: `feat(rune-deck-ui): S<n> <title>`, the title lower-case first, e.g. `feat(rune-deck-ui): S1 walking skeleton: a Rune window shows the deck's tabs read from /api/view`
- A fix round: `fix(rune-deck-ui): <what>`
- The feature PR: `feat(rune-deck-ui): Deck UI rebuilt in Rune`

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

`docs/design/rune-deck-ui/architecture.md`, slices in `slices/S1.md` to `slices/S20.md`. The run's ADR is
`docs/adr/0206-rune-deck-ui.md` (S1).

## Prerequisite

Rust (rustup, stable, edition 2024) and the Visual Studio C++ Build Tools, installed by the user. Before S1,
`cargo --version` must print; if it does not, stop and tell `main`. Rune is a git dependency pinned at
`7cba77c86b7c203bcf68c5ca539640cb81ec50ad`; copy its `[patch.crates-io]` block from `crates/rune/README.md` at that rev.

## Gate command

```
npm ci
npm test
cargo test --manifest-path deck/rune/Cargo.toml
```

`npm test` runs `node scripts/gate.mjs`, 6-8 minutes, 10 skipped is normal; after S19 it runs the cargo line itself.
One file: `node --test <file>`; one Rust test: `cargo test --manifest-path deck/rune/Cargo.toml --test <name>`.

## Known flaky tests

None recorded.

## Overlaps

human-steps (#122) edits `deck/ui/render-cards.mjs` and `deck/ui/render-rail.mjs`: a view slice may add `export` to a
helper there and nothing else, and rebases on `pilot` after human-steps lands. Never edit around another run's hunks.

## Diff limit

300 changed lines per slice, `Cargo.lock` excluded. Past that, stop and ask `main`.
