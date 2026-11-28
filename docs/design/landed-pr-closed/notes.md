# landed-pr-closed design notes

- Run bases at design time (2026-11-28), from `docs/design/*/run.json` dated by `git log -1 --format=%cs`: since 11-21, 4 `main` (handoff-no-wait, ui-design-workflow, handoff-self-close, portable-store), 21 `pilot`/`hazzardrust-pilot`.
- `gh pr list --base main --state all --limit 40`: per-feature PRs #140, #146 merged and #145 merged-as-draft (GitHub read it merged from a release PR) on 11-22; #149 closed by hand on 11-28; release PRs #162-#164 merged, #167 open.
- `git rev-list --count origin/main..origin/hazzardrust-pilot`: 175.
- No `ready` call in `scripts/` or `deck/` (grep `ready:|markReady|.ready(`); `deck/host-github.mjs` allows `pr create|edit|comment|view|list`.
