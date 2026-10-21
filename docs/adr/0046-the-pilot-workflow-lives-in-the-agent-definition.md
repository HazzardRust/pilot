---
status: accepted
date: 2026-09-29
tags: [crew, workflow]
supersedes: [0041]
superseded_by: []
paths: [agents/pilot.md, scripts/test/measure-prompt.test.mjs]
---
# The pilot's workflow lives in its agent definition

The pilot was two prompt files: `agents/pilot.md`, the system prompt, and `skills/pilot/SKILL.md`, the nine-step workflow, which reached a session only through the agent's `initialPrompt: /pilot:pilot`. In the session that asked for this change the skill was not in context at all and the pilot had to read it from disk, while the definition, being the system prompt, survives `/clear` and compaction. The user: "if the pilot skill is getting loaded every session, we may as well fold it's contents into the agent file", and "pilot does not need to run in an ordinary session, i want to fold it." So we decided that the workflow is part of `agents/pilot.md` and the skill is gone.

- **One file, one statement of each rule.** The pointers between the two files ("`agents/pilot.md` has the rule … not repeated here", "the `pilot` skill, loaded by your first turn") went, and every rule the two stated twice kept one statement; the request is whatever the user's first message brings, since `$ARGUMENTS` has no meaning in an agent file.
- **No `initialPrompt`.** The first turn of every session starts with `deck_read` (`open: true`), resumes a live run and starts the background `pilot wait` then, stated in the definition; `pilot run` still passes its resume prompt as the first prompt.
- **The prompt budget is unchanged.** The pilot's own share stays at or under 9800 tokens (`scripts/test/measure-prompt.test.mjs`); the fold paid for the first-turn rule with the duplicates it removed.

Rejected:
- Keeping the skill and preloading it with `skills:`: still two files pointing at each other, and a skill in a main session is only as present as whatever loaded it.
- Keeping `/pilot:pilot` as a thin skill that points at the agent: an ordinary session given it would lack the agent's tool restriction and model, which is the case the old definition had to talk its way around ("behave as if you had only this list").

**Consequences**:
- The `/pilot:pilot` entry point inside an ordinary session is given up. The pilot starts only as the main session, with `pilot run` or `claude --agent pilot:pilot`.
- Tests that pinned the skill's text pin the same text in `agents/pilot.md`, and the step sections keep their headings so those pins still find them.
- On that first turn the pilot also takes every open thread its repository's `qa` owns (`deck_reply`, `to: "pilot"`), because a QA agent dies with the session that spawned it and a user's reply on its walkthrough was otherwise handed to nobody. The user: "the walkthrough thread, no one picked up my message, that is something we need to fix." This amends ADR 0041 on the pilot's side only; the deck-side fallback is its own change.
- The definition is now about 480 lines; every session pays for it from the first token, where before the skill arrived one turn later.
