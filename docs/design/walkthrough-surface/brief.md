# walkthrough-surface: implementer brief

## Repository

`C:/Users/Hazzard/Projects/pilot` (HazzardRust/pilot), default branch `main`.

## Base and PR target

Base `feat/walkthrough-surface`, cut from `pilot`; slice PRs target `feat/walkthrough-surface`, the feature PR targets `pilot`.
Precondition: #885 (short-path) is on `pilot` before S1 starts.

## Remote

Remote: origin

## Gate

`npm test` (`node scripts/gate.mjs`, 4–6 min), run once on the final state. GitHub Actions is billing-blocked: the local gate is the referee; report the sha and the result.
Red/green: `npm run test:changed -- --since=<base sha>`.

## Known flaky tests

- `deck/test/daemon-lifecycle.test.mjs:110` (a rerun passes).

## Standing bars

- 800-line bar on deck modules (`deck/test/facades.test.mjs`, counts `split('\n')`); `deck/README.md` must list each module.
- measure-prompt pins on agent prompts (`scripts/test/measure-prompt.test.mjs`); headroom is 0 for pilot, pilot-qa, pilot-architect.

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

- Slice: `feat(walkthrough-surface): S<n> <title>`, the title lower-case first.
- Fix round: `fix(walkthrough-surface): <what>`.
- Feature: `feat(walkthrough-surface): a walkthrough only for a surface; every command step names where it runs`.
