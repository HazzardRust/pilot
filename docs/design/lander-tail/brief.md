# Brief: lander-tail

The facts every implementer of this feature shares. Read this first, then your slice file.

## Repository

`C:/Users/Hazzard/Projects/pilot` (GitHub `HazzardRust/pilot`), default branch `main`, pilot branch `pilot`. Never
work in that checkout or in another session's worktree. Create your own beside it, `pilot-lander-tail-s<n>`, and run
`npm ci` there before the first test run. The deck on 127.0.0.1:4321 is the user's: never stop, replace or restart it,
and never prune or touch a real run's worktree (L2).

## Base and PR target

Base: `feat/lander-tail`, cut from `design/lander-tail` at Gate 1 (ticket itm_6971c0f47a93), itself on `origin/pilot`
c1836f88. Every slice PR is a **draft** against `feat/lander-tail` and is never marked ready. Branch:
`slice/lander-tail-s<n>`. The feature PR targets `pilot`.

## Remote

Remote: origin

## Gate command

`npm test` (`node scripts/gate.mjs`), the full suite: run it in the background, past a 600 s tool timeout.
`npm run test:changed -- --since=<base sha>` is the slice's red/green loop; the phase gate stays `npm test`. GitHub
Actions are billing-blocked: the local `npm test` on Windows is the referee.

## Known flaky tests

None recorded.

## Commit trailer

```
Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Tek2jZXVh7dqjyqwApvNHq
```

## PR footer

```
🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_01Tek2jZXVh7dqjyqwApvNHq
```

## PR titles

- Slice: `feat(lander-tail): S<n> <title>`, the title lower-case first, e.g. `feat(lander-tail): S1 a bodiless report posts through the deck_post schema`
- Fix round: `fix(lander-tail): <what>`
- Feature PR: `feat(lander-tail): the lander's tail is the lander's`

## Artefact

`docs/design/lander-tail/architecture.md`; slice files `slices/S<n>.md`. ADR number 0171 (S2; renumbered from 0168, then 0170, by the co-pilot), a real number: the
installed plugin's land does not allocate. A collision is renumbered by the pilot, never by a slice. Diff limit:
300 lines per slice; past it, stop and ask `main`.
