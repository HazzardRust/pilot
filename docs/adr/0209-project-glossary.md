---
status: proposed
date: 2026-11-22
tags: [glossary, skills, crew]
supersedes: []
superseded_by: []
paths: [GLOSSARY.md, GLOSSARY-LOG.md, scripts/glossary.mjs, skills/domain-modeling/SKILL.md, skills/domain-modeling/GLOSSARY-FORMAT.md, skills/grilling/SKILL.md]
---
# A repository has one glossary, GLOSSARY.md at its root, and agents look words up in it rather than reading it

The skills kept a glossary per run, in section 3 of each run's architecture artefact, while the repository's own root file already carried 70 terms nobody was told to maintain; so we decided that a repository has one glossary, `GLOSSARY.md` at its root, committed and reviewed with the code, where a term that outlives its run is written as it settles and each change is logged in `GLOSSARY-LOG.md` in the same commit, a run's artefact keeping only its run-local terms (L1), and that an agent reads it by lookup only, `glossary.mjs match` on a request's text or `term` on one word, opening the file whole only to edit it (L11). We rejected a per-run glossary, because each run's copy drifts from the last and a term outlives the run that coined it; a glossary in the deck's store under `~/.claude`, because ADR 0006 keeps only disposable state there and a store file is never reviewed with the code; and a whole-file read or an index of terms read every time, because a 300-line glossary loaded into every grilling costs context on every run for the handful of entries the request names.
