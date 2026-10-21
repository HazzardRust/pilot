---
status: accepted
date: 2026-10-01
tags: [vendor, rules]
supersedes: []
superseded_by: []
paths: [vendor/toolbox.md, vendor/methodology.md, scripts/check-upstream.mjs, scripts/check-provenance.mjs, docs/design/crew-voice-rules/architecture.md]
---
# Vendored rules and skills are ours to edit; there is no upstream sync

The 111 language rules files were vendored verbatim from ECC 2.2.0 and the methodology skills from Matt Pocock's
collection, so that a re-sync against a newer upstream was a straight replacement (`rules/README.md`,
`vendor/toolbox.md`, `vendor/methodology.md`). That guarantee had a cost the crew-voice-rules run measured: 108 of
the 111 files open with an `extends ../common/X.md` line pointing at files retired in 0.7.0, 42 name a `skill:`
the package does not ship, and two directories' `paths:` globs (`**/*.ts`, `**/*.tsx`) load 10.9k tokens of
HarmonyOS and React Native text on every TypeScript read. None of it could be fixed without breaking "verbatim".
The user ended the guarantee (L1, itm_6088dedf59b8): "i dont care about the ecc verbatim or syncing with ecc
anymore. neither with matt pococks rules or skills."

So we decided the vendored files are the package's own text from here on. They are pruned, re-globbed and
rewritten as any file in the package is. The MIT provenance headers and `THIRD-PARTY-NOTICES.md` stay, because
the licence requires the copyright notice on adapted text as much as on a copy. `scripts/check-upstream.mjs`
stays as a non-gating report of drift; nothing acts on it.

Rejected:
- Keeping verbatim and removing the misfiring directories outright: loses RN and HarmonyOS guidance to keep a
  property nobody uses.
- Keeping verbatim and narrowing only the globs: still ships 150 dead reference lines.
- Removing the provenance headers with the guarantee: the licence does not allow it.

**Consequences**:
- `scripts/check-provenance.mjs` checks that a header is present, not that the body matches upstream.
- A future upstream improvement is ported by hand, file by file, like any other change.
- Spec 9's verdict table in `docs/design/crew-voice-rules/architecture.md` §5 L16 is the record of what was cut.
