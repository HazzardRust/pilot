# Brief: crew-tests-behaviour

## Repository

`C:/Users/Hazzard/projects/pilot` (HazzardRust/pilot), default branch `main`. Artefact: `docs/design/crew-tests-behaviour/architecture.md`; slices under `slices/`.

## Base and PR target

Base: `feat/crew-tests-behaviour`, cut from `pilot` at `1125a1ea`. Slice PRs target `feat/crew-tests-behaviour`; the feature PR targets `pilot`.

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
Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Cmu6QXexHes1EiTfHDYBgB
```

## PR footer

```
🤖 Generated with [Claude Code](https://claude.com/claude-code)
https://claude.ai/code/session_01Cmu6QXexHes1EiTfHDYBgB
```

## PR titles

- Slice: `feat(crew-tests-behaviour): S<n> <title>`, the title lower-case first, e.g. `feat(crew-tests-behaviour): S1 walking skeleton: the implementer writes its tests under tdd`
- Fix round: `fix(crew-tests-behaviour): <what>`
- Feature: `feat(crew-tests-behaviour): the crew tests behaviour, not wording`
