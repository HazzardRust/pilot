# Brief: clean-landing

The facts every implementer of this feature shares. Read this first, then your slice file.

## Repository

`C:/Users/Hazzard/Projects/pilot` (GitHub `HazzardRust/pilot`), default branch `main`, pilot branch `pilot`. Never
work in that checkout or in another session's worktree: create your own, named `pilot-clean-landing-s<n>`,
beside it. Run `npm ci` in the new worktree before the first test run.

## Base and PR target

Base: `feat/clean-landing`, cut from `design/clean-landing` at Gate 1 (ticket itm_09983af566aa), itself on
`origin/pilot` 64906d40. Every slice PR is a **draft** against `feat/clean-landing`, never marked ready; the pilot
merges it. Branch: `slice/clean-landing-s<n>`. Write PR bodies with `gh pr create --body-file <file>`. The order
in §8 of the artefact holds: `scripts/land.mjs` is edited by S3, S2, S4, S9 in that order and `deck/landing.mjs`
by S5 then S8; S1, S3, S7, S11 share no file and may start together within the budget.

Two other runs are yellow at the same time: idle-main-lane (`deck/lanes.mjs`, `deck/wait.mjs`,
`deck/test/wait.test.mjs`, `scripts/test/handoff.test.mjs`, the hooks) and bigger-jobs (`agents/pilot.md`,
`agents/pilot-architect.md`, `agents/pilot-qa.md`, `skills/*`, `deck/budget.mjs`). S6 waits for idle-main-lane to
land and S10 for bigger-jobs; the co-pilot holds them until then. No other slice edits those files.

## PR titles

- Slice: `feat(clean-landing): S<n> <title as the artefact words it>`, the first word after `S<n>` lower-case.
- Fix round: `fix(clean-landing): <what>`
- Feature PR: `feat(clean-landing): landings that never stop blind, and clear up after themselves`

## Commit trailer

```
Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_019aXY9ksfTqaDQ45XvJgA7D
```

## PR footer

```
🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_019aXY9ksfTqaDQ45XvJgA7D
```

## Artefact

`docs/design/clean-landing/architecture.md`; slice files `docs/design/clean-landing/slices/S<n>.md`.
Locked decisions §5 (L0 to L10) move in no slice; assumed A2 and A3 are decided, not open. ADRs 0129 and 0130
are already on the design branch; `node scripts/adr-index.mjs --check` stays green.

## Where things live

The landing merge: `scripts/sync.mjs` (`mergeIntoPilot`), called from `scripts/land.mjs` and `pilot sync`.
Worktree removal: `scripts/worktrees.mjs` (`prune`). The deck's press: `deck/landing.mjs`, rows in
`deck/store-runs.mjs`. Test runs inside the scripts: `scripts/integrate.mjs` (`runTests`). Test helpers:
`deck/testUtils.mjs`. Agent prose pins: `scripts/test/pilot-agents.test.mjs`; prompt-budget pins:
`scripts/test/measure-prompt.test.mjs` (pilot headroom is 0: measure with the test's own `measure()` before any
edit to `agents/pilot.md`). Heredoc edits mangle `\'` and backticks on this machine, and `node -e` inside bash
double quotes mangles template literals: use the Edit tool or a Node script file for text replaces. `PILOT_RUN_REPO`
and `CLAUDE_PROJECT_DIR` silently point `pilot` and the hooks at the live checkout: unset or redirect them in every
scratch run and test.

## Gate command

```
npm ci
npm test
node scripts/adr-index.mjs --check
node scripts/check-references.mjs
```

## Known flaky tests

`hooks/test/inbox.test.js:471` "a session takes its place on the deck without being told anything" fails under
`npm run test:quiet` on a loaded machine (`fetch failed` / `ECONNRESET`); S11 diagnoses and fixes it. Until S11
lands, a red run that names only that test is reported as such, never re-run to green and never skipped.

## Environment

QA runs against a scratch deck: `pilot deck --scratch` on a scratch repository with
`claude --plugin-dir <worktree>`; never the live deck at :4321. Landings are exercised in a scratch git repository
with its own bare `origin`, never against `HazzardRust/pilot`. Stop a scratch deck with `pilot deck --stop <pid>`,
never by killing the process. No logins, no seed data.
