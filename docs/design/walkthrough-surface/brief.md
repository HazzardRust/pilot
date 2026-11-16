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

## Seam changes (co-pilot, 2026-11-16)

- Repository recreated as a fresh public repo after Gate 1: the plan is on `feat/walkthrough-surface` (71b16af0), `origin/pilot` 6ea49cac merged in at 4168ecad. #885 is on `pilot` (`docs/adr/0168-a-small-ticket-takes-the-short-path.md`, `deck/short-path-shape.mjs`): the precondition holds.
- Line anchors in the slice files are from the old tree; re-read each before editing on it.
- A new ADR is written as `docs/adr/NNNN-<title>.md`; the landing numbers it (`scripts/adr-allocate.mjs`).
- No test reads a prompt or doc for a phrase (assumed, itm_16a37a996e52; `crew-tests-behaviour` makes a wording pin an anti-pattern): S4's and S8's prose pins are dropped; their evidence is `node scripts/check-references.mjs` and `node scripts/measure-prompt.mjs`.
- Edits to `scripts/integrate.mjs`, `agents/pilot-implementer.md` and `agents/pilot-fundamentalist.md` stay minimal: `crew-tests-behaviour` changes them.
