# Brief: blocked-yellow-yields

The facts every implementer of this feature shares. Read this first, then your slice file.

## Repository

The repository is `C:/Users/Hazzard/Projects/pilot` (GitHub `HazzardRust/pilot`). Its default branch is `main` and its
pilot branch is `pilot`. Never work in that checkout, or in another session's worktree. Create your own beside it,
named `pilot-blocked-yellow-yields-s<n>`. In a deep directory, `git -c core.longpaths=true worktree add`. Run `npm ci`
in the new worktree before the first test run.

## Base and PR target

The base is `feat/blocked-yellow-yields`, cut at Gate 1 from the design branch on `origin/pilot` 4a9b17ad; read the
integration tip, not an older checkout. Every slice PR is a **draft** against `feat/blocked-yellow-yields` and is
never marked ready, because the pilot merges it.

- Branch name: `slice/blocked-yellow-yields-s<n>`.
- PR body: write it with `gh pr create --body-file <file>`.

## Remote

Remote: origin

## PR titles

- A slice: `feat(blocked-yellow-yields): S<n> <title as in the artefact, lower-case first>`
- A fix round: `fix(blocked-yellow-yields): <what>`
- The feature PR: `feat(blocked-yellow-yields): A blocked yellow ticket yields the lane`

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

The artefact is `docs/design/blocked-yellow-yields/architecture.md`, and the slice files are `slices/S<n>.md`. Its
terms (§4) are fixed; the locked decisions are in §5 (L1–L7) and the assumed ones in §6 (A1–A6), and no slice moves
one. The repo says co-pilot and ticket; the ticket's body predates the rename. Keep `deck/lanes.mjs` changes to what
your slice names (L6): ticket `itm_97a14cc327a5` changes gate2's landing and `chainNext` there after this run.

## Tests

Nothing reaches GitHub, the live deck on 4321, or a real remote from a test. A deck test posts against an `http`
server on a free port or an injected `deck`, with `PILOT_DECK_DIR` on a temp directory; a clock is injected, never
waited on. Every test that starts a process or server stops it in teardown.

## Gate command

```
npm ci
npm test
node scripts/check-references.mjs
node scripts/check-provenance.mjs agents/ skills/ rules/
```

There is no typecheck, lint or build step. To run one file, use `node --test <file>`. Wording pins on one rule are
spread across `deck/test/`, `scripts/test/` and `hooks/test/`, so grep for a sentence before you change it. The
pilot's prompt pin (`scripts/test/measure-prompt.test.mjs`, `own <= 11072.75` at 4a9b17ad) moves by exactly what a
slice's wording costs, with a history line naming the slice. `docs/adr/README.md` is regenerated with
`node scripts/adr-index.mjs` when an ADR is added.

**Known flake**: `scripts/test/gate-census.test.mjs` "the leak fixture is red and names it" can go red while another
gate runs on this machine; it is green alone, and a red there is rerun once, never fixed in a slice.

## Live verification

QA and every slice with a surface run against a scratch deck (`pilot deck --scratch`, seeded with a run record and a
planted store, stopped in teardown) plus `npm test` (L7). A page is opened in a browser and what it showed goes in
the PR; a `pilot wait` line is pasted as printed. Never use the live deck on 4321 and never post to it from a test.

## Diff limit

300 changed lines per slice. Past it, stop and ask `main`.
