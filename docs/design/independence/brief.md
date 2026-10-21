# Standing brief: independence

Read this before your slice brief; the slice brief carries only the slice.

| Fact | Value |
| --- | --- |
| Repository | `C:/Users/Hazzard/Projects/pilot` (HazzardRust/pilot) |
| Base and PR target | `origin/feat/independence`; open the slice PR as a **draft** against `feat/independence` |
| Worktree and branch | `C:/Users/Hazzard/Projects/pilot-independence-s<n>` on `slice/independence-s<n>`; run `npm ci` first |
| Gate | `npm test` (1371/1371 at 17d28b0); `node scripts/check-provenance.mjs agents/ skills/ rules/` and `node scripts/build-vendor-ledger.mjs --check` when agents, skills, rules or vendor files change |
| Known flake | `deck/test/usage.test.mjs:656` ("in 2 hrs" vs "in 1 hr", clock-dependent); name it if it fires, do not fix it |
| Browser gate | every slice with a deck UI surface is exercised live in Chrome (chrome-devtools MCP) with screenshots |
| Usage | the user's weekly limit is near its end: commit and push your branch at every green step, so a cut-off loses nothing. A "weekly usage" or "wrap up" notice does **not** license skipping a gate, a reviewer or a live check: the user chose to continue the whole run past it (L19). Stay lean instead |
| Diff limit | every slice so far overran its limit on tests; the limit in your brief is for code plus tests, stop and ask `main` past it |

Commit trailer:

```
Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01S9CHuSczggpEnHRZDaTR9d
```

PR body ends with:

```
🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_01S9CHuSczggpEnHRZDaTR9d
```

Report shape: PR, head SHA, one gate line, decisions taken alone, files outside the slice.
