# Brief: readme-pitch

The facts every implementer of this feature shares. Read this first, then your slice file.

## Repository

The repository is `C:/Users/Hazzard/Projects/pilot` (GitHub `HazzardRust/pilot`). Its default branch is `main` and its
pilot branch is `pilot`. Never work in that checkout, or in another session's worktree. Create your own beside it,
named `pilot-readme-pitch-s<n>`, with `git -c core.longpaths=true worktree add`. Run `npm ci` in the new worktree
before the first test run.

## Base and PR target

The base is `feat/readme-pitch`, cut at Gate 1 from the design branch on `origin/pilot` 2ea8122f. Every slice PR is a
**draft** against `feat/readme-pitch` and is never marked ready, because the pilot merges it.

- Branch name: `slice/readme-pitch-s<n>`.
- PR body: written with `gh pr create --body-file <file>`; it names the model (Opus) and pastes the rendered README
  section the slice changed. S3's body carries the claim table (sentence | mechanism | path | holds/stale).

## Remote

Remote: origin

## PR titles

- A slice: `feat(readme-pitch): S<n> <title as in the artefact, lower-case first>`
- A fix round: `fix(readme-pitch): <what>`
- The feature PR: `feat(readme-pitch): The README becomes a pitch: new ideas first, one line each`

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

`docs/design/readme-pitch/architecture.md`; slice files `slices/S<n>.md`. §3's fact sheet is the only source of
feature claims; §3 lists the README's 27 pins, each moved with its wording and never deleted (spec 8). No install
command changes (L2). Words: co-pilot (never foreman), ticket (never task); the vocabulary guard scans README.md.

## Gate command

```
npm ci
npm test
node scripts/check-references.mjs
node scripts/check-provenance.mjs agents/ skills/ rules/
```

There is no typecheck, lint or build step. Run one file with `node --test <file>`. The full suite takes about 5
minutes: run it with `run_in_background` or a 600000 ms timeout, never the default 120 s.

**Known flake**: `scripts/test/gate-census.test.mjs` "the leak fixture is red and names it" can go red while another
gate runs on this machine; it is green alone; rerun once, never fix it in a slice.

## Live verification

The surface is the rendered README: view it on GitHub's PR view of the pushed slice branch and paste what the slice
changed. QA reads the same render and runs the install commands once in a temp directory (L8).

## Diff limit

300 changed lines per slice; past it, stop and ask `main`.
