# Brief: suite-at-landing

The facts every implementer of this feature shares. Read this first, then your slice file.

## Repository

`C:/Users/Hazzard/Projects/pilot` (GitHub `HazzardRust/pilot`), default branch `main`, pilot branch `pilot`. Never
work in that checkout or in another session's worktree. Create your own beside it, `pilot-suite-at-landing-s<n>`,
and run `npm ci` there before the first test run. The deck on 127.0.0.1:4321 is the user's: never stop, replace or
restart it.

## Base and PR target

Base: `feat/suite-at-landing`, cut from `design/suite-at-landing` at Gate 1 (ticket itm_82f39930287e), itself on
`origin/pilot` 54d11846. Every slice PR is a **draft** against `feat/suite-at-landing` and is never marked ready.
Branch: `slice/suite-at-landing-s<n>`. The feature PR targets `pilot`. Ticket itm_d1054e1ebb14 (one integration
line) runs after this one on the same scripts: build no part of it.

## Remote

Remote: origin

## Gate command

`npm test` (`node scripts/gate.mjs`), the full suite, 4-6 minutes: run it in the background, past a 600 s tool
timeout. This feature builds the selection, and its slices change the gate, the selector and the merge scripts
(each a full-run trigger), so every slice's phase gate stays the full `npm test`.

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

- Slice: `feat(suite-at-landing): S<n> <title>`, the title lower-case first, e.g. `feat(suite-at-landing): S1 npm run test:changed runs the changed tests and their importers`
- Fix round: `fix(suite-at-landing): <what>`
- Feature PR: `feat(suite-at-landing): the full suite runs once, at the landing`

## Artefact

`docs/design/suite-at-landing/architecture.md`; slice files `slices/S<n>.md`. ADR number 0166 (0164 deck-token's,
0165 deck-spawn-root's, both unlanded). A collision at the base merge is renumbered by the pilot, never by a slice.
Small-diff limit: 40 lines per fix; past it, stop and ask `main`.
