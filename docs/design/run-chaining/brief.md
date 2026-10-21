# Standing brief: run-chaining (v2)

Read this before your slice brief; the slice brief carries only the slice. The slice's own file is `docs/design/run-chaining/slices/S<n>.md` on this branch.

| Fact | Value |
| --- | --- |
| Repository | `C:/Users/Hazzard/Projects/pilot` (HazzardRust/pilot) |
| Base and PR target | `origin/feat/run-chaining-v2`; open the slice PR as a **draft** against `feat/run-chaining-v2` |
| Worktree and branch | `C:/Users/Hazzard/Projects/pilot-feat-run-chaining-v2-s<n>` on `slice/run-chaining-v2-s<n>`; run `npm ci` first (the shared checkout's `node_modules` may be stale; a fresh install is green) |
| Gate | `npm test` (1508/1508 at 518aa45 with fresh deps); `node scripts/measure-prompt.mjs` and `node --test scripts/test/measure-prompt.test.mjs` when `agents/`, `skills/`, `deck/tools.mjs` or `hooks/` change (pilot share pinned ≤ 9800 tokens; 9792 at 518aa45, so every prompt line is paid by a trim until S2 lands); `node scripts/check-provenance.mjs agents/ skills/ rules/` and `node scripts/build-vendor-ledger.mjs --check` when agents, skills, rules or vendor files change |
| Known flakes | `deck/test/usage.test.mjs:674` ("in 2 hrs" vs "in 1 hr", clock-dependent); `hooks/test/inbox.test.js:379` ("deck coming up never happened within 15000ms", load-dependent). Name either if it fires, do not fix it |
| Tests never spawn `claude` | `PILOT_DECK_NO_LAUNCH` is set by `deck/test/no-open.mjs`; keep it so until S2 removes the launcher. Timers are stubbed by `deck/testUtils.mjs` or `unref`'d. `deck/test/run.test.mjs` needs nothing listening on port 4399: never leave a scratch daemon there |
| Scratch daemon | `PILOT_DECK_PORT=4398`, `PILOT_DECK_DIR` a fresh temp dir seeded with only the rows the check needs, `PILOT_PLUGIN_DIR` your worktree, `PILOT_DECK_NO_OPEN=1`. The production deck on 4321 is the pilot's live inbox: never restart it, never point it at your worktree |
| Browser gate | every slice with a deck UI surface is exercised live in Chrome (chrome-devtools MCP) on the scratch daemon; screenshots in the PR |
| Model | Chosen per ticket, as `orchestration.md` says: Opus where a wrong judgement is expensive (a new module or seam, a design call left open); Sonnet where the brief already decides every change (a fix brief, a mechanical slice). The earlier Opus-only rule was withdrawn by the user on 2026-09-26 after it blew through the usage allowance |
| User's rules | no headless sessions anywhere; the deck is the only inbox; one run per deck, in succession |
| Diff limit | the limit in your brief is for code plus tests; stop and ask `main` past it |

Commit trailer:

```
Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01TxGwc6Qo5KrZGpXZPBv6KA
```

PR body ends with:

```
🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_01TxGwc6Qo5KrZGpXZPBv6KA
```

Report shape: PR, head SHA, one gate line, decisions taken alone, files outside the slice, one friction row.
