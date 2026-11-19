# Brief: audit-f12

The facts every implementer of this feature shares. Read this first, then your slice file.

## Repository

`C:/Users/Hazzard/Projects/pilot` (GitHub `HazzardRust/pilot`). Default branch `main`, pilot branch `pilot`. Never
work in that shared checkout or in another session's worktree. Create your own beside it, `pilot-audit-f12-s<n>`,
and run `npm ci` there before the first test.

## Remote

Remote: origin

## Base and PR target

The base is `feat/audit-f12`, cut at Gate 1 from `origin/pilot` (fa28b73b at design time). Branch:
`slice/audit-f12-s<n>`, pushed for the pilot to integrate; no slice PR. The feature PR targets `pilot`.

## PR titles

- A slice: `feat(audit-f12): S1 a sed -i on a tracked file is refused`
- A slice: `feat(audit-f12): S2 heredoc and echo writes are refused, read-only heredocs pass`
- A fix round: `fix(audit-f12): <what>`
- The feature PR: `feat(audit-f12): A hook refuses shell edits of tracked source`

## Commit trailer

Every commit ends with these two lines, copied exactly:

```
Co-Authored-By: Claude Fable 5.2 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01NXgSFppeY5pzVQLciH5swh
```

## PR footer

Every PR body ends with these lines, copied exactly:

```
🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_01NXgSFppeY5pzVQLciH5swh
```

## Artefact

`docs/design/audit-f12/architecture.md`, slices in `slices/S1.md`, `slices/S2.md`. The run's ADR is
`docs/adr/NNNN-audit-f12.md`; the landing numbers it.

## Gate command

```
npm ci
npm test
```

`npm test` runs `node scripts/gate.mjs` and takes 6-8 minutes; 10 skipped is normal; sub-suites print their own
pass/fail lines before the overall summary. One file: `node --test <file>`. `deck/test/facades.test.mjs` caps source
files at 800 lines; each slice file says how near its files are.

## Known flaky tests

None recorded.

## Live verification

A pilot-lane Bash call in a scratch clone session with the plugin loaded from the clone, architecture.md §9.
Once S1 lands, your own `sed -i` or heredoc into tracked source is refused: write source with Edit/Write.

## Diff limit

150 changed lines per slice. Past that, stop and ask `main`.
