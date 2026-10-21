# Standing brief: architect-depth

Read this before your slice brief; the slice brief carries only the slice.

| Fact | Value |
| --- | --- |
| Repository | `C:/Users/Hazzard/projects/pilot` (HazzardRust/pilot) |
| Base and PR target | `origin/feat/architect-depth`; open the slice PR as a **draft** against `feat/architect-depth` |
| Worktree and branch | `C:/Users/Hazzard/projects/pilot-architect-depth-s<n>` on `slice/architect-depth-s<n>`; run `npm ci` first |
| Gate | `npm test` (`node --test`); `node scripts/check-provenance.mjs agents/ skills/ rules/` and `node scripts/build-vendor-ledger.mjs --check` when agents, skills, rules or vendor files change; `node scripts/measure-prompt.mjs` — the pilot's share must stay under its 9800 pin and QA's under 5500 |
| Known flake | `deck/test/usage.test.mjs:656` ("in 2 hrs" vs "in 1 hr", clock-dependent); name it if it fires, do not fix it |
| Parallel work | `fix/deck-polish` (another agent) edits `skills/pilot/SKILL.md` step 1 and the deck UI; do not touch step 1, and expect a rebase if it lands first |
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

Report shape: PR, head SHA, one gate line, the tests that were red then green by name, decisions taken alone, files outside the slice, one friction row.
