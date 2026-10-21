# Brief: deck-spawn-root

The facts every implementer of this feature shares. Read this first, then your slice file.

## Repository

`C:/Users/Hazzard/Projects/pilot` (GitHub `HazzardRust/pilot`), default branch `main`, pilot branch `pilot`. Never
work in that checkout or in another session's worktree. Create your own beside it, `pilot-deck-spawn-root-s<n>`,
and run `npm ci` there before the first test run. The deck on 127.0.0.1:4321 is the user's: never stop, replace or
restart it. Every live check runs on a scratch deck (`pilot deck --scratch`) or by calling a module.

## Base and PR target

Base: `feat/deck-spawn-root`, cut from `design/deck-spawn-root` at Gate 1 (ticket itm_2c871094c3ac), itself on
`origin/pilot` 9e77cbf3. Every slice PR is a **draft** against `feat/deck-spawn-root` and is never marked ready.
Branch: `slice/deck-spawn-root-s<n>`. The feature PR targets `pilot`. Lander (#849, `feat/lander`) lands on pilot
first. Its `deck/client.mjs`, `deck/landing.mjs` and `deck/procs.mjs` match pilot's at 9e77cbf3.

## Remote

Remote: origin

## Gate command

`npm test` (`node scripts/gate.mjs`), 4-6 minutes: run it in the background, past a 600 s tool timeout.

## Known flaky tests

- `deck/test/daemon-lifecycle.test.mjs:110` "a 500 writes the same one line" (2 !== 1); a rerun passes.

## Commit trailer

```
Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01N5gq1NsTqzrTzohHn4TGwx
```

## PR footer

```
🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_01N5gq1NsTqzrTzohHn4TGwx
```

## PR titles

- Slice: `feat(deck-spawn-root): S<n> <title>`, the title lower-case first, e.g. `feat(deck-spawn-root): S1 a checkout client spawns the installed deck`
- Fix round: `fix(deck-spawn-root): <what>`
- Feature PR: `feat(deck-spawn-root): a deck is only ever spawned from the installed plugin`

## Artefact

`docs/design/deck-spawn-root/architecture.md`; slice files `slices/S<n>.md`. ADR number 0165 (0163 is pilot's
landing-keeps-worktrees, 0164 deck-token's). A collision at the base merge is renumbered by the pilot, never by a slice.
Small-diff limit: 40 lines per fix; past it, stop and ask `main`.
