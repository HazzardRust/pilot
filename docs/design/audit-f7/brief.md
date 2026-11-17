# Brief: audit-f7

Read this first, then your slice file. It holds the facts every implementer of this feature shares.

## Repository

The repository is `C:/Users/Hazzard/Projects/pilot` (GitHub `HazzardRust/pilot`). The default branch is `main` and the
pilot branch is `pilot`. Do not work in that checkout, which is stale, or in another session's worktree. Create your
own worktree beside it, named `pilot-audit-f7-s<n>`. Run `npm ci` in it before the first test run.

## Remote

Remote: origin

## Base and PR target

The base is `feat/audit-f7`. It is cut at Gate 1 from `origin/pilot` (d7569a49 at design time). Push your slice
branch, `slice/audit-f7-s<n>`; the pilot integrates it into `feat/audit-f7`.

## PR titles

- A slice: `feat(audit-f7): S<n> <title as in the artefact, lower-case first>`
- A fix round: `fix(audit-f7): <what>`
- The feature PR: `feat(audit-f7): The deck's hand-off bar test gets a name of its own`

## Commit trailer

End every commit with these two lines, copied exactly:

```
Co-Authored-By: Claude Fable 5.2 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01NXgSFpzgnD51HokpbABUPw
```

## PR footer

End every PR body with these lines, copied exactly:

```
🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_01NXgSFpzgnD51HokpbABUPw
```

## Artefact

The artefact is `docs/design/audit-f7/architecture.md`, with the slice in `slices/S1.md`. The terms in §4 are fixed,
and a slice may not move the locked decisions in §5 (L1-L4). This run has no ADR.

## Gate command

```
npm ci
npm test
```

To run one file: `node --test <file>`.

## Known flaky tests

- `deck/test/usage.test.mjs:656`: the clock-dependent "in 2 hrs" against "in 1 hr" test, named in ADR 0036. Rerun it once before treating a failure as real.
- No recent run record names any other flaky test.

## Live verification

The surface is the repository's file tree and the gate, with no GUI. Run `git ls-files '*.test.*' | xargs -n1 basename | sort | uniq -d`
and read that it prints nothing.

## Diff limit

The slice should come to 0 changed lines of content: one rename. Stop and ask `main` if anything beyond the rename seems needed.
