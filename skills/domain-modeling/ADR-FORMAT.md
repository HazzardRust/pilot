<!-- provenance
upstream: mattpocock-skills 1.2.3 - skills/engineering/domain-modeling/ADR-FORMAT.md
copyright: Copyright (c) 2026 Matt Pocock
licence: MIT - see THIRD-PARTY-NOTICES.md
adapted: the template is the shape of the ADRs already in docs/adr/ - title, one paragraph, optional Consequences - opened by a front matter block for navigation; under a piloted run the number is the placeholder NNNN until the landing allocates it
ledger: vendor/methodology.md
-->
# ADR Format

ADRs live in `docs/adr/` and use sequential numbering: `0001-slug.md`, `0002-slug.md`, etc. The slug names the decision, not the topic: `0004-the-deck-is-the-only-inbox.md`, not `0004-deck.md`.

Under a piloted run the number is `NNNN` until landing: the feature's one ADR is `docs/adr/NNNN-<slug>.md`, cited `ADR NNNN`, and the landing renames it to one past the highest number on `pilot` and rewrites its citations in the files the feature changed. A feature carries at most one.

Create the `docs/adr/` directory lazily: only when the first ADR is needed.

## Template

```md
---
status: proposed | accepted | superseded | amended | deprecated
date: YYYY-MM-DD
tags: [<domain>, ...]
supersedes: [<NNNN>, ...]      # empty list when none
superseded_by: [<NNNN>, ...]
paths: [<repo-relative path or glob>, ...]
---
# {The decision, as a sentence}

{One paragraph: what the situation was, what we decided, why, and what we
rejected and why it lost.}

**Consequences**: {one sentence, only when a downstream effect is non-obvious}
```

That's it. An ADR is one paragraph, and the rejected alternative goes inside it rather than in a section of its own: the next reader's question is always "why not the obvious thing?", and an ADR that leaves it unanswered gets re-litigated. The value is in recording *that* a decision was made and *why*, not in filling out sections.

The front matter is for navigation: a reader filters by status, tag or path without opening each file. When a decision is reversed, write the new ADR and set `superseded_by` on the old one. The body takes no other sections. A repository's own rule naming another schema wins over this one.

## Numbering

Scan `docs/adr/` for the highest existing number and increment by one.

## When to offer an ADR

All three of these must be true:

1. **Hard to reverse**: the cost of changing your mind later is meaningful
2. **Surprising without context**: a future reader will look at the code and wonder "why on earth did they do it this way?"
3. **The result of a real trade-off**: there were genuine alternatives and you picked one for specific reasons

If a decision is easy to reverse, skip it: you'll just reverse it. If it's not surprising, nobody will wonder why. If there was no real alternative, there's nothing to record beyond "we did the obvious thing."

### What qualifies

- **Architectural shape.** "We're using a monorepo." "The write model is event-sourced, the read model is projected into Postgres."
- **Integration patterns between contexts.** "Ordering and Billing communicate via domain events, not synchronous HTTP."
- **Technology choices that carry lock-in.** Database, message bus, auth provider, deployment target. Not every library: just the ones that would take a quarter to swap out.
- **Boundary and scope decisions.** "Customer data is owned by the Customer context; other contexts reference it by ID only." The explicit no-s are as valuable as the yes-s.
- **Deliberate deviations from the obvious path.** "We're using manual SQL instead of an ORM because X." Anything where a reasonable reader would assume the opposite. These stop the next engineer from "fixing" something that was deliberate.
- **Constraints not visible in the code.** "We can't use AWS because of compliance requirements." "Response times must be under 200ms because of the partner API contract."
- **Rejected alternatives when the rejection is non-obvious.** If you considered GraphQL and picked REST for subtle reasons, record it; otherwise someone will suggest GraphQL again in six months.
