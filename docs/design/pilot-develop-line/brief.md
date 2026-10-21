# Brief: pilot-develop-line

The facts every implementer of this feature shares. Read this first, then your slice file.

## Repository

`C:/Users/Hazzard/projects/pilot` (GitHub `HazzardRust/pilot`), default branch `main`, pilot branch `pilot`. Never
work in that checkout or in another session's worktree. Create your own beside it, `pilot-pilot-develop-line-s<n>`,
and run `npm ci` there before the first test run. The deck on 127.0.0.1:4321 is the user's: never stop, replace or
restart it. QA and any live check use scratch branches in this repository, never `pilot` or `main` (L2).

## Base and PR target

Base: `feat/pilot-develop-line`, cut from `design/pilot-develop-line` at Gate 1 (ticket itm_ec448e2fd6f6), itself on
`origin/pilot` 4e5def84. Branch: `slice/pilot-develop-line-s<n>`. This run is built by the installed plugin, so its
slices still follow today's PR step: a **draft** PR against `feat/pilot-develop-line`, never marked ready. The feature
PR targets `pilot`.

## Remote

Remote: origin

## Gate command

`npm test` (`node scripts/gate.mjs`), the full suite: run it in the background, past a 600 s tool timeout.
GitHub Actions is billing-refused on this account: a red or unstarted check is not evidence; the local run is the
referee (`npm test` on Windows; the WSL five-run loop at the landing).

## Known flaky tests

None known.

## Commit trailer

```
Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_0131nxNBjfjGFLyrfajro9Wk
```

## PR footer

```
🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_0131nxNBjfjGFLyrfajro9Wk
```

## PR titles

- Slice: `feat(pilot-develop-line): S<n> <title>`, the title lower-case first.
- Fix round: `fix(pilot-develop-line): <what>`.
- Feature: `feat(pilot-develop-line): the pilot branch reads as a develop line to a team`.
