# Standing brief: runs-build-on-each-other

Read this before your slice brief; the slice brief carries only the slice.

| Fact | Value |
| --- | --- |
| Repository | `C:/Users/Hazzard/Projects/pilot` (HazzardRust/pilot), default branch `main` |
| Base and PR target | `origin/feat/runs-build-on-each-other`; open the slice PR as a **draft** against `feat/runs-build-on-each-other` |
| Worktree and branch | `C:/Users/Hazzard/Projects/pilot-runs-build-on-each-other-s<n>` on `slice/runs-build-on-each-other-s<n>`; run `npm ci` first |
| Artefact | `docs/design/runs-build-on-each-other/architecture.md`; your slice is `docs/design/runs-build-on-each-other/slices/S<n>.md` |
| Gate | `npm test`, plus your slice file's own verification command; `node scripts/check-provenance.mjs agents/ skills/ rules/` and `node scripts/build-vendor-ledger.mjs --check` when agents, skills, rules or vendor files change |
| Known flake | `deck/test/usage.test.mjs` "in 2 hrs" vs "in 1 hr" (clock-dependent; seen 2026-09-28, green on the rerun); name it if it fires, do not fix it |
| Live check | no browser surface. Run the CLI for real in a scratch clone with a local bare remote and a `gh` stub on `PATH` (L8, L9); never against this repository's real branches or real GitHub PRs |
| Live deck | the user's deck daemon on `127.0.0.1:4321` is running this very run; do not restart it, stop it or post test items to it, and never write into `~/.claude/pilot/`. A scratch deck takes its own `PILOT_DECK_DIR` and `PILOT_DECK_PORT` |
| Shell safety | PR numbers and branch names reach `git` and `gh` as argv, never a shell string (L10) |
| Prompt budgets | any change to `deck/tools.mjs`, `agents/*.md` or `skills/*/SKILL.md` moves the prompt-budget pins (`scripts/test/measure-prompt.test.mjs`). The pins are the user's and do not move; `agents/pilot.md` has about 5 tokens of headroom (F8, L6). Pay for added text by removing redundant text, never an instruction, and table each change in the PR body |
| Diff limit | 400 changed lines, code plus tests; stop and ask `main` past it |

Commit trailer:

```
Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01FDtma9B6qDLLGVFXRiyAKj
```

PR body ends with:

```
🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_01FDtma9B6qDLLGVFXRiyAKj
```

Report shape: PR, head SHA, one gate line, decisions taken alone, files outside the slice, one friction row.
