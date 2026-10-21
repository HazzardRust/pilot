# Standing brief: listener-worktree

Read this before your slice brief; the slice brief carries only the slice.

| Fact | Value |
| --- | --- |
| Repository | `C:/Users/Hazzard/Projects/pilot` (HazzardRust/pilot), default branch `main` |
| Base and PR target | `origin/feat/listener-worktree`; open the slice PR as a **draft** against `feat/listener-worktree`. The feature is cut from `pilot` (design at 389c6f3d; `pilot integrate` takes the current `pilot` tip first) |
| Worktree and branch | `C:/Users/Hazzard/Projects/pilot-listener-worktree-s<n>` on `slice/listener-worktree-s<n>`; run `npm ci` first |
| Artefact | `docs/design/listener-worktree/architecture.md`; your slice is `docs/design/listener-worktree/slices/S<n>.md` |
| Gate | `npm test`, plus your slice file's own verification command; `npm run adr-index` then `node scripts/adr-index.mjs --check` when an ADR is added (S1); `node scripts/check-provenance.mjs agents/ skills/ rules/` and `node scripts/build-vendor-ledger.mjs --check` when agents, skills, rules or vendor files change (none planned) |
| Known flake | `deck/test/usage.test.mjs` "in 2 hrs" vs "in 1 hr" (clock-dependent; seen 2026-09-28, green on the rerun); name it if it fires, do not fix it |
| Test hazard | a suite run inside a `pilot run` session inherits `PILOT_RUN_REPO`; every `wait()` call in the suite passes its own `env` (L3). Run the suite once with `PILOT_RUN_REPO` set in the shell and once without |
| Live check | a scratch deck only (L6): `PILOT_DECK_DIR` a temp dir, `PILOT_DECK_PORT` 4440 or above, `PILOT_DECK_NO_OPEN=1`; a real `git worktree add` for the `PILOT_RUN_REPO` case, a fresh `git init` directory for the `NO DECK` case. Paste the lines you saw in the PR |
| Never touch | the user's real `~/.claude` or `~/.claude/pilot/deck.json`, this repository's other worktrees; the user's deck daemon on `127.0.0.1:4321` is running this very run: do not restart it, stop it, wait on it or post test items to it. No change to `sameRepo`, `repoKey`, `forRun`, the hooks or `agents/pilot.md` (§7) |
| Diff limit | 80 lines net per slice (artefact §8); stop and ask `main` past it |

Commit trailer:

```
Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_018AhBBtoZQLm8YkRkinesmx
```

PR body ends with:

```
🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_018AhBBtoZQLm8YkRkinesmx
```

PR titles: `feat(listener-worktree): S<n> <title>` for a slice (title lower-case first), `fix(listener-worktree): <what>` for a fix round, `feat(listener-worktree): a listener started in a worktree hears its repository's deck` for the feature PR.

Report shape: PR, head SHA, one gate line, decisions taken alone, files outside the slice, one friction row.
