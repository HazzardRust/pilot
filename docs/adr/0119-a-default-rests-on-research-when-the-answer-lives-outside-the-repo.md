---
status: accepted
date: 2026-10-10
tags: [agents, grilling, research, deck]
supersedes: []
superseded_by: []
paths: [skills/grilling/SKILL.md, agents/pilot-explorer.md, agents/pilot.md, agents/pilot-architect.md, agents/pilot-qa.md, docs/design/research-first/architecture.md]
---
# A default rests on research when the answer lives outside the repo

We decided that before a question with a recommended default goes up, its owner (pilot, architect or QA) sends a `pilot-explorer` to research the default when it rests on practice outside the repository, waits for the table, and posts the question with one `Research:` line; the table itself reaches the owner only.

## Context

A recommendation the pilot makes from memory is the user's to check by hand. On itm_49d87121223d a grilling question about git workflows went up unresearched; the user asked for research, an explorer fetched eight sources, and the default flipped. The user wants that to be standing behaviour, with the agents deciding for themselves when a question needs it (ticket itm_a513988b403c), and research kept behind the scenes: "it is meant for the pilot to make better decisions ... we want the user to only see what is necessary".

## Decision

**One rule, in the grilling skill (L1, L8).** Research when the default rests on (a) a practice or convention outside the repository, (b) a library, tool or service's current behaviour or API, (c) a security, privacy, data or licensing rule, (d) a standard or source the user named, or (e) the user asks. Skip for (f) a codebase fact, (g) a preference, (h) a scope call, (i) a locked decision or an ADR, (j) research already on the thread this run. Each agent's definition names the rule in one clause and does not copy the lists.

**The explorer researches (L2, L3).** One research-brief shape in `agents/pilot-explorer.md`: the decision, the options, the practice to read, a fetch limit (at most eight, stopping at three agreeing sources, unfetched rows marked). It returns a table to its owner and posts nothing on the thread.

**The question waits (L7) and says what it rests on (L6).** The researched question goes up after the research, with one `Research:` line: what was read, how many sources, which option it favours. The rest of the frontier goes up meanwhile. The owner quotes a source or a row on the thread by its own judgement, never the whole table by rule.

**Budgets move by what it costs (L5).** Each prompt-budget pin rises by the measured cost of its clause, with a history comment, on the user's word.

## Rejected

- *The explorer posts its table on the question's thread*: the recommended default, so the user could check sources; overridden by the user, who wants only what is necessary on the deck.
- *Posting at once and amending when the research lands*: the user may answer a default that then flips.
- *The lists copied into each agent*: three copies, three pins, three budget costs.
- *A new `researching` skill*: the explorer already holds WebFetch, WebSearch and the brief.
