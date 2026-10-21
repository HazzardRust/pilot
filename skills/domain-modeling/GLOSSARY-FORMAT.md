<!-- provenance
upstream: mattpocock-skills 1.2.3 - skills/engineering/domain-modeling/CONTEXT-FORMAT.md
copyright: Copyright (c) 2026 Matt Pocock
licence: MIT - see THIRD-PARTY-NOTICES.md
adapted: describes the artefact's section 3 entry instead of a CONTEXT.md file; the multi-context map is dropped
ledger: vendor/methodology.md
-->
# Glossary Format

The glossary is section 3 of the run's architecture artefact. One entry per term: the
term in bold, an em dash, a tight definition, and then the words it is *not*, so the
rejected names are as findable as the chosen one.

## Structure

```md
## 3. Ubiquitous language

- **Order** — {a one or two sentence description of the term}. It is not a
  "purchase" and not a "transaction".
- **Invoice** — a request for payment sent to a customer after delivery. It is
  not a "bill" and not a "payment request".
- **Customer** — a person or organization that places orders. It is not a
  "client", a "buyer" or an "account".
```

## Rules

- **Be opinionated.** When multiple words exist for the same concept, pick the best one and name the others as what the term is not.
- **Keep definitions tight.** One or two sentences max. Define what it IS, not what it does.
- **Only include terms specific to this run.** General programming concepts (timeouts, error types, utility patterns) don't belong even if the project uses them extensively. Before adding a term, ask: is this a concept unique to this design, or a general programming concept? Only the former belongs.
- **Group terms under subheadings** when natural clusters emerge. If all terms belong to a single cohesive area, a flat list is fine.
- **One glossary per run.** Every term goes in section 3 of that run's artefact. A term that turns out to belong to the whole repository rather than this run belongs in an ADR or the repository's own `CONTEXT.md`, not in a second glossary beside this one.
