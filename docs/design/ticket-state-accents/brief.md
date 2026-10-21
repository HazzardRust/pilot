# Standing brief: ticket-state-accents

Read this before your slice brief; the slice brief carries only the slice.

| Fact | Value |
| --- | --- |
| Repository | `C:/Users/Hazzard/Projects/pilot` (HazzardRust/pilot), default branch `main` |
| Base and PR target | `origin/feat/ticket-state-accents`; open the slice PR as a **draft** against `feat/ticket-state-accents`. The feature is cut from `pilot` at bcc17744 |
| Worktree and branch | `C:/Users/Hazzard/Projects/pilot-ticket-state-accents-s<n>` on `slice/ticket-state-accents-s<n>`; run `npm ci` first |
| Artefact | `docs/design/ticket-state-accents/architecture.md`; your slice is `docs/design/ticket-state-accents/slices/S<n>.md` |
| Gate | `npm test`, plus your slice file's own verification command; `node scripts/check-provenance.mjs agents/ skills/ rules/` when agents, skills or rules change (S9) |
| Known flake | `deck/test/usage.test.mjs` "in 2 hrs" vs "in 1 hr" (clock-dependent; seen 2026-09-28, green on the rerun); name it if it fires, do not fix it |
| Live check | run what your slice changed for real: start a scratch deck daemon from your worktree on a port of its own (never 4321), open it with chrome-devtools, drive it with `deck_ticket`, browser presses and replies, and read the DOM. A slice that only changes agent prose (S9) has no surface you can run; say so. Paste the output or a screenshot in the PR |
| Scratch deck | `PILOT_DECK_DIR=<scratch dir> PILOT_DECK_PORT=<port, never 4321> PILOT_DECK_NO_OPEN=1 node deck/daemon.mjs` from your worktree, then drive it with `POST http://127.0.0.1:<port>/api/tool` (see `deck/tools.mjs`); a seed script that imports deck modules by a `C:` path needs `pathToFileURL(...).href`; a scratch `pilot wait` runs as `node bin/pilot.mjs wait` (`node deck/wait.mjs` prints nothing) and needs `PILOT_RUN_REPO=<scratch repo>`, since the shell exports the real repository; edit files with Edit, not python or perl through Bash (CRLF, escapes); stop only the process you started (found by S2, S6, S7) |
| Never touch | the user's real `~/.claude` or this repository's other worktrees; the user's deck daemon on `127.0.0.1:4321` is running this very run: do not restart it, stop it or post test items to it |
| Live regions | `deck/ui/js/live.mjs` swaps a `[data-live]` region's `innerHTML` only (L5): every accent, mark, chip and switch attribute sits **inside** a region, never on the region element |
| Prompt budgets | any change to `agents/*.md` moves the prompt-budget pins (`scripts/test/measure-prompt.test.mjs`). The pins are the user's and do not move. Pay for added text by removing redundant text, never an instruction, and table each change in the PR body |
| Shared files | `deck/store.mjs`, `deck/ui/render.mjs` and `deck/ui/deck.css` are edited by most slices, which is why S5–S8 and S10–S12 run in series; stay inside the functions and sections your slice file names |
| Diff limit | 300 changed lines, code plus tests; stop and ask `main` past it |

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

PR titles:

- a slice: `feat(ticket-state-accents): S<n> <title>`, the title lower-case first
- a fix round: `fix(ticket-state-accents): <what>`
- the feature PR: `feat(ticket-state-accents): Ticket-state accents`

Report shape: PR, head SHA, one gate line, decisions taken alone, files outside the slice, one friction row.
