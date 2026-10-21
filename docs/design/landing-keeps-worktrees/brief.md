# Brief: landing-keeps-worktrees

These are the facts every implementer of this feature shares. Read this first, then your slice file.

## Repository

The repository is `C:/Users/Hazzard/Projects/pilot` (GitHub `HazzardRust/pilot`). Its default branch is `main`
and its pilot branch is `pilot`. Never work in that checkout or in another session's worktree. Create your own
worktree beside it, named `pilot-landing-keeps-worktrees-s<n>`. In a deep directory, use
`git -c core.longpaths=true worktree add`. Run `npm ci` in the new worktree before the first test run.

## Base and PR target

The base is `feat/landing-keeps-worktrees`. It is cut at Gate 1 from the design branch on `origin/pilot`, after
`feat/gate2-frees-lane` (#748) has landed there. Read the integration tip, not an older checkout. Every slice PR
is a **draft** against `feat/landing-keeps-worktrees`. Never mark it ready: the pilot merges it.

- Branch name: `slice/landing-keeps-worktrees-s<n>`.
- PR body: write it with `gh pr create --body-file <file>`.

## Remote

Remote: origin

## Gate

`npm ci`, `npm test` (about 5 minutes; `node --test <file>` runs one file), `node scripts/check-references.mjs`,
`node scripts/check-provenance.mjs agents/ skills/ rules/`.

## Known flaky tests

None.

## PR titles

- A slice: `feat(landing-keeps-worktrees): S<n> <title as in the artefact, lower-case first>`
- A fix round: `fix(landing-keeps-worktrees): <what>`
- The feature PR: `feat(landing-keeps-worktrees): Landing keeps a live agent's worktree, and the crew never chains past a failed cd`

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

`docs/design/landing-keeps-worktrees/architecture.md`, and your slice file under `slices/`.
