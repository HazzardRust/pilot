# Brief: archive-page

The facts every implementer of this feature shares. Read this first, then your slice file.

## Repository

`C:/Users/Hazzard/Projects/pilot` (GitHub `HazzardRust/pilot`). Default branch `main`, pilot branch `pilot`. Never
work in that shared checkout or in another session's worktree. Create your own beside it, `pilot-archive-page-s<n>`,
and run `npm ci` there before the first test.

## Remote

Remote: origin

## Base and PR target

The base is `feat/archive-page`, cut at Gate 1 from the design tip on `origin/pilot` (Rune landed at 4fee6665).
Branches: `slice/archive-page-s<n>`, pushed for the pilot to integrate; no slice PR. The PR target is `pilot`.

## PR titles

- A slice: `feat(archive-page): S<n> <title>`, the title lower-case first, e.g. `feat(archive-page): S1 the archive tab lists closed tickets by day`
- A fix round: `fix(archive-page): <what>`
- The feature PR: `feat(archive-page): every local record, readable`

## Commit trailer

Every commit ends with these two lines, copied exactly:

```
Co-Authored-By: Claude Fable 5.2 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01NXgSFpzNB8zPpKs1Y5s2eU
```

## PR footer

Every PR body ends with these lines, copied exactly:

```
🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_01NXgSFpzNB8zPpKs1Y5s2eU
```

## Artefact

`docs/design/archive-page/architecture.md`, slices in `slices/S1.md` to `slices/S10.md`. The run's ADR is
`docs/adr/0220-archive-page.md` (S10); the landing numbers it.

## Gate command

```
npm ci
npm test
```

A slice that edits `deck/rune/` also runs `cargo test --manifest-path deck/rune/Cargo.toml` (its own `--test deck <module>` filter first; the Rune tests are one binary under `tests/deck/` since drift merge df492de).

`npm test` runs `node scripts/gate.mjs`: 5.5 to 20 minutes on 2026-11-20. One file: `node --test <file>`. Run the full
`npm test` once, on the slice's final state. The repo has no typecheck, lint or build script. Tests use a scratch store
(`tempDeck`, `deckOnAPort` in `deck/testUtils.mjs`); the gate fails a write to the home store (ADR 0194).

## Known flaky tests

- Windows-CI only: "sed -i on a tracked file is refused".

## Diff limit

400 changed lines per slice. Past that, stop and ask `main`.

## Live verification

The screen is a surface: start a scratch deck on a copy of the store (`PILOT_DECK_DIR`), run the Rune deck against it
(`cargo build --release --manifest-path deck/rune/Cargo.toml`, then `deck/rune/target/release/pilot-deck`; `--snap out.png`
for a screenshot), press Archive and look at it. Never point a test or a timing at the live `~/.claude/pilot`.
