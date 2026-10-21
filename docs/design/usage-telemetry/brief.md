# Standing brief: usage-telemetry

Read this before your slice brief; the slice brief carries only the slice.

| Fact | Value |
| --- | --- |
| Repository | `C:/Users/Hazzard/Projects/pilot` (HazzardRust/pilot) |
| Base and PR target | `origin/feat/usage-telemetry`; open the slice PR as a **draft** against `feat/usage-telemetry` |
| Worktree and branch | `C:/Users/Hazzard/Projects/pilot-usage-telemetry-s<n>` on `slice/usage-telemetry-s<n>`; run `npm ci` first |
| Artefact | `docs/design/usage-telemetry/architecture.md`; your slice is `docs/design/usage-telemetry/slices/S<n>.md`; ADR 0042 is the reader's contract, ADR 0043 the log's, ADR 0044 the closing report's |
| Gate | `npm test`, plus your slice file's own verification command; `node scripts/check-provenance.mjs agents/ skills/ rules/` and `node scripts/build-vendor-ledger.mjs --check` when agents, skills, rules or vendor files change |
| Known flake | `deck/test/usage.test.mjs:657` and `:692` ("in 2 hrs" vs "in 1 hr", clock-dependent; fired once on 2026-09-28, green on the rerun); name it if it fires, do not fix it |
| Browser gate | none: spec 9 forbids any rendering of the log. The live check is a scratch deck: `node bin/pilot.mjs deck --foreground` from your worktree with `PILOT_DECK_DIR` a temp directory and `PILOT_DECK_PORT` a spare port, read against your slice's evidence |
| Transcripts | real transcripts under `~/.claude/projects` hold secrets. Read shapes and numbers only; never copy transcript content into a fixture, a test, a commit or a report. Fixtures are written by hand |
| Live deck | the user's deck daemon on `127.0.0.1:4321` is running this very run; do not restart it, stop it or post test items to it, and never write into `~/.claude/pilot/` |
| Prompt budgets | any change to `deck/tools.mjs` schemas or descriptions, `agents/*.md` or `skills/pilot/SKILL.md` moves the prompt-budget pins (`scripts/test/measure-prompt.test.mjs`, `scripts/test/qa-preview.test.mjs`). The pins are the user's and do not move. Pay for added text by removing redundant text in a file you own, never an instruction, and table each change in the PR body |
| Diff limit | 400 changed lines, code plus tests; stop and ask `main` past it |

Commit trailer:

```
Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
```

PR body ends with:

```
🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_01Nmjz9tw2PFBncsiCuwrpbG
```

Report shape: PR, head SHA, one gate line, decisions taken alone, files outside the slice, one friction row.
