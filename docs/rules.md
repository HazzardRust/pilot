# Rules

Reference content: a directory per language or framework. These are the standards an
agent reads when it is working in that language — coding style, testing, security,
patterns and hooks — and they are not crew machinery.
Nothing in here runs; the crew's own operating rules are `orchestration.md` and
`vertical-execution.md`, which sit beside these directories.

```
rules/
├── orchestration.md       # how work is split between the pilot and its crew
├── vertical-execution.md  # the slice loop and its two human gates
└── <language>/            # 21 of them: typescript, react, python, golang, rust, swift, …
```

Every file under a language directory carries a provenance header naming its upstream.
They came from ECC 2.2.0 (MIT, Copyright (c) 2026 Affaan Mustafa) and were copied
verbatim — this package adapts its agents and skills, but not its reference content, so a
re-sync against a newer ECC is a straight replacement. The ledger is
[`vendor/toolbox.md`](../vendor/toolbox.md); `scripts/check-provenance.mjs` fails if a
header or a row goes missing. This file is the package's own work and carries no header.

## How they reach a session

Claude Code loads rules from `.claude/rules/`, and a plugin can carry files but cannot
register them as loaded context (ADR 0008). So the install copies this tree into
`~/.claude/rules/`, idempotently: a file already there is never overwritten, and the
install reports what it wrote. See `docs/INSTALL.md`. Agents that need a specific file
reference it by `${CLAUDE_PLUGIN_ROOT}/rules/…` instead, which reads the copy inside the
plugin and costs nothing until the agent asks for it.

Copying all 21 directories means every session pays the context cost of the ones that
match the project. That was the deliberate choice (L11); install a subset by copying only
the directories you want.

There is no `common/` layer. Up to 0.6.x one shipped: ten ECC files with no `paths:`
block, so they loaded into every session and every spawn, about 4.9k tokens, and
`common/agents.md` told agents to use planner, tdd-guide and code-reviewer agents this
setup does not have. The install now deletes a `~/.claude/rules/common/` file only when
it is byte-identical to the copy that shipped, and names each one; a file anyone edited
stays.
