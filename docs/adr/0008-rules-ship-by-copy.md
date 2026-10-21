---
status: accepted
date: 2026-09-13
tags: [rules, install]
supersedes: []
superseded_by: []
paths: []
---
# The rules tree ships in the plugin and is copied into `~/.claude/rules/`

Claude Code loads rules only from `.claude/rules/`, and a plugin can carry files but not register them as loaded context. The plugin holds the canonical `rules/` (the two orchestration rules and ECC's full 22-language tree, about 6,000 lines) and the install copies them idempotently, never overwriting a file already present, reporting what it wrote. Symlinks were rejected because they need developer mode on Windows; shipping only the two orchestration rules was the recommended default and the user chose the whole tree.

**Consequences**: every session on the friend's machine pays the context cost of the matching language rules, and re-sync covers both the vendored skills and the copied rules.
