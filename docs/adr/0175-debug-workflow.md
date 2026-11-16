---
status: proposed
date: 2026-10-21
tags: [crew, prompts, debugging]
supersedes: []
superseded_by: []
paths: [agents/pilot-implementer.md, agents/pilot-co-pilot.md, skills/diagnosing-bugs/SKILL.md, docs/design/debug-workflow/architecture.md]
---
# The crew's bug path

`diagnosing-bugs` was vendored, but only QA was told to load it; the implementer, who writes every fix, never was (`docs/design/debug-workflow/architecture.md` §1). So we decided that whoever writes a fix loads the skill when the work in hand is a bug, and that the co-pilot says so in the brief.

- **L6 The skill loads on demand** with the Skill tool, as QA's does: the implementer loads `pilot:diagnosing-bugs` on a fix brief that carries a bug and on a phase-gate red it calls `regression` (red rerun alone). It is never in a `skills:` field, so a slice that fixes no bug pays nothing for it.
- **L7 The co-pilot's fix brief names the skill** when a kept finding is a defect rather than a tidy, so the fixer loads it without re-deriving the call.
- **L11 The bug path is the crew's only**: nothing host-specific. A red CI run still reaches the crew as the user pastes it, and the bug path then applies to its fix.

Rejected:
- A `skills:` preload on the implementer: paid on every spawn, though most slices fix no bug.
- The implementer's prose alone, without the co-pilot naming the skill: a narrow fix brief can crowd it out.
- A host's CI poller (a watcher on one host's runs, or on any other host's API, and a `pilot ci` command to read a run's log): the user rejected a design centred on one VCS host, since other hosts must not be second-class.
