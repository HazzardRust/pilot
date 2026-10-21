# Standing brief: user-thread-listener

Read this before your slice brief; the slice brief carries only the slice.

| Fact | Value |
| --- | --- |
| Repository | `C:/Users/Hazzard/Projects/pilot` (HazzardRust/pilot), default branch `main` |
| Base and PR target | `origin/feat/user-thread-listener`; open the slice PR as a **draft** against `feat/user-thread-listener` |
| Worktree and branch | `C:/Users/Hazzard/Projects/pilot-user-thread-listener-s<n>` on `slice/user-thread-listener-s<n>`; run `npm ci` first |
| Artefact | `docs/design/user-thread-listener/architecture.md`; your slice is `docs/design/user-thread-listener/slices/S<n>.md` |
| Gate | `npm test`, plus your slice file's own verification command; `node scripts/check-provenance.mjs agents/ skills/ rules/` and `node scripts/build-vendor-ledger.mjs --check` when agents, skills, rules or vendor files change |
| Known flake | `deck/test/usage.test.mjs` "in 2 hrs" vs "in 1 hr" (clock-dependent; seen 2026-09-28, green on the rerun); name it if it fires, do not fix it |
| Live check | no browser surface. Run `pilot wait` and the two hooks by hand against a scratch deck with its own `PILOT_DECK_DIR` and `PILOT_DECK_PORT=4399`, in a scratch repository with one `git worktree` (L8, artefact §9); paste the output in the PR |
| Live deck | the user's deck daemon on `127.0.0.1:4321` is running this very run; do not restart it, stop it or post test items to it, and never write into `~/.claude/pilot/` |
| Prompt budgets | any change to `agents/*.md`, `skills/*/SKILL.md` or `deck/tools.mjs` moves the prompt-budget pins (`scripts/test/measure-prompt.test.mjs`). The pins are the user's and do not move: the pilot's own share stays at or under 10270.75. Pay for added text by removing redundant text, never an instruction, and table each change in the PR body |
| Diff limit | 400 changed lines, code plus tests; stop and ask `main` past it |

Commit trailer:

```
Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
```

PR body ends with:

```
🤖 Generated with [Claude Code](https://claude.com/claude-code)
```

Report shape: PR, head SHA, one gate line, decisions taken alone, files outside the slice, one friction row.
