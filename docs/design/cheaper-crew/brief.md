# Brief: cheaper-crew

The facts every implementer of this feature shares. Read this first, then your slice file.

## Repository

The repository is `C:/Users/Hazzard/Projects/pilot` (GitHub `HazzardRust/pilot`). Its default branch is `main` and its
pilot branch is `pilot`. Never work in that checkout, or in another session's worktree. Create your own beside it,
named `pilot-cheaper-crew-s<n>`. In a deep directory, `git -c core.longpaths=true worktree add`. Run `npm ci` in the
new worktree before the first test run.

## Base and PR target

The base is `feat/cheaper-crew`, cut at Gate 1 from `origin/pilot` and rebased on 2026-10-14 onto `origin/pilot` 59ccb523,
after yellow-lane landed (plugin 0.9.0, red/green ticket states, pilot pin 10838). Every slice PR is a **draft** against `feat/cheaper-crew` and is never marked ready, because the pilot merges it.

- Branch name: `slice/cheaper-crew-s<n>`.
- PR body: write it with `gh pr create --body-file <file>`. It carries a `Reviewers:` line and, where
  `pilot:security-reviewer` is named, its `Verdict (pilot:security-reviewer):` line before integration.

## PR titles

- A slice: `feat(cheaper-crew): S<n> <title as in the artefact, lower-case first>`
- A fix round: `fix(cheaper-crew): <what>`
- The feature PR: `feat(cheaper-crew): Cheaper crew: Haiku 5.5 pre-steps for the implementer and the fundamentalist, Sonnet 5.5 on precise-brief slices`

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

The artefact is `docs/design/cheaper-crew/architecture.md`, and the slice files are `slices/S<n>.md`. Its terms (§4)
are fixed; the locked decisions are in §5 (L1–L11), and no slice moves one. L3 was amended at grilling: the runner's
surface is a table of six checks with one command per stack row, pinned by a test (S2). Each slice header carries a
`Model:` line (L2); the pilot copies it into the brief. ADR **0150** is this run's (seam edit, S4.md); 0148 is report-record's and 0149 pilot-state-line's; 0143–0147 are
yellow-lane's, on `pilot`.

## Overlap

yellow-lane has landed and `feat/cheaper-crew` is rebased onto it. S1 and S3 run side by side; S1, S2 and S4 each
touch `agents/pilot.md` and the pilot pin, so rebase onto the current `feat/cheaper-crew` tip before your PR opens and
re-measure the pin there. The co-pilot sends the new tip whenever a slice integrates. §3's `path:line` anchors predate
the rebase: treat them as leads.

## Tests

Nothing reaches GitHub, the live deck on 4321, or a real remote from a test. A test that needs a repository makes a
real temp git repository; `gh` is always injected as `(args) => string`. Every test that starts a process or server
stops it in teardown. Pins on agent prose live in `scripts/test/pilot-agents.test.mjs`, `scripts/test/check-slices.test.mjs`
and `scripts/test/measure-prompt.test.mjs`: grep for the sentence before the first full run.

## Gate command

```
npm ci
npm test
node scripts/check-references.mjs
node scripts/check-provenance.mjs agents/ skills/ rules/
```

There is no typecheck, lint or build step. To run one file, use `node --test <file>`. No test is known to flake. A
slice that edits `agents/pilot.md` re-measures the pilot pin in `scripts/test/measure-prompt.test.mjs` to the real
number on the rebased integration tip and names the before and after in its PR (spec 9).

## Live verification

S1 and S2 spawn their helper once for real (a scratch slice file or a scratch diff in your worktree) and paste the
helper's returned table in the PR; S3 runs `node scripts/check-slices.mjs` on a slice file without a `Model:` line and
pastes the refusal; S4 runs `node scripts/check-references.mjs` and pastes the ADR index line. Never use the live
deck on 4321.

## Diff limit

300 changed lines per slice. Past that, stop and ask `main`.
