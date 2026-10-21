# Brief: lander-report

The facts every implementer of this feature shares. Read this first, then your slice file.

## Repository

`C:/Users/Hazzard/projects/pilot` (GitHub `HazzardRust/pilot`, public), default branch `main`, pilot branch `pilot`.
Never work in that checkout or in another session's worktree. Create your own beside it,
`pilot-lander-report-s<n>`, and run `npm ci` there before the first test run. The deck on 127.0.0.1:4321 is the
user's: never stop, replace or restart it.

## Base and PR target

Base: `feat/lander-report`, cut from `design/lander-report` at Gate 1 (ticket itm_09a7f609e937), itself on
`origin/pilot` c8365943. Every slice PR is a **draft** against `feat/lander-report` and is never marked ready.
Branch: `slice/lander-report-s<n>`. The feature PR targets `pilot`.

## Remote

Remote: origin

## Gate command

`npm ci; npm test; node scripts/check-references.mjs; node scripts/check-provenance.mjs agents/ skills/ rules/`.
Run `npm test` in the background, past a 600 s tool timeout. GitHub Actions are billing-blocked: the local run
is the referee.

## Known flaky tests

- `deck/test/scratch-stop.test.mjs`, the symlink-registry test: can fail `EEXIST` on a shared `%TEMP%` path; passes on rerun.

## Commit trailer

```
Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01PLSy3oNjHdFSiMkkcniEyc
```

## PR footer

```
🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_01PLSy3oNjHdFSiMkkcniEyc
```

## PR titles

- Slice: `feat(lander-report): S<n> <title>`, the title lower-case first, e.g. `feat(lander-report): S1 the plugin version moves so an update installs the bodiless report`
- Fix round: `fix(lander-report): <what>`
- Feature PR: `feat(lander-report): the lander's bodiless closing report is accepted`

## Artefact

`docs/design/lander-report/architecture.md`; slice file `slices/S1.md`. No ADR (L3). Diff limit: 300 lines per
slice; past it, stop and ask `main`.
