# Standing brief: deep-modules

Read this before your slice brief; the slice brief carries only the slice.

| Fact | Value |
| --- | --- |
| Repository | `C:/Users/Hazzard/Projects/pilot` (HazzardRust/pilot), default branch `main` |
| Base and PR target | `origin/feat/deep-modules`; open the slice PR as a **draft** against `feat/deep-modules`. The feature stands on `feat/audit-fixes` (PR #320) |
| Worktree and branch | `C:/Users/Hazzard/Projects/pilot-deep-modules-s<n>` on `slice/deep-modules-s<n>`; run `npm ci` first |
| Artefact | `docs/design/deep-modules/architecture.md`; your slice is `docs/design/deep-modules/slices/S<n>.md` |
| Gate | `npm test`, plus your slice file's own verification command; `node scripts/check-provenance.mjs agents/ skills/ rules/` and `node scripts/build-vendor-ledger.mjs --check` when agents, skills, rules or vendor files change |
| Known flake | `deck/test/usage.test.mjs` "in 2 hrs" vs "in 1 hr" (clock-dependent; seen 2026-09-28, green on the rerun); name it if it fires, do not fix it |
| Live check | run what your slice changed for real: `node scripts/check-slices.mjs` on the skill's example and this feature's slice files, `node scripts/check-references.mjs` on the corpus. A slice that only changes agent prose has no surface you can run; say so, and QA runs the agent live (L11). Paste the output in the PR |
| Never touch | the user's real `~/.claude` or this repository's other worktrees; the user's deck daemon on `127.0.0.1:4321` is running this very run: do not restart it, stop it or post test items to it |
| Prompt budgets | any change to `agents/*.md`, `skills/*/SKILL.md` or `deck/tools.mjs` moves the prompt-budget pins (`scripts/test/measure-prompt.test.mjs`). The pins are the user's and do not move. Pay for added text by removing redundant text, never an instruction, and table each change in the PR body |
| Shared files | `agents/pilot-architect.md` ("Read before you design") and `scripts/test/pilot-rules.test.mjs` are also edited by audit-fixes S7 and S11 on the base; stay inside the sections and lines your slice file names |
| Diff limit | 400 changed lines, code plus tests; a deepening fold 200 (A2); stop and ask `main` past it |

Commit trailer:

```
Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
```

PR body ends with:

```
🤖 Generated with [Claude Code](https://claude.com/claude-code)
```

Report shape: PR, head SHA, one gate line, decisions taken alone, files outside the slice, one friction row.
