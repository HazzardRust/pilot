# Standing brief: walkthrough-taste

Read this before your slice brief; the slice brief carries only the slice.

| Fact | Value |
| --- | --- |
| Repository | `C:/Users/Hazzard/Projects/pilot` (HazzardRust/pilot), default branch `main` |
| Base and PR target | `origin/feat/walkthrough-taste`; open the slice PR as a **draft** against `feat/walkthrough-taste`. The feature is cut from `pilot` (design at c79346d2; `pilot integrate` takes the current `pilot` tip first) |
| Worktree and branch | `C:/Users/Hazzard/Projects/pilot-walkthrough-taste-s<n>` on `slice/walkthrough-taste-s<n>`; run `npm ci` first |
| Artefact | `docs/design/walkthrough-taste/architecture.md`; your slice is `docs/design/walkthrough-taste/slices/S<n>.md` |
| Gate | `npm test`, plus your slice file's own verification command; `node scripts/check-provenance.mjs agents/ skills/ rules/` and `node scripts/build-vendor-ledger.mjs --check` when agents, skills, rules or vendor files change |
| Known flake | `deck/test/usage.test.mjs` "in 2 hrs" vs "in 1 hr" (clock-dependent; seen 2026-09-28, green on the rerun); name it if it fires, do not fix it |
| Live check | a scratch deck only (L9): `PILOT_DECK_DIR` a temp dir, `PILOT_DECK_PORT` 4440 or above, `PILOT_DECK_NO_OPEN=1`; read `deck/server.mjs` for how `author` arrives before posting to it. Paste what you saw in the PR |
| Never touch | the user's real `~/.claude` or `~/.claude/pilot/deck.json`, this repository's other worktrees; the user's deck daemon on `127.0.0.1:4321` is running this very run: do not restart it, stop it or post test items to it |
| Prompt budgets | any change to `agents/*.md`, `skills/*/SKILL.md` or `deck/tools.mjs` moves the prompt-budget pins (`scripts/test/measure-prompt.test.mjs`, `scripts/test/qa-preview.test.mjs`). A pin never rises; S3 and S4 lower them to the measured value as L7 says. Pay for added text by removing redundant text, never an instruction, and table each change in the PR body. `deck/tools.mjs` is not touched in this feature |
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
