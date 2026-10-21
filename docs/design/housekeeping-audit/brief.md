# Standing brief: housekeeping-audit

Read this before your slice brief; the slice brief carries only the slice. The slice's own file is `docs/design/housekeeping-audit/slices/S<n>.md` on this branch, and `../architecture.md` is the approved plan (Gate 1, 2026-09-27).

| Fact | Value |
| --- | --- |
| Repository | `C:/Users/Hazzard/Projects/pilot` (HazzardRust/pilot) |
| Base and PR target | `origin/feat/housekeeping-audit`; open the slice PR as a **draft** against `feat/housekeeping-audit` |
| Worktree and branch | `C:/Users/Hazzard/Projects/pilot-feat-housekeeping-audit-s<n>` on `slice/housekeeping-audit-s<n>`; run `npm ci` first (a fresh worktree has no `node_modules`, and the suite then fails on `@modelcontextprotocol/sdk` resolution, which is not a regression) |
| Gate | `npm test` (`node --test`; 1522/1522 on the badge fix's branch, d523be2, with fresh deps); `node scripts/measure-prompt.mjs` and `node --test scripts/test/measure-prompt.test.mjs` when `agents/`, `skills/`, `deck/tools.mjs` or `hooks/` change (pilot share pinned ≤ 9800 tokens; the architect measured 9651 at 6addeef); `node scripts/check-provenance.mjs agents/ skills/ rules/`, `node scripts/check-references.mjs` and `node scripts/build-vendor-ledger.mjs --check` when agents, skills, rules or vendor files change |
| Measuring a diff | `git diff --numstat` against the base, insertions plus deletions; never `--stat`'s summary line |
| Known flakes | `deck/test/usage.test.mjs:674` ("in 2 hrs" vs "in 1 hr", clock-dependent); `hooks/test/inbox.test.js:379` ("deck coming up never happened within 15000ms", load-dependent). Name either if it fires, do not fix it |
| Tests never spawn an agent | No test starts `claude` or any session (A6, ADR 0039). Timers are stubbed by `deck/testUtils.mjs` or `unref`'d. `deck/test/run.test.mjs` needs nothing listening on port 4399: never leave a scratch daemon there |
| Scratch daemon | `PILOT_DECK_PORT=4398`, `PILOT_DECK_DIR` a fresh temp dir seeded with only the rows the check needs, `PILOT_PLUGIN_DIR` your worktree, `PILOT_DECK_NO_OPEN=1`. Seed items by importing `postItem` from `deck/store.mjs`; change them through the daemon's `/api/tool` route so the page is told. The production deck on 4321 is the pilot's live inbox: never restart it, never point it at your worktree, never write to its store |
| Browser gate | every slice with a deck UI surface (S1's `audit` kind, S5's offer, S6's tickets) is exercised live in Chrome (chrome-devtools MCP) on the scratch daemon; screenshots in the PR |
| Model | Chosen per ticket, as `orchestration.md` says; the slice brief names it and why |
| User's rules | no headless sessions anywhere; the deck is the only inbox; one run per deck, in succession; a ticket is never posted without the user's words |
| Diff limit | the limit in your brief is for code plus tests; stop and ask `main` past it, before the reviewer's fixes as well as after |

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
