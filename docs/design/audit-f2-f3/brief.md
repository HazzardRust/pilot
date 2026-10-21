# Brief: audit-f2-f3

The facts every implementer of this feature shares. Read this first, then your slice file.

## Repository

`C:/Users/Hazzard/Projects/pilot` (GitHub `HazzardRust/pilot`), default branch `main`, pilot branch `pilot`. Never
work in that checkout or in another session's worktree. Create your own beside it, `pilot-audit-f2-f3-s<n>`, and run
`npm ci` there before the first test run. The deck on 127.0.0.1:4321 is the user's: never stop, replace or restart it.

## Base and PR target

Base: `feat/audit-f2-f3`, cut from `design/audit-f2-f3` at Gate 1 (ticket itm_a796b37c2d10), itself on `origin/pilot`
33a5ead7. Every slice PR is a **draft** against `feat/audit-f2-f3` and is never marked ready. Branch:
`slice/audit-f2-f3-s<n>`. The feature PR targets `pilot`.

## Remote

Remote: origin

## Gate command

`npm test` on Windows, once, in your own worktree. Before a landing, `node scripts/gate.mjs` runs five times in a row
on a fresh Linux clone (WSL, node 26 at `~/node26`) at the exact commit, and all five must be green. GitHub Actions
does not run on this account, so a red or unstarted check is not evidence either way.

## Known flaky tests

- The Windows worktrees test has twice failed mid-run with MODULE_NOT_FOUND and no summary (2026-10-19).
- The nested fixture gate once reported "powershell.exe not found" while three gates were running at once.

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

- Slice: `feat(audit-f2-f3): S<n> <title>`, the title lower-case first, e.g. `feat(audit-f2-f3): S1 pilot gh-stub answers a pr probe without reaching github`
- Fix round: `fix(audit-f2-f3): <what>`
- Feature PR: `feat(audit-f2-f3): the rerun-alone gate step and pilot gh-stub`

## Artefact

`docs/design/audit-f2-f3/architecture.md`; slice files `slices/S<n>.md`. The ADR is
`docs/adr/0173-a-gh-stub-is-node-linked-as-gh.md`, cited `ADR NNNN`, and the landing numbers it (ADR 0167). Never
write a four-digit number yourself. S1 writes the ADR. The diff limit is 40 lines: past it, ask `main` before you
grow the diff further. S1 is already agreed at about 90 lines.

## Environment

`gh` is at `C:/Program Files/GitHub CLI/gh.exe`. Never probe a PR command against real GitHub: once S1 has landed, use
`eval "$(pilot gh-stub)"` (Git Bash) or `pilot gh-stub --powershell` in the same call as the probe. Before S1 lands,
use `node bin/pilot.mjs gh-stub` from your worktree.
