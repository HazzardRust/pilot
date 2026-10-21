# Brief: gate2-frees-lane

The facts every implementer of this feature shares. Read this first, then your slice file.

## Repository

The repository is `C:/Users/Hazzard/Projects/pilot` (GitHub `HazzardRust/pilot`). Its default branch is `main` and its
pilot branch is `pilot`. Never work in that checkout, or in another session's worktree. Create your own beside it,
named `pilot-gate2-frees-lane-s<n>`. In a deep directory, `git -c core.longpaths=true worktree add`. Run `npm ci`
in the new worktree before the first test run.

## Base and PR target

The base is `feat/gate2-frees-lane`, cut at Gate 1 from the design branch on `origin/pilot`, after
`feat/blocked-yellow-yields` has landed there (artefact §8). Read the integration tip, not an older checkout. Every
slice PR is a **draft** against `feat/gate2-frees-lane` and is never marked ready, because the pilot merges it.

- Branch name: `slice/gate2-frees-lane-s<n>`.
- PR body: write it with `gh pr create --body-file <file>`.

## Remote

Remote: origin

## PR titles

- A slice: `feat(gate2-frees-lane): S<n> <title as in the artefact, lower-case first>`
- A fix round: `fix(gate2-frees-lane): <what>`
- The feature PR: `feat(gate2-frees-lane): Gate 2 frees the lane: the deck owns the landing and the report, a resolver on a conflict`

## Commit trailer

Every commit ends with these two lines, copied exactly:

```
Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01R7ezDPFuWmWXgQXtoenFBZ
```

## PR footer

Every PR body ends with these lines, copied exactly:

```
🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_01R7ezDPFuWmWXgQXtoenFBZ
```

## Artefact

The artefact is `docs/design/gate2-frees-lane/architecture.md`, and the slice files are `slices/S<n>.md`. Its terms
(§4) are fixed. The locked decisions are in §5 (L1–L9) and the assumed ones in §6 (A1, A2), and no slice moves one.
The repo says co-pilot and ticket; the ticket's foreman and task are the user's quoted words. Do not edit
`deck/lanes.mjs` (L8). Nothing a test runs reaches `git push`, `gh` or a real remote.

## Tests

Nothing reaches GitHub, the live deck on 4321, or a real remote from a test. A deck test posts against an `http`
server on a free port or an injected `deck`, with `PILOT_DECK_DIR` on a temp directory. `spawn` and the clock are
injected (`startLanding`'s seams), never waited on, and `PILOT_DECK_NO_LAND` stays set in `deck/test/no-open.mjs`.
Every test that starts a process or server stops it in teardown.

## Gate command

```
npm ci
npm test
node scripts/check-references.mjs
node scripts/check-provenance.mjs agents/ skills/ rules/
```

There is no typecheck, lint or build step. To run one file, use `node --test <file>`. Run the full suite with
`run_in_background` or a 600000 ms timeout, because it takes about 4.6 minutes. Wording pins on one rule are spread
across `deck/test/`, `scripts/test/` and `hooks/test/`, so grep for a sentence before you change it. The pilot's
prompt pin (`scripts/test/measure-prompt.test.mjs`, `own <= 11072.75` at 34f596ff, moved again by
blocked-yellow-yields) moves by exactly what a slice's wording costs, with a history line naming the slice.
`docs/adr/README.md` is regenerated with `node scripts/adr-index.mjs`, never by hand. The vocabulary guard
(`scripts/vocabulary.mjs`) flags the retired words outside its `EXCEPTIONS` (S11 adds this run's paths).

**Known flake**: `scripts/test/gate-census.test.mjs` "the leak fixture is red and names it" can go red while another
gate runs on this machine. It is green alone. A red there is rerun once, never fixed in a slice.

## Live verification

QA and every slice with a surface run against a scratch deck (`pilot deck --scratch`, seeded with a run record, a
planted gate2 and, for a landing, a feature worktree whose `origin` is a local bare repository) plus `npm test` (L9).
A page is opened in a browser and what it showed goes in the PR. A thread line is pasted as printed. Never use the
live deck on 4321, and never post to it from a test.

## Diff limit

300 changed lines per slice. Past it, stop and ask `main`.
