# Brief: readme-flow

The facts every implementer of this feature shares. Read this first, then your slice file.

## Repository

The repository is `C:/Users/Hazzard/Projects/pilot` (GitHub `HazzardRust/pilot`). Its default branch is `main` and its
pilot branch is `pilot`. Never work in that checkout, or in another session's worktree. Create your own beside it,
named `pilot-readme-flow-s<n>`. In a deep directory, `git -c core.longpaths=true worktree add`. Run `npm ci` in the
new worktree before the first test run.

## Base and PR target

The base is `feat/readme-flow`, cut at Gate 1 from the design branch and carrying `origin/pilot` at 2426af8f (after
pilot-state-line landed). Every slice PR is a **draft** against `feat/readme-flow` and is never marked ready, because
the pilot merges it.

- Branch name: `slice/readme-flow-s<n>`.
- PR body: write it with `gh pr create --body-file <file>`.

## PR titles

- A slice: `feat(readme-flow): S<n> <title as in the artefact, lower-case first>`
- A fix round: `fix(readme-flow): <what>`
- The feature PR: `feat(readme-flow): README: the information flow between the agents, the machinery and the deck`

## Commit trailer

Every commit ends with these two lines, copied exactly:

```
Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01MhHUvzfch1SDF1mSRfjgR1
```

## PR footer

Every PR body ends with these lines, copied exactly:

```
🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_01MhHUvzfch1SDF1mSRfjgR1
```

## Artefact

The artefact is `docs/design/readme-flow/architecture.md`, and the slice files are `slices/S<n>.md`. The locked
decisions are in §5 (L1–L5) and no slice moves one; A1–A3 in §6 stand as assumed (the user chose no grilling). Both
slices own `README.md` and `scripts/test/readme-flow.test.mjs`, so S2 branches from S1's tip and rebases onto
`feat/readme-flow` once S1 is integrated. Use the names of the day this was written; a later ticket renamed them.

## Tests

Nothing reaches GitHub, the live deck on 4321, or a real remote from a test. The readme-flow test reads `README.md`,
`agents/*.md` and `pilot help` from the checkout and nothing else; it runs under `node --test`. Existing README pins
(`scripts/test/deck-readme.test.mjs`, the doctor, install and pilot-agents README pins) must stay green untouched.

## Gate command

```
npm ci
npm test
node scripts/check-references.mjs
node scripts/check-provenance.mjs agents/ skills/ rules/
```

There is no typecheck, lint or build step. To run one file, use `node --test <file>`. On Windows, use the glob form
for a directory. Pins on one rule are spread across `deck/test/`, `scripts/test/` and `hooks/test/`, so grep for the
sentence before the first full run. No test is known to flake.

## Live verification

The surface is a rendered README. Every slice renders the fence locally (`npx -y @mermaid-js/mermaid-cli -i <fence
extracted to a .mmd> -o <png>`, or mermaid.live) and looks at the picture, then opens the slice PR's `README.md` on
GitHub (the Files tab's rendered view) and pastes a screenshot or the rendered link in the PR body. A Mermaid parse
error on GitHub shows as an error box where the graph should be: that is a failed gate.

## Diff limit

300 changed lines per slice. Past that, stop and ask `main`.
