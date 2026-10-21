# Brief: main-never-red

The facts every implementer of this feature shares. Read this first, then your slice file.

## Repository

The repository is `C:/Users/Hazzard/Projects/pilot` (GitHub `HazzardRust/pilot`). Its default branch is `main` and its pilot branch is `pilot`. Never work in that checkout, or in another session's worktree. Create your own beside it, named `pilot-main-never-red-s<n>`, with `git -c core.longpaths=true worktree add`. Run `npm ci` in the new worktree before the first test run.

## Base and PR target

The base is `feat/main-never-red`, cut at Gate 1 from the design branch. Read the integration tip, not an older checkout. Every slice PR is a **draft** against `feat/main-never-red` and is never marked ready, because the pilot merges it. The feature PR goes from `feat/main-never-red` to `main`.

- Branch name: `slice/main-never-red-s<n>`.
- PR body: write it with `gh pr create --body-file <file>`.

## Remote

Remote: origin

## Gate

```
npm ci
npm test
node scripts/check-references.mjs
node scripts/check-provenance.mjs agents/ skills/ rules/
```

There is no typecheck, lint or build step. The suite takes about 5 minutes: run it in the background, or with a 600000 ms timeout, and read its log. Wording pins are spread across `deck/test/`, `scripts/test/` and `hooks/test/`. `docs/adr/README.md` is regenerated with `node scripts/adr-index.mjs`, never written by hand.

## Known flaky tests

- `scripts/test/gate-census.test.mjs` "the leak fixture is red and names it" can go red while another gate runs on this machine. It is green when run alone. Rerun it once; never fix it in a slice.

## Small-diff limit

300 changed lines per slice. Past that, stop and ask `main`.

## PR titles

- A slice: `feat(main-never-red): S<n> <title as in the artefact, lower-case first>`
- A fix round: `fix(main-never-red): <what>`
- The feature PR: `feat(main-never-red): Main never goes red: the gate rebuilds the ledgers, CI runs it on every PR`

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

The artefact is `docs/design/main-never-red/architecture.md`, with one slice file per slice under `slices/`. Its terms (§4) are fixed. The locked decisions are in §5 (L1–L8), and no slice moves one. L8 is the user's: the CI gate runs on `ubuntu-latest`, on non-draft PRs to `main` and pushes to `main`, overriding A1 and A2. An OS-bound test red on Linux is a found issue, built in this run.

## Tests

No test reaches GitHub, the live deck on 4321, or a real remote. No test writes the real repository's ledgers: `runGate` tests inject `ledgers` (L2), and the ledger tests build a temp git repo.
