# Standing brief: audit-fixes

Read this before your slice brief; the slice brief carries only the slice.

| Fact | Value |
| --- | --- |
| Repository | `C:/Users/Hazzard/Projects/pilot` (HazzardRust/pilot), default branch `main` |
| Base and PR target | `origin/feat/audit-fixes`; open the slice PR as a **draft** against `feat/audit-fixes`. The feature stands on `feat/deck-press-feedback` (PR #319) |
| Worktree and branch | `C:/Users/Hazzard/Projects/pilot-audit-fixes-s<n>` on `slice/audit-fixes-s<n>`; run `npm ci` first |
| Artefact | `docs/design/audit-fixes/architecture.md`; your slice is `docs/design/audit-fixes/slices/S<n>.md` |
| Gate | `npm test`, plus your slice file's own verification command; `node scripts/check-provenance.mjs agents/ skills/ rules/` and `node scripts/build-vendor-ledger.mjs --check` when agents, skills, rules or vendor files change |
| Known flake | `deck/test/usage.test.mjs` "in 2 hrs" vs "in 1 hr" (clock-dependent; seen 2026-09-28, green on the rerun); name it if it fires, do not fix it |
| Live check | run what your slice changed for real, against scratch only (L8): the install with a temporary home standing in for `~/.claude`, the prune in a throwaway clone with its own merged, unmerged and dirty worktrees, a hook fed its payload on stdin. Paste the output in the PR |
| Never touch | the user's real `~/.claude`, `~/.gateguard` or this repository's worktrees; the user's deck daemon on `127.0.0.1:4321` is running this very run: do not restart it, stop it or post test items to it |
| Prompt budgets | any change to `agents/*.md`, `skills/*/SKILL.md` or `deck/tools.mjs` moves the prompt-budget pins (`scripts/test/measure-prompt.test.mjs`). The pins are the user's and do not move. Pay for added text by removing redundant text, never an instruction, and table each change in the PR body |
| Diff limit | 400 changed lines, code plus tests; stop and ask `main` past it (the ADR backfill slice is exempt, Q7) |

Commit trailer:

```
Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
```

PR body ends with:

```
🤖 Generated with [Claude Code](https://claude.com/claude-code)
```

Report shape: PR, head SHA, one gate line, decisions taken alone, files outside the slice, one friction row.
