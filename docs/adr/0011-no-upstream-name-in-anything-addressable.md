---
status: accepted
date: 2026-09-13
tags: [vendor]
supersedes: []
superseded_by: []
paths: [vendor/methodology.md, vendor/toolbox.md, docs/INSTALL.md]
---
# No upstream name in anything addressable; attribution lives in the documentation

Everything the package ships is built on Matt Pocock's skills and on ECC, and the friend who installs it must be told so, but not by the names they type or the paths they see. Agents, skills, commands, directories, hook and script files carry no `ecc`, `pocock` or `mattpocock`: a reviewer is `pilot:security-reviewer`, the rules tree is `rules/<dir>/` with no `ecc/` level, and the vendoring ledger fragments are `vendor/methodology.md` and `vendor/toolbox.md`. The credit is documentation, and it is not optional: the README's *Built on* section, `THIRD-PARTY-NOTICES.md` with both MIT notices verbatim, `VENDOR.md`, `docs/INSTALL.md`, and the provenance header inside every vendored file. Keeping the brand names in the tree was rejected because the package is one thing called pilot and a path is not where a reader looks for credit.

**Consequences**: every vendored file's header is the only in-tree trace of its origin, so `check-provenance.mjs` is what keeps the credit from eroding; and any later slice that names a path after an upstream fails the principles review.
