# Brief: mac-linux

The facts every implementer of this feature shares. Read this first, then your slice file.

## Repository

The repository is `C:/Users/Hazzard/Projects/pilot` (GitHub `HazzardRust/pilot`). Its default branch is `main` and its
pilot branch is `pilot`. Never work in that checkout, or in another session's worktree. Create your own beside it,
named `pilot-mac-linux-s<n>`. In a deep directory, `git -c core.longpaths=true worktree add`. Run `npm ci` in the new
worktree before the first test run.

## Base and PR target

The base is `feat/mac-linux`, cut at Gate 1 from the design branch on `origin/pilot`. Read the integration tip, not
an older checkout; main-never-red (`.github/workflows/gate.yml`), gate2-frees-lane and store-durability land before
this feature, so the tip holds their `deck/landing.mjs`, `deck/items.mjs` and `deck/daemon.mjs`. Every slice PR is a
**draft** against `feat/mac-linux` and is never marked ready, because the pilot merges it.

- Branch name: `slice/mac-linux-s<n>`.
- PR body: write it with `gh pr create --body-file <file>`.

## Remote

Remote: origin

## PR titles

- A slice: `feat(mac-linux): S<n> <title as in the artefact, lower-case first>`
- A fix round: `fix(mac-linux): <what>`
- The feature PR: `feat(mac-linux): Runs on macOS and Linux: CI on three OSes, one platform seam, a hardened mac host`

## Commit trailer

Every commit ends with these two lines, copied exactly:

```
Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01HBzxtWP7gaRA3q54NyZuoB
```

## PR footer

Every PR body ends with these lines, copied exactly:

```
🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_01HBzxtWP7gaRA3q54NyZuoB
```

## Artefact

The artefact is `docs/design/mac-linux/architecture.md`, and the slice files are `slices/S<n>.md`. Its terms (§4)
are fixed. The locked decisions are in §5 (L1–L10) and the assumed ones in §6 (A2), and no slice moves one. The
seam is `hooks/lib/platform.js`, CommonJS (L1); every `process.platform` read outside it is a defect S9 removes.

## The host

This machine is Windows 11 with no Mac and no Linux box. A POSIX line is proven by its CI job (spec 1, the `all-os`
label) and by a fake-platform test that passes the `platform` argument; say in the PR which of the two each
assertion rests on. What only a real Mac can show (TCC prompts, Terminal.app sourcing the profile, APFS case) is
named in the artefact §9 as unproven and is not claimed in a PR.

## Tests

Nothing reaches GitHub, the live deck on 4321, or a real remote from a test. A deck test posts against an `http`
server on a free port or an injected `deck`, with `PILOT_DECK_DIR` on a temp directory. `spawn`, the process table
and the clock are injected, never waited on. A test that spawns a real child tree for `killTree` runs on POSIX only
and is skipped on win32 with the reason. Every test that starts a process or server stops it in teardown. Windows
path literals in tests become host paths (L8).

## Gate command

```
npm ci
npm test
node scripts/check-references.mjs
node scripts/check-provenance.mjs agents/ skills/ rules/
```

There is no typecheck, lint or build step. To run one file, use `node --test <file>`. Run the full suite with
`run_in_background` or a 600000 ms timeout, because it takes about 5 minutes. Wording pins on one rule are spread
across `deck/test/`, `scripts/test/` and `hooks/test/`, so grep for a sentence before you change it. The prompt-size
pins (`scripts/test/measure-prompt.test.mjs`) move by exactly what a slice's wording costs, with a history line
naming the slice. `docs/adr/README.md` is regenerated with `node scripts/adr-index.mjs`, never by hand; ADR numbers
collide with concurrently landed features, so take the next free one on `origin/pilot` at integrate time. The
vocabulary guard (`scripts/vocabulary.mjs`) flags retired words outside its `EXCEPTIONS`.

**Known flake**: `scripts/test/gate-census.test.mjs` "the leak fixture is red and names it" can go red while another
gate runs on this machine. It is green alone. A red there is rerun once, never fixed in a slice.

## Live verification

A slice with a surface (an install script, `pilot` output, a deck page) runs it for real on this Windows host and
pastes what it printed into the PR; its POSIX branch is shown by the fake-platform test and, once S1 is in, by the
`all-os` CI job on the slice PR (label it). Never use the live deck on 4321, and never post to it from a test.

## Diff limit

300 changed lines per slice. Past it, stop and ask `main`.
