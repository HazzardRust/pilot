# Brief: implementer-gate-steps

The facts every implementer of this feature shares. Read this first, then your slice file.

## Repository

The repository is `C:/Users/Hazzard/Projects/pilot` (GitHub `HazzardRust/pilot`). Its default branch is `main` and its
pilot branch is `pilot`. Never work in that checkout, or in another session's worktree. Create your own beside it,
named `pilot-implementer-gate-steps-s<n>`, with `git -c core.longpaths=true worktree add`. Run `npm ci` in the new
worktree before the first test run.

## Base and PR target

The base is `feat/implementer-gate-steps`, cut at Gate 1 from the design branch on `origin/pilot` 4349249b; read the
integration tip, not an older checkout. Every slice PR is a **draft** against `feat/implementer-gate-steps` and is
never marked ready, because the pilot merges it.

- Branch name: `slice/implementer-gate-steps-s<n>`.
- PR body: write it with `gh pr create --body-file <file>`.

## Remote

Remote: origin

## PR titles

- A slice: `feat(implementer-gate-steps): S<n> <title as in the artefact, lower-case first>`
- A fix round: `fix(implementer-gate-steps): <what>`
- The feature PR: `feat(implementer-gate-steps): Implementer gate and worktree steps carry the audit's lessons`

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

The artefact is `docs/design/implementer-gate-steps/architecture.md`, and the slice files are `slices/S<n>.md`. Its
terms (§4) are fixed; the locked decisions are L1–L11 and the assumed ones A1–A3, and no slice moves one. L1's
sentence is copied verbatim into both definitions. No slice edits `agents/pilot.md` or
`scripts/test/measure-prompt.test.mjs` (gate2-frees-lane owns them).

## Gate command

```
npm ci
npm test
node scripts/check-references.mjs
node scripts/check-provenance.mjs agents/ skills/ rules/
node scripts/build-vendor-ledger.mjs --check
```

There is no typecheck, lint or build step. `npm test` takes about 280 s, more than the Bash default of 120 s, so
run it with `run_in_background` or a `timeout` of 600000 ms, and read its log to the pass and fail counts. For red
and green, run only your slice's files: `node --test <files>` (one file takes about 1 s). Edit files with the Edit or
Write tool, never a heredoc, `sed -i` or Python's text mode, because on Windows those mangle escapes and write
CRLF. QA's prompt pin (`scripts/test/qa-preview.test.mjs`, `own <= 4844.75` at 4349249b) moves by exactly
what S3's wording costs, with a history line naming the slice. `docs/adr/README.md` is regenerated with
`node scripts/adr-index.mjs`, never merged by hand.

## Known flaky tests

None recorded. A red `scripts/test/gate-census.test.mjs` while another gate runs on this machine is rerun once
alone before it counts.

## Live verification

These are definitions and scripts, so a slice's live check is a run on this machine (L11). Run
`node scripts/measure-prompt.mjs` and paste its output for S1 and S3. Print the stop line for S4. Run against a
planted CRLF file in a scratch copy for S6. There is no deck surface; never use the live deck on 4321.

## Diff limit

200 changed lines per slice. Past it, stop and ask your addressee.
