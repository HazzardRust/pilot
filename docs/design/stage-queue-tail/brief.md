# Brief: stage-queue-tail

The facts every implementer of this feature shares. Read this first, then your slice file.

## Repository

The repository is `C:/Users/Hazzard/Projects/pilot` (GitHub `HazzardRust/pilot`). Its default branch is `main` and its
pilot branch is `pilot`. Never work in that checkout, or in another session's worktree. Create your own beside it,
named `pilot-stage-queue-tail-s<n>`, and run `npm ci` in it before the first test run.

## Remote

Remote: origin

## Base and PR target

The base is `feat/stage-queue-tail`, cut at Gate 1 from `origin/pilot` (ba3f5d11). Every slice PR is a **draft**
against `feat/stage-queue-tail` and is never marked ready, because the pilot merges it.

- Branch name: `slice/stage-queue-tail-s<n>`.
- PR body: write it with `gh pr create --body-file <file>`.

## PR titles

- A slice: `feat(stage-queue-tail): S<n> <title as in the artefact, lower-case first>`
- A fix round: `fix(stage-queue-tail): <what>`
- The feature PR: `feat(stage-queue-tail): A ticket entering a stage joins the back of that stage's queue`

## Commit trailer

Every commit ends with these two lines, copied exactly:

```
Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01N5gq1NsTqzrTzohHn4TGwx
```

## PR footer

Every PR body ends with these lines, copied exactly:

```
🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_01N5gq1NsTqzrTzohHn4TGwx
```

## Artefact

`docs/design/stage-queue-tail/architecture.md`, with slice files `slices/S<n>.md`. Its terms (§4) are fixed, and the
locked decisions (§5) and the answers in §6 (A1, A2) are not moved by any slice. `greenAt` is a new ticket field (S2), written once at the first green entry. S2 reads S1's `enterStage` from the
integration branch by name.

## Gate command

```
npm ci
npm test
npm run adr-index && git diff --exit-code docs/adr/README.md
```

`npm test` runs `node scripts/gate.mjs`. There is no typecheck, lint or build step. To run one file, use
`node --test <file>`.

GitHub Actions on this account runs no jobs (a billing refusal), so a red or unstarted check proves nothing. The gate
is local: `npm test` once in your own worktree on Windows. Report the commit sha and the result in place of a CI run
id. The WSL five-run loop is QA's.

## Known flaky tests

- `deck/test/daemon-lifecycle.test.mjs`: "a 500 writes the same one line, then its stack, and the deck serves on".

## Tests

Every store test takes its own store (`tempDeck`, `postStored` from `deck/testUtils.mjs`, as in
`deck/test/ticket-need.test.mjs`). Nothing touches the live deck on 4321. Live checks use `pilot deck --scratch`,
stopped in teardown.

## Diff limit

150 changed lines per slice. Past that, stop and ask `main`.
