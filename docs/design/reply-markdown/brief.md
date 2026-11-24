# Brief: reply-markdown

The facts every implementer of this feature shares. Read this first, then your slice file.

## Repository

`C:/Users/jrylk/Projects/pilot` (GitHub `HazzardRust/pilot`). Default branch `main`, pilot branch `pilot`. Never
work in that shared checkout or in another session's worktree. Create your own beside it,
`pilot-reply-markdown-s<n>`, and run `npm ci` there before the first test.

## Remote

Remote: origin

## Base and PR target

The base is `feat/reply-markdown`, which carries Rune (landed on `pilot`) and was merged up to `origin/pilot` at
8cc844c. Branch each slice from the `feat/reply-markdown` tip your brief names. Branches: `slice/reply-markdown-s<n>`,
pushed for the co-pilot to integrate; no slice PR. The feature PR (#137) lands on `pilot` at Gate 2.

## PR titles

- A slice: `feat(reply-markdown): S<n> <title>`, the title lower-case first, e.g. `feat(reply-markdown): S1 walking skeleton: bold, italic and code render off the caret's line, and the draft is sent unchanged`
- A fix round: `fix(reply-markdown): <what>`
- The feature PR: `feat(reply-markdown): Reply box renders markdown as you type`

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

`docs/design/reply-markdown/architecture.md`, slices in `slices/S1.md` to `slices/S4.md`. The run's ADR is
`docs/adr/NNNN-reply-markdown.md` (S1).

## Environment

cargo is not on the Git Bash PATH: run cargo from PowerShell with `$env:USERPROFILE\.cargo\bin` on `PATH`. Build
with `CARGO_PROFILE_DEV_DEBUG=0` and `CARGO_PROFILE_TEST_DEBUG=0`: per-worktree targets filled C: on the Rune run.
Rune is a git dependency pinned at `7cba77c86b7c203bcf68c5ca539640cb81ec50ad` (L6 of rune-deck-ui); do not move it.

## Gate command

```
npm ci
npm test
cargo fmt --check --manifest-path deck/rune/Cargo.toml
cargo test --manifest-path deck/rune/Cargo.toml
```

`npm test` runs `node scripts/gate.mjs`, 6-8 minutes, 10 skipped is normal; it runs the cargo test line itself where
cargo is on PATH. `cargo fmt --check` is added for this run: formatting drift reached QA on the Rune run.
One file: `node --test <file>`; one Rust test: `cargo test --manifest-path deck/rune/Cargo.toml --test <name>`.

## Live check

The surface is the Rune window: run `pilot-deck` against a scratch deck (no database), open a thread, type in the
reply box, and look; also `--snap <png>` of the thread screen. Your look feeds the walkthrough.

## Known flaky tests

None recorded.

## Diff limit

400 changed lines per slice, `Cargo.lock` excluded. Past that, stop and ask `main`.
