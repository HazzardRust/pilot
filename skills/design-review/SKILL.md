---
name: design-review
description: The taste pass of QA. Use after a feature's flows work, to judge at one desktop width whether the UI feels like quality work, with a screenshot for every finding.
---

<!-- provenance
upstream: claude-code-workflows 6a65344 - design-review/design-review-agent.md
copyright: Copyright (c) 2025 Patrick Ellis
licence: MIT - see THIRD-PARTY-NOTICES.md
adapted: seven phases cut to the three questions the user asked of taste; its browser tool config, breakpoints, code health and persona dropped (independence L11, L12)
ledger: vendor/taste.md
-->

# Design review: does it feel like quality?

Live first: judge what a user meets in the browser, not the diff. One width,
1440px, unless the spec names another. Walk each changed screen as a user
would and ask three questions.

- **Unnecessary information.** What could go without being missed: a label
  repeating its heading, an id or timestamp nobody acts on, a second way to do
  the same thing, a paragraph where a word would do.
- **Feedback on actions.** Every click, submit and destructive action shows it
  landed: a pending state, a success or error message that says what happened,
  a confirmation before anything irreversible, and loading, empty and error
  states that are designed rather than blank.
- **Polish.** Alignment and spacing agree with the neighbours, type hierarchy
  leads the eye, copy is plain and correct, nothing overflows, clips or jumps.

Describe the problem and what it costs the user, not the CSS fix. Say first
what works.

## Report

One table, a row per finding, each with a screenshot taken through
`mcp__plugin_pilot_chrome-devtools__take_screenshot`:

| Triage | Screen | Problem and its cost | Screenshot |
| --- | --- | --- | --- |
| Blocker / High / Medium / Nit | | | path |
