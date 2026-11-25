---
name: pr-overview
description: How to write the plain overview a pull request opens with - four labelled lines a business manager and a developer can both read, above the tables written for agents. Use when writing or rewriting the `## Overview` of a feature's architecture.md, or the opening of a trivial-work PR body.
---
<!-- provenance
upstream: mattpocock-skills 1.3.2 - skills/engineering/pr/SKILL.md
copyright: Copyright (c) 2026 Matt Pocock
licence: MIT - see THIRD-PARTY-NOTICES.md
adapted: three lines taken - skip all preambles and keep prose brief; use the user's domain language from GLOSSARY.md; the one-way or two-way door and blast radius, here the overview's last line; the reader is a person outside the build rather than the reviewer, so the diagram Summary (credited upstream to another author) and the Evidence section (the tables carry it) are not taken; the four labelled lines, the bounds and the banned tokens are this package's (pr-overview A2, A3, L6)
ledger: vendor/methodology.md
-->

# The PR overview

The top of every PR the pilot opens is a short overview for a person: a business manager
and a developer both read it and know what the PR is. The tables below it are for whoever
wants the detail, and stay as they are.

Where it lives: a feature's overview is the `## Overview` section of its `architecture.md`,
above `## 1`, and `pilot pr` copies it to the feature PR's top with a `Built so far: k of n
parts.` line it counts itself; you never write that line. A trivial-work PR has no artefact,
so its body opens with the same section written straight into the body.

Skip all preambles and keep prose brief.

## The four lines

```markdown
## Overview

- **What changes**: <what is different after this, in one or two sentences>.
- **Why**: <the problem it removes, as the person who had it would say it>.
- **What you'll notice**: <what a user sees, does or stops doing>.
- **Can it be undone**: <one-way or two-way door>; <who and what it affects>.
```

- **What changes** comes first because it is the line a release note reuses: its first
  sentence must stand alone.
- **Can it be undone** names the door - one-way (hard to walk back: a migration, a deleted
  file, a published name) or two-way (a revert undoes it) - and the blast radius: who and
  what it touches.
- Write what the change does, not how it was built. No file paths, no function names.

## Bounds

- At most 150 words, the labels included.
- Sentences average at most 20 words. Split a long sentence at its `;` or `and`.

`node "${CLAUDE_PLUGIN_ROOT}/scripts/check-slices.mjs" <dir>/architecture.md` refuses an
artefact whose overview is missing, over either bound, or holds a banned token (rule
`overview-plain`); the overview passes when the check does.

## Words

- Use the user's domain language from `GLOSSARY.md` at the repository root when one exists:
  look a word up there, and use the term it names, never a word it lists under `_Avoid_`.
- Never a run's internal ids: no slice ids (`S2`), no item ids (`itm_...`), no decision ids
  (`A1`, `L3`), no ADR numbers (`ADR 0142`).
- Never a crew role name: the words after `pilot-` in `agents/pilot-*.md` (architect,
  implementer, fundamentalist, qa, ...). Say what happened, not which agent did it.
  "Pilot" itself is the product and stays.
