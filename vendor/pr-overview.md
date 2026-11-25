# Vendoring ledger: the PR overview skill

`skills/pr-overview/SKILL.md`, adapted from **mattpocock-skills 1.3.2** at commit `e484a80`
(<https://github.com/mattpocock/skills>), MIT, Copyright (c) 2026 Matt Pocock.

The header and row formats are the ones `vendor/methodology.md` defines. This is its own
fragment rather than a row there because that fragment is 1.2.3 and
`scripts/build-vendor-ledger.mjs` refuses a fragment that mixes upstreams. The MIT notice
travels in `THIRD-PARTY-NOTICES.md`.

## Vetting

| Checked | Found |
| --- | --- |
| What `skills/engineering/pr` ships | `SKILL.md`, `CREDITS.md`, `agents/openai.yaml` |
| Hooks, `.mcp.json`, scripts, credentials, network calls | none |

## Vendored files

| File | Upstream | Adapted | What changed and why |
| --- | --- | --- | --- |
| `skills/pr-overview/SKILL.md` | `skills/engineering/pr/SKILL.md` | yes | Three lines kept: "skip all preambles and keep prose brief", "use the user's domain language from `GLOSSARY.md`", and the one-way or two-way door with its blast radius, which becomes the overview's last line. Upstream's reader is the reviewer and its template is a diagram Summary, Evidence and Merge Danger; here the reader is a person outside the build, so the diagram Summary (credited upstream to Dex Horthy's `show-me`, so not vendored) and Evidence (the PR's tables carry it) are not taken, and `agents/openai.yaml` and `CREDITS.md` are not copied. The four labelled lines, the 150-word and 20-words-a-sentence bounds, and the banned ids and crew role names are this package's, checked by `check-slices` rule `overview-plain` (pr-overview A2, A3, L6). |

## Re-syncing

Upstream is `mattpocock-skills`, installed at
`~/.claude/plugins/cache/claude-plugins-official/mattpocock-skills/<version>`. To re-sync,
diff the row's upstream file against the version recorded in its header, and re-apply only
the changes to the reasoning: the shape changes in the fourth column above are this
project's and are meant to survive. Bump the version in the header and in the row.
