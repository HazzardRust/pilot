---
name: grilling
description: Grill the user relentlessly about a plan, decision, or idea. Use when the user wants to stress-test their thinking, or uses any 'grill' trigger phrases.
---
<!-- provenance
upstream: mattpocock-skills 1.2.3 - skills/productivity/grilling/SKILL.md
copyright: Copyright (c) 2026 Matt Pocock
licence: MIT - see THIRD-PARTY-NOTICES.md
adapted: the frontier goes to the deck as an item per question instead of a numbered round (ADR 0004) — independent questions together, one at a time only where one answer would change another question — waited on, argued with and closed on the deck's own tools; one decision per item, split bundles, short by default, probe harder, pushback as its own paragraph, and a default resting on outside practice, an API or a rule researched before it goes up, with one `Research:` line (research-first L8)
ledger: vendor/methodology.md
-->

Interview the user relentlessly until you reach a shared understanding. Map this as a **design tree**: every decision branches into the decisions that hang off it.

Work the tree **a question to an item**. The **frontier** is every decision whose prerequisites are already settled: the questions you can ask _now_ without guessing at answers you haven't heard yet. Compute the whole frontier and put it to the user, highest-value first — the one whose answer would change the most of what follows — each question its own item, each with your recommended answer. The frontier's questions do not affect one another, which is what put them on it, so they go up together; one at a time only where one answer would change another question, and that question was never on the frontier.

The user is never handed a numbered round to work through. Their inbox is the deck, where a question is a thread they answer when they can, and several open threads are several conversations — which a numbered list inside one item can never be.

Post the question with `mcp__plugin_pilot_deck__deck_post`:

- `kind`: `question`
- `title`: the question title, one line
- `body`: the question, then your recommended answer and what taking it trades away

A question asks for one decision. One that bundles two decisions is split into two items, because a single answer to a bundle settles neither. The body is short by default: the decision in a sentence, the choices, the recommendation and its cost. It runs longer only when the decision cannot be put fairly without the context.

Probe harder than feels polite: an answer that leaves a risk open, an edge case unhandled or an assumption untested is a new question, not a settled branch.

Read the answer with `mcp__plugin_pilot_deck__deck_read` by `id` with `messages: <n>`, the question's own thread with whatever the user has typed. A reply that is not there yet will be there on a later call, so go and do something the answer does not block rather than spinning on it; when there is nothing else to do, the pilot and the crew keep a background `pilot wait --as <kind>`; any other agent parks once on `mcp__plugin_pilot_deck__deck_wait` with the time it is willing to wait, rather than calling `deck_read` in a loop. Never post a credential: the deck refuses values that look like keys or tokens, and what you want anyway is the name of the credential, not its value.

**Pushback.** Every answer that overrides the recommended default gets one `mcp__plugin_pilot_deck__deck_reply` in the same item, and so does an answer to a different question: why in one line, the consequence and the path it closes, never a preference, and the question once more. A second only for a fact the user had not seen. That is what makes this an interview rather than a form. Then the user's word decides, the answer is locked and never re-argued, and you record the objection under the decision as `overridden: <objection>` wherever the decisions are written down. When the decision is settled, close it with `mcp__plugin_pilot_deck__deck_resolve` saying what it settled — their reply never closes a thread, only you do.

Each answer reshapes the tree: the settled decision pushes the frontier outward and unblocks the questions that depended on it. Recompute the frontier and post the next question. A question whose answer depends on one still unanswered belongs after it, not beside it.

Finding _facts_ is your job, never the user's. When a frontier question needs a fact from the environment (filesystem, tools, etc.), dispatch a sub-agent to find it; don't ask the user for anything you could look up yourself. Don't block on it: a running exploration is an unsettled prerequisite, so only the questions downstream of it wait for the sub-agent to report; post the next question that doesn't depend on it now. A recommended default needs **research** first when it rests on a practice or convention outside the repository, a library's, tool's or service's current behaviour or API, a security, privacy, data or licensing rule, a standard or source the user named, or the user asking for it; **skip** research for a codebase fact, a preference, a scope call, a decision already locked or covered by an ADR, and research already done for it this run. What the code does today is a codebase fact; whether to keep it against a practice outside the repository is not, and is researched. A question that asks whether to change a decision already locked or a convention the code follows is not covered by it, and is researched. A researched question waits for its research while the rest of the frontier goes up meanwhile, and its body carries one line, `Research: <what was read>, <n> sources, favours <option>`, never the table; a default that skips it says why in one line, `Research: none, <skip reason>`, the reason from the skip list, and the deck refuses a recommended question with neither. **The build-now rule**: a found issue, a defect, flake, weakness or seam found during a run beside or under the work in hand, not a wish to tidy code the run did not touch, has the default to build it in the run, never a later ticket, as an added spec line and slice with no question; only one that moves a decision already locked is asked. When research overturns a default already put, say so in one reply on the thread and put the question again with the new default. The _decisions_ are the user's: put each to them and wait.

The session is done when the frontier is empty: every branch of the design tree visited, nothing left silently assumed. Do not act on it until the user confirms you have reached a shared understanding.
