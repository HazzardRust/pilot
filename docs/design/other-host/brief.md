# Brief: other-host

## Repository

`C:/Users/Hazzard/Projects/pilot` (GitHub `HazzardRust/pilot`), default branch `main`. Never work in that checkout or another session's worktree.

## Base and PR target

Base `feat/other-host`, cut from `origin/pilot` once deck-writes-github (itm_5f1725c876a7) has landed there (L6); design base 368eaa2a. Slice PRs target `feat/other-host`; the feature PR targets `pilot`.

## Remote

Remote: origin

## Gate

`npm test` (`node scripts/gate.mjs`), 4–6 min, run in the background, once on the final state.
Red/green loop: `npm run test:changed -- --since=<base sha>`.
GitHub Actions is billing-blocked on this account: a red or unstarted check is no evidence; the local gate is the referee. Report the sha and the result.

## Bars

- 800-line bar on deck modules (`deck/test/facades.test.mjs`, counts `split('\n')`); `deck/items.mjs` and `deck/store-items.mjs` are at it: new logic goes in new modules.
- `deck/README.md` must list each deck module.
- `measure-prompt` pins on agent prompts are exact; move a pin only by its measured cost.
- `node scripts/check-references.mjs` must pass.
- Verdict lines in the artefact's §6 are bullets, `Verdict: stands` or `Verdict: overturned: <why>` exactly, no trailing period or parenthesis.

## Known flaky tests

- `deck/test/daemon-lifecycle.test.mjs:110`; a rerun passes.

## Overlaps

- deck-writes-github: every seam this run names (`hostIn`, `HOST_VERBS`, `syncFeaturePr`, the host-bar test, doctor's allow row) is read from pilot after it lands; a symbol under another name goes to `main` as a seam change.
- plain-session: `deck/doctor.mjs`, `docs/INSTALL.md`, `agents/pilot.md`.
- itm_6971c0f47a93 (lander tail): `deck/closing-report.mjs` (S4).
- `glab` is not installed on this machine; the GitLab live run is QA's, on a throwaway gitlab.com project the user creates and signs `glab` into.

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

- Slice: `feat(other-host): S<n> <title>`, the title lower-case first.
- Fix round: `fix(other-host): <what>`.
- Feature: `feat(other-host): the pilot runs on a host other than GitHub`.
