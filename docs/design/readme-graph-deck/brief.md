# Brief: readme-graph-deck

The facts every implementer of this feature shares. Read this first, then your slice file.

## Repository

The repository is `C:/Users/Hazzard/Projects/pilot` (GitHub `HazzardRust/pilot`). Its default branch is `main` and its
pilot branch is `pilot`. Never work in that checkout, or in another session's worktree. Create your own beside it,
named `pilot-readme-graph-deck-s<n>`. In a deep directory, use `git -c core.longpaths=true worktree add`. Run `npm ci`
in the new worktree before the first test run.

## Remote

Remote: origin

## Base and PR target

The base is `feat/readme-graph-deck`, cut at Gate 1 from the design branch, which carries `origin/pilot` at 1a4fd385.
Every slice PR is a **draft** against `feat/readme-graph-deck` and is never marked ready, because the pilot merges it.

- Branch name: `slice/readme-graph-deck-s<n>`.
- PR body: write it with `gh pr create --body-file <file>`.

## Gate command

`npm test` (it runs `node scripts/gate.mjs`). Run it once, on the final state, in your own worktree.

## Known flaky tests

None known. Friction from the last run: `npm test`'s leak sweep stops a scratch deck started from the same worktree,
so run the gate before you stand any deck up there.

## PR titles

- A slice: `feat(readme-graph-deck): S<n> <title as in the artefact, lower-case first>`
- A fix round: `fix(readme-graph-deck): <what>`
- The feature PR: `feat(readme-graph-deck): The README's graph shows what the user sees: the deck, not the CLI`

## Commit trailer

Every commit ends with these two lines, copied exactly:

```
Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01HBzxtWP7gaRA3q54NyZuoB
```

## PR footer

Every PR body ends with these lines, copied exactly:

```
🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_01HBzxtWP7gaRA3q54NyZuoB
```

## Artefact

The artefact is `docs/design/readme-graph-deck/architecture.md`, and the slice files are `slices/S<n>.md`. The locked
decisions are in §5 (L1–L7), and no slice moves one. A1 in §6 stands as assumed, because the user chose no grilling.
S1 owns `README.md` and `scripts/test/readme-flow.test.mjs`. S2 owns `docs/OPERATING.md` and the new
`scripts/test/operating-commands.test.mjs`. The two slices share no file, so both branch from `feat/readme-graph-deck`
and run side by side. Each slice's diff limit is 150 changed lines; past it, stop and ask `main`.
