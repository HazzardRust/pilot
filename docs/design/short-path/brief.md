# Brief: short-path

The facts every implementer of this feature shares. Read this first, then your slice file.

## Repository

`C:/Users/Hazzard/Projects/pilot` (GitHub `HazzardRust/pilot`), default branch `main`, pilot branch `pilot`. Never
work in that checkout or in another session's worktree. Create your own beside it, `pilot-short-path-s<n>`,
and run `npm ci` there before the first test run. The deck on 127.0.0.1:4321 is the user's: never stop, replace or
restart it; use `pilot deck --scratch` for live checks.

## Base and PR target

Base: `feat/short-path`, cut from `design/short-path` at Gate 1 (ticket itm_3f18af072438), itself on
`origin/pilot` 54d11846. Every slice PR is a **draft** against `feat/short-path` and is never marked ready.
Branch: `slice/short-path-s<n>`. The feature PR targets `pilot`. stage-queue-tail edits `deck/store-items.mjs`
(S3 rebases on it) and one-integration-line edits `agents/pilot.md` (S4 rebases on it if it lands first): build no
part of either.

## Remote

Remote: origin

## Gate command

`npm test` (`node scripts/gate.mjs`), the full suite, 4-6 minutes: run it in the background, past a 600 s tool
timeout. Each slice names its focused `node --test` files first.

## Known flaky tests

- `deck/test/daemon-lifecycle.test.mjs:110` "a 500 writes the same one line" (2 !== 1); a rerun passes.

## Commit trailer

```
Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Cmu6QXexHes1EiTfHDYBgB
```

## PR footer

```
🤖 Generated with [Claude Code](https://claude.com/claude-code)
```

## PR titles

- Slice: `feat(short-path): S<n> <title>`, the title lower-case first, e.g. `feat(short-path): S1 the tickets tab marks a short-path ticket`
- Fix round: `fix(short-path): <what>`
- Feature PR: `feat(short-path): a small ticket takes the short path`

## Artefact

`docs/design/short-path/architecture.md`; slice files `slices/S<n>.md`. ADR number 0168 (0165-0167 taken by
unlanded designs). A collision at the base merge is renumbered by the pilot, never by a slice.
Small-diff limit: 40 lines per fix; past it, stop and ask `main`.
