# Brief: blocking-close

The facts every implementer of this feature shares. Read this first, then your slice file.

## Repository

`C:/Users/Hazzard/Projects/pilot` (GitHub `HazzardRust/pilot`). Default branch `main`, pilot branch `pilot`. Never work in that checkout or in another session's worktree. Create your own beside it, named `pilot-blocking-close-s<n>`, and run `npm ci` in it before the first test run.

## Base and PR target

The base is `feat/blocking-close`, cut at Gate 1 from `origin/pilot` (a37673eb at design time). Every slice PR is a **draft** against `feat/blocking-close`, never marked ready; the pilot merges it. Branch: `slice/blocking-close-s<n>`. PR body via `gh pr create --body-file <file>`.

## Remote

Remote: origin

## PR titles

- A slice: `feat(blocking-close): S<n> <title as in the artefact, lower-case first>`
- A fix round: `fix(blocking-close): <what>`
- The feature PR: `feat(blocking-close): The pilot clears a blocking thread it no longer needs`

## Commit trailer

Every commit ends with these two lines, copied exactly:

```
Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Tek2jZXVh7dqjyqwApvNHq
```

## PR footer

Every PR body ends with these lines, copied exactly:

```
🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_01Tek2jZXVh7dqjyqwApvNHq
```

## Gate command

- Windows: `npm test` once in the slice worktree.
- Before a landing: `node scripts/gate.mjs` five times in a row in WSL (Ubuntu, node 26 at `~/node26`), on a fresh clone at the exact commit. All five must pass.
- GitHub Actions is not evidence on this account (billing refusal). Report the sha and each run's result instead.
- Also `node scripts/check-references.mjs`; `node --test <file>` for one file.

## Known flaky tests

- The worktrees test has failed with `MODULE_NOT_FOUND` mid-run on Windows.
- The nested fixture gate once reported "powershell.exe not found" with three gates running at once.

## Constraints

- `deck/test/facades.test.mjs` bars every deck module at 800 lines. `deck/store-items.mjs` is at 795: S1 adds no lines there.
- `deck/README.md` lists each deck module. A new module gets its row.
- The pilot prompt pin (`scripts/test/measure-prompt.test.mjs`) has 4.25 headroom. It moves by exactly the measured delta, with a history line.
- `docs/adr/README.md` is regenerated with `node scripts/adr-index.mjs`. ADR 0169-0171 are taken; this run's is 0172.
- Overlaps: lander-tail (#959), deck-writes-github (#951), walkthrough-surface (#954) and other-host (#955) are queued against pilot and may touch `deck/closing-report.mjs` and `deck/server-tools.mjs`. Keep edits there minimal.
- Tests never reach the live deck on 4321, GitHub or a real remote. Use `PILOT_DECK_DIR` on a temp dir; for live checks, `pilot deck --scratch`.
- Diff limit: 150 changed lines per slice. Past it, stop and ask `main`.
