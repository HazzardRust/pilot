<!-- provenance
upstream: mattpocock-skills 1.2.3 - skills/engineering/domain-modeling/CONTEXT-FORMAT.md
copyright: Copyright (c) 2026 Matt Pocock
licence: MIT - see THIRD-PARTY-NOTICES.md
adapted: describes an entry of the repository's one GLOSSARY.md, at its root, in the shape glossary.mjs parses, instead of a CONTEXT.md file; the multi-context map is dropped
ledger: vendor/methodology.md
-->
# Glossary Format

The glossary is `GLOSSARY.md` at the repository's root. One entry per term: the term in
bold followed by a colon on its own line, a tight definition under it, and an `_Avoid_:`
line naming the words it is *not*, so the rejected names are as findable as the chosen one.
A blank line ends an entry; a `###` heading groups entries.

## Structure

```md
### Ordering

**Order**:
A customer's request for goods, priced and placed in one step.
_Avoid_: Purchase, transaction

**Invoice**:
A request for payment sent to a customer after delivery.
_Avoid_: Bill, payment request

**Customer**:
A person or organization that places orders.
_Avoid_: Client, buyer, account
```

## Rules

- **Be opinionated.** When multiple words exist for the same concept, pick the best one and list the others under `_Avoid_`.
- **Keep definitions tight.** One or two sentences max. Define what it IS, not what it does.
- **No implementation detail: no file path.** A definition names no file, directory or path; where a thing lives belongs in the code and its docs, and `node "${CLAUDE_PLUGIN_ROOT}/scripts/glossary.mjs" check GLOSSARY.md` fails an entry that names one.
- **Only include terms specific to this project.** General programming concepts (timeouts, error types, utility patterns) don't belong even if the project uses them extensively. Before adding a term, ask: is this a concept unique to this domain, or a general programming concept? Only the former belongs.
- **Group terms under subheadings** when natural clusters emerge. If all terms belong to a single cohesive area, a flat list is fine.
- **One glossary per repository, at its root.** A term a later run would meet goes in `GLOSSARY.md`, with its `GLOSSARY-LOG.md` row in the same commit; a term only one run's design uses stays in that artefact's ubiquitous-language section. There is no second glossary beside it, and none under `~/.claude`.
