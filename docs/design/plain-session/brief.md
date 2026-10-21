# Brief: plain-session

The facts every implementer of this feature shares. Read this first, then your slice file.

## Repository

The repository is `C:/Users/Hazzard/Projects/pilot` (GitHub `HazzardRust/pilot`). Its default branch is `main`, and its
pilot branch is `pilot`. Never work in that checkout or in another session's worktree. Create your own beside it, named
`pilot-plain-session-s<n>`; in a deep directory use `git -c core.longpaths=true worktree add`. Run `npm ci` in the new
worktree before the first test run.

## Remote

Remote: origin

## Base and PR target

The base is `feat/plain-session`, cut at Gate 1 from `origin/pilot` (4c6448b8 at design time). Every slice PR is a
**draft** against `feat/plain-session`. It is never marked ready, because the pilot merges it.

- Branch name: `slice/plain-session-s<n>`.
- PR body: write it with `gh pr create --body-file <file>`.

## PR titles

- A slice: `feat(plain-session): S<n> <title as in the artefact, lower-case first>`
- A fix round: `fix(plain-session): <what>`
- The feature PR: `feat(plain-session): A plain claude session carries only what the install was told to`

## Gate

`npm test` (`node scripts/gate.mjs`). It takes 4–6 min, so run it in the background, once, on the final state. For red
and green use `npm run test:changed -- --since=<base sha>`. GitHub Actions is billing-blocked on this account, so the
local gate is the referee: report the commit sha and the result.

## Known flaky tests

- `deck/test/daemon-lifecycle.test.mjs:110`: a rerun passes.

## Commit trailer

Every commit ends with these two lines, copied exactly:

```
Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Cmu6QXexHes1EiTfHDYBgB
```

## PR footer

Every PR body ends with these lines, copied exactly:

```
🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_01Cmu6QXexHes1EiTfHDYBgB
```

## Artefact

`docs/design/plain-session/architecture.md`, with the slice files in `slices/S<n>.md`. Its terms (§4) are fixed. The
locked decisions are §5 L1–L10, and no slice moves one. S1's `scripts/reach.mjs` symbols are read by name from the
integration branch by S2–S5.

## Live checks: the throwaway HOME (L10)

Never touch the user's `~/.claude`. Every live `claude` or `pilot` run sets all three of `USERPROFILE`, `HOME` and
`CLAUDE_CONFIG_DIR` to a throwaway directory, and runs with HOME **and** cwd outside `C:\Users\Hazzard`:

- `install-rules.mjs` and `install-settings.mjs` resolve the home through `os.homedir()` (`USERPROFILE` on Windows) and
  ignore `CLAUDE_CONFIG_DIR`, so a SessionStart hook writes into the real home unless `USERPROFILE` is moved.
- A cwd under `C:\Users\Hazzard` makes Claude Code read the real `~/.claude` as an ancestor project directory.
- The init event (`claude -p hi --output-format stream-json --verbose`) and the hook events are printed before
  authentication, so the plugin footprint is readable without a login. Install into the throwaway HOME with
  `claude plugin marketplace add <your worktree>` and `claude plugin install pilot@pilot`.

## Overlaps outside this run

- deck-writes-github (`itm_5f1725c876a7`): `scripts/install-settings.mjs` (S3), a doctor row (S5).
- The Defender ticket: a doctor row (S5).
- crew-tests-behaviour (#906): `agents/pilot.md` (S6).
