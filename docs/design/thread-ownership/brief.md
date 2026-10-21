# Standing brief: thread-ownership

Read this before your slice brief; the slice brief carries only the slice.

| Fact | Value |
| --- | --- |
| Repository | `C:/Users/Hazzard/Projects/pilot` (HazzardRust/pilot) |
| Base and PR target | `origin/feat/thread-ownership`; open the slice PR as a **draft** against `feat/thread-ownership` |
| Worktree and branch | `C:/Users/Hazzard/Projects/pilot-thread-ownership-s<n>` on `slice/thread-ownership-s<n>`; run `npm ci` first |
| Artefact | `docs/design/thread-ownership/architecture.md`; your slice is `docs/design/thread-ownership/slices/S<n>.md` |
| Gate | `npm test`, plus your slice file's own verification command; `node scripts/check-provenance.mjs agents/ skills/ rules/` and `node scripts/build-vendor-ledger.mjs --check` when agents, skills, rules or vendor files change |
| Known flake | `deck/test/usage.test.mjs:656` ("in 2 hrs" vs "in 1 hr", clock-dependent); name it if it fires, do not fix it |
| Browser gate | every slice with a deck UI surface is exercised live in Chrome (chrome-devtools MCP) with screenshots, on a scratch deck, never the user's live deck on port 4321 |
| Live deck | the user's deck daemon on `127.0.0.1:4321` is running this very run; do not restart it, stop it or post test items to it |
| Prompt budgets | any change to `deck/tools.mjs` schemas or descriptions, `agents/*.md` or `skills/pilot/SKILL.md` moves the prompt-budget pins (`scripts/test/measure-prompt.test.mjs:105`, `scripts/test/qa-preview.test.mjs:111`: pilot <= 9800, pilot-qa <= 5500, explorer <= 2150). The pins are the user's and do not move; after S1 the headroom is pilot 29, pilot-qa 5.5 tokens. Pay for added text by removing redundant text in a file you own, never an instruction, and table each change in the PR body |
| Test waits | a parked HTTP wait wakes only on a write through the page (`POST /reply`), not on `addReply` called directly; see `deck/test/routing.test.mjs` |
| Diff limit | 400 changed lines, code plus tests; stop and ask `main` past it |
| Model | Opus for every implementer and fixer (the user's instruction on the ticket) |

Commit trailer:

```
Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01GCnP4QYTVAVAZUiWQYgV4R
```

PR body ends with:

```
🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_01GCnP4QYTVAVAZUiWQYgV4R
```

Report shape: PR, head SHA, one gate line, decisions taken alone, files outside the slice, one friction row.
