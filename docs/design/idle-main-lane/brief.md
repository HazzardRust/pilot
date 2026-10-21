# Brief: idle-main-lane

The facts every implementer of this feature shares. Read this first, then your slice file.

## Repository

`C:/Users/Hazzard/Projects/pilot` (GitHub `HazzardRust/pilot`), default branch `main`, pilot branch `pilot`. Never
work in that checkout or in another session's worktree: create your own, named `pilot-idle-main-lane-s<n>`,
beside it. Run `npm ci` in the new worktree before the first test run.

## Base and PR target

Base: `feat/idle-main-lane`, cut from `design/idle-main-lane` at Gate 1 (ticket itm_5717249cf87a), itself on
`origin/pilot` 64906d40. Every slice PR is a **draft** against `feat/idle-main-lane`, never marked ready; the pilot
merges it. Branch: `slice/idle-main-lane-s<n>`. Write PR bodies with `gh pr create --body-file <file>`. S1 is the
walking skeleton; S2 to S5 run after it and share no file with each other.

## PR titles

- Slice: `feat(idle-main-lane): S<n> <title as the artefact words it>`, the first word after `S<n>` lower-case.
- Fix round: `fix(idle-main-lane): <what>`
- Feature PR: `feat(idle-main-lane): an idle main lane is refused while a red or green ticket is queued`

## Commit trailer

```
Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_019aXY9ksfTqaDQ45XvJgA7D
```

## PR footer

```
🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_019aXY9ksfTqaDQ45XvJgA7D
```

## Artefact

`docs/design/idle-main-lane/architecture.md`; slice files `docs/design/idle-main-lane/slices/S<n>.md`.
Locked decisions §5 (L1 to L9) move in no slice. S1 writes ADR 0123 (`pilot` holds 0122) and keeps
`node scripts/adr-index.mjs --check` green.

## Where things live

The queue state is `deckStateOf` / `nextTicketOf` in `deck/items.mjs` (~:568-608); clients read `GET /api/record`
(`deck/server-routes.mjs`, grep `api/record`). The hooks are CommonJS (`hooks/lib/deck.js`) and cannot import
`deck/*.mjs`: a lane rule reaches them only as strings from the daemon. Tests that pin each kind's fields:
`deck/test/items.test.mjs`, `deck/test/standing.test.mjs`. Prompt-budget pins: `scripts/test/measure-prompt.test.mjs`,
`scripts/test/qa-preview.test.mjs` — measure before moving one; headroom is 0 unless measured otherwise.
Heredoc edits mangle `\'` on this machine: use the Edit tool or Node for text replaces.

## Gate command

```
npm ci
npm test
node scripts/adr-index.mjs --check
node scripts/check-references.mjs
```

## Known flaky tests

None known at 64906d40 (the daemon two-sessions flake was fixed in #509). A red run names its failing tests in the
report; it is never re-run to green.

## Environment

QA runs against a scratch deck (L9): `pilot deck --scratch` on a scratch repository with
`claude --plugin-dir <worktree>`; never the live deck at :4321. A live check of `pilot wait` or the Stop hook is
done there. No logins, no seed data.
