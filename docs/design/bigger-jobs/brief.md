# Brief: bigger-jobs

The facts every implementer of this feature shares. Read this first, then your slice file.

## Repository

`C:/Users/Hazzard/Projects/pilot` (GitHub `HazzardRust/pilot`), default branch `main`, pilot branch `pilot`. Never
work in that checkout or in another session's worktree: create your own, named `pilot-bigger-jobs-s<n>`,
beside it. Run `npm ci` in the new worktree before the first test run.

## Base and PR target

Base: `feat/bigger-jobs`, cut from `design/bigger-jobs` at Gate 1 (ticket itm_7397c7bb01d2), itself on
`origin/pilot` 64906d40. Every slice PR is a **draft** against `feat/bigger-jobs`, never marked ready; the pilot
merges it. Branch: `slice/bigger-jobs-s<n>`. Write PR bodies with `gh pr create --body-file <file>`. S1 to S6 and S8
share no file and may run side by side within the budget; S7 runs after S6.

Another run, idle-main-lane, is yellow at the same time on `deck/lanes.mjs`, `deck/wait.mjs`, `deck/server-routes.mjs`,
`deck/server-tools.mjs`, `hooks/stop-gate.js`, `hooks/session-handoff.js`, `scripts/handoff.mjs`: no slice here
edits them.

## PR titles

- Slice: `feat(bigger-jobs): S<n> <title as the artefact words it>`, the first word after `S<n>` lower-case.
- Fix round: `fix(bigger-jobs): <what>`
- Feature PR: `feat(bigger-jobs): bias to bigger jobs — found work is built in the run, no hard slice cap, twelve agents`

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

`docs/design/bigger-jobs/architecture.md`; slice files `docs/design/bigger-jobs/slices/S<n>.md`.
Locked decisions §5 (L1 to L10) move in no slice; assumed A1 to A8 are decided, not open. ADRs 0124 to 0127 are
already on the design branch; `node scripts/adr-index.mjs --check` stays green.

## Where things live

Prompt-budget pins: `scripts/test/measure-prompt.test.mjs` (pilot, explorer, rules; history comments ~:105-135) and
`scripts/test/qa-preview.test.mjs` (QA): measure with the test's own `measure()` before moving a pin; pilot and QA
headroom is 0, the rules pin has ~118 tokens. Agent prose pins: `scripts/test/pilot-agents.test.mjs`; crew voice:
`scripts/test/crew-voice.test.mjs`. Shipped-rules hashes: `scripts/shipped-rules.json` (append the new hash for an
edited rule file, never replace). Budget: `deck/budget.mjs`. Question post path: `deck/store-items.mjs` (grep
`MAX_QUESTION_CHARS`), fields in `deck/items.mjs`; tests that pin each kind's fields: `deck/test/items.test.mjs`,
`deck/test/standing.test.mjs`. Heredoc edits mangle `\'` and backticks on this machine: use the Edit tool or Node
for text replaces.

## Gate command

```
npm ci
npm test
node scripts/adr-index.mjs --check
node scripts/check-references.mjs
```

## Known flaky tests

None known at 64906d40. A red run names its failing tests in the report; it is never re-run to green.

## Environment

QA runs against a scratch deck (A6): `pilot deck --scratch` on a scratch repository with
`claude --plugin-dir <worktree>`; never the live deck at :4321. Stop a scratch deck with `pilot deck --stop <pid>`,
never by killing the process. No logins, no seed data.
