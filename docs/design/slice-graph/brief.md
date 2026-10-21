# Standing brief: slice-graph

Read this before your slice brief; the slice brief carries only the slice.

| Fact | Value |
| --- | --- |
| Repository | `C:/Users/Hazzard/Projects/pilot` (HazzardRust/pilot), default branch `main` |
| Base and PR target | `origin/feat/slice-graph`; open the slice PR as a **draft** against `feat/slice-graph`. The feature is cut from `pilot` at 620e60c9; `pilot integrate` takes the current `pilot` tip first |
| Worktree and branch | `C:/Users/Hazzard/Projects/pilot-slice-graph-s<n>` on `slice/slice-graph-s<n>`; run `npm ci` first |
| Artefact | `docs/design/slice-graph/architecture.md`; your slice is `docs/design/slice-graph/slices/S<n>.md` |
| Gate | `npm test`, plus your slice file's own verification command; `node scripts/check-provenance.mjs agents/ skills/ rules/` and `node scripts/build-vendor-ledger.mjs --check` when agents, skills, rules or vendor files change |
| Known flake | `deck/test/usage.test.mjs` "in 2 hrs" vs "in 1 hr" (clock-dependent; seen 2026-09-28, green on the rerun); name it if it fires, do not fix it |
| Live check | a scratch deck only (L8): `PILOT_DECK_DIR` a temp dir, `PILOT_DECK_PORT` 4440 or above, `PILOT_DECK_NO_OPEN=1`, seeded with the user's fixture (S1 → S2 ‖ S3 → S4 → S5 ‖ S6→S7 → S8, S9 from S1); open the Tree panel in a browser and look at it. Paste what you saw in the PR |
| Never touch | the user's real `~/.claude` or `~/.claude/pilot/deck.json`, this repository's other worktrees; the user's deck daemon on `127.0.0.1:4321` is running this very run: do not restart it, stop it or post test items to it |
| Prompt budgets | any change to `agents/*.md` or `deck/tools.mjs` moves the prompt-budget pins (`scripts/test/measure-prompt.test.mjs`). A pin never rises (L9); a slice that lowers the measure lowers the pin with a history line. `deck/tools.mjs` bytes are paid by five agents on every turn: S3 pays for the list `after` by dropping `delivers` (A2) |
| Diff limit | 400 changed lines, additions plus deletions, code plus tests; stop and ask `main` past it |

Commit trailer:

```
Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
```

PR body ends with:

```
🤖 Generated with [Claude Code](https://claude.com/claude-code)
```

Report shape: PR, head SHA, one gate line, decisions taken alone, files outside the slice, one friction row.
