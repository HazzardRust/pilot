---
status: accepted
date: 2026-10-19
tags: [crew, voice]
supersedes: [0056]
superseded_by: []
paths: [agents/pilot.md, agents/pilot-architect.md, agents/pilot-qa.md, agents/pilot-explorer.md, agents/pilot-teacher.md, agents/pilot-auditor.md, scripts/test/crew-voice.test.mjs]
---
# User-facing prose trades grammatical accuracy for conciseness

ADR 0056 wrote the crew's voice rule as "no unasked explanation" and rejected any rule phrased as brevity, because a
brevity rule reads as an incentive to think less. The user still found deck items and chat replies written in
paragraphs or in technical language, and asked for the voice a tip promised: an agent told to "sacrifice grammatical
accuracy for conciseness" writes text a reader takes in faster (itm_6a1a7da44875, itm_e6637dd71cbf).

So we decided the six definitions whose text the user reads (the pilot's "Writing to the user" and the `## Voice` of
the architect, QA, explorer, teacher and auditor) each carry one sentence, the user's words verbatim: "In deck items
and chat replies, sacrifice grammatical accuracy for conciseness." This carves out 0056's ban, and only that. The
sentence shapes the grammar of what the user reads; it names deck items and chat replies, never thinking, so the
reason 0056 gave does not reach it, and 0056's terminal rule, its banned phrases and its measured evidence stand. What
the decision needs (ADR 0122), the general answer and the four longer-is-right cases stay in every section; the prose
rules the sentence already covers were cut rather than kept beside it, so each section ends shorter and the pilot,
architect, explorer and QA budget pins fall.

The co-pilot, implementer and fundamentalist write to `main`, not the user, and do not carry it (ADR 0122 L6).
Durable documents keep full grammar: the artefact, PR bodies, ADRs, slice files and commits are read for precision,
where a dropped article costs a misread. The deck's own strings are unchanged. Rejected: editing 0056 in place, which
loses the date the carve-out was made; a shared voice skill every agent pays for; the sentence in all eight crew
definitions, spending tokens on agent-to-agent text the user asked nothing about.
