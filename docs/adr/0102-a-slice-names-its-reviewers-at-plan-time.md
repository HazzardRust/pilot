---
status: accepted
date: 2026-10-08
tags: [review, security, runs]
supersedes: []
superseded_by: []
paths: [docs/design/security-reviewer/architecture.md, skills/vertical-slicing/SKILL.md, agents/pilot-architect.md, agents/pilot-implementer.md, agents/security-reviewer.md]
---
# A slice names its reviewers at plan time

The security reviewer worked when it was called (it found a CRITICAL in pilot-package S8), but nothing made sure it was called. The only trigger was one judgement clause in `agents/pilot-implementer.md` that no test pinned, and the last two runs' briefs named no reviewer at all. So we decided that every slice file carries a Reviewers line, written by the architect when the slice is planned and seen at Gate 1 (`docs/design/security-reviewer/architecture.md`, L6, L4, L7).

- **The Reviewers line** names the language reviewer and, when the slice hits the security trigger, `pilot:security-reviewer`. The trigger is auth, user input, secrets, an API boundary (a route, a hook input, a CLI argument), a process start, or agent configuration (`agents/`, `hooks/`, `skills/`, `settings*.json`, `.mcp.json`, `CLAUDE.md`).
- **The implementer spawns every reviewer the line names**, and adds the security reviewer when its own diff turns out to hit the trigger.
- **No third-party scanner** (L7): agentshield was inspected and not adopted. `agents/security-reviewer.md` carries its own agent-configuration checklist instead.

Rejected:
- Leaving the call to the implementer's judgement: that was the arrangement in place, and nothing enforced it.
- agentshield's pinned `npx` scan: it is a download-and-run on the user's machine, and it checks only configuration.

**Consequences:**
- The slice anatomy grows from ten fields to eleven, and its pin moves with it.
- Gate 1 shows who reviews each slice, so a missing security review is visible before any code is written.
