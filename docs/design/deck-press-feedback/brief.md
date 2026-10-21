# Standing brief: deck-press-feedback

Read this before your slice brief; the slice brief carries only the slice.

| Fact | Value |
| --- | --- |
| Repository | `C:/Users/Hazzard/Projects/pilot` (HazzardRust/pilot), default branch `main` |
| Base and PR target | `origin/feat/deck-press-feedback`; open the slice PR as a **draft** against `feat/deck-press-feedback`. The feature stands on `feat/user-thread-listener` (PR #318) |
| Worktree and branch | `C:/Users/Hazzard/Projects/pilot-deck-press-feedback-s<n>` on `slice/deck-press-feedback-s<n>`; run `npm ci` first |
| Artefact | `docs/design/deck-press-feedback/architecture.md`; your slice is `docs/design/deck-press-feedback/slices/S<n>.md` |
| Gate | `npm test`, plus your slice file's own verification command; `node scripts/check-provenance.mjs agents/ skills/ rules/` and `node scripts/build-vendor-ledger.mjs --check` when agents, skills, rules or vendor files change |
| Known flake | `deck/test/usage.test.mjs` "in 2 hrs" vs "in 1 hr" (clock-dependent; seen 2026-09-28, green on the rerun); name it if it fires, do not fix it |
| Live check | a browser surface: run a scratch deck with its own `PILOT_DECK_DIR` and `PILOT_DECK_PORT`, open it in Chrome, press what your slice changed and look at the page (L14); screenshot in the PR. Slices with no deck page (S9 to S12) run their CLI or test for real instead |
| Live deck | the user's deck daemon on `127.0.0.1:4321` is running this very run; do not restart it, stop it or post test items to it, and never write into `~/.claude/pilot/` |
| Prompt budgets | any change to `agents/*.md`, `skills/*/SKILL.md` or `deck/tools.mjs` moves the prompt-budget pins (`scripts/test/measure-prompt.test.mjs`). The pins are the user's and do not move (L11); the pilot's has about 23 tokens of headroom. Pay for added text by removing redundant text, never an instruction, and table each change in the PR body |
| Rendering | every value drawn into a page (the refusal reason, ticket titles, resolutions) is escaped; a redirect's Location is built from the stored item's id only (L2, L3) |
| Diff limit | 400 changed lines, code plus tests; stop and ask `main` past it |

Commit trailer:

```
Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
```

PR body ends with:

```
🤖 Generated with [Claude Code](https://claude.com/claude-code)
```

Report shape: PR, head SHA, one gate line, decisions taken alone, files outside the slice, one friction row.
