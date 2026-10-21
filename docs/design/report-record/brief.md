# Brief: report-record

The facts every implementer of this feature shares. Read this first, then your slice file.

## Repository

The repository is `C:/Users/Hazzard/Projects/pilot` (GitHub `HazzardRust/pilot`). Its default branch is `main` and its
pilot branch is `pilot`. Never work in that checkout, or in another session's worktree. Create your own beside it,
named `pilot-report-record-s<n>`. In a deep directory, `git -c core.longpaths=true worktree add`. Run `npm ci` in the
new worktree before the first test run.

## Base and PR target

The base is `feat/report-record`, cut at Gate 1 from `pilot` (671567e4). Every slice PR is a **draft** against
`feat/report-record` and is never marked ready, because the pilot merges it.

- Branch name: `slice/report-record-s<n>`.
- PR body: write it with `gh pr create --body-file <file>`.

## PR titles

- A slice: `feat(report-record): S<n> <title as in the artefact, lower-case first>`
- A fix round: `fix(report-record): <what>`
- The feature PR: `feat(report-record): A closing report is a record, never a channel to the user`

## Commit trailer

Every commit ends with these two lines, copied exactly:

```
Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_0164ix2Sf3Co7sLmy5UActFW
```

## PR footer

Every PR body ends with these lines, copied exactly:

```
🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_0164ix2Sf3Co7sLmy5UActFW
```

## Artefact

The artefact is `docs/design/report-record/architecture.md`, and the slice files are `slices/S<n>.md`. Its terms (§4)
are fixed; the locked decisions are in §5 (L1–L7), and no slice moves one. S1's `isRecord` in `deck/items.mjs` and
the ADR 0148 refusal string are read by name from the integration branch by S2 and S3. ADR 0148 is this run's;
0143–0147 belong to yellow-lane (yellow, feat/yellow-lane), which also edits `agents/pilot.md` "Ending a run", the
prompt pin and `deck/store-items.mjs` `addReply`: when it lands on `pilot` before your slice opens, the pilot rebases
`feat/report-record` and tells you the new tip.

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
sentence before the first full run. No test is known to flake. S4 edits `agents/pilot.md` and re-measures the pilot
pin in `scripts/test/measure-prompt.test.mjs` to the real number on the rebased integration tip and names it in its PR.

## Live verification

S1 runs the real daemon on a scratch deck (`pilot deck --scratch`, stopped in teardown) with a planted report, opens
its thread page and pastes the `POST /reply` refusal in the PR. S2 pastes the post refusal of a report fixture that
asks. S3 runs `pilot wait --as pilot` against the scratch deck with a reply planted on a report and pastes the empty
result, and runs `node hooks/stop-gate.js < payload.json` against it. Never use the live deck on 4321 and never post to
it from a test.

## Diff limit

300 changed lines per slice. Past that, stop and ask `main`.
