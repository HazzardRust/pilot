# Brief: one-integration-line

The facts every implementer of this feature shares. Read this first, then your slice file.

## Repository

`C:/Users/Hazzard/Projects/pilot` (GitHub `HazzardRust/pilot`), default branch `main`, pilot branch `pilot`. Never
work in that checkout or in another session's worktree. Create your own beside it, `pilot-one-integration-line-s<n>`,
and run `npm ci` there before the first test run. The deck on 127.0.0.1:4321 is the user's: never stop, replace or
restart it.

## Base and PR target

Base: `feat/one-integration-line`, cut from `design/one-integration-line` at Gate 1 (ticket itm_d1054e1ebb14),
itself on `origin/pilot` 54d11846, rebased onto pilot once suite-at-landing (ADR 0166) has landed. Every slice PR is
a **draft** against `feat/one-integration-line` and is never marked ready. Branch: `slice/one-integration-line-s<n>`.
The feature PR targets `pilot`.

## Remote

Remote: origin

## Gate command

`npm test` (`node scripts/gate.mjs`), the full suite, 4-6 minutes: run it in the background, past a 600 s tool
timeout. Once suite-at-landing is on the base, `npm run test:changed -- --since=<base sha>` is the slice's red/green
loop; the phase gate stays `npm test`, since these slices change the merge scripts.

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

- Slice: `feat(one-integration-line): S<n> <title>`, the title lower-case first, e.g. `feat(one-integration-line): S1 the landing runs no sync`
- Fix round: `fix(one-integration-line): <what>`
- Feature PR: `feat(one-integration-line): pilot is the one integration line`

## Artefact

`docs/design/one-integration-line/architecture.md`; slice files `slices/S<n>.md`. ADR number 0167, a real number
(L6): this feature's landing runs the installed plugin's land, which does not allocate. A collision is renumbered by
the pilot, never by a slice. Small-diff limit: 40 lines per fix; past it, stop and ask `main`.
