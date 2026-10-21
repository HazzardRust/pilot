# Standing brief: co-pilot-successor

Read this before your slice brief; the slice brief carries only the slice.

| Fact | Value |
| --- | --- |
| Repository | `C:/Users/Hazzard/Projects/pilot` (HazzardRust/pilot), default branch `main` |
| Base and PR target | `origin/feat/co-pilot-successor`; open the slice PR as a **draft** against `feat/co-pilot-successor`. The feature is cut from `pilot` at 725a5bd1 |
| Worktree and branch | `C:/Users/Hazzard/Projects/pilot-co-pilot-successor-s<n>` on `slice/co-pilot-successor-s<n>`; run `npm ci` first |
| Artefact | `docs/design/co-pilot-successor/architecture.md`; your slice is `docs/design/co-pilot-successor/slices/S<n>.md` |
| Gate | `npm test`, plus your slice file's own verification command; `node scripts/check-provenance.mjs agents/ skills/ rules/` when agents change (S1, S4); `node scripts/check-slices.mjs docs/design/co-pilot-successor/slices` stays green |
| Known flake | `deck/test/usage.test.mjs` "in 2 hrs" vs "in 1 hr" (clock-dependent; seen 2026-09-28 and 2026-10-09, green on the rerun); name it if it fires, do not fix it |
| Live check | run what your slice changed for real: S2 replays a `pilot:pilot-co-pilot` payload through `hooks/context-size-guard.js` at both marks and pastes the item and text it produced; S3 runs `pilot ready --ticket <id> --slots <n>` against a stored graph and pastes the output; S1 and S4 change agent prose and have no surface you can run: say so, QA runs the co-pilot live on a forged advisory line (L7). Paste the output in the PR |
| Never touch | the user's real `~/.claude` or this repository's other worktrees; the user's deck daemon on `127.0.0.1:4321` is running this very run: do not restart it, stop it or post test items to it |
| Prompt budgets | any change to `agents/*.md` moves the prompt-budget pins (`scripts/test/measure-prompt.test.mjs`). The user allowed the pilot's pin to move in this run by the measured cost of the one Yellow clause (L6): table the before and after in the PR body, and pay for any other added text by removing redundant text, never an instruction |
| Shared files | `agents/pilot-co-pilot.md`, `scripts/test/yellow-co-pilot.test.mjs` and `docs/adr/README.md` are edited by S1 and S4; S4 runs after S1 and stays inside the paragraphs its slice file names. ADR numbers 0105 and 0106 are taken by ticket-state-accents, which lands first: this run's are 0107 and 0108, indexed after 0106 |
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

- a slice: `feat(co-pilot-successor): S<n> <title>`, the title lower-case first
- a fix round: `fix(co-pilot-successor): <what>`
- the feature PR: `feat(co-pilot-successor): Co-pilot self hand-off`

Report shape: PR, head SHA, one gate line, decisions taken alone, files outside the slice, one friction row.
