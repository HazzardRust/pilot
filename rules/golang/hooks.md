---
paths:
  - "**/*.go"
  - "**/go.mod"
  - "**/go.sum"
---

<!-- provenance
upstream: ECC 2.2.0 - rules/golang/hooks.md
copyright: Copyright (c) 2026 Affaan Mustafa
licence: MIT - see THIRD-PARTY-NOTICES.md
adapted: dead common/ link removed
ledger: vendor/toolbox.md
-->

# Go Hooks

## PostToolUse Hooks

Configure in `~/.claude/settings.json`:

- **gofmt/goimports**: Auto-format `.go` files after edit
- **go vet**: Run static analysis after editing `.go` files
- **staticcheck**: Run extended static checks on modified packages
