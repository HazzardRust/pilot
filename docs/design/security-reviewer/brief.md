# Standing brief: security-reviewer

Read this before your slice brief; the slice brief carries only the slice.

| Fact | Value |
| --- | --- |
| Repository | `C:/Users/Hazzard/Projects/pilot` (HazzardRust/pilot), default branch `main` |
| Base and PR target | `origin/feat/security-reviewer`; open the slice PR as a **draft** against `feat/security-reviewer`. The feature is cut from `pilot` (design at e1b0df50; `pilot integrate` takes the current `pilot` tip first) |
| Worktree and branch | `C:/Users/Hazzard/Projects/pilot-security-reviewer-s<n>` on `slice/security-reviewer-s<n>`; run `npm ci` first |
| Artefact | `docs/design/security-reviewer/architecture.md`; your slice is `docs/design/security-reviewer/slices/S<n>.md`; ADRs 0102 and 0103 |
| Gate | `npm test`, plus your slice file's own verification command; `node scripts/check-provenance.mjs agents/ skills/ rules/` and `node scripts/build-vendor-ledger.mjs --check`; `node scripts/adr-index.mjs --check` when `docs/adr/` changes |
| Known flakes | under load: `deck/test/daemon.test.mjs` "a progress token is the asking", `deck/test/usage.test.mjs` "a reset time already behind us", `run.test.mjs:300`, and `deck/test/usage.test.mjs` "in 2 hrs" vs "in 1 hr". Rerun them, do not fix them, and name any that fires |
| Live check | every slice changes prompt prose, so the live check is the real review your slice file's Reviewers line triggers on your own PR: spawn each reviewer it names, and paste each report, table and verdict, into the PR body |
| Reviewer briefs | a reviewer brief says "report to your caller, the co-pilot" |
| Never touch | the user's real `~/.claude` or `~/.claude/pilot/deck.json`, this repository's other worktrees; the user's deck daemon on `127.0.0.1:4321` is running this very run: do not restart it, stop it or post test items to it |
| Prompt budgets | any change to `agents/*.md` or `skills/*/SKILL.md` moves the prompt-budget pins (`scripts/test/measure-prompt.test.mjs`, `scripts/test/qa-preview.test.mjs`). A pin never rises. Pay for added text by removing redundant text, never an instruction, and table each change in the PR body |
| Diff limit | 150 changed lines, code plus tests; stop and ask past it |

Commit trailer:

```
Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01XhyMaro8EpPz9iRc2da2ZR
```

PR body ends with:

```
🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_01XhyMaro8EpPz9iRc2da2ZR
```

Report shape: PR, head SHA, one gate line, decisions taken alone, files outside the slice, one friction row.
