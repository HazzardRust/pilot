---
status: accepted
date: 2026-09-13
tags: [vendor]
supersedes: []
superseded_by: []
paths: []
---
# Vendor the ECC and Pocock skills instead of depending on their plugins

The pilot agent deliberately resolved Matt Pocock's skills at runtime from `installed_plugins.json` so plugin updates reached it without editing the file. We give that up: the skills and agents the crew actually uses are copied into this repository, adapted to this project's output shapes, with a provenance header per file and a re-sync ledger in `VENDOR.md`, and there is no runtime dependency on either plugin. A friend must be able to install one thing, and adapted skills (grilling through the deck, ADRs into the artefact) cannot be expressed as references to upstream files. Both upstreams are MIT; the notices travel in `THIRD-PARTY-NOTICES.md`.

**Consequences**: staying current is a manual re-sync, reported by `check-upstream.mjs`, never automatic. `check-references.mjs` fails on any reference back to `ecc:`, `mattpocock-skills:` or `installed_plugins.json` so the runtime read does not creep back.
