# Brief: audit-f6

The facts every implementer of this feature shares. Read this first, then your slice file.

## Repository

`C:/Users/Hazzard/Projects/pilot` (GitHub `HazzardRust/pilot`). Default branch `main`, pilot branch `pilot`. Never
work in that shared checkout (it is on `main`) or in another session's worktree. Create your own beside it,
`pilot-audit-f6-s1`, and run `npm ci` there before the first test.

## Remote

Remote: origin

## Base and PR target

The base is `feat/audit-f6`, cut at Gate 1 from `origin/pilot` (d7569a49 at design time). The slice PR is a **draft**
against `feat/audit-f6`, never marked ready; the pilot merges it. Branch: `slice/audit-f6-s1`. Write the body with
`gh pr create --body-file <file>`.

## PR titles

- A slice: `feat(audit-f6): S1 the gate refuses a syntax error before the suite, naming the file`
- A fix round: `fix(audit-f6): <what>`
- The feature PR: `feat(audit-f6): The gate checks syntax before the suite`

## Commit trailer

Every commit ends with these two lines, copied exactly:

```
Co-Authored-By: Claude Fable 5.2 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01NXgSFodNbTKqoJ71EpWMS5
```

## PR footer

Every PR body ends with these lines, copied exactly:

```
🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_01NXgSFodNbTKqoJ71EpWMS5
```

## Artefact

`docs/design/audit-f6/architecture.md`, slice in `slices/S1.md`. Terms (§4) are fixed; locked decisions §5 are not
moved by the slice. The run's ADR is `docs/adr/NNNN-audit-f6.md`; the landing numbers it.

## Tests

A test needing a repository makes a real temp git repository and removes it in teardown (pattern
`deck/test/gate1-lineage.test.mjs`). `runGate` tests inject every step (pattern `scripts/test/gate.test.mjs:133`).

## Gate command

```
npm ci
npm test
```

`npm test` runs `node scripts/gate.mjs`. One file: `node --test <file>`. Full suite: 460-762 s.

## Known flaky tests

None recorded.

## Live verification

A CLI run of the gate in a scratch clone, architecture.md §9 steps 1-3.

## Diff limit

400 changed lines. Past that, stop and ask `main`.
