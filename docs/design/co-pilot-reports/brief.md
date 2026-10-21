# Brief: co-pilot-reports

The facts every implementer of this feature shares. Read this first, then your slice file.

## Repository

`C:/Users/Hazzard/Projects/pilot` (GitHub `HazzardRust/pilot`), default branch `main`. Never work in that checkout
or in another session's worktree: create your own, named `pilot-slice-co-pilot-reports-s<n>`, beside it.

On Windows a worktree in a deep directory needs `git -c core.longpaths=true worktree add`: tracked fixture paths
run to 127 characters. Run `npm ci` in the new worktree before the first test run; without it about twenty
unrelated tests fail.

## Base and PR target

Base: `feat/co-pilot-reports`, cut from `pilot@32c5e37d` (`pilot base`). Every slice PR is a **draft** against
`feat/co-pilot-reports` and is never marked ready; the co-pilot merges it with `pilot integrate`. The feature PR
targets `main`. Branch name: `slice/co-pilot-reports-s<n>`. Write PR bodies with `gh pr create --body-file <file>`;
a heredoc body fails in Git Bash.

## PR title

One format, spec 8 / L9, and S4 makes `pilot integrate` refuse anything else:

- a slice: `feat(co-pilot-reports): S<n> <title as the artefact words it, first letter lower-case>`
- a fix round: `fix(co-pilot-reports): <what>`
- the feature PR: `feat(co-pilot-reports): <feature>` (the pilot's)

## Artefact

`docs/design/co-pilot-reports/architecture.md`. Slice files are `docs/design/co-pilot-reports/slices/S<n>.md`. The
locked decisions are §5 (L1 to L12); a slice moves none of them. New ADRs: 0099 in S1, 0100 in S4 (A5).
0096 to 0098 belong to deck-press-feedback, 0090 to walkthrough-taste; take neither.

## Gate command

```
npm ci
npm test
node scripts/check-references.mjs
node scripts/check-provenance.mjs agents/ skills/ rules/
node scripts/measure-prompt.mjs
```

`check-provenance.mjs` run without directories prints its usage and exits 2: it has checked nothing.
`measure-prompt.mjs` prints the prompt table: record the rows your slice touches, before and after, in the PR.

There is no typecheck, lint or build step. One file alone: `node --test <file>`. A directory does not work on
Windows: use the glob form, `node --test scripts/test/*.test.mjs`.

Live gate: S1, S2 and S3 are prose and pins; their live verification is L6, the next yellow ticket observed on
the user's deck after this feature lands, and it is the pilot's, not yours. S4's live gate is `pilot integrate`
run in a scratch clone with a local bare origin, once with a bad title and once with a good one, and its output
read. Never the user's deck on port 4321, never its store at `~/.claude/pilot/deck.json`, and never this
repository's branches on GitHub beyond your own slice branch.

## Known flaky tests

`deck/test/run.test.mjs`'s marker-wait tests, `deck/test/usage.test.mjs`'s reset-time test and
`deck/test/daemon.test.mjs`'s progress-token test have failed under load and never alone; rerun the one file
before you call it a regression. Otherwise none known.

## Shared constraints

- S1, S2 and S3 run in a line: they share `scripts/test/pilot-agents.test.mjs`, and S3 edits the report sections
  of the definitions S1 and S2 rewrite. S4 shares no file with them and runs beside S1.
- Several tests read the real agent files and pin their wording. When a pin fails after your edit, read what rule
  it pins: change the pin only when your slice changed that rule on purpose, and say so in the PR; never loosen a
  pin to pass. The pilot's pin (10115) is never raised (L11) and QA's (5752) is never raised.
- No agent id is written into any definition (L1); `rules/orchestration.md` is not edited (A3).
- Small-diff limit: 400 changed lines per slice, tests included; past it, stop and ask your spawner.
- Files: use the Edit and Write tools, never a shell heredoc.
- The reviewer is `pilot:typescript-reviewer` for every slice; S4 (a merge refusal path) also gets
  `pilot:security-reviewer`.
- The live pilot's and crew's definitions come from the installed plugin cache, not this repo: nothing a slice
  changes reaches a live agent until a release is installed.

## Commit trailer

Copy it exactly, whatever model you run on.

```
Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
```

## PR footer

```
🤖 Generated with [Claude Code](https://claude.com/claude-code)
```
