# Brief: crew-tests-behaviour

## Repository

`C:/Users/Hazzard/Projects/pilot` (HazzardRust/pilot, recreated public), default branch `main`. Artefact: `docs/design/crew-tests-behaviour/architecture.md`; slices under `slices/`.

## Base and PR target

Base: `feat/crew-tests-behaviour`, cut from `pilot`, base taken at `6ea49cac` (merge 8be8f3a0). Slice PRs target `feat/crew-tests-behaviour`; the feature PR targets `pilot`.

## Remote

Remote: origin

## Gate

- Slices: `npm run test:changed -- --since=origin/feat/crew-tests-behaviour` (falls back to the full suite when a skill or agent change reaches no test). Run with `run_in_background` or a 600000 ms timeout and read the log to its counts.
- Full suite: `npm test` (4-6 min), once, at `pilot land`.
- Prompt and skill edits also gate on `node scripts/check-references.mjs` (exit 0) and `node scripts/measure-prompt.mjs` (each agent within its pin: pilot-architect headroom 0, pilot-qa headroom 1.5; an addition to a pinned agent cuts as much as it adds).
- Skill edits: `node scripts/check-provenance.mjs skills/` and `node scripts/build-vendor-ledger.mjs --check` (regenerate `VENDOR.md` with `node scripts/build-vendor-ledger.mjs`).
- GitHub Actions is billing-refused: a red or unstarted check is not evidence; local runs are the referee.

## Known flaky tests

- `deck/test/daemon-lifecycle.test.mjs:110` — a rerun passes.

## Commit trailer

```
Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01NXgSFodNbTKqoJ71EpWMS5
```

## PR footer

```
🤖 Generated with [Claude Code](https://claude.com/claude-code)
https://claude.ai/code/session_01NXgSFodNbTKqoJ71EpWMS5
```

## PR titles

- Slice: `feat(crew-tests-behaviour): S<n> <title>`, the title lower-case first, e.g. `feat(crew-tests-behaviour): S1 walking skeleton: the implementer writes its tests under tdd`
- Fix round: `fix(crew-tests-behaviour): <what>`
- Feature: `feat(crew-tests-behaviour): the crew tests behaviour, not wording`

## Seam changes recorded by the co-pilot

- The run's ADR is the placeholder `docs/adr/0180-prose-is-not-a-test-target.md`, cited `ADR NNNN`, no README row; the landing numbers it (`scripts/adr-allocate.mjs`). 0166-0176 are taken on `pilot`.
- `npm ci` in every fresh worktree before any test.
