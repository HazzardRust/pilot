# Brief: co-pilot-tickets

The facts every implementer of this feature shares. Read this first, then your slice file.

## Repository

The repository is `C:/Users/Hazzard/Projects/pilot` (GitHub `HazzardRust/pilot`). Its default branch is `main` and its
pilot branch is `pilot`. Never work in that checkout, or in another session's worktree. Create your own beside it,
named `pilot-co-pilot-tickets-s<n>`. In a deep directory, `git -c core.longpaths=true worktree add`. Run `npm ci` in
the new worktree before the first test run.

## Base and PR target

The base is `feat/co-pilot-tickets`, cut at Gate 1 from the design branch on `origin/pilot` a5f260c2; read the
integration tip, not an older checkout, and re-run your slice's codemod after every rebase (the codemod is the
slice). Every slice PR is a **draft** against `feat/co-pilot-tickets` and is never marked ready, because the pilot
merges it.

- Branch name: `slice/co-pilot-tickets-s<n>`.
- PR body: write it with `gh pr create --body-file <file>`; a rename slice's body names its exact
  `node scripts/vocabulary.mjs rename …` command and lists every hand-fix (L7).

## Remote

Remote: origin

## PR titles

- A slice: `feat(co-pilot-tickets): S<n> <title as in the artefact, lower-case first>`
- A fix round: `fix(co-pilot-tickets): <what>`
- The feature PR: `feat(co-pilot-tickets): Foreman becomes co-pilot and tasks become tickets, everywhere`

## Commit trailer

Every commit ends with these two lines, copied exactly:

```
Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_018PZ3dU1BcLCgmFPwfDNfmV
```

## PR footer

Every PR body ends with these lines, copied exactly:

```
🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_018PZ3dU1BcLCgmFPwfDNfmV
```

## Artefact

The artefact is `docs/design/co-pilot-tickets/architecture.md`, and the slice files are `slices/S<n>.md`. Its terms
(§4) are fixed; the locked decisions are in §5 (L1–L14), and no slice moves one. §7 is the closed exception list:
nothing joins it from a slice. Claude Code's own `Task*` tools keep their names (spec 7). The stored spellings (kind
values, item fields, store keys, query parameters, the hooks' mirrors) flip only in S5 (L6, L9). The store version
and the ADR number are read when the slice lands, not fixed in the artefact.

## Tests

Nothing reaches GitHub, the live deck on 4321, or a real remote from a test. A deck test posts against an `http`
server on a free port or an injected `deck`; a test that needs a repository makes a real temp git repository (copy the
pattern in `deck/test/gate1-lineage.test.mjs`). `gh` is always injected as `(args) => string`. Every test that starts a
process or server stops it in teardown.

## Gate command

```
npm ci
npm test
node scripts/check-references.mjs
node scripts/check-provenance.mjs agents/ skills/ rules/
```

There is no typecheck, lint or build step. To run one file, use `node --test <file>`. On Windows, use the glob form
for a directory. Pins on one rule are spread across `deck/test/`, `scripts/test/` and `hooks/test/`, so grep for the
sentence before the first full run. **Known flake**: `scripts/test/gate-census.test.mjs` "the leak fixture is red and
names it" can go red while another gate runs on this machine (pid reuse in `besideGate`); it is green alone, and a
red there is rerun once, never fixed in a slice. The prompt pins (`scripts/test/measure-prompt.test.mjs`,
`scripts/test/qa-preview.test.mjs` and the explorer's) move by exactly what a slice's wording costs, with a history
line naming the slice. `scripts/shipped-rules.json` is rebuilt with `scripts/build-rules-ledger.mjs` when a shipped
rule changes; `docs/adr/README.md` with `scripts/adr-index.mjs` when an ADR is added or renamed.

## Live verification

Every slice with a surface runs the real daemon on a scratch deck (`pilot deck --scratch`, stopped in teardown) with a
planted store, opens the page in a browser, and pastes what it saw in the PR (L4). S5 also rehearses the migration on
a copy of the live store (`~/.claude/pilot/deck.json`, copied into the scratch deck's directory, never the live file)
and pastes the before/after listing. A prose slice pastes the pin diff. Never use the live deck on 4321 and never post
to it from a test.

## Diff limit

200 hand-written changed lines per slice (L7). Codemod output is uncapped when the PR names the exact command and the
reviewer's re-run on the base reproduces it apart from the listed hand-fixes. Past 200 hand-written lines, stop and
ask `main`.
