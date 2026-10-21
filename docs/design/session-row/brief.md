# Brief: session-row

The facts every implementer of this feature shares. Read this first, then your slice file.

## Repository

`C:/Users/Hazzard/Projects/pilot` (GitHub `HazzardRust/pilot`), default branch `main`, pilot branch `pilot`. Never
work in that checkout or in another session's worktree: create your own, named `pilot-session-row-s<n>`,
beside it. Run `npm ci` in the new worktree before the first test run.

## Base and PR target

Base: `feat/session-row`, cut from `design/session-row` at Gate 1 (ticket itm_723a6a8120d1), itself on
`origin/pilot` 45f5729f. Every slice PR is a **draft** against `feat/session-row`, never marked ready; the pilot
merges it. Branch: `slice/session-row-s<n>`. Write PR bodies with `gh pr create --body-file <file>`. S1 needs
nothing and starts first; S2 and S3 start once idle-main-lane (PR #548) is on `pilot` (S2 shares two hooks with
it, S3 its `lanes.test.mjs`); S4 after S2 and S3, and once bigger-jobs (#549) and clean-landing S10 (#559) are on
`pilot`, or it rebases onto them. The co-pilot holds a slice until its blocker lands.

## PR titles

- Slice: `feat(session-row): S<n> <title as the artefact words it>`, the first word after `S<n>` lower-case.
- Fix round: `fix(session-row): <what>`
- Feature PR: `feat(session-row): one session is one run row, a thread read takes a window, the idle pick is green`

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

`docs/design/session-row/architecture.md`; slice files `docs/design/session-row/slices/S<n>.md`.
Locked decisions §5 move in no slice; the assumed ones in §6 are decided, not open. S4 writes the run's three
ADRs at the next free numbers on `pilot` when it lands (A4); `node scripts/adr-index.mjs --check` stays green.

## Where things live

Run registration: `deck/store-runs.mjs` (`registerRun`, ~:442), `deck/runs.mjs` (`newRun`), the route in
`deck/server-routes.mjs`, the client in `deck/client.mjs`; the existing pin "a session re-registering replaces its
run" is `deck/test/daemon.test.mjs:274`. Thread reads: `deck/tools.mjs` (`deck_read`), `deck/server-tools.mjs`;
code readers in `hooks/` are CommonJS and found only by grepping the tool name. The pick: `deck/items.mjs`
(`nextTicketOf`, ~:563). Prompt-budget pins: `scripts/test/measure-prompt.test.mjs` (pilot headroom 0; the tool
schema counts in the pilot's share, `scripts/measure-prompt.mjs:84`) and `scripts/test/qa-preview.test.mjs`
(QA): measure with the test's own `measure()` before moving a pin, and move it by the measured cost with a dated
comment (A3). Agent prose pins: `scripts/test/pilot-agents.test.mjs`. Heredoc edits mangle `\'` and backticks on
this machine, and `node -e` inside bash double quotes mangles template literals: use the Edit tool or a Node script
file for text replaces. `PILOT_RUN_REPO` and `CLAUDE_PROJECT_DIR` silently point `pilot` and the hooks at the live
checkout: unset or redirect them in every scratch run and test. `deck/testUtils.mjs:24-25` redirects
HOME/USERPROFILE for tests.

## Gate command

```
npm ci
npm test
node scripts/adr-index.mjs --check
node scripts/check-references.mjs
```

## Known flaky tests

`hooks/test/inbox.test.js:471` "a session takes its place on the deck without being told anything" fails under
`npm run test:quiet` on a loaded machine (`fetch failed` / `ECONNRESET`); clean-landing S11 fixes it. A red run that
names only that test is reported as such, never re-run to green and never skipped.

## Environment

QA runs against a scratch deck (A5): `pilot deck --scratch` on a scratch repository with
`claude --plugin-dir <worktree>`; never the live deck at :4321. Stop a scratch deck with `pilot deck --stop <pid>`,
never by killing the process. No logins, no seed data.
