# Planted items

One line per planted item: area · file · what the audit should report.

- loops · package.json · no lint and no typecheck script: an agent learns of a mistake only from the tests
- loops · spec/clock.spec.js · a flaky check: it asserts the clock is on an even second, so it passes half the runs
- setup · .env.example · SESSION_SECRET, which src/server.js requires, is absent from it
- preview · src/server.js · the dev script exits 1 on a fresh copy (SESSION_SECRET is not set), so the preview never comes up
- navigability · src/report.js · a 1,200-line module, too large to read whole
- navigability · src/utils/dates.js · a duplicate helper: formatDate is src/format.js's, line for line, and nothing imports this copy
- open · README.md · it names `npm run seed`, a script package.json does not have
- context · CLAUDE.md · a 30 KB always-loaded file, about 7,500 tokens every session
- context · .claude/rules/react/hooks.md · a React rule on **/hooks/**/*.js, and this project has no React: it matches src/hooks/counter.js
- tooling · .claude/settings.json · a PreToolUse hook on the `*` matcher that waits 2 s before every tool call
- rederived · docs/design · two runs (alpha, beta) each re-ran the flaky clock check before trusting it, and no step, record or refusal says to
